import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { FactsStore } from '../db/FactsStore'
import { CANONICAL_KEYS } from '../db/FactsStore'
import { createLogger } from '../utils/Logger'

const logger = createLogger('FactExtractor')

const KEY_IMPORTANCE: Record<string, number> = {
  name: 0.9,
  profession: 0.8,
  city: 0.8,
  country: 0.7,
  employer: 0.7,
  projects: 0.7,
  family: 0.6,
  preferences: 0.6,
  pets: 0.5,
  language: 0.8,
  timezone: 0.5,
  notes: 0.4
}

export class FactExtractor {
  constructor(
    private adapter: ModelAdapter,
    private store: FactsStore
  ) {}

  async extract(
    userId: string,
    userMessage: string,
    ezioResponse: string
  ): Promise<void> {
    const prompt = `Analyze this conversation and extract facts about the user.

CONVERSATION:
User: ${userMessage}
Assistant: ${ezioResponse}

Extract ONLY concrete, durable facts about the user.
Use ONLY these canonical keys: ${CANONICAL_KEYS.join(', ')}
Map to the closest canonical key. If nothing fits, use "notes".

Respond ONLY with valid JSON:
{"facts": [{"key": "name", "value": "Franco"}, ...]}
If no facts worth remembering: {"facts": []}`

    try {
      const raw = await this.adapter.complete(
        [{ role: 'user', content: prompt }],
        { temperature: 0 }
      )

      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) return

      const parsed = JSON.parse(match[0])
      if (!Array.isArray(parsed.facts)) return

      for (const fact of parsed.facts) {
        if (
          typeof fact.key === 'string' &&
          typeof fact.value === 'string' &&
          fact.value.trim().length > 0
        ) {
          const importance = KEY_IMPORTANCE[fact.key] ?? 0.4
          this.store.saveFact(userId, fact.key, fact.value.trim(), importance)
          logger.debug(`Extracted: ${fact.key}=${fact.value}`)
        }
      }
    } catch (e) {
      logger.warn('Extraction failed:', e instanceof Error ? e.message : String(e))
    }
  }
}

export function createFactExtractor(
  adapter: ModelAdapter,
  store: FactsStore
): FactExtractor {
  return new FactExtractor(adapter, store)
}