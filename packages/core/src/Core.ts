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
import * as os from 'node:os'
import * as path from 'node:path'

export class Core {
  private harness: Harness
  private classifier: Classifier
  private ritosService: RitosService | null = null
  private logger = createLogger('Core')

  constructor(
    private adapter: ModelAdapter,
    db?: import('node:sqlite').DatabaseSync
  ) {
    this.harness = new Harness(adapter)
    this.classifier = new Classifier(adapter)
    if (db) {
      this.ritosService = createRitosService(db)
    }
  }

  async process(input: CoreInput): Promise<CoreOutput> {

    // PASO 1 — Clasificar
    const { level: classification } = await this.classifier.classify(
      input.message,
      input.sessionContext
    )

    // PASO 2 — SIMPLE: respuesta directa
    if (classification === 'simple') {
      const parts = [
        input.systemPrompt ?? 'You are Ezio, a personal assistant.',
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
      `Home directory: ${os.homedir()}`,
      `Downloads: ${path.join(os.homedir(), 'Downloads')}`,
      `Desktop: ${path.join(os.homedir(), 'Desktop')}`,
      `Documents: ${path.join(os.homedir(), 'Documents')}`,
      `Current working directory: ${process.cwd()}`,
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
      input.tools
    )

    // PASO 6 — Examine (Pólya fase 4 — primera mitad)
    let gapContext: string | undefined
    try {
      const examineRaw = await this.adapter.complete([{
        role: 'user',
        content: buildExaminePrompt(
          understanding,
          stepResults.map(r => ({ summary: r.summary, status: r.status }))
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
    const response = await this.adapter.complete([{
      role: 'user',
      content: buildRespondPrompt(
        input.message,
        understanding,
        stepResults,
        input.userProfile ?? [],
        gapContext,
        workingState
      )
    }], { temperature: 0.3 })

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
