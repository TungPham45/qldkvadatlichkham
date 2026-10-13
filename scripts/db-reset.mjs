#!/usr/bin/env node
/**
 * Xóa volume Postgres và tạo lại từ database/qlphongkham.sql
 * (+ migrations trong docker-entrypoint-initdb.d).
 *
 * Dùng khi cần seed lại dữ liệu mẫu (bác sĩ, bệnh nhân, lịch...).
 * CẢNH BÁO: mọi dữ liệu trong Postgres sẽ mất.
 */
import { spawnSync } from 'node:child_process';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('Dang dung Postgres/Redis va xoa volume...');
run('docker', ['compose', 'down', '-v']);
console.log('Dang tao lai Postgres + Redis (nap lai seed SQL)...');
run('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'redis']);
console.log('Xong. Database qlphongkham da duoc nap tu database/qlphongkham.sql');
console.log('Tai khoan mau: admin / bs1..bs15 / bn1..bn50 — mat khau: 123456');
