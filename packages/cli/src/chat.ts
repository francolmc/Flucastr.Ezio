#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { EzioClient } from '@ezio/sdk';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

export async function handleLine(line: string, client: EzioClient): Promise<string | null> {
  const trimmed = line.trim().toLowerCase();
  if (trimmed === 'exit') {
    return null;
  }
  if (trimmed === '') {
    return '';
  }
  const response = await client.send(line);
  return response;
}

async function main() {
  console.log('Ezio CLI — escribe \'exit\' para salir');
  const client = new EzioClient();

  while (true) {
    const line = await rl.question('> ');
    try {
      const result = await handleLine(line, client);
      if (result === null) {
        console.log('Adiós.');
        break;
      }
      if (result !== '') {
        console.log(`Ezio: ${result}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      } else {
        console.error('Error desconocido');
      }
    }
  }

  rl.close();
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main();
}
