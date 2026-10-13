import './load-env';
import 'reflect-metadata';
import {
  Body, Controller, Delete, Get, Inject, Injectable, Module, Param, ParseIntPipe,
  Post, Put, Query, UseGuards, ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AllExceptionsFilter, AppException, AppRole,
  ErrorCode, JwtAuthGuard, Roles, RolesGuard, isDbConflict,
} from '@qlpk/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { DataSource } from 'typeorm';

class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 10;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() group?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() stockStatus?: string;
  @IsOptional() @IsString() active?: string;
}

class MedicineDto {
  @IsString() @MinLength(1) @MaxLength(255) name!: string;
  @IsOptional() @IsString() @MaxLength(255) activeIngredient?: string;
  @IsOptional() @IsString() @MaxLength(100) strength?: string;
  @IsOptional() @IsString() @MaxLength(50) unit?: string;
  @IsOptional() @IsString() @MaxLength(100) group?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitPrice!: number;
  @Type(() => Number) @IsInt() @Min(0) stockQuantity!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) lowStockThreshold?: number;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() @MaxLength(255) manufacturer?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() active?: boolean;
}

class SuggestionDiseaseQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() group?: string;
  @IsOptional() @IsString() configured?: string;
}

class SuggestionItemDto {
  @Type(() => Number) @IsInt() @Min(1) medicineId!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) priority?: number;
  @IsOptional() @IsString() @MaxLength(255) purpose?: string;
  @IsOptional() @IsString() @MaxLength(255) dosage?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() active?: boolean;
}

class SaveProtocolDto {
  @IsOptional() @Type(() => Boolean) @IsBoolean() applying?: boolean;
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => SuggestionItemDto)
  items!: SuggestionItemDto[];
}

class UpdateSuggestionDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) priority?: number;
  @IsOptional() @IsString() @MaxLength(255) purpose?: string;
  @IsOptional() @IsString() @MaxLength(255) dosage?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() active?: boolean;
}

class AddSuggestionDto extends SuggestionItemDto {}

class ApplyingDto {
  @Type(() => Boolean) @IsBoolean() applying!: boolean;
}

function clean(value?: string) {
  return value?.trim() || null;
}

function medicineCode(id: number) {
  return `TH-${String(id).padStart(4, '0')}`;
}

function mapRow(row: Record<string, unknown>) {
  const id = Number(row.id);
  const stockQuantity = Number(row.stockQuantity);
  const lowStockThreshold = Number(row.lowStockThreshold);
  const lowStock = stockQuantity <= lowStockThreshold;
  return {
    id,
    code: medicineCode(id),
    name: row.name,
    activeIngredient: row.activeIngredient ?? null,
    strength: row.strength ?? null,
    unit: row.unit ?? null,
    group: row.group ?? null,
    unitPrice: Number(row.unitPrice),
    stockQuantity,
    lowStockThreshold,
    lowStock,
    stockLabel: lowStock ? 'Sắp hết' : 'Đủ tồn kho',
    expiryDate: row.expiryDate ?? null,
    manufacturer: row.manufacturer ?? null,
    active: Boolean(row.active),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const SELECT_FIELDS = `
  id_thuoc id, ten_thuoc name, hoat_chat "activeIngredient", ham_luong strength, don_vi unit,
  nhom_thuoc "group", don_gia "unitPrice", so_luong_ton "stockQuantity", nguong_canh_bao "lowStockThreshold",
  han_su_dung::text "expiryDate", nha_san_xuat manufacturer, dang_hoat_dong active,
  ngay_tao "createdAt", ngay_cap_nhat "updatedAt"
`;

@Injectable()
class PharmacyService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  private buildWhere(q: PageQuery) {
    const where: string[] = [];
    const values: unknown[] = [];
    if (q.search?.trim()) {
      const term = `%${q.search.trim()}%`;
      values.push(term);
      const i = values.length;
      where.push(`(ten_thuoc ILIKE $${i} OR COALESCE(hoat_chat,'') ILIKE $${i} OR ('TH-'||LPAD(id_thuoc::text,4,'0')) ILIKE $${i})`);
    }
    if (q.group?.trim()) {
      values.push(q.group.trim());
      where.push(`nhom_thuoc = $${values.length}`);
    }
    if (q.unit?.trim()) {
      values.push(q.unit.trim());
      where.push(`don_vi = $${values.length}`);
    }
    if (q.stockStatus === 'low') {
      where.push('so_luong_ton <= nguong_canh_bao');
    } else if (q.stockStatus === 'safe') {
      where.push('so_luong_ton > nguong_canh_bao');
    }
    if (q.active === 'true' || q.active === '1') {
      where.push('dang_hoat_dong = TRUE');
    } else if (q.active === 'false' || q.active === '0') {
      where.push('dang_hoat_dong = FALSE');
    }
    return { where, values, clause: where.length ? `WHERE ${where.join(' AND ')}` : '' };
  }

  async list(q: PageQuery) {
    const { values, clause } = this.buildWhere(q);
    const total = (await this.db.query(`SELECT COUNT(*)::int total FROM thuoc ${clause}`, values))[0].total as number;
    const pageValues = [...values, q.limit, (q.page - 1) * q.limit];
    const rows = await this.db.query(
      `SELECT ${SELECT_FIELDS} FROM thuoc ${clause} ORDER BY ten_thuoc, id_thuoc LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );
    const statsRow = await this.db.query(`
      SELECT COUNT(*) FILTER (WHERE dang_hoat_dong)::int total,
        COUNT(*) FILTER (WHERE so_luong_ton > nguong_canh_bao AND dang_hoat_dong)::int safe,
        COUNT(*) FILTER (WHERE so_luong_ton <= nguong_canh_bao AND dang_hoat_dong)::int low
      FROM thuoc
    `);
    const groups = (await this.db.query(
      `SELECT DISTINCT nhom_thuoc value FROM thuoc WHERE nhom_thuoc IS NOT NULL AND nhom_thuoc <> '' ORDER BY nhom_thuoc`,
    )).map((r: { value: string }) => r.value);
    const units = (await this.db.query(
      `SELECT DISTINCT don_vi value FROM thuoc WHERE don_vi IS NOT NULL AND don_vi <> '' ORDER BY don_vi`,
    )).map((r: { value: string }) => r.value);
    return {
      items: rows.map(mapRow),
      total,
      page: q.page,
      limit: q.limit,
      groups,
      units,
      stats: { total: statsRow[0].total, safe: statsRow[0].safe, low: statsRow[0].low },
    };
  }

  async one(id: number) {
    const rows = await this.db.query(`SELECT ${SELECT_FIELDS} FROM thuoc WHERE id_thuoc = $1`, [id]);
    if (!rows.length) throw new AppException(404, 'MEDICINE_NOT_FOUND', 'Không tìm thấy thuốc.');
    return mapRow(rows[0]);
  }

  async save(id: number | null, dto: MedicineDto) {
    const name = dto.name.trim();
    if (!name) throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Tên thuốc là bắt buộc.');
    const activeIngredient = clean(dto.activeIngredient);
    const strength = clean(dto.strength);
    const unit = clean(dto.unit);
    const group = clean(dto.group);
    const manufacturer = clean(dto.manufacturer);
    const expiryDate = dto.expiryDate?.slice(0, 10) || null;
    const lowStockThreshold = dto.lowStockThreshold ?? 50;
    const active = dto.active ?? true;
    try {
      if (id) {
        const result = await this.db.query(
          `UPDATE thuoc SET
            ten_thuoc=$1, hoat_chat=$2, ham_luong=$3, don_vi=$4, nhom_thuoc=$5, don_gia=$6,
            so_luong_ton=$7, nguong_canh_bao=$8, han_su_dung=$9, nha_san_xuat=$10,
            dang_hoat_dong=$11, ngay_cap_nhat=CURRENT_TIMESTAMP
           WHERE id_thuoc=$12 RETURNING id_thuoc id`,
          [name, activeIngredient, strength, unit, group, dto.unitPrice, dto.stockQuantity,
            lowStockThreshold, expiryDate, manufacturer, active, id],
        );
        if (!result.length) throw new AppException(404, 'MEDICINE_NOT_FOUND', 'Không tìm thấy thuốc.');
        return this.one(id);
      }
      const result = await this.db.query(
        `INSERT INTO thuoc(ten_thuoc, hoat_chat, ham_luong, don_vi, nhom_thuoc, don_gia, so_luong_ton, nguong_canh_bao, han_su_dung, nha_san_xuat, dang_hoat_dong)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id_thuoc id`,
        [name, activeIngredient, strength, unit, group, dto.unitPrice, dto.stockQuantity,
          lowStockThreshold, expiryDate, manufacturer, active],
      );
      return this.one(Number(result[0].id));
    } catch (error) {
      if (isDbConflict(error)) {
        throw new AppException(409, 'MEDICINE_CONFLICT', 'Không thể lưu thuốc do xung đột dữ liệu.');
      }
      throw error;
    }
  }

  async remove(id: number) {
    const existing = await this.one(id);
    try {
      const result = await this.db.query(`DELETE FROM thuoc WHERE id_thuoc = $1 RETURNING id_thuoc id`, [id]);
      if (!result.length) throw new AppException(404, 'MEDICINE_NOT_FOUND', 'Không tìm thấy thuốc.');
      return { id, deleted: true };
    } catch (error) {
      if (isDbConflict(error)) {
        await this.db.query(
          `UPDATE thuoc SET dang_hoat_dong = FALSE, ngay_cap_nhat = CURRENT_TIMESTAMP WHERE id_thuoc = $1`,
          [id],
        );
        return { id, deleted: false, deactivated: true, name: existing.name };
      }
      throw error;
    }
  }

  private mapSuggestion(row: Record<string, unknown>) {
    const medicineId = Number(row.medicineId);
    return {
      id: Number(row.id),
      diseaseId: Number(row.diseaseId),
      medicineId,
      priority: Number(row.priority),
      purpose: (row.purpose as string | null) ?? null,
      dosage: (row.dosage as string | null) ?? null,
      quantity: row.quantity == null ? null : Number(row.quantity),
      note: (row.note as string | null) ?? null,
      active: Boolean(row.active),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      medicine: {
        id: medicineId,
        code: medicineCode(medicineId),
        name: row.medicineName,
        activeIngredient: row.activeIngredient ?? null,
        strength: row.strength ?? null,
        unit: row.unit ?? null,
        group: row.group ?? null,
        stockQuantity: Number(row.stockQuantity ?? 0),
        active: Boolean(row.medicineActive),
      },
    };
  }

  private async requireDisease(diseaseId: number) {
    const rows = await this.db.query(
      `SELECT id_danh_muc_ten_benh id, ma_benh code, ten_benh name, nhom_benh "group", mo_ta description
       FROM danh_muc_ten_benh WHERE id_danh_muc_ten_benh = $1`,
      [diseaseId],
    );
    if (!rows.length) throw new AppException(404, 'DISEASE_NOT_FOUND', 'Không tìm thấy bệnh.');
    const row = rows[0] as { id: number | string; code: string; name: string; group: string | null; description: string | null };
    return { ...row, id: Number(row.id) };
  }

  async suggestionStats() {
    const rows = await this.db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM danh_muc_ten_benh) "diseaseTotal",
        (SELECT COUNT(DISTINCT id_danh_muc_ten_benh)::int FROM goi_y_thuoc WHERE dang_hoat_dong) "configuredDiseases",
        (SELECT COUNT(*)::int FROM goi_y_thuoc WHERE dang_hoat_dong) "suggestionTotal",
        (SELECT MAX(ngay_cap_nhat) FROM goi_y_thuoc) "lastUpdatedAt"
    `);
    const row = rows[0] || {};
    return {
      diseaseTotal: Number(row.diseaseTotal || 0),
      configuredDiseases: Number(row.configuredDiseases || 0),
      suggestionTotal: Number(row.suggestionTotal || 0),
      lastUpdatedAt: row.lastUpdatedAt ?? null,
    };
  }

  async suggestionDiseases(q: SuggestionDiseaseQuery) {
    const where: string[] = [];
    const values: unknown[] = [];
    if (q.search?.trim()) {
      values.push(`%${q.search.trim()}%`);
      where.push(`(d.ma_benh ILIKE $${values.length} OR d.ten_benh ILIKE $${values.length})`);
    }
    if (q.group?.trim()) {
      values.push(q.group.trim());
      where.push(`d.nhom_benh = $${values.length}`);
    }
    if (q.configured === 'yes' || q.configured === '1') {
      where.push(`EXISTS (SELECT 1 FROM goi_y_thuoc g WHERE g.id_danh_muc_ten_benh = d.id_danh_muc_ten_benh AND g.dang_hoat_dong)`);
    } else if (q.configured === 'no' || q.configured === '0') {
      where.push(`NOT EXISTS (SELECT 1 FROM goi_y_thuoc g WHERE g.id_danh_muc_ten_benh = d.id_danh_muc_ten_benh AND g.dang_hoat_dong)`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await this.db.query(
      `SELECT COUNT(*)::int total FROM danh_muc_ten_benh d ${clause}`,
      values,
    ))[0].total as number;
    const pageValues = [...values, q.limit, (q.page - 1) * q.limit];
    const rows = await this.db.query(
      `SELECT d.id_danh_muc_ten_benh id, d.ma_benh code, d.ten_benh name, d.nhom_benh "group",
              COALESCE((SELECT COUNT(*)::int FROM goi_y_thuoc g WHERE g.id_danh_muc_ten_benh = d.id_danh_muc_ten_benh AND g.dang_hoat_dong), 0) "suggestionCount",
              EXISTS (SELECT 1 FROM goi_y_thuoc g WHERE g.id_danh_muc_ten_benh = d.id_danh_muc_ten_benh AND g.dang_hoat_dong) configured
       FROM danh_muc_ten_benh d
       ${clause}
       ORDER BY configured DESC, d.ten_benh, d.id_danh_muc_ten_benh
       LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );
    const groups = (await this.db.query(
      `SELECT DISTINCT nhom_benh value FROM danh_muc_ten_benh WHERE nhom_benh IS NOT NULL AND nhom_benh <> '' ORDER BY nhom_benh`,
    )).map((r: { value: string }) => r.value);
    return {
      items: rows.map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        code: row.code,
        name: row.name,
        group: row.group ?? null,
        suggestionCount: Number(row.suggestionCount),
        configured: Boolean(row.configured),
      })),
      total,
      page: q.page,
      limit: q.limit,
      groups,
    };
  }

  async suggestionsByDisease(diseaseId: number, activeOnly = false) {
    const disease = await this.requireDisease(diseaseId);
    const activeClause = activeOnly ? 'AND g.dang_hoat_dong = TRUE AND t.dang_hoat_dong = TRUE' : '';
    const rows = await this.db.query(
      `SELECT g.id_goi_y_thuoc id, g.id_danh_muc_ten_benh "diseaseId", g.id_thuoc "medicineId",
              g.muc_do_uu_tien priority, g.muc_dich_su_dung purpose, g.lieu_dung_goi_y dosage,
              g.so_luong_goi_y quantity, g.ghi_chu note, g.dang_hoat_dong active,
              g.ngay_tao "createdAt", g.ngay_cap_nhat "updatedAt",
              t.ten_thuoc "medicineName", t.hoat_chat "activeIngredient", t.ham_luong strength,
              t.don_vi unit, t.nhom_thuoc "group", t.so_luong_ton "stockQuantity", t.dang_hoat_dong "medicineActive"
       FROM goi_y_thuoc g
       JOIN thuoc t ON t.id_thuoc = g.id_thuoc
       WHERE g.id_danh_muc_ten_benh = $1 ${activeClause}
       ORDER BY g.muc_do_uu_tien, g.id_goi_y_thuoc`,
      [diseaseId],
    );
    const items = rows.map((row: Record<string, unknown>) => this.mapSuggestion(row));
    const applying = items.some((item: { active: boolean }) => item.active);
    return { disease, applying, items };
  }

  async saveProtocol(diseaseId: number, dto: SaveProtocolDto) {
    await this.requireDisease(diseaseId);
    const applying = dto.applying ?? true;
    const seen = new Set<number>();
    for (const item of dto.items) {
      if (seen.has(item.medicineId)) {
        throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Danh sách thuốc gợi ý bị trùng.');
      }
      seen.add(item.medicineId);
    }
    await this.db.transaction(async (manager) => {
      for (const item of dto.items) {
        const meds = await manager.query(
          `SELECT id_thuoc id FROM thuoc WHERE id_thuoc = $1 AND dang_hoat_dong = TRUE`,
          [item.medicineId],
        );
        if (!meds.length) {
          throw new AppException(404, 'MEDICINE_NOT_FOUND', `Không tìm thấy thuốc #${item.medicineId}.`);
        }
      }
      await manager.query(`DELETE FROM goi_y_thuoc WHERE id_danh_muc_ten_benh = $1`, [diseaseId]);
      let priority = 1;
      for (const item of dto.items) {
        await manager.query(
          `INSERT INTO goi_y_thuoc(
             id_danh_muc_ten_benh, id_thuoc, muc_do_uu_tien, muc_dich_su_dung,
             lieu_dung_goi_y, so_luong_goi_y, ghi_chu, dang_hoat_dong
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            diseaseId,
            item.medicineId,
            item.priority ?? priority,
            clean(item.purpose) || 'Hỗ trợ điều trị theo chẩn đoán',
            clean(item.dosage) || 'Theo chỉ định của bác sĩ',
            item.quantity ?? null,
            clean(item.note),
            applying ? (item.active ?? true) : false,
          ],
        );
        priority += 1;
      }
    });
    return this.suggestionsByDisease(diseaseId);
  }

  async addSuggestion(diseaseId: number, dto: AddSuggestionDto) {
    await this.requireDisease(diseaseId);
    const meds = await this.db.query(
      `SELECT id_thuoc id FROM thuoc WHERE id_thuoc = $1 AND dang_hoat_dong = TRUE`,
      [dto.medicineId],
    );
    if (!meds.length) throw new AppException(404, 'MEDICINE_NOT_FOUND', 'Không tìm thấy thuốc.');
    const maxPriority = (await this.db.query(
      `SELECT COALESCE(MAX(muc_do_uu_tien), 0)::int value FROM goi_y_thuoc WHERE id_danh_muc_ten_benh = $1`,
      [diseaseId],
    ))[0].value as number;
    try {
      await this.db.query(
        `INSERT INTO goi_y_thuoc(
           id_danh_muc_ten_benh, id_thuoc, muc_do_uu_tien, muc_dich_su_dung,
           lieu_dung_goi_y, so_luong_goi_y, ghi_chu, dang_hoat_dong
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          diseaseId,
          dto.medicineId,
          dto.priority ?? maxPriority + 1,
          clean(dto.purpose) || 'Hỗ trợ điều trị theo chẩn đoán',
          clean(dto.dosage) || 'Theo chỉ định của bác sĩ',
          dto.quantity ?? null,
          clean(dto.note),
          dto.active ?? true,
        ],
      );
    } catch (error) {
      if (isDbConflict(error)) {
        throw new AppException(409, 'SUGGESTION_EXISTS', 'Thuốc này đã có trong phác đồ của bệnh.');
      }
      throw error;
    }
    return this.suggestionsByDisease(diseaseId);
  }

  async updateSuggestion(id: number, dto: UpdateSuggestionDto) {
    const existing = await this.db.query(
      `SELECT id_goi_y_thuoc id, id_danh_muc_ten_benh "diseaseId" FROM goi_y_thuoc WHERE id_goi_y_thuoc = $1`,
      [id],
    );
    if (!existing.length) throw new AppException(404, 'SUGGESTION_NOT_FOUND', 'Không tìm thấy gợi ý thuốc.');
    const sets: string[] = [];
    const values: unknown[] = [];
    const push = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (dto.priority !== undefined) push('muc_do_uu_tien', dto.priority);
    if (dto.purpose !== undefined) push('muc_dich_su_dung', clean(dto.purpose));
    if (dto.dosage !== undefined) push('lieu_dung_goi_y', clean(dto.dosage));
    if (dto.quantity !== undefined) push('so_luong_goi_y', dto.quantity);
    if (dto.note !== undefined) push('ghi_chu', clean(dto.note));
    if (dto.active !== undefined) push('dang_hoat_dong', dto.active);
    if (!sets.length) throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Không có trường nào để cập nhật.');
    values.push(id);
    await this.db.query(
      `UPDATE goi_y_thuoc SET ${sets.join(', ')}, ngay_cap_nhat = CURRENT_TIMESTAMP WHERE id_goi_y_thuoc = $${values.length}`,
      values,
    );
    return this.suggestionsByDisease(Number(existing[0].diseaseId));
  }

  async removeSuggestion(id: number) {
    const existing = await this.db.query(
      `SELECT id_goi_y_thuoc id, id_danh_muc_ten_benh "diseaseId" FROM goi_y_thuoc WHERE id_goi_y_thuoc = $1`,
      [id],
    );
    if (!existing.length) throw new AppException(404, 'SUGGESTION_NOT_FOUND', 'Không tìm thấy gợi ý thuốc.');
    await this.db.query(`DELETE FROM goi_y_thuoc WHERE id_goi_y_thuoc = $1`, [id]);
    return this.suggestionsByDisease(Number(existing[0].diseaseId));
  }

  async setProtocolApplying(diseaseId: number, applying: boolean) {
    await this.requireDisease(diseaseId);
    await this.db.query(
      `UPDATE goi_y_thuoc SET dang_hoat_dong = $2, ngay_cap_nhat = CURRENT_TIMESTAMP WHERE id_danh_muc_ten_benh = $1`,
      [diseaseId, applying],
    );
    return this.suggestionsByDisease(diseaseId);
  }

  async loadTemplate(diseaseId: number) {
    const disease = await this.requireDisease(diseaseId);
    const group = (disease.group || '').toLowerCase();
    const code = (disease.code || '').toUpperCase();
    let medicineGroups: string[] = ['Khác'];
    if (code.startsWith('J') || group.includes('hô hấp')) {
      medicineGroups = ['Kháng sinh', 'Hô hấp', 'Giảm đau - Hạ sốt'];
    } else if (code.startsWith('K') || group.includes('tiêu hóa')) {
      medicineGroups = ['Tiêu hóa', 'Giảm đau - Hạ sốt'];
    } else if (code.startsWith('I') || group.includes('tuần hoàn') || group.includes('tim')) {
      medicineGroups = ['Tim mạch', 'Lipid máu'];
    } else if (code.startsWith('E') || group.includes('nội tiết') || group.includes('đái')) {
      medicineGroups = ['Đái tháo đường', 'Vitamin - Khoáng chất'];
    } else if (code.startsWith('L') || group.includes('da ')) {
      medicineGroups = ['Kháng Histamin', 'Corticoid'];
    } else if (code.startsWith('A') || code.startsWith('B') || group.includes('nhiễm trùng')) {
      medicineGroups = ['Kháng sinh', 'Giảm đau - Hạ sốt', 'Bù nước điện giải'];
    } else if (code.startsWith('T78') || group.includes('dị ứng')) {
      medicineGroups = ['Kháng Histamin', 'Corticoid'];
    } else if (code.startsWith('M') || group.includes('cơ xương')) {
      medicineGroups = ['Giảm đau - Hạ sốt', 'Corticoid'];
    } else if (code.startsWith('N') || group.includes('tiết niệu')) {
      medicineGroups = ['Kháng sinh', 'Giảm đau - Hạ sốt'];
    }

    const meds = await this.db.query(
      `SELECT id_thuoc id FROM thuoc
       WHERE dang_hoat_dong = TRUE
         AND (
           nhom_thuoc = ANY($1::text[])
           OR id_thuoc IN (SELECT id_thuoc FROM thuoc WHERE dang_hoat_dong ORDER BY id_thuoc LIMIT 5)
         )
       ORDER BY
         CASE WHEN nhom_thuoc = ANY($1::text[]) THEN 0 ELSE 1 END,
         id_thuoc
       LIMIT 5`,
      [medicineGroups],
    );
    if (!meds.length) {
      throw new AppException(404, 'MEDICINE_NOT_FOUND', 'Chưa có thuốc trong kho để tạo phác đồ mẫu.');
    }
    const items: SuggestionItemDto[] = meds.map((row: { id: number }, index: number) => {
      const item = new SuggestionItemDto();
      item.medicineId = Number(row.id);
      item.priority = index + 1;
      item.purpose = 'Phác đồ mẫu theo nhóm bệnh';
      item.dosage = 'Theo chỉ định của bác sĩ';
      item.active = true;
      return item;
    });
    const dto = new SaveProtocolDto();
    dto.applying = true;
    dto.items = items;
    return this.saveProtocol(diseaseId, dto);
  }
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
class PharmacyController {
  constructor(@Inject(PharmacyService) private readonly service: PharmacyService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'pharmacy-service' };
  }

  @Get('medicines')
  @Roles(AppRole.DOCTOR, AppRole.MANAGER)
  list(@Query() query: PageQuery) {
    return this.service.list(query);
  }

  @Get('medicines/:id')
  @Roles(AppRole.DOCTOR, AppRole.MANAGER)
  one(@Param('id', ParseIntPipe) id: number) {
    return this.service.one(id);
  }

  @Post('medicines')
  @Roles(AppRole.MANAGER)
  create(@Body() body: MedicineDto) {
    return this.service.save(null, body);
  }

  @Put('medicines/:id')
  @Roles(AppRole.MANAGER)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: MedicineDto) {
    return this.service.save(id, body);
  }

  @Delete('medicines/:id')
  @Roles(AppRole.MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Get('medicine-suggestions/stats')
  @Roles(AppRole.DOCTOR, AppRole.MANAGER)
  suggestionStats() {
    return this.service.suggestionStats();
  }

  @Get('medicine-suggestions/diseases')
  @Roles(AppRole.DOCTOR, AppRole.MANAGER)
  suggestionDiseases(@Query() query: SuggestionDiseaseQuery) {
    return this.service.suggestionDiseases(query);
  }

  @Get('medicine-suggestions/by-disease/:diseaseId')
  @Roles(AppRole.DOCTOR, AppRole.MANAGER)
  suggestionsByDisease(
    @Param('diseaseId', ParseIntPipe) diseaseId: number,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.service.suggestionsByDisease(diseaseId, activeOnly === 'true' || activeOnly === '1');
  }

  @Put('medicine-suggestions/by-disease/:diseaseId')
  @Roles(AppRole.MANAGER)
  saveProtocol(@Param('diseaseId', ParseIntPipe) diseaseId: number, @Body() body: SaveProtocolDto) {
    return this.service.saveProtocol(diseaseId, body);
  }

  @Post('medicine-suggestions/by-disease/:diseaseId')
  @Roles(AppRole.MANAGER)
  addSuggestion(@Param('diseaseId', ParseIntPipe) diseaseId: number, @Body() body: AddSuggestionDto) {
    return this.service.addSuggestion(diseaseId, body);
  }

  @Post('medicine-suggestions/by-disease/:diseaseId/load-template')
  @Roles(AppRole.MANAGER)
  loadTemplate(@Param('diseaseId', ParseIntPipe) diseaseId: number) {
    return this.service.loadTemplate(diseaseId);
  }

  @Put('medicine-suggestions/by-disease/:diseaseId/applying')
  @Roles(AppRole.MANAGER)
  setApplying(@Param('diseaseId', ParseIntPipe) diseaseId: number, @Body() body: ApplyingDto) {
    return this.service.setProtocolApplying(diseaseId, body.applying);
  }

  @Put('medicine-suggestions/:id')
  @Roles(AppRole.MANAGER)
  updateSuggestion(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateSuggestionDto) {
    return this.service.updateSuggestion(id, body);
  }

  @Delete('medicine-suggestions/:id')
  @Roles(AppRole.MANAGER)
  removeSuggestion(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeSuggestion(id);
  }
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5433),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'qlphongkham',
      synchronize: false,
    }),
    JwtModule.register({ secret: process.env.JWT_ACCESS_SECRET }),
  ],
  controllers: [PharmacyController],
  providers: [PharmacyService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(Number(process.env.PHARMACY_PORT || 3011));
}

bootstrap();
