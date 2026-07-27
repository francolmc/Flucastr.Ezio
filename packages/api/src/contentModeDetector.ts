export interface ContentSignals {
  hasLiteralIdentifier: boolean
  needsContentTransform: boolean
}

const IDENTIFIER_TOKEN_RE = /\b[\w-]+\.\w{1,5}\b/
const QUOTED_STRING_RE = /["'][^"']{1,80}["']/

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