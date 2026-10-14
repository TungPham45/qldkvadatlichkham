import { Injectable } from '@nestjs/common';
import { AccessTokenPayload, AppException, AppointmentStatus, isDbConflict } from '@qlpk/common';
import { DataSource, EntityManager } from 'typeorm';

export interface CreateClinicalOrderPayload {
  serviceId: number;
  purpose: string;
  priority?: 'Thuong' | 'Khan';
}

export interface UpdateClinicalOrderPayload {
  purpose: string;
  priority: 'Thuong' | 'Khan';
}

export interface ClinicalResultPayload {
  result: string;
  conclusion?: string;
  attachment?: string;
  performedBy?: string;
}

export interface ClinicalCatalogPayload {
  code: string;
  name: string;
  group?: string;
  performingUnit?: string;
  unitPrice: number;
  active?: boolean;
}

@Injectable()
export class ClinicalServiceService {
  constructor(private readonly db: DataSource) {}

  async catalog(params: { search?: string; group?: string; active?: string; page?: number; limit?: number } = {}) {
    const search = params.search?.trim() || '';
    const group = params.group?.trim() || '';
    const active = params.active;
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(params.limit) || 100));
    const offset = (page - 1) * limit;

    const values: unknown[] = [];
    const where: string[] = [];

    if (active === 'true' || (active !== 'false' && active !== 'all')) {
      where.push('dang_hoat_dong = TRUE');
    } else if (active === 'false') {
      where.push('dang_hoat_dong = FALSE');
    }

    if (search) {
      values.push(`%${search}%`);
      where.push(`(ma_dich_vu ILIKE $${values.length} OR ten_dich_vu ILIKE $${values.length} OR COALESCE(nhom_dich_vu,'') ILIKE $${values.length})`);
    }

    if (group) {
      values.push(group);
      where.push(`nhom_dich_vu = $${values.length}`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRows = await this.db.query(
      `SELECT COUNT(*)::int total FROM danh_muc_dich_vu_lam_sang ${whereClause}`,
      values,
    );
    const total = Number(countRows[0]?.total || 0);

    const listValues = [...values, limit, offset];
    const items = await this.db.query(
      `SELECT id_dich_vu::int id, ma_dich_vu code, ten_dich_vu name, nhom_dich_vu "group",
              don_vi_thuc_hien "performingUnit", don_gia "unitPrice", dang_hoat_dong "active",
              ngay_tao "createdAt", ngay_cap_nhat "updatedAt"
       FROM danh_muc_dich_vu_lam_sang ${whereClause}
       ORDER BY nhom_dich_vu, ten_dich_vu
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues,
    );

    const groupRows = await this.db.query(
      `SELECT DISTINCT nhom_dich_vu "group" FROM danh_muc_dich_vu_lam_sang WHERE nhom_dich_vu IS NOT NULL AND nhom_dich_vu <> '' ORDER BY nhom_dich_vu`,
    );
    const groups = groupRows.map((r: { group: string }) => r.group);

    return { items, total, page, limit, groups };
  }

  async saveCatalog(id: number | null, dto: ClinicalCatalogPayload) {
    try {
      if (id) {
        const rows = await this.db.query(
          `UPDATE danh_muc_dich_vu_lam_sang SET ma_dich_vu=$1,ten_dich_vu=$2,nhom_dich_vu=$3,
             don_vi_thuc_hien=$4,don_gia=$5,dang_hoat_dong=$6,ngay_cap_nhat=CURRENT_TIMESTAMP
           WHERE id_dich_vu=$7 RETURNING id_dich_vu::int id`,
          [dto.code.trim(),dto.name.trim(),dto.group?.trim()||null,dto.performingUnit?.trim()||null,dto.unitPrice,dto.active??true,id],
        );
        if (!rows.length) throw new AppException(404,'CLINICAL_SERVICE_NOT_FOUND','Không tìm thấy dịch vụ cận lâm sàng.');
        return rows[0];
      }
      const rows = await this.db.query(
        `INSERT INTO danh_muc_dich_vu_lam_sang(ma_dich_vu,ten_dich_vu,nhom_dich_vu,don_vi_thuc_hien,don_gia,dang_hoat_dong)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id_dich_vu::int id`,
        [dto.code.trim(),dto.name.trim(),dto.group?.trim()||null,dto.performingUnit?.trim()||null,dto.unitPrice,dto.active??true],
      );
      return rows[0];
    } catch (error) {
      if (isDbConflict(error)) throw new AppException(409,'CLINICAL_SERVICE_DUPLICATE','Mã dịch vụ đã tồn tại.');
      throw error;
    }
  }

  async deleteCatalog(id: number) {
    const orders = await this.db.query(
      `SELECT 1 FROM chi_dinh_dich_vu_lam_sang WHERE id_dich_vu = $1 LIMIT 1`,
      [id],
    );
    if (orders.length > 0) {
      throw new AppException(
        409,
        'CLINICAL_SERVICE_IN_USE',
        'Dịch vụ đã phát sinh chỉ định trong hồ sơ khám, vui lòng chuyển trạng thái sang ngưng hoạt động thay vì xóa.',
      );
    }
    const rows = await this.db.query(
      `DELETE FROM danh_muc_dich_vu_lam_sang WHERE id_dich_vu = $1 RETURNING id_dich_vu::int id`,
      [id],
    );
    if (!rows.length) {
      throw new AppException(404, 'CLINICAL_SERVICE_NOT_FOUND', 'Không tìm thấy dịch vụ cận lâm sàng.');
    }
    return rows[0];
  }

  async orders(user: AccessTokenPayload, appointmentId: number) {
    await this.assertDoctorScope(this.db.manager, user, appointmentId, false);
    return this.db.query(
      `SELECT cd.id_chi_dinh::int id, cd.id_lich_hen::int "appointmentId", cd.id_dich_vu::int "serviceId",
              dv.ma_dich_vu code, dv.ten_dich_vu name, dv.nhom_dich_vu "group",
              dv.don_vi_thuc_hien "performingUnit", dv.don_gia "unitPrice", cd.muc_dich purpose,
              cd.muc_uu_tien priority, cd.trang_thai status, cd.ngay_chi_dinh "orderedAt",
              CASE WHEN kq.id_ket_qua IS NULL THEN NULL ELSE jsonb_build_object(
                'id',kq.id_ket_qua,'result',kq.ket_qua,'conclusion',kq.ket_luan,
                'attachment',kq.tep_dinh_kem,'performedBy',performer.ten_dang_nhap,
                'reportedAt',kq.thoi_gian_tra_ket_qua
              ) END result
       FROM chi_dinh_dich_vu_lam_sang cd
       JOIN danh_muc_dich_vu_lam_sang dv ON dv.id_dich_vu = cd.id_dich_vu
       LEFT JOIN ket_qua_dich_vu_lam_sang kq ON kq.id_chi_dinh = cd.id_chi_dinh
       LEFT JOIN tai_khoan performer ON performer.id_tai_khoan = kq.nguoi_tra_ket_qua
       WHERE cd.id_lich_hen = $1
       ORDER BY cd.ngay_chi_dinh, cd.id_chi_dinh`,
      [appointmentId],
    );
  }

  async createOrder(user: AccessTokenPayload, appointmentId: number, dto: CreateClinicalOrderPayload) {
    try {
      return await this.db.transaction(async (manager) => {
        const visit = await this.assertDoctorScope(manager, user, appointmentId, true);
        if (visit.status !== AppointmentStatus.IN_PROGRESS) {
          throw new AppException(409, 'VISIT_STATUS_INVALID', 'Chỉ được chỉ định dịch vụ khi lượt khám đang diễn ra.');
        }
        const services = await manager.query(
          `SELECT id_dich_vu FROM danh_muc_dich_vu_lam_sang WHERE id_dich_vu=$1 AND dang_hoat_dong=TRUE FOR SHARE`,
          [dto.serviceId],
        );
        if (!services.length) throw new AppException(404, 'CLINICAL_SERVICE_NOT_FOUND', 'Không tìm thấy dịch vụ cận lâm sàng đang hoạt động.');
        const existing = await manager.query(
          `SELECT id_chi_dinh::int id, trang_thai status
           FROM chi_dinh_dich_vu_lam_sang
           WHERE id_lich_hen=$1 AND id_dich_vu=$2
           FOR UPDATE`,
          [appointmentId, dto.serviceId],
        );
        let rows: Array<{ id: number }>;
        if (existing.length) {
          if (existing[0].status !== 'Huy') {
            throw new AppException(409, 'CLINICAL_ORDER_DUPLICATE', 'Dịch vụ này đã được chỉ định cho lượt khám.');
          }
          rows = await manager.query(
            `UPDATE chi_dinh_dich_vu_lam_sang
             SET id_bac_si_chi_dinh=$2,muc_dich=$3,muc_uu_tien=$4,
                 trang_thai='Cho thuc hien',ngay_chi_dinh=CURRENT_TIMESTAMP,ngay_cap_nhat=CURRENT_TIMESTAMP
             WHERE id_chi_dinh=$1 RETURNING id_chi_dinh::int id`,
            [existing[0].id, visit.doctorId, dto.purpose.trim(), dto.priority || 'Thuong'],
          );
        } else {
          rows = await manager.query(
            `INSERT INTO chi_dinh_dich_vu_lam_sang(id_lich_hen,id_dich_vu,id_bac_si_chi_dinh,muc_dich,muc_uu_tien)
             VALUES($1,$2,$3,$4,$5) RETURNING id_chi_dinh::int id`,
            [appointmentId, dto.serviceId, visit.doctorId, dto.purpose.trim(), dto.priority || 'Thuong'],
          );
        }
        await manager.query(`UPDATE phieu_kham SET khong_can_can_lam_sang=FALSE,ngay_cap_nhat=CURRENT_TIMESTAMP WHERE id_lich_hen=$1`, [appointmentId]);
        return rows[0];
      });
    } catch (error) {
      if (isDbConflict(error)) throw new AppException(409, 'CLINICAL_ORDER_DUPLICATE', 'Dịch vụ này đã được chỉ định cho lượt khám.');
      throw error;
    }
  }

  async updateOrder(user: AccessTokenPayload, orderId: number, dto: UpdateClinicalOrderPayload) {
    const rows = await this.db.query(
      `UPDATE chi_dinh_dich_vu_lam_sang cd
       SET muc_dich=$3,muc_uu_tien=$4,ngay_cap_nhat=CURRENT_TIMESTAMP
       FROM lich_hen lh
       JOIN bac_si bs ON bs.id_bac_si=lh.id_bac_si
       WHERE cd.id_chi_dinh=$1
         AND lh.id_lich_hen=cd.id_lich_hen
         AND bs.id_tai_khoan=$2
         AND lh.trang_thai=$5
         AND cd.trang_thai='Cho thuc hien'
       RETURNING cd.id_chi_dinh::int id`,
      [orderId, user.sub, dto.purpose.trim(), dto.priority, AppointmentStatus.IN_PROGRESS],
    );
    if (!rows.length) {
      throw new AppException(409, 'CLINICAL_ORDER_NOT_EDITABLE', 'Chỉ được sửa chỉ định đang chờ thực hiện của lượt khám đang diễn ra.');
    }
    return rows[0];
  }

  async cancelOrder(user: AccessTokenPayload, orderId: number) {
    const rows = await this.db.query(
      `UPDATE chi_dinh_dich_vu_lam_sang cd
       SET trang_thai='Huy',ngay_cap_nhat=CURRENT_TIMESTAMP
       FROM lich_hen lh
       JOIN bac_si bs ON bs.id_bac_si=lh.id_bac_si
       WHERE cd.id_chi_dinh=$1
         AND lh.id_lich_hen=cd.id_lich_hen
         AND bs.id_tai_khoan=$2
         AND lh.trang_thai=$3
         AND cd.trang_thai='Cho thuc hien'
       RETURNING cd.id_chi_dinh::int id`,
      [orderId, user.sub, AppointmentStatus.IN_PROGRESS],
    );
    if (!rows.length) {
      throw new AppException(409, 'CLINICAL_ORDER_NOT_CANCELLABLE', 'Chỉ được hủy chỉ định chưa bắt đầu thực hiện.');
    }
    return { ...rows[0], status: 'Huy' };
  }

  async review(user: AccessTokenPayload, orderId: number) {
    const rows = await this.db.query(
      `UPDATE chi_dinh_dich_vu_lam_sang cd SET trang_thai='Da xem ket qua',ngay_cap_nhat=CURRENT_TIMESTAMP
       FROM lich_hen lh JOIN bac_si bs ON bs.id_bac_si=lh.id_bac_si
       WHERE cd.id_chi_dinh=$1 AND lh.id_lich_hen=cd.id_lich_hen AND bs.id_tai_khoan=$2
         AND cd.trang_thai='Da co ket qua'
       RETURNING cd.id_chi_dinh::int id`,
      [orderId, user.sub],
    );
    if (!rows.length) throw new AppException(404, 'CLINICAL_RESULT_NOT_FOUND', 'Không tìm thấy kết quả chưa xem trong phạm vi của bác sĩ.');
    return rows[0];
  }

  async saveResult(orderId: number, dto: ClinicalResultPayload, user?: AccessTokenPayload) {
    return this.db.transaction(async (manager) => {
      const orders = await manager.query(
        `SELECT cd.id_chi_dinh::int id, cd.id_lich_hen::int "appointmentId", dv.ten_dich_vu "serviceName",
                bs.id_tai_khoan "doctorAccountId"
         FROM chi_dinh_dich_vu_lam_sang cd
         JOIN danh_muc_dich_vu_lam_sang dv ON dv.id_dich_vu=cd.id_dich_vu
         JOIN lich_hen lh ON lh.id_lich_hen=cd.id_lich_hen
         JOIN bac_si bs ON bs.id_bac_si=lh.id_bac_si
         WHERE cd.id_chi_dinh=$1 AND cd.trang_thai<>'Huy' FOR UPDATE OF cd`,
        [orderId],
      );
      if (!orders.length) throw new AppException(404, 'CLINICAL_ORDER_NOT_FOUND', 'Không tìm thấy chỉ định dịch vụ.');
      const order = orders[0] as {id:number;appointmentId:number;serviceName:string;doctorAccountId:string|null};
      const performer = dto.performedBy || user?.sub || null;
      await manager.query(
        `INSERT INTO ket_qua_dich_vu_lam_sang(id_chi_dinh,ket_qua,ket_luan,tep_dinh_kem,nguoi_tra_ket_qua)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(id_chi_dinh) DO UPDATE SET ket_qua=EXCLUDED.ket_qua,ket_luan=EXCLUDED.ket_luan,
           tep_dinh_kem=EXCLUDED.tep_dinh_kem,nguoi_tra_ket_qua=EXCLUDED.nguoi_tra_ket_qua,
           thoi_gian_tra_ket_qua=CURRENT_TIMESTAMP,ngay_cap_nhat=CURRENT_TIMESTAMP`,
        [orderId, dto.result.trim(), dto.conclusion?.trim() || null, dto.attachment?.trim() || null, performer],
      );
      await manager.query(`UPDATE chi_dinh_dich_vu_lam_sang SET trang_thai='Da co ket qua',ngay_cap_nhat=CURRENT_TIMESTAMP WHERE id_chi_dinh=$1`, [orderId]);
      if (order.doctorAccountId) {
        await manager.query(
          `INSERT INTO thong_bao(id_tai_khoan,id_lich_hen,loai,kenh,tieu_de,noi_dung,trang_thai,thoi_gian_gui,duong_dan,ma_su_kien)
           VALUES($1,$2,'Ket qua can lam sang','Ung dung','Đã có kết quả cận lâm sàng',$3,'Chua doc',CURRENT_TIMESTAMP,$4,$5)
           ON CONFLICT(ma_su_kien) DO NOTHING`,
          [order.doctorAccountId, order.appointmentId, `${order.serviceName} đã có kết quả.`, `/doctor/examinations/${order.appointmentId}`, `clinical-result-doctor:${orderId}`],
        );
      }
      return { id: orderId, appointmentId: order.appointmentId, status: 'Da co ket qua' };
    });
  }

  private async assertDoctorScope(manager: EntityManager, user: AccessTokenPayload, appointmentId: number, lock: boolean) {
    const rows = await manager.query(
      `SELECT lh.id_lich_hen::int id, lh.trang_thai status, bs.id_bac_si::int "doctorId"
       FROM lich_hen lh JOIN bac_si bs ON bs.id_bac_si=lh.id_bac_si
       WHERE lh.id_lich_hen=$1 AND bs.id_tai_khoan=$2${lock ? ' FOR UPDATE OF lh' : ''}`,
      [appointmentId, user.sub],
    );
    if (!rows.length) throw new AppException(404, 'APPOINTMENT_NOT_FOUND', 'Không tìm thấy lượt khám thuộc phạm vi của bác sĩ.');
    return rows[0] as {id:number;status:string;doctorId:number};
  }
}
