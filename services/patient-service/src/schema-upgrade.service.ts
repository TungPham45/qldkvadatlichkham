import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, EntityManager, Table, TableCheck, TableForeignKey } from 'typeorm';

const linkChecks = [
  new TableCheck({ name: 'chk_tkbn_loai_quan_he', expression: "loai_quan_he IN ('BanThan', 'Bo', 'Me', 'Con', 'Vo', 'Chong', 'NguoiThan', 'NguoiChamSoc')" }),
  new TableCheck({ name: 'chk_tkbn_trang_thai', expression: "trang_thai IN ('Active', 'Inactive')" }),
  new TableCheck({ name: 'chk_tkbn_chu_ho_so', expression: "(la_chu_ho_so = TRUE AND loai_quan_he = 'BanThan') OR (la_chu_ho_so = FALSE AND loai_quan_he <> 'BanThan')" }),
];

const indexes = [
  ['idx_benh_nhan_co_bhyt', 'CREATE INDEX idx_benh_nhan_co_bhyt ON benh_nhan(co_bhyt)'],
  ['uq_benh_nhan_so_bhyt', 'CREATE UNIQUE INDEX uq_benh_nhan_so_bhyt ON benh_nhan (upper(so_bhyt)) WHERE so_bhyt IS NOT NULL'],
  ['idx_tkbn_tai_khoan', 'CREATE INDEX idx_tkbn_tai_khoan ON tai_khoan_benh_nhan(id_tai_khoan)'],
  ['idx_tkbn_benh_nhan', 'CREATE INDEX idx_tkbn_benh_nhan ON tai_khoan_benh_nhan(id_benh_nhan)'],
  ['uq_benh_nhan_chu_ho_so', 'CREATE UNIQUE INDEX uq_benh_nhan_chu_ho_so ON tai_khoan_benh_nhan(id_benh_nhan) WHERE la_chu_ho_so = TRUE'],
  ['uq_tkbn_mot_ban_than', "CREATE UNIQUE INDEX uq_tkbn_mot_ban_than ON tai_khoan_benh_nhan(id_tai_khoan) WHERE loai_quan_he = 'BanThan'"],
  ['idx_lich_hen_tai_khoan_dat', 'CREATE INDEX idx_lich_hen_tai_khoan_dat ON lich_hen(id_tai_khoan_dat)'],
] as const;

/** Upgrade an existing database before this service accepts requests. */
@Injectable()
export class SchemaUpgradeService implements OnModuleInit {
  private readonly logger = new Logger(SchemaUpgradeService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    try {
      const changed = await this.dataSource.transaction((manager) => this.upgrade(manager));
      if (changed) this.logger.log('Đã nâng cấp cấu trúc tài khoản/bệnh nhân và BHYT, giữ nguyên dữ liệu hiện có.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Không thể nâng cấp cơ sở dữ liệu hiện có: ${reason}. Toàn bộ thay đổi đã được hoàn tác; không reset hoặc xóa dữ liệu.`, { cause: error });
    }
  }

  private async upgrade(manager: EntityManager): Promise<boolean> {
    const runner = manager.queryRunner;
    if (!runner) throw new Error('Thiếu TypeORM QueryRunner cho transaction nâng cấp');
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['qlpk-account-patient-schema-v2']);
    const patient = await runner.getTable('benh_nhan');
    const doctor = await runner.getTable('bac_si');
    const appointment = await runner.getTable('lich_hen');
    const account = await runner.getTable('tai_khoan');
    const links = await runner.getTable('tai_khoan_benh_nhan');
    if (!patient || !doctor || !appointment || !account) {
      throw new Error('Thiếu bảng nền tảng benh_nhan, bac_si, lich_hen hoặc tai_khoan');
    }
    if (links) {
      const required = ['id_tai_khoan', 'id_benh_nhan', 'loai_quan_he', 'la_chu_ho_so', 'duoc_dat_lich_ho', 'trang_thai', 'ngay_tao'];
      const missing = required.filter((name) => !links.findColumnByName(name));
      if (missing.length) throw new Error(`Bảng tai_khoan_benh_nhan thiếu cột ${missing.join(', ')}`);
    }
    const existingIndexes = await manager.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()
       AND tablename IN ('benh_nhan', 'tai_khoan_benh_nhan', 'lich_hen')`,
    ) as Array<{ indexname: string }>;
    const indexNames = new Set(existingIndexes.map((index) => index.indexname));
    const legacyAccount = patient.findColumnByName('id_tai_khoan');
    const addedCoBhyt = !patient.findColumnByName('co_bhyt');
    const addedSoBhyt = !patient.findColumnByName('so_bhyt');
    const addedBookingAccount = !appointment.findColumnByName('id_tai_khoan_dat');
    const insuranceUpgrade = addedCoBhyt || addedSoBhyt || !indexNames.has('uq_benh_nhan_so_bhyt');
    const legacyForeignKeys = patient.foreignKeys.filter((key) => key.columnNames.length === 1
      && key.columnNames[0] === 'id_tai_khoan' && key.referencedTableName.split('.').pop() === 'tai_khoan');
    const pending = !links || addedCoBhyt || addedSoBhyt || addedBookingAccount
      || !doctor.findColumnByName('nhan_bhyt') || legacyAccount?.isNullable === false
      || legacyForeignKeys.some((key) => key.onDelete !== 'SET NULL' || key.onUpdate !== 'CASCADE')
      || (legacyAccount !== undefined && legacyForeignKeys.length === 0)
      || indexes.some(([name]) => !indexNames.has(name))
      || linkChecks.some((check) => !links?.checks.some((existing) => existing.name === check.name))
      || !this.hasForeignKey(links, 'id_tai_khoan', 'tai_khoan', 'CASCADE')
      || !this.hasForeignKey(links, 'id_benh_nhan', 'benh_nhan', 'CASCADE')
      || !this.hasForeignKey(appointment, 'id_tai_khoan_dat', 'tai_khoan', 'SET NULL');
    if (!pending) return false;

    // Acquire table locks in the same account/doctor/patient order as live transactions.
    await manager.query(`LOCK TABLE tai_khoan, bac_si, benh_nhan, lich_hen${links ? ', tai_khoan_benh_nhan' : ''} IN ACCESS EXCLUSIVE MODE`);
    if (addedCoBhyt) await manager.query('ALTER TABLE benh_nhan ADD COLUMN co_bhyt BOOLEAN NOT NULL DEFAULT FALSE');
    if (addedSoBhyt) await manager.query('ALTER TABLE benh_nhan ADD COLUMN so_bhyt VARCHAR(20)');
    if (!doctor.findColumnByName('nhan_bhyt')) await manager.query('ALTER TABLE bac_si ADD COLUMN nhan_bhyt BOOLEAN NOT NULL DEFAULT FALSE');
    if (!links) {
      await manager.query(`CREATE TABLE tai_khoan_benh_nhan (
        id_tai_khoan UUID NOT NULL,
        id_benh_nhan BIGINT NOT NULL,
        loai_quan_he VARCHAR(50) NOT NULL,
        la_chu_ho_so BOOLEAN NOT NULL DEFAULT FALSE,
        duoc_dat_lich_ho BOOLEAN NOT NULL DEFAULT TRUE,
        trang_thai VARCHAR(30) NOT NULL DEFAULT 'Active',
        ngay_tao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id_tai_khoan, id_benh_nhan),
        CONSTRAINT fk_tkbn_tai_khoan FOREIGN KEY (id_tai_khoan) REFERENCES tai_khoan(id_tai_khoan) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_tkbn_benh_nhan FOREIGN KEY (id_benh_nhan) REFERENCES benh_nhan(id_benh_nhan) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT chk_tkbn_loai_quan_he CHECK (loai_quan_he IN ('BanThan', 'Bo', 'Me', 'Con', 'Vo', 'Chong', 'NguoiThan', 'NguoiChamSoc')),
        CONSTRAINT chk_tkbn_trang_thai CHECK (trang_thai IN ('Active', 'Inactive')),
        CONSTRAINT chk_tkbn_chu_ho_so CHECK ((la_chu_ho_so = TRUE AND loai_quan_he = 'BanThan') OR (la_chu_ho_so = FALSE AND loai_quan_he <> 'BanThan'))
      )`);
    }
    if (legacyAccount && (!links || !legacyAccount.isNullable)) {
      const orphans = await manager.query(`SELECT bn.id_benh_nhan AS id FROM benh_nhan bn
        LEFT JOIN tai_khoan tk ON tk.id_tai_khoan = bn.id_tai_khoan
        WHERE bn.id_tai_khoan IS NOT NULL AND tk.id_tai_khoan IS NULL LIMIT 5`) as Array<{ id: string }>;
      if (orphans.length) throw new Error(`Hồ sơ bệnh nhân ${orphans.map((row) => row.id).join(', ')} liên kết tới tài khoản không tồn tại`);
      await manager.query(`INSERT INTO tai_khoan_benh_nhan
        (id_tai_khoan, id_benh_nhan, loai_quan_he, la_chu_ho_so, duoc_dat_lich_ho, trang_thai)
        SELECT id_tai_khoan, id_benh_nhan, 'BanThan', TRUE, TRUE, 'Active'
        FROM benh_nhan WHERE id_tai_khoan IS NOT NULL
        ON CONFLICT (id_tai_khoan, id_benh_nhan) DO NOTHING`);
    }
    if (legacyAccount) {
      if (!legacyAccount.isNullable) await manager.query('ALTER TABLE benh_nhan ALTER COLUMN id_tai_khoan DROP NOT NULL');
      await this.ensureForeignKey(manager, patient, 'id_tai_khoan', 'tai_khoan', 'SET NULL', 'fk_benh_nhan_tai_khoan');
    }
    if (insuranceUpgrade) {
      if (addedCoBhyt && !addedSoBhyt) {
        await manager.query("UPDATE benh_nhan SET co_bhyt = TRUE WHERE btrim(so_bhyt) ~* '^[A-Z0-9]{10,15}$'");
      }
      if (patient.findColumnByName('so_bao_hiem_y_te') && (addedCoBhyt || addedSoBhyt)) {
        await manager.query(`UPDATE benh_nhan
          SET so_bhyt = upper(btrim(so_bao_hiem_y_te))${addedCoBhyt ? ', co_bhyt = TRUE' : ''}
          WHERE so_bhyt IS NULL AND btrim(so_bao_hiem_y_te) ~* '^[A-Z0-9]{10,15}$'
          ${addedCoBhyt ? '' : 'AND co_bhyt = TRUE'}`);
      }
      await manager.query(`UPDATE benh_nhan SET so_bhyt = NULLIF(upper(btrim(so_bhyt)), '')
        WHERE so_bhyt IS NOT NULL AND so_bhyt IS DISTINCT FROM NULLIF(upper(btrim(so_bhyt)), '')`);
      await manager.query(`UPDATE benh_nhan SET so_bhyt = 'DN401' || lpad(id_benh_nhan::text, 10, '0')
        WHERE co_bhyt = TRUE AND so_bhyt IS NULL`);
      await manager.query('UPDATE benh_nhan SET so_bhyt = NULL WHERE co_bhyt = FALSE AND so_bhyt IS NOT NULL');
      const duplicates = await manager.query(`SELECT array_agg(id_benh_nhan ORDER BY id_benh_nhan) AS ids
        FROM benh_nhan WHERE so_bhyt IS NOT NULL GROUP BY upper(so_bhyt) HAVING COUNT(*) > 1 LIMIT 5`) as Array<{ ids: string[] }>;
      if (duplicates.length) {
        throw new Error(`Số BHYT bị trùng giữa các hồ sơ ${duplicates.map((row) => row.ids.join('/')).join(', ')}; cần sửa số thẻ trùng trước khi nâng cấp`);
      }
    }
    if (addedBookingAccount) {
      await manager.query('ALTER TABLE lich_hen ADD COLUMN id_tai_khoan_dat UUID');
      await manager.query(`UPDATE lich_hen lh SET id_tai_khoan_dat = link.id_tai_khoan
        FROM tai_khoan_benh_nhan link WHERE link.id_benh_nhan = lh.id_benh_nhan
        AND link.la_chu_ho_so = TRUE AND lh.id_tai_khoan_dat IS NULL`);
    }
    const currentLinks = await runner.getTable('tai_khoan_benh_nhan');
    if (!currentLinks) throw new Error('Không tạo được bảng liên kết tài khoản/bệnh nhân');
    for (const check of linkChecks) {
      if (!currentLinks.checks.some((existing) => existing.name === check.name)) await runner.createCheckConstraint(currentLinks, check);
    }
    await this.ensureForeignKey(manager, currentLinks, 'id_tai_khoan', 'tai_khoan', 'CASCADE', 'fk_tkbn_tai_khoan');
    await this.ensureForeignKey(manager, currentLinks, 'id_benh_nhan', 'benh_nhan', 'CASCADE', 'fk_tkbn_benh_nhan');
    await this.ensureForeignKey(manager, appointment, 'id_tai_khoan_dat', 'tai_khoan', 'SET NULL', 'fk_lich_hen_tai_khoan_dat');
    for (const [name, statement] of indexes) {
      if (!indexNames.has(name)) await manager.query(statement);
    }
    return true;
  }

  private hasForeignKey(table: Table | undefined, column: string, target: string, onDelete: string): boolean {
    return table?.foreignKeys.some((key) => key.columnNames.length === 1 && key.columnNames[0] === column
      && key.referencedTableName.split('.').pop() === target && key.onDelete === onDelete && key.onUpdate === 'CASCADE') ?? false;
  }

  private async ensureForeignKey(manager: EntityManager, table: Table, column: string, target: string, onDelete: string, name: string) {
    const runner = manager.queryRunner!;
    const keys = table.foreignKeys.filter((key) => key.columnNames.length === 1 && key.columnNames[0] === column
      && key.referencedTableName.split('.').pop() === target);
    const correct = keys.find((key) => key.onDelete === onDelete && key.onUpdate === 'CASCADE');
    for (const key of keys) {
      if (key !== correct) await runner.dropForeignKey(table, key);
    }
    if (!correct) {
      await runner.createForeignKey(table, new TableForeignKey({
        name, columnNames: [column], referencedTableName: target,
        referencedColumnNames: [target === 'benh_nhan' ? 'id_benh_nhan' : 'id_tai_khoan'], onDelete, onUpdate: 'CASCADE',
      }));
    }
  }
}
