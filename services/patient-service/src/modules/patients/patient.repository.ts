import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BenhNhan } from './benh-nhan.entity';
import { CreatePatientDto } from './dto/patient.dto';

@Injectable()
export class PatientRepository {
  constructor(
    @InjectRepository(BenhNhan) private readonly patients: Repository<BenhNhan>,
    private readonly dataSource: DataSource,
  ) {}

  async findByAccount(idTaiKhoan: string) {
    const rows = await this.dataSource.query(
      `SELECT bn.id_benh_nhan AS "idBenhNhan"
       FROM tai_khoan_benh_nhan link
       JOIN benh_nhan bn ON bn.id_benh_nhan = link.id_benh_nhan
       WHERE link.id_tai_khoan = $1
         AND link.la_chu_ho_so = TRUE
         AND link.trang_thai = 'Active'
       LIMIT 1`,
      [idTaiKhoan],
    ) as Array<{ idBenhNhan: string | number }>;
    const id = rows[0]?.idBenhNhan;
    if (!id) return null;
    return this.patients.findOne({ where: { idBenhNhan: Number(id) } });
  }

  findByEmail(email: string) {
    return this.patients
      .createQueryBuilder('bn')
      .where('lower(bn.email) = :email', { email: email.toLowerCase() })
      .getOne();
  }

  findByPhone(soDienThoai: string) {
    return this.patients.findOne({ where: { soDienThoai } });
  }

  async create(dto: CreatePatientDto) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(BenhNhan);
      const created = await repository.save(
        repository.create({
          hoTen: dto.hoTen,
          ngaySinh: dto.ngaySinh.slice(0, 10),
          gioiTinh: dto.gioiTinh,
          soDienThoai: dto.soDienThoai,
          email: dto.email.toLowerCase(),
          diaChi: dto.diaChi,
          coBhyt: dto.coBhyt === true && Boolean(dto.soBhyt),
          soBhyt: dto.coBhyt === true && dto.soBhyt ? dto.soBhyt.trim().toUpperCase() : null,
          trangThai: 'Active',
        }),
      );
      await manager.query(
        `INSERT INTO tai_khoan_benh_nhan
           (id_tai_khoan, id_benh_nhan, loai_quan_he, la_chu_ho_so, duoc_dat_lich_ho, trang_thai)
         VALUES ($1, $2, 'BanThan', TRUE, TRUE, 'Active')
         ON CONFLICT DO NOTHING`,
        [dto.idTaiKhoan, created.idBenhNhan],
      );
      return created;
    });
  }
}
