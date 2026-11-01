/**
 * Build and start each app service in its own container.
 * Postgres and Redis stay up. db-migrate runs to completion before app containers.
 */
import { spawnSync } from 'node:child_process';

const appServices = [
  'auth-service',
  'patient-service',
  'staff-service',
  'appointment-service',
  'medical-record-service',
  'pharmacy-service',
  'billing-service',
  'notification-service',
  'api-gateway',
  'frontend',
];

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('Stopping app containers so published ports are free...');
run('docker', ['compose', 'stop', ...appServices]);
run('node', ['scripts/free-ports.mjs']);

console.log('Starting Postgres and Redis...');
run('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'redis']);

console.log('Applying database migrations...');
run('docker', [
  'compose',
  'up',
  '--build',
  '--force-recreate',
  '--no-deps',
  '--exit-code-from',
  'db-migrate',
  'db-migrate',
]);

console.log('Building and starting each service container...');
run('docker', ['compose', 'up', '-d', '--build', '--wait', ...appServices]);

console.log('Stack is up. Open http://localhost:5173');
