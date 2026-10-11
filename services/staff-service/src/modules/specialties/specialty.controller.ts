import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AppException, AppRole, isDbConflict, JwtAuthGuard, Roles, RolesGuard } from '@qlpk/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChuyenKhoa } from '../../database/entities';
import { SpecialtyInputDto, SpecialtyQueryDto } from './specialty.dto';

@Controller('specialties')
@UseGuards(JwtAuthGuard)
export class SpecialtyController {
  constructor(@InjectRepository(ChuyenKhoa) private readonly specialties: Repository<ChuyenKhoa>) {}

  @Get()
  async list() {
    const rows = await this.specialties.find({ where: { trangThai: 'Active' }, order: { tenChuyenKhoa: 'ASC' } });
    return rows.map((row) => ({ id: row.idChuyenKhoa, ten: row.tenChuyenKhoa, moTa: row.moTa }));
  }
}

@Controller('manager/specialties')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.MANAGER)
export class ManagerSpecialtyController {
  constructor(@InjectRepository(ChuyenKhoa) private readonly specialties: Repository<ChuyenKhoa>) {}

  @Get()
  async list(@Query() query: SpecialtyQueryDto) {
    const builder = this.specialties.createQueryBuilder('specialty');
    if (query.q?.trim()) builder.andWhere('(specialty.tenChuyenKhoa ILIKE :q OR COALESCE(specialty.moTa, \'\') ILIKE :q)', { q: `%${query.q.trim()}%` });
    if (query.trangThai) builder.andWhere('specialty.trangThai = :status', { status: query.trangThai });
    const [rows, total] = await builder.orderBy('specialty.idChuyenKhoa', 'ASC').skip((query.page - 1) * query.pageSize).take(query.pageSize).getManyAndCount();
    const counts = rows.length ? await this.specialties.manager.query(
      'SELECT id_chuyen_khoa, COUNT(*)::int AS total FROM bac_si_chuyen_khoa WHERE id_chuyen_khoa = ANY($1) GROUP BY id_chuyen_khoa',
      [rows.map((row) => row.idChuyenKhoa)],
    ) : [];
    const byId = new Map(counts.map((item: { id_chuyen_khoa: string; total: number }) => [Number(item.id_chuyen_khoa), Number(item.total)]));
    return {
      items: rows.map((row) => ({ id: row.idChuyenKhoa, ten: row.tenChuyenKhoa, moTa: row.moTa, trangThai: row.trangThai, soBacSi: byId.get(row.idChuyenKhoa) || 0 })),
      total, page: query.page, pageSize: query.pageSize,
    };
  }

  @Post()
  async create(@Body() dto: SpecialtyInputDto) {
    try {
      const row = await this.specialties.save(this.specialties.create({ tenChuyenKhoa: dto.ten.trim(), moTa: dto.moTa?.trim() || null, trangThai: dto.trangThai }));
      return { id: row.idChuyenKhoa };
    } catch (error) {
      if (isDbConflict(error)) throw new AppException(409, 'SPECIALTY_ALREADY_EXISTS', 'Tên chuyên khoa đã tồn tại.');
      throw error;
    }
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: SpecialtyInputDto) {
    const row = await this.specialties.findOne({ where: { idChuyenKhoa: id } });
    if (!row) throw new AppException(404, 'SPECIALTY_NOT_FOUND', 'Không tìm thấy chuyên khoa.');
    row.tenChuyenKhoa = dto.ten.trim();
    row.moTa = dto.moTa?.trim() || null;
    row.trangThai = dto.trangThai;
    try {
      await this.specialties.save(row);
      return { id };
    } catch (error) {
      if (isDbConflict(error)) throw new AppException(409, 'SPECIALTY_ALREADY_EXISTS', 'Tên chuyên khoa đã tồn tại.');
      throw error;
    }
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const result = await this.specialties.delete({ idChuyenKhoa: id });
    if (!result.affected) throw new AppException(404, 'SPECIALTY_NOT_FOUND', 'Không tìm thấy chuyên khoa.');
    return { success: true };
  }
}
