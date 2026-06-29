#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { EzioClient, type EzioClientConfig } from '@ezio/sdk';
import type { UserValidationRequest, ProgressEvent } from '@ezio/core';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const USER_PROMPT = 'TU > '
const EZIO_PROMPT = 'EZIO > '
const EXIT_COMMAND = 'exit'
const VERBOSE_COMMAND = '/verbose'
const QUIET_COMMAND = '/quiet'
const HELP_COMMAND = '/help'

const helpText = `
Comandos disponibles:
  /verbose    - Mostrar razonamiento paso a paso
  /quiet      - Solo mostrar resultado final (default)
  /help       - Mostrar esta ayuda
  exit        - Salir

El razonamiento Polya se aplica automaticamente cuando el modelo
detecta que el problema es complejo.
`.trim()

let verbose = false

function printProgress(event: ProgressEvent): void {
  if (!verbose) return

  switch (event.type) {
    case 'analyzing':
      console.log(`\n${EZIO_PROMPT}[1/5] ${event.message}`)
      if (event.complexity) {
        console.log(`    → ${event.complexity.isComplex ? '⚠️ COMPLEJO' : '✓ Simple'}`)
        console.log(`    → Razón: ${event.complexity.reason}`)
      }
      break

    case 'planning':
      console.log(`\n${EZIO_PROMPT}[2/5] ${event.message}`)
      if (event.plan) {
        console.log(`    → ${event.plan.summary}`)
        event.plan.steps.forEach(step => {
          console.log(`    ${step.order}. ${step.description}`)
        })
      }
      break

    case 'validating':
      console.log(`\n${EZIO_PROMPT}[3/5] ${event.message}`)
      if (event.plan) {
        console.log('    Plan:')
        event.plan.steps.forEach(step => {
          console.log(`      ${step.order}. ${step.description}`)
        })
      }
      break

    case 'user_input_required':
      console.log('\n' + '='.repeat(50))
      console.log(`${EZIO_PROMPT}📋 VALIDACIÓN REQUERIDA`)
      if (event.plan) {
        console.log('\nPlan propuesto:')
        event.plan.steps.forEach(step => {
          console.log(`  ${step.order}. ${step.description}`)
        })
      }
      console.log(`\n${event.message}`)
      break

    case 'executing':
      console.log(`\n${EZIO_PROMPT}[4/5] ${event.message}`)
      if (event.plan) {
        console.log('    Ejecutando:')
        event.plan.steps.forEach(step => {
          console.log(`    → ${step.description}`)
        })
      }
      if (event.finalOutput) {
        console.log(`\n    Output: ${event.finalOutput.slice(0, 100)}...`)
      }
      break

    case 'verifying':
      console.log(`\n${EZIO_PROMPT}[5/5] ${event.message}`)
      break

    case 'complete':
      console.log('\n' + '='.repeat(50))
      console.log(`${EZIO_PROMPT}✅ VERIFICACIÓN COMPLETA`)
      if (event.verification) {
        console.log(`\nEstado: ${event.verification.isVerified ? '✓ VERIFICADO' : '⚠️ CON PROBLEMAS'}`)
        console.log(`Reporte: ${event.verification.verificationReport}`)
      }
      console.log('='.repeat(50))
      break
  }
}

async function handleUserValidation(request: UserValidationRequest): Promise<string> {
  console.log('\n--- Plan ---')
  if (request.plan) {
    request.plan.steps.forEach(step => {
      console.log(`  ${step.order}. ${step.description}`)
    })
  }
  console.log(`\n${request.message || '¿Apruebas este plan?'}`)

  const response = await rl.question(USER_PROMPT)
  return response
}

async function main() {
  console.log('Ezio CLI — escribe /help, /verbose o /quiet, exit para salir\n')

  const clientConfig: EzioClientConfig = {
    userValidationHandler: handleUserValidation,
    progressHandler: printProgress
  }

  let client: EzioClient;

  try {
    client = new EzioClient(clientConfig);
  } catch (error) {
    console.error('Error al inicializar:', error instanceof Error ? error.message : error);
    rl.close();
    return;
  }

  console.log(`Modo: ${verbose ? 'VERBOSE' : 'QUIET'} (usa /verbose para ver razonamiento)\n`);

    while (true) {
      let line: string;
      try {
        line = await rl.question(USER_PROMPT);
    } catch {
      break;
    }

    const trimmed = line.trim().toLowerCase();

    if (trimmed === EXIT_COMMAND) {
      break;
    }

    if (trimmed === HELP_COMMAND) {
      console.log(helpText + '\n');
      continue;
    }

    if (trimmed === VERBOSE_COMMAND) {
      verbose = true;
      console.log(`Modo: VERBOSE (usa /quiet para solo resultado final)\n`);
      continue;
    }

    if (trimmed === QUIET_COMMAND) {
      verbose = false;
      console.log(`Modo: QUIET (usa /verbose para ver razonamiento)\n`);
      continue;
    }

    if (trimmed === '') {
      continue;
    }

    try {
      const result = await client.resolve(line)

      if (!verbose) {
        console.log(`\n${EZIO_PROMPT}${result.execution?.finalOutput || 'Sin resultado'}`)
      }
      console.log()
    } catch (error) {
      console.error(`${EZIO_PROMPT}Error:`, error instanceof Error ? error.message : error);
    }
  }

  console.log('Adiós.');
  rl.close();
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main();
}

export async function handleLine(line: string, client: EzioClient): Promise<string | null> {
  const trimmed = line.trim().toLowerCase();

  if (trimmed === EXIT_COMMAND) {
    return null;
  }

  if (trimmed === '') {
    return '';
  }

  try {
    const result = await client.resolve(line)
    return result.execution?.finalOutput || 'Sin resultado'
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : error}`
  }
}
