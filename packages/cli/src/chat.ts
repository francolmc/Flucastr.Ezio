#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { EzioClient } from '@ezio/sdk';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const EXIT_COMMAND = 'exit'

export async function handleLine(line: string, client: EzioClient): Promise<string | null> {
  const trimmed = line.trim().toLowerCase();
  if (trimmed === EXIT_COMMAND) {
    return null;
  }
  if (trimmed === '') {
    return '';
  }
  return client.send(line);
}

function printError(error: unknown, context: string): void {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error(`Error desconocido ${context}`);
  }
}

async function main() {
  console.log('Ezio CLI — escribe \'exit\' para salir');
  let client: EzioClient;
  try {
    client = new EzioClient();
  } catch (error) {
    printError(error, 'al inicializar');
    rl.close();
    return;
  }

  while (true) {
    let line: string;
    try {
      line = await rl.question('> ');
    } catch {
      break;
    }

    try {
      const result = await handleLine(line, client);
      if (result === null) {
        break;
      }
      if (result !== '') {
        console.log(`Ezio: ${result}`);
      }
    } catch (error) {
      printError(error, '');
    }
  }

  console.log('Adiós.');
  rl.close();
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main();
}
