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
    const hasPatientAccountLink = await this.hasPatientAccountLink();
    const rows = await this.dataSource.query(
      hasPatientAccountLink
        ? `SELECT bn.id_benh_nhan AS "idBenhNhan", bn.ho_ten AS "hoTen",
                  to_char(bn.ngay_sinh, 'YYYY-MM-DD') AS "ngaySinh", bn.gioi_tinh AS "gioiTinh",
                  bn.so_dien_thoai AS "soDienThoai", bn.email, bn.dia_chi AS "diaChi",
                  bn.co_bhyt AS "coBhyt", bn.so_bhyt AS "soBhyt", bn.trang_thai AS "trangThai",
                  bn.ngay_tao AS "ngayTao", bn.ngay_cap_nhat AS "ngayCapNhat"
           FROM tai_khoan_benh_nhan link
           JOIN benh_nhan bn ON bn.id_benh_nhan = link.id_benh_nhan
           WHERE link.id_tai_khoan = $1
             AND link.la_chu_ho_so = TRUE
             AND link.trang_thai = 'Active'
           LIMIT 1`
        : `SELECT bn.id_benh_nhan AS "idBenhNhan", bn.ho_ten AS "hoTen",
                  to_char(bn.ngay_sinh, 'YYYY-MM-DD') AS "ngaySinh", bn.gioi_tinh AS "gioiTinh",
                  bn.so_dien_thoai AS "soDienThoai", bn.email, bn.dia_chi AS "diaChi",
                  CASE WHEN NULLIF(BTRIM(bn.so_bao_hiem_y_te), '') IS NULL THEN FALSE ELSE TRUE END AS "coBhyt",
                  bn.so_bao_hiem_y_te AS "soBhyt", bn.trang_thai AS "trangThai",
                  bn.ngay_tao AS "ngayTao", bn.ngay_cap_nhat AS "ngayCapNhat"
           FROM benh_nhan bn
           WHERE bn.id_tai_khoan = $1
           LIMIT 1`,
      [idTaiKhoan],
    ) as Array<Record<string, unknown>>;
    if (!rows.length) return null;
    const row = rows[0];
    return Object.assign(new BenhNhan(), row, {
      idBenhNhan: Number(row.idBenhNhan),
      coBhyt: row.coBhyt === true,
      soBhyt: row.soBhyt ? String(row.soBhyt) : null,
    });
  }

  private hasPatientAccountLink() {
    return this.dataSource.query(
      `SELECT to_regclass('public.tai_khoan_benh_nhan') IS NOT NULL AS "exists"`,
    ).then((rows: Array<{ exists: boolean }>) => rows[0]?.exists === true);
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
