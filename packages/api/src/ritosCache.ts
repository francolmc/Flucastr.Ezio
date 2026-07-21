import type { RitosService } from '@ezio/core'
import { createLogger } from '@ezio/core'

const logger = createLogger('RitosCache')

export interface RitoLookupResult {
  found: boolean
  guiaText: string | null
  similarity?: number
}

export function lookupPattern(
  ritos: RitosService,
  userId: string,
  objective: string
): RitoLookupResult {
  const match = ritos.findRito(userId, objective)
  if (!match) {
    return { found: false, guiaText: null }
  }
  const guiaText = `[RITO_PATTERN]\n${match.rito.guia}\n[/RITO_PATTERN]`
  return { found: true, guiaText, similarity: match.similarity }
}

export async function recordPattern(
  ritos: RitosService,
  userId: string,
  objective: string,
  toolsProposed: string[],
  resultSummary: string,
  guia: string
): Promise<void> {
  try {
    await ritos.saveRito(userId, objective, toolsProposed, resultSummary, guia)
  } catch (err) {
    logger.warn('No se pudo guardar el Rito:', err)
  }
}