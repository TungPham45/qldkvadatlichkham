/**
 * Free ports used by `npm run dev` so a previous session cannot block startup.
 * Usage: node scripts/free-ports.mjs
 *        node scripts/free-ports.mjs 3001 5173
 */
import { execSync } from 'node:child_process';

const DEFAULT_PORTS = [3000, 3001, 3002, 3003, 3004, 3010, 3011, 3013, 5173];
const ports = (process.argv.slice(2).map(Number).filter(Boolean).length
  ? process.argv.slice(2).map(Number).filter(Boolean)
  : DEFAULT_PORTS);

const isWin = process.platform === 'win32';

function pidsOnPort(port) {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        if (pid > 0) pids.add(pid);
      }
      return [...pids];
    }

    const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return out
      .split(/\s+/)
      .map(Number)
      .filter((n) => n > 0);
  } catch {
    return [];
  }
}

function killPid(pid) {
  try {
    if (isWin) {
      execSync(`taskkill /PID ${pid} /F`, { stdio: ['pipe', 'pipe', 'pipe'] });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: ['pipe', 'pipe', 'pipe'] });
    }
    return true;
  } catch {
    return false;
  }
}

let freed = 0;
for (const port of ports) {
  const pids = pidsOnPort(port);
  if (!pids.length) {
    console.log(`port ${port}: free`);
    continue;
  }
  for (const pid of pids) {
    const ok = killPid(pid);
    console.log(`port ${port}: ${ok ? 'killed' : 'failed to kill'} PID ${pid}`);
    if (ok) freed += 1;
  }
}

console.log(freed ? `Freed ${freed} process(es).` : 'All checked ports were already free.');
