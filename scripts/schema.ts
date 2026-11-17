// Writes schema/risk-gate.schema.json from the zod config schema.
import { mkdirSync, writeFileSync } from 'node:fs';
import { configJsonSchema } from '../src/config.ts';

mkdirSync('schema', { recursive: true });
writeFileSync('schema/risk-gate.schema.json', `${JSON.stringify(configJsonSchema(), null, 2)}\n`);
console.log('wrote schema/risk-gate.schema.json');
