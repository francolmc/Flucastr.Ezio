import { describe, it, expect } from 'vitest'
import { detectContentSignals } from '../contentModeDetector.js'

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