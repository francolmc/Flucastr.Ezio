import type { ModelAdapter } from '@ezio/core'

export class LanguageMiddleware {
  constructor(private adapter: ModelAdapter) {}

  detectLanguage(text: string): string {
    const spanishChars = /[áéíóúüñ¿¡]/i
    const portugueseChars = /[ãõâêôàèìòùç]/i
    const frenchChars = /[àâæçéèêëîïôùûüÿœ]/i

    if (spanishChars.test(text)) return 'es'
    if (portugueseChars.test(text)) return 'pt'
    if (frenchChars.test(text)) return 'fr'

    return 'en'
  }

  async translate(
    text: string,
    targetLanguage: string
  ): Promise<string> {
    if (targetLanguage === 'en') return text

    const languageNames: Record<string, string> = {
      es: 'Spanish',
      pt: 'Portuguese',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      zh: 'Chinese',
      ja: 'Japanese'
    }

    const langName = languageNames[targetLanguage] ?? targetLanguage

    const prompt = `Translate the following text to ${langName}.
Respond ONLY with the translation — no explanations, no preamble.

TEXT TO TRANSLATE:
${text}`

    return this.adapter.complete([{ role: 'user', content: prompt }])
  }
}
