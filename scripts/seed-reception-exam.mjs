import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = resolve('database/seeds/seed_reception_exam_demo.sql');
const sql = readFileSync(sqlPath, 'utf8');
const container = process.env.SEED_PG_CONTAINER || 'qlpk-postgres';

const result = spawnSync(
  'docker',
  ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'qlphongkham', '-v', 'ON_ERROR_STOP=1'],
  { input: sql, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) {
  console.error(result.error?.message || `Seed failed with exit code ${result.status ?? 1}`);
  process.exit(result.status ?? 1);
}
