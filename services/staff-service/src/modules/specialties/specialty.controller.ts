import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@qlpk/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChuyenKhoa } from '../../database/entities';

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
