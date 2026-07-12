import type { CoreInput, CoreOutput, WorkingStateData } from './types/index'
import type { ModelAdapter } from './adapters/ModelAdapter'
import { Harness } from './harness/Harness'
import { Classifier } from './planner/Classifier'
import { createRitosService, type RitosService } from './memory/Ritos'
import { createLogger } from './utils/Logger'
import {
  buildUnderstandPrompt,
  buildExaminePrompt,
  buildRespondPrompt
} from './planner/prompts'
import { ConfigService, type EzioConfig } from './config/ConfigService'
import { getCurrentDateContext } from './utils/DateContext'
import { generateRunId, setLoggingEnabled, logEvent } from './EventLogger'
import * as os from 'node:os'
import * as path from 'node:path'

export class Core {
  private harness: Harness
  private classifier: Classifier
  private ritosService: RitosService | null = null
  private logger = createLogger('Core')
  private db: import('node:sqlite').DatabaseSync | null = null

  constructor(
    private adapter: ModelAdapter,
    db?: import('node:sqlite').DatabaseSync,
    config?: EzioConfig
  ) {
    this.db = db ?? null
    if (config?.logging?.enabled !== undefined) {
      setLoggingEnabled(config.logging.enabled)
    }
    this.harness = new Harness(adapter, {
      maxReactiveDecomposePerRun: config?.reasoning?.maxReactiveDecomposePerRun,
      toolRetrievalThreshold: config?.reasoning?.toolRetrievalThreshold,
      maxWebSearchPerRun: config?.reasoning?.maxWebSearchPerRun
    })
    this.classifier = new Classifier(adapter)
    if (db) {
      this.ritosService = createRitosService(db)
    }
  }

  async process(input: CoreInput): Promise<CoreOutput> {
    const dateContext = getCurrentDateContext()
    const runId = generateRunId()

    // PASO 1 — Clasificar
    const { level: classification } = await this.classifier.classify(
      input.message,
      input.sessionContext,
      dateContext
    )

    logEvent(this.db, {
      ts: Date.now(),
      runId,
      component: 'Classifier',
      event: 'classification',
      level: 'info',
      data: { classification, model: this.adapter.model }
    })

    // PASO 2 — SIMPLE: respuesta directa
    if (classification === 'simple') {
      const parts = [
        input.systemPrompt ?? 'You are Ezio, a personal assistant.',
        dateContext,
        input.userProfile?.length
          ? 'USER CONTEXT:\n' + input.userProfile.map(f => `${f.key}: ${f.value}`).join('\n')
          : '',
        input.sessionContext ? 'CONVERSATION HISTORY:\n' + input.sessionContext : '',
        'USER: ' + input.message
      ].filter(Boolean).join('\n\n')

      const response = await this.adapter.complete([{ role: 'user', content: parts }], { temperature: 0.3 })
      return { response, stepResults: [], classification }
    }

    // Construir contexto del sistema
    const systemContext = [
      dateContext,
      `Home directory: ${os.homedir()}`,
      `Downloads: ${path.join(os.homedir(), 'Downloads')}`,
      `Desktop: ${path.join(os.homedir(), 'Desktop')}`,
      `Documents: ${path.join(os.homedir(), 'Documents')}`,
      `(Internal process directory — NEVER use this path or any part of it as a folder name, target location, or template when creating files/directories for the user; it is unrelated to the user's own files and only exists for the tool's own reference)`,
      `Platform: ${process.platform}`,
    ].join('\n')

    // PASO 3 — Understand (Pólya fase 1)
    const understanding = await this.adapter.complete([{
      role: 'user',
      content: buildUnderstandPrompt(input.message, input.userProfile ?? [], input.sessionContext, systemContext)
    }], { temperature: 0 })

    // PASO 4 — Buscar Rito (solo COMPLEX)
    let ritoGuia: string | undefined
    if (classification === 'complex' && this.ritosService) {
      const ritoMatch = this.ritosService.findRito('default', understanding)
      if (ritoMatch) ritoGuia = ritoMatch.rito.guia
    }

    // PASO 5 — AmplifyLoop (planning + ejecución incremental)
    const toolRegistry = { callTool: input.toolExecutor }

    const harnessObjective = ritoGuia
      ? `${understanding}\n\nGUIDANCE FROM SIMILAR PROBLEMS:\n${ritoGuia}`
      : understanding

    const { results: stepResults, workingState } = await this.harness.run(
      harnessObjective,
      {
        systemPromptBase: input.systemPrompt ?? 'You are Ezio, a personal assistant.',
        classification,
        targetLanguage: input.targetLanguage,
        systemContext
      },
      toolRegistry,
      input.tools,
      runId,
      this.db
    )

    // PASO 6 — Examine (Pólya fase 4 — primera mitad)
    let gapContext: string | undefined
    try {
      const examineRaw = await this.adapter.complete([{
        role: 'user',
        content: buildExaminePrompt(
          understanding,
          stepResults.map(r => ({ summary: r.summary, status: r.status })),
          dateContext
        )
      }], { temperature: 0 })
      const firstBrace = examineRaw.indexOf('{')
      const lastBrace = examineRaw.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1) {
        const examined = JSON.parse(examineRaw.slice(firstBrace, lastBrace + 1))
        if (!examined.accomplished && examined.gaps) {
          gapContext = examined.gaps
        }
      }
    } catch {
      // continuar sin gapContext
    }

    // PASO 7 — Respond (Pólya fase 4 — segunda mitad)
    let response: string
    try {
      response = await this.adapter.complete([{
        role: 'user',
        content: buildRespondPrompt(
          input.message,
          understanding,
          stepResults,
          input.userProfile ?? [],
          gapContext,
          workingState,
          dateContext
        )
      }], { temperature: 0.3 })
    } catch (e) {
      this.logger.warn('Respond phase failed, using deterministic fallback:', e instanceof Error ? e.message : String(e))
      const parts: string[] = ['No pude generar una respuesta completa, pero esto es lo que se hizo:']
      if (workingState.createdDirectories.length > 0) parts.push(`Carpetas creadas: ${workingState.createdDirectories.join(', ')}`)
      if (workingState.movedFiles.length > 0) parts.push(`Archivos movidos: ${workingState.movedFiles.join(', ')}`)
      if (workingState.writtenFiles.length > 0) parts.push(`Archivos escritos: ${workingState.writtenFiles.join(', ')}`)
      const failedSteps = stepResults.filter(r => r.status === 'failed')
      if (failedSteps.length > 0) parts.push(`Pasos que fallaron: ${failedSteps.map(r => r.failReason ?? 'razón desconocida').join('; ')}`)
      response = parts.join('\n')
    }

    // PASO 8 — Guardar Rito en background
    if (classification === 'complex' && stepResults.every(r => r.status === 'ok') && this.ritosService) {
      this.adapter.complete([{
        role: 'user',
        content: `Generate a brief guidance (max 3 sentences) describing how to structure this type of problem. Focus on the approach, not on specific paths or identifiers. Objective: ${understanding}`
      }], { temperature: 0 })
      .then(guia => this.ritosService!.saveRito('default', understanding, stepResults.map(r => r.tool), stepResults.map(r => r.summary).join('\n'), guia))
      .catch(e => this.logger.warn('saveRito error:', e))
    }

    return {
      response,
      stepResults,
      classification,
      workingStateData: {
        trackedFiles: workingState.trackedFiles,
        createdDirectories: workingState.createdDirectories,
        movedFiles: workingState.movedFiles,
        writtenFiles: workingState.writtenFiles,
        searchResults: workingState.searchResults
      }
    }
  }
}
