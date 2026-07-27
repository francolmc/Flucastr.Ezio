import { describe, it, expect } from 'vitest'
import { detectContentSignals, extractLiteralIdentifier, correctLiteralIdentifierIfNeeded } from '../contentModeDetector.js'

describe('detectContentSignals', () => {
  it('Crea un archivo combinado.py con el contenido de ambos concatenado', () => {
    const result = detectContentSignals('Crea un archivo combinado.py con el contenido de ambos concatenado')
    expect(result).toEqual({ hasLiteralIdentifier: true, needsContentTransform: true })
  })

  it('Crea un archivo log.txt vacío, y agrégale 3 líneas en 3 pasos separados', () => {
    const result = detectContentSignals('Crea un archivo log.txt vacío, y agrégale 3 líneas en 3 pasos separados')
    expect(result).toEqual({ hasLiteralIdentifier: true, needsContentTransform: true })
  })

  it('Crea un archivo contador.txt con el número 0', () => {
    const result = detectContentSignals('Crea un archivo contador.txt con el número 0')
    expect(result).toEqual({ hasLiteralIdentifier: true, needsContentTransform: false })
  })

  it('increméntalo en 1 guardándolo de nuevo', () => {
    const result = detectContentSignals('increméntalo en 1 guardándolo de nuevo')
    expect(result).toEqual({ hasLiteralIdentifier: false, needsContentTransform: true })
  })

  it('Busca el clima de Santiago', () => {
    const result = detectContentSignals('Busca el clima de Santiago')
    expect(result).toEqual({ hasLiteralIdentifier: false, needsContentTransform: false })
  })

  it('Lee el archivo notas.txt (verbo "lee" no está en CREATION_KEYWORDS)', () => {
    const result = detectContentSignals('Lee el archivo notas.txt')
    expect(result).toEqual({ hasLiteralIdentifier: false, needsContentTransform: false })
  })
})

describe('extractLiteralIdentifier', () => {
  it('extrae "combinado.py" del mensaje de c9', () => {
    const result = extractLiteralIdentifier('Lista los archivos .py en este directorio, lee cada uno, y crea un archivo combinado.py con el contenido de ambos concatenado')
    expect(result).toBe('combinado.py')
  })

  it('extrae "log.txt" del mensaje de c8', () => {
    const result = extractLiteralIdentifier('Crea un archivo log.txt vacío, y agrégale 3 líneas en 3 pasos separados')
    expect(result).toBe('log.txt')
  })

  it('extrae "contador.txt" del mensaje de c10', () => {
    const result = extractLiteralIdentifier('Crea un archivo contador.txt con el número 0')
    expect(result).toBe('contador.txt')
  })

  it('devuelve null cuando no hay verbo de creación', () => {
    const result = extractLiteralIdentifier('Ahora réstale 3 y guárdalo de nuevo')
    expect(result).toBeNull()
  })

  it('devuelve null cuando hay múltiples candidatos (c2 - crea 3 archivos)', () => {
    const result = extractLiteralIdentifier('Crea 3 archivos: a.txt, b.txt, c.txt, cada uno con el número correspondiente como contenido (1, 2, 3)')
    expect(result).toBeNull()
  })
})

describe('correctLiteralIdentifierIfNeeded', () => {
  it('corrige combined.py -> combinado.py para write', () => {
    const result = correctLiteralIdentifierIfNeeded(
      'write',
      { path: 'combined.py', content: 'x' },
      '...crea un archivo combinado.py...'
    )
    expect(result).toEqual({
      input: { path: 'combinado.py', content: 'x' },
      corrected: true,
      originalValue: 'combined.py'
    })
  })

  it('no toca tool "read" aunque haya mismatch', () => {
    const result = correctLiteralIdentifierIfNeeded(
      'read',
      { path: 'a.py' },
      '...crea un archivo combinado.py...'
    )
    expect(result).toEqual({
      input: { path: 'a.py' },
      corrected: false
    })
  })

  it('no corrige si el path ya coincide con el literal', () => {
    const result = correctLiteralIdentifierIfNeeded(
      'write',
      { path: 'combinado.py', content: 'x' },
      '...crea un archivo combinado.py...'
    )
    expect(result).toEqual({
      input: { path: 'combinado.py', content: 'x' },
      corrected: false
    })
  })

  it('no corrige cuando hay múltiples candidatos (c2) aunque el path sea uno de ellos', () => {
    const result = correctLiteralIdentifierIfNeeded(
      'write',
      { path: 'b.txt', content: '2' },
      'Crea 3 archivos: a.txt, b.txt, c.txt, cada uno con el número correspondiente como contenido (1, 2, 3)'
    )
    expect(result).toEqual({
      input: { path: 'b.txt', content: '2' },
      corrected: false
    })
  })
})