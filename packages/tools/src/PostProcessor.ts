import type { ModelAdapter } from '@ezio/core'
import * as fs from 'node:fs/promises'

export class PostProcessor {
  constructor(private adapter: ModelAdapter) {}

  async translateFile(
    filePath: string,
    targetLanguage: string
  ): Promise<void> {
    if (targetLanguage === 'en') return

    const languageNames: Record<string, string> = {
      es: 'Spanish', pt: 'Portuguese', fr: 'French',
      de: 'German', it: 'Italian'
    }
    const langName = languageNames[targetLanguage] ?? targetLanguage

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      if (!content.trim()) return

      const prompt = `Translate the following text to ${langName}.
Preserve all markdown formatting, headings, bullet points, and structure.
Respond ONLY with the translated content — no explanations.

CONTENT:
${content.slice(0, 3000)}`

      const translated = await this.adapter.complete([
        { role: 'user', content: prompt }
      ])

      await fs.writeFile(filePath, translated, 'utf-8')
    } catch {
      // Si falla la traducción, dejar el archivo original
    }
  }
}