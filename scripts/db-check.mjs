#!/usr/bin/env node
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const expectedTables = [
  'tai_khoan', 'quan_ly', 'nhat_ky_hoat_dong', 'chuyen_khoa', 'bac_si',
  'bac_si_chuyen_khoa', 'lich_lam_viec', 'benh_nhan', 'tai_khoan_benh_nhan',
  'tien_su_benh', 'lich_hen', 'lich_su_lich_hen', 'tiep_nhan_benh_nhan',
  'danh_muc_ten_benh', 'phieu_kham', 'chan_doan', 'thuoc', 'goi_y_thuoc',
  'giao_dich_kho_thuoc', 'don_thuoc', 'chi_tiet_don_thuoc', 'hoa_don',
  'thanh_toan', 'thong_bao', 'chi_so_thong_ke',
];

const requiredColumns = {
  benh_nhan: ['id_benh_nhan', 'co_bhyt', 'so_bhyt', 'trang_thai'],
  tai_khoan_benh_nhan: ['id_tai_khoan', 'id_benh_nhan', 'la_chu_ho_so', 'duoc_dat_lich_ho', 'trang_thai'],
  lich_lam_viec: ['id_bac_si', 'ngay_lam_viec', 'gio_bat_dau', 'gio_ket_thuc', 'thoi_luong_moi_ca', 'trang_thai'],
  lich_hen: ['id_benh_nhan', 'id_bac_si', 'id_tai_khoan_dat', 'ngay_hen', 'gio_hen', 'trang_thai'],
  thong_bao: ['id_tai_khoan', 'id_lich_hen', 'thoi_gian_doc'],
};

const requiredRelations = [
  'fk_tkbn_tai_khoan', 'fk_tkbn_benh_nhan', 'fk_lich_hen_benh_nhan',
  'fk_lich_hen_bac_si', 'fk_lich_hen_tai_khoan_dat',
];

const requiredIndexes = [
  'uq_lich_hen_bac_si_khung_gio', 'uq_lich_lam_viec_bs_ngay_gio',
  'uq_benh_nhan_email', 'uq_benh_nhan_so_dien_thoai',
  'uq_bac_si_email', 'uq_bac_si_so_dien_thoai',
  'idx_thong_bao_tai_khoan_chua_doc',
];

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5433),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'qlphongkham',
  connectionTimeoutMillis: 5000,
  application_name: 'qlpk-db-check',
});

let failures = 0;
function report(ok, label, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`${status} ${label}${detail ? `: ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function scalar(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
}

async function checkMigrations() {
  const directory = path.resolve('database', 'migrations');
  const names = (await readdir(directory)).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
  const ledgerExists = await scalar("SELECT to_regclass('public.schema_migrations') IS NOT NULL");
  if (!ledgerExists) {
    report(false, 'migration ledger', `${names.length} local migration(s) are untracked`);
    return;
  }
  const applied = await client.query('SELECT name, checksum FROM schema_migrations ORDER BY name');
  const checksums = new Map(applied.rows.map((row) => [row.name, row.checksum.trim()]));
  for (const name of names) {
    const content = await readFile(path.join(directory, name));
    const checksum = createHash('sha256').update(content).digest('hex');
    const appliedChecksum = checksums.get(name);
    report(appliedChecksum === checksum, `migration ${name}`, appliedChecksum ? 'checksum verified' : 'pending');
  }
}

async function main() {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  try {
    const identity = await client.query(
      "SELECT current_database() AS database, current_setting('server_version') AS version, current_setting('TimeZone') AS timezone",
    );
    const info = identity.rows[0];
    report(info.database === (process.env.DB_NAME || 'qlphongkham'), 'database name', info.database);
    report(Number.parseInt(info.version, 10) >= 15, 'PostgreSQL version', info.version);
    report(info.timezone === 'Asia/Ho_Chi_Minh', 'database timezone', info.timezone);

    const tableRows = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
    );
    const tables = new Set(tableRows.rows.map((row) => row.table_name));
    const missingTables = expectedTables.filter((name) => !tables.has(name));
    report(missingTables.length === 0, 'required tables', missingTables.length ? `missing ${missingTables.join(', ')}` : `${expectedTables.length} present`);

    const columnRows = await client.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'",
    );
    const columns = new Set(columnRows.rows.map((row) => `${row.table_name}.${row.column_name}`));
    const missingColumns = Object.entries(requiredColumns).flatMap(([table, names]) =>
      names.filter((name) => !columns.has(`${table}.${name}`)).map((name) => `${table}.${name}`),
    );
    report(missingColumns.length === 0, 'backend-required columns', missingColumns.length ? `missing ${missingColumns.join(', ')}` : 'present');

    const constraints = new Set((await client.query("SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace")).rows.map((row) => row.conname));
    const missingRelations = requiredRelations.filter((name) => !constraints.has(name));
    report(missingRelations.length === 0, 'required foreign keys', missingRelations.length ? `missing ${missingRelations.join(', ')}` : 'present');

    const indexes = new Set((await client.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'")).rows.map((row) => row.indexname));
    const missingIndexes = requiredIndexes.filter((name) => !indexes.has(name));
    report(missingIndexes.length === 0, 'required indexes', missingIndexes.length ? `missing ${missingIndexes.join(', ')}` : 'present');

    const checks = [
      ['duplicate active appointment slots', "SELECT count(*) FROM (SELECT 1 FROM lich_hen WHERE trang_thai <> 'Huy' GROUP BY id_bac_si, ngay_hen, gio_hen HAVING count(*) > 1) d"],
      ['duplicate patient emails', "SELECT count(*) FROM (SELECT 1 FROM benh_nhan WHERE email IS NOT NULL AND btrim(email) <> '' GROUP BY lower(btrim(email)) HAVING count(*) > 1) d"],
      ['duplicate patient phone numbers', "SELECT count(*) FROM (SELECT 1 FROM benh_nhan WHERE so_dien_thoai IS NOT NULL AND btrim(so_dien_thoai) <> '' GROUP BY btrim(so_dien_thoai) HAVING count(*) > 1) d"],
      ['duplicate doctor emails', "SELECT count(*) FROM (SELECT 1 FROM bac_si WHERE email IS NOT NULL AND btrim(email) <> '' GROUP BY lower(btrim(email)) HAVING count(*) > 1) d"],
      ['orphan account-patient links', 'SELECT count(*) FROM tai_khoan_benh_nhan l LEFT JOIN tai_khoan t ON t.id_tai_khoan=l.id_tai_khoan LEFT JOIN benh_nhan b ON b.id_benh_nhan=l.id_benh_nhan WHERE t.id_tai_khoan IS NULL OR b.id_benh_nhan IS NULL'],
      ['orphan appointments', 'SELECT count(*) FROM lich_hen l LEFT JOIN benh_nhan b ON b.id_benh_nhan=l.id_benh_nhan LEFT JOIN bac_si d ON d.id_bac_si=l.id_bac_si WHERE b.id_benh_nhan IS NULL OR d.id_bac_si IS NULL'],
    ];
    for (const [label, sql] of checks) {
      const count = Number(await scalar(sql));
      report(count === 0, label, String(count));
    }

    const sample = await client.query(
      `SELECT
        (SELECT count(*)::int FROM tai_khoan WHERE vai_tro='Admin') AS admins,
        (SELECT count(*)::int FROM bac_si) AS doctors,
        (SELECT count(*)::int FROM benh_nhan) AS patients,
        (SELECT count(*)::int FROM chuyen_khoa) AS specialties,
        (SELECT count(*)::int FROM lich_lam_viec) AS schedules`,
    );
    const counts = sample.rows[0];
    report(counts.admins > 0, 'admin sample data', `${counts.admins} row(s)`);
    report(counts.doctors > 0, 'doctor sample data', `${counts.doctors} row(s)`);
    report(counts.patients > 0, 'patient sample data', `${counts.patients} row(s)`);
    report(counts.specialties > 0, 'specialty sample data', `${counts.specialties} row(s)`);
    report(counts.schedules > 0, 'schedule sample data', `${counts.schedules} row(s)`);

    await checkMigrations();
  } finally {
    await client.query('ROLLBACK');
  }
}

try {
  await main();
} catch (error) {
  failures += 1;
  const code = error && typeof error === 'object' && 'code' in error ? error.code : 'UNKNOWN';
  console.error(`FAIL database check could not complete (${code}).`);
} finally {
  await client.end().catch(() => undefined);
}

process.exitCode = failures ? 1 : 0;
