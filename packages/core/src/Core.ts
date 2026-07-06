import type { CoreInput, CoreOutput } from './types/index'
import type { ModelAdapter } from './adapters/ModelAdapter'
import { Harness } from './harness/Harness'
import { Classifier } from './planner/Classifier'
import { createRitosService, type RitosService } from './memory/Ritos'
import {
  buildUnderstandPrompt,
  buildPlanPrompt,
  buildExaminePrompt,
  buildRespondPrompt
} from './planner/prompts'
import * as os from 'node:os'
import * as path from 'node:path'

export class Core {
  private harness: Harness
  private classifier: Classifier
  private ritosService: RitosService | null = null

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

      const response = await this.adapter.complete([{ role: 'user', content: parts }])
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
    }])

    // PASO 4 — Buscar Rito (solo COMPLEX)
    let ritoGuia: string | undefined
    if (classification === 'complex' && this.ritosService) {
      const ritoMatch = this.ritosService.findRito('default', understanding)
      if (ritoMatch) ritoGuia = ritoMatch.rito.guia
    }

    // PASO 6 — Plan (Pólya fase 2)
    const planText = await this.adapter.complete([{
      role: 'user',
      content: buildPlanPrompt(understanding, input.tools, input.sessionContext, ritoGuia, systemContext)
    }])

    if (planText.trim() === 'NO_STEPS') {
      const response = await this.adapter.complete([{
        role: 'user',
        content: buildRespondPrompt(input.message, understanding, [], input.userProfile ?? [])
      }])
      return { response, stepResults: [], classification }
    }

    // Parsear plan en Subtask[]
    const subtasks = planText
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^\d+[\.\)]\s+/.test(line) || /^\*{0,2}\d+[\.\)]\*{0,2}\s+/.test(line))
      .map((line, index) => ({
        id: index + 1,
        objective: line
          .replace(/^\*{0,2}\d+[\.\)]\*{0,2}\s+/, '')
          .replace(/^\d+[\.\)]\s+/, '')
          .trim(),
        dependsOn: index === 0 ? null : index
      }))

    // Si no se parsearon pasos, respuesta directa
    if (subtasks.length === 0) {
      console.warn('[Core] Plan parsed 0 subtasks. planText was:\n', planText.slice(0, 500))
      const response = await this.adapter.complete([{
        role: 'user',
        content: buildRespondPrompt(input.message, understanding, [], input.userProfile ?? [])
      }])
      return { response, stepResults: [], classification }
    }

    // PASO 7 — Execute (Pólya fase 3 — Harness)
    const toolRegistry = { callTool: input.toolExecutor }
    const stepResults = await this.harness.run(
      subtasks,
      {
        systemPromptBase: input.systemPrompt ?? 'You are Ezio, a personal assistant.',
        previousSummaries: [],
        classification,
        targetLanguage: input.targetLanguage
      },
      toolRegistry,
      input.tools
    )

    // PASO 8 — Examine (Pólya fase 4 — primera mitad)
    let gapContext: string | undefined
    try {
      const examineRaw = await this.adapter.complete([{
        role: 'user',
        content: buildExaminePrompt(
          understanding,
          stepResults.map(r => ({ summary: r.summary, status: r.status }))
        )
      }])
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

    // PASO 9 — Respond (Pólya fase 4 — segunda mitad)
    const response = await this.adapter.complete([{
      role: 'user',
      content: buildRespondPrompt(
        input.message,
        understanding,
        stepResults,
        input.userProfile ?? [],
        gapContext
      )
    }])

    // PASO 10 — Guardar Rito en background
    if (classification === 'complex' && stepResults.every(r => r.status === 'ok') && this.ritosService) {
      this.adapter.complete([{
        role: 'user',
        content: `Generate a brief guidance (max 3 sentences) describing how to structure this type of problem. Focus on the approach, not on specific paths or identifiers. Objective: ${understanding}`
      }])
      .then(guia => this.ritosService!.saveRito('default', understanding, stepResults.map(r => r.tool), stepResults.map(r => r.summary).join('\n'), guia))
      .catch(e => console.warn('[Core] saveRito error:', e))
    }

    return { response, stepResults, classification }
  }
}
