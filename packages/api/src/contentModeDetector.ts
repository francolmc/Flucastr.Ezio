export interface ContentSignals {
  hasLiteralIdentifier: boolean
  needsContentTransform: boolean
}

export const IDENTIFIER_TOKEN_RE = /\b[\w-]+\.\w{1,5}\b/
export const QUOTED_STRING_RE = /["'][^"']{1,80}["']/

const CREATION_KEYWORDS = [
  'crea', 'crear', 'creá', 'escribe', 'escribir', 'escribí',
  'guarda', 'guardar', 'guardá', 'nombra', 'nombrar', 'llama', 'llamar'
]

const TRANSFORM_KEYWORDS = [
  'súmale', 'sumale', 'réstale', 'restale', 'multiplícalo', 'multiplicalo',
  'divídelo', 'dividelo', 'incrementa', 'incrementá', 'increméntalo', 'incrementalo',
  'agrega', 'agregale', 'agrégale', 'añade', 'añádele',
  'combina', 'combinar', 'concatena', 'concatenar', 'concatenado', 'concatenada',
  'junta', 'juntar', 'une', 'unir', 'calcula', 'calcular', 'actualiza', 'actualizar'
]

export function detectContentSignals(message: string): ContentSignals {
  const lower = message.toLowerCase()

  const hasIdentifierToken = IDENTIFIER_TOKEN_RE.test(message) || QUOTED_STRING_RE.test(message)
  const hasCreationVerb = CREATION_KEYWORDS.some(k => lower.includes(k))
  const hasLiteralIdentifier = hasIdentifierToken && hasCreationVerb

  const needsContentTransform = TRANSFORM_KEYWORDS.some(k => lower.includes(k))

  return { hasLiteralIdentifier, needsContentTransform }
}

export function extractLiteralIdentifier(message: string): string | null {
  const all = extractAllLiteralIdentifiers(message)
  return all.length === 1 ? all[0] : null
}

function extractAllLiteralIdentifiers(message: string): string[] {
  const lower = message.toLowerCase()
  const creationPositions = CREATION_KEYWORDS
    .map(k => lower.indexOf(k))
    .filter(i => i !== -1)

  if (creationPositions.length === 0) return []

  const creationIndex = Math.min(...creationPositions)
  const afterCreation = message.slice(creationIndex)

  const identifierMatches = [...afterCreation.matchAll(new RegExp(IDENTIFIER_TOKEN_RE.source, 'g'))]
    .map(m => m[0])
  const quotedMatches = [...afterCreation.matchAll(new RegExp(QUOTED_STRING_RE.source, 'g'))]
    .map(m => m[0].replace(/^["']|["']$/g, ''))

  return [...identifierMatches, ...quotedMatches]
}

export interface IdentifierCorrection {
  input: Record<string, unknown>
  corrected: boolean
  originalValue?: string
}

export function correctLiteralIdentifierIfNeeded(
  toolName: string,
  input: Record<string, unknown>,
  lastUserTurn: string
): IdentifierCorrection {
  if (toolName !== 'write') {
    return { input, corrected: false }
  }

  const literal = extractLiteralIdentifier(lastUserTurn)
  if (literal === null) {
    return { input, corrected: false }
  }

  const currentPath = input.path
  if (typeof currentPath !== 'string' || currentPath === literal) {
    return { input, corrected: false }
  }

  return {
    input: { ...input, path: literal },
    corrected: true,
    originalValue: currentPath
  }
}