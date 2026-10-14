import { Injectable } from '@nestjs/common';
import {
  AccessTokenPayload,
  AppException,
  AppRole,
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
  isDbConflict,
} from '@qlpk/common';
import { DataSource, EntityManager } from 'typeorm';

export interface PaymentPayload {
  amount: number;
  method: (typeof PaymentMethod)[keyof typeof PaymentMethod];
  idempotencyKey: string;
  note?: string;
}

export interface InvoicePayload {
  examFee?: number;
}

interface InvoiceableVisit {
  appointmentId: number;
  recordId: number;
  patientId: number;
  status: string;
  examFee: string;
  invoiceId: string | null;
}

interface LockedInvoice {
  invoiceId: string;
  appointmentId: number;
  total: string;
  status: string;
}

@Injectable()
export class BillingService {
  constructor(private readonly db: DataSource) {}

  async ensureInvoiceForAppointment(manager?: EntityManager, appointmentId?: number): Promise<string | null> {
    const mgr = manager || this.db?.manager || (this.db as any);
    if (!mgr || typeof mgr.query !== 'function' || !appointmentId) return null;
    try {
      const visits = await mgr.query(
      `SELECT lh.id_lich_hen::int "appointmentId", lh.id_benh_nhan::int "patientId",
              lh.trang_thai status, pk.id_phieu_kham::int "recordId", pk.phi_kham "rawExamFee",
              hd.id_hoa_don "invoiceId", hd.trang_thai_thanh_toan "invoiceStatus"
       FROM lich_hen lh
       JOIN phieu_kham pk ON pk.id_lich_hen = lh.id_lich_hen
       LEFT JOIN hoa_don hd ON hd.id_phieu_kham = pk.id_phieu_kham
       WHERE lh.id_lich_hen = $1
         AND lh.trang_thai IN ('${AppointmentStatus.EXAM_COMPLETED}', '${AppointmentStatus.COMPLETED}')`,
      [appointmentId],
    );
    if (!visits.length) return null;
    const visit = visits[0];
    if (visit.invoiceId) return visit.invoiceId;

    const examFee = Number(visit.rawExamFee) > 0 ? Number(visit.rawExamFee) : 100000;

    const serviceRows = await mgr.query(
      `SELECT COALESCE(SUM(dv.don_gia), 0) amount
       FROM chi_dinh_dich_vu_lam_sang cd
       JOIN danh_muc_dich_vu_lam_sang dv ON dv.id_dich_vu = cd.id_dich_vu
       WHERE cd.id_lich_hen = $1 AND cd.trang_thai <> 'Huy'`,
      [appointmentId],
    );
    const serviceAmount = Number(serviceRows[0]?.amount || 0);

    const medicineRows = await mgr.query(
      `SELECT COALESCE(SUM(ct.so_luong * ct.don_gia_tai_thoi_diem_ke), 0) amount
       FROM don_thuoc dt
       JOIN chi_tiet_don_thuoc ct ON ct.id_don_thuoc = dt.id_don_thuoc
       WHERE dt.id_phieu_kham = $1`,
      [visit.recordId],
    );
    const medicineAmount = Number(medicineRows[0]?.amount || 0);
    const total = examFee + serviceAmount + medicineAmount;
    const invoiceId = `HD-LH-${String(appointmentId).padStart(8, '0')}`;
    const initialStatus = visit.status === AppointmentStatus.COMPLETED ? PaymentStatus.PAID : PaymentStatus.UNPAID;

    await mgr.query(
      `INSERT INTO hoa_don (
         id_hoa_don, id_phieu_kham, id_benh_nhan, ngay_lap,
         phi_kham, tien_dich_vu, tien_thuoc, giam_tru,
         tong_tien, trang_thai_thanh_toan
       ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, 0, $7, $8)
       ON CONFLICT (id_phieu_kham) DO UPDATE SET
         phi_kham = EXCLUDED.phi_kham,
         tien_dich_vu = EXCLUDED.tien_dich_vu,
         tien_thuoc = EXCLUDED.tien_thuoc,
         tong_tien = EXCLUDED.tong_tien,
         ngay_cap_nhat = CURRENT_TIMESTAMP
       WHERE hoa_don.trang_thai_thanh_toan <> 'Da thanh toan'`,
      [invoiceId, visit.recordId, visit.patientId, examFee, serviceAmount, medicineAmount, total, initialStatus],
    );

    return invoiceId;
    } catch {
      return null;
    }
  }

  async invoice(user: AccessTokenPayload, appointmentId: number) {
    const where: string[] = ['lh.id_lich_hen = $1'];
    const values: unknown[] = [appointmentId];
    if (user.role === AppRole.DOCTOR) {
      values.push(user.sub);
      where.push(`bs.id_tai_khoan = $${values.length}::uuid`);
    } else if (user.role === AppRole.PATIENT) {
      values.push(user.sub);
      const parameter = `$${values.length}`;
      where.push(`(
        lh.id_tai_khoan_dat = ${parameter}::uuid
        OR EXISTS (
          SELECT 1 FROM tai_khoan_benh_nhan owner
          WHERE (owner.id_benh_nhan = lh.id_benh_nhan OR owner.id_benh_nhan = hd.id_benh_nhan)
            AND owner.id_tai_khoan = ${parameter}::uuid
            AND owner.trang_thai = 'Active'
        )
      )`);
    }
    const query = `SELECT
         hd.id_hoa_don id,
         lh.id_lich_hen::int "appointmentId",
         'LH-' || LPAD(lh.id_lich_hen::text, 6, '0') "appointmentCode",
         bn.id_benh_nhan::int "patientId",
         'BN-' || LPAD(bn.id_benh_nhan::text, 5, '0') "patientCode",
         bn.ho_ten "patientName",
         bs.ho_ten "doctorName",
         ck.ten_chuyen_khoa "specialtyName",
         lh.ngay_hen::text "appointmentDate",
         lh.gio_hen::text "appointmentTime",
         hd.ngay_lap::text date,
         hd.ngay_tao "createdAt",
         hd.phi_kham "examFee",
         hd.tien_dich_vu "serviceAmount",
         hd.tien_thuoc "medicineAmount",
         hd.giam_tru discount,
         hd.tong_tien total,
         hd.trang_thai_thanh_toan status,
         COALESCE(payment.total_paid, 0) "paidAmount",
         GREATEST(hd.tong_tien - COALESCE(payment.total_paid, 0), 0) balance,
         COALESCE(payment.items, '[]'::jsonb) payments,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'orderId', cd.id_chi_dinh,
             'serviceId', cd.id_dich_vu,
             'code', dv.ma_dich_vu,
             'name', dv.ten_dich_vu,
             'group', dv.nhom_dich_vu,
             'performingUnit', dv.don_vi_thuc_hien,
             'quantity', 1,
             'unitPrice', dv.don_gia,
             'amount', dv.don_gia
           ) ORDER BY cd.ngay_chi_dinh)
           FROM chi_dinh_dich_vu_lam_sang cd
           JOIN danh_muc_dich_vu_lam_sang dv ON dv.id_dich_vu = cd.id_dich_vu
           WHERE cd.id_lich_hen = lh.id_lich_hen AND cd.trang_thai <> 'Huy'
         ), '[]'::jsonb) services,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'medicineId', ct.id_thuoc,
             'name', m.ten_thuoc,
             'strength', m.ham_luong,
             'unit', m.don_vi,
             'quantity', ct.so_luong,
             'unitPrice', ct.don_gia_tai_thoi_diem_ke,
             'amount', ct.so_luong * ct.don_gia_tai_thoi_diem_ke
           ) ORDER BY ct.id_chi_tiet_don_thuoc)
           FROM don_thuoc dt
           JOIN chi_tiet_don_thuoc ct ON ct.id_don_thuoc = dt.id_don_thuoc
           JOIN thuoc m ON m.id_thuoc = ct.id_thuoc
           WHERE dt.id_phieu_kham = pk.id_phieu_kham
         ), '[]'::jsonb) medicines
       FROM lich_hen lh
       JOIN benh_nhan bn ON bn.id_benh_nhan = lh.id_benh_nhan
       JOIN bac_si bs ON bs.id_bac_si = lh.id_bac_si
       LEFT JOIN LATERAL (
         SELECT ck.ten_chuyen_khoa
         FROM bac_si_chuyen_khoa link
         JOIN chuyen_khoa ck ON ck.id_chuyen_khoa = link.id_chuyen_khoa
         WHERE link.id_bac_si = bs.id_bac_si
         ORDER BY link.la_chuyen_khoa_chinh DESC NULLS LAST
         LIMIT 1
       ) ck ON TRUE
       JOIN phieu_kham pk ON pk.id_lich_hen = lh.id_lich_hen
       JOIN hoa_don hd ON hd.id_phieu_kham = pk.id_phieu_kham
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(SUM(tt.so_tien) FILTER (WHERE tt.trang_thai = '${PaymentTransactionStatus.SUCCESS}'), 0) total_paid,
           jsonb_agg(jsonb_build_object(
             'id', tt.id_thanh_toan,
             'amount', tt.so_tien,
             'method', tt.phuong_thuc_thanh_toan,
             'reference', tt.ma_giao_dich,
             'status', tt.trang_thai,
             'paidAt', tt.thoi_gian_thanh_toan,
             'confirmedBy', confirmer.ten_dang_nhap,
             'note', tt.ghi_chu
           ) ORDER BY tt.thoi_gian_thanh_toan) items
         FROM thanh_toan tt
         LEFT JOIN tai_khoan confirmer ON confirmer.id_tai_khoan = tt.id_nguoi_xac_nhan
         WHERE tt.id_hoa_don = hd.id_hoa_don
       ) payment ON TRUE
       WHERE ${where.join(' AND ')}`;
    let rows = await this.db.query(query, values);
    if (!rows.length) {
      const generated = await this.ensureInvoiceForAppointment(this.db?.manager || (this.db as any), appointmentId);
      if (generated) {
        rows = await this.db.query(query, values);
      }
    }
    if (!rows.length) {
      throw new AppException(404, 'INVOICE_NOT_FOUND', 'Không tìm thấy hóa đơn thuộc phạm vi được phép.');
    }
    return rows[0];
  }

  async myInvoices(
    user: AccessTokenPayload,
    params: { search?: string; status?: string; page?: number; limit?: number } = {},
  ) {
    // Ensure any completed appointments have an invoice generated
    const pendingAppointments = await this.db.query(
      `SELECT DISTINCT lh.id_lich_hen::int "appointmentId"
       FROM lich_hen lh
       JOIN phieu_kham pk ON pk.id_lich_hen = lh.id_lich_hen
       LEFT JOIN hoa_don hd ON hd.id_phieu_kham = pk.id_phieu_kham
       WHERE lh.trang_thai IN ('${AppointmentStatus.EXAM_COMPLETED}', '${AppointmentStatus.COMPLETED}')
         AND hd.id_hoa_don IS NULL
         ${
           user.role === AppRole.PATIENT
             ? `AND (
                  lh.id_tai_khoan_dat = $1::uuid
                  OR EXISTS (
                    SELECT 1 FROM tai_khoan_benh_nhan owner
                    WHERE owner.id_benh_nhan = lh.id_benh_nhan
                      AND owner.id_tai_khoan = $1::uuid
                      AND owner.trang_thai = 'Active'
                  )
                )`
             : ''
         }`,
      user.role === AppRole.PATIENT ? [user.sub] : [],
    );
    for (const appt of pendingAppointments) {
      await this.ensureInvoiceForAppointment(this.db.manager, appt.appointmentId);
    }

    const search = params.search?.trim() || '';
    const status = params.status?.trim() || '';
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 10));
    const offset = (page - 1) * limit;

    const values: unknown[] = [];
    const where: string[] = [];

    if (user.role === AppRole.PATIENT) {
      values.push(user.sub);
      const parameter = `$${values.length}`;
      where.push(`(
        lh.id_tai_khoan_dat = ${parameter}::uuid
        OR EXISTS (
          SELECT 1 FROM tai_khoan_benh_nhan owner
          WHERE (owner.id_benh_nhan = lh.id_benh_nhan OR owner.id_benh_nhan = hd.id_benh_nhan)
            AND owner.id_tai_khoan = ${parameter}::uuid
            AND owner.trang_thai = 'Active'
        )
      )`);
    }

    if (status && status !== 'all') {
      values.push(status);
      where.push(`hd.trang_thai_thanh_toan = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      const p = `$${values.length}`;
      where.push(`(
        hd.id_hoa_don ILIKE ${p}
        OR 'LH-' || LPAD(lh.id_lich_hen::text, 6, '0') ILIKE ${p}
        OR bn.ho_ten ILIKE ${p}
        OR bs.ho_ten ILIKE ${p}
      )`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRows = await this.db.query(
      `SELECT COUNT(*)::int total
       FROM hoa_don hd
       JOIN phieu_kham pk ON pk.id_phieu_kham = hd.id_phieu_kham
       JOIN lich_hen lh ON lh.id_lich_hen = pk.id_lich_hen
       JOIN benh_nhan bn ON bn.id_benh_nhan = lh.id_benh_nhan
       JOIN bac_si bs ON bs.id_bac_si = lh.id_bac_si
       ${whereClause}`,
      values,
    );
    const total = Number(countRows[0]?.total || 0);

    const listValues = [...values, limit, offset];
    const items = await this.db.query(
      `SELECT
         hd.id_hoa_don id,
         lh.id_lich_hen::int "appointmentId",
         'LH-' || LPAD(lh.id_lich_hen::text, 6, '0') "appointmentCode",
         bn.id_benh_nhan::int "patientId",
         'BN-' || LPAD(bn.id_benh_nhan::text, 5, '0') "patientCode",
         bn.ho_ten "patientName",
         hd.ngay_lap::text date,
         hd.ngay_tao "createdAt",
         hd.phi_kham "examFee",
         hd.tien_dich_vu "serviceAmount",
         hd.tien_thuoc "medicineAmount",
         hd.giam_tru discount,
         hd.tong_tien total,
         hd.trang_thai_thanh_toan status,
         COALESCE(payment.total_paid, 0) "paidAmount",
         GREATEST(hd.tong_tien - COALESCE(payment.total_paid, 0), 0) balance,
         bs.ho_ten "doctorName",
         ck.ten_chuyen_khoa "specialtyName",
         lh.ngay_hen::text "appointmentDate",
         lh.gio_hen::text "appointmentTime"
       FROM hoa_don hd
       JOIN phieu_kham pk ON pk.id_phieu_kham = hd.id_phieu_kham
       JOIN lich_hen lh ON lh.id_lich_hen = pk.id_lich_hen
       JOIN benh_nhan bn ON bn.id_benh_nhan = lh.id_benh_nhan
       JOIN bac_si bs ON bs.id_bac_si = lh.id_bac_si
       LEFT JOIN LATERAL (
         SELECT ck.ten_chuyen_khoa
         FROM bac_si_chuyen_khoa link
         JOIN chuyen_khoa ck ON ck.id_chuyen_khoa = link.id_chuyen_khoa
         WHERE link.id_bac_si = bs.id_bac_si
         ORDER BY link.la_chuyen_khoa_chinh DESC NULLS LAST
         LIMIT 1
       ) ck ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(SUM(tt.so_tien) FILTER (WHERE tt.trang_thai = '${PaymentTransactionStatus.SUCCESS}'), 0) total_paid
         FROM thanh_toan tt
         WHERE tt.id_hoa_don = hd.id_hoa_don
       ) payment ON TRUE
       ${whereClause}
       ORDER BY hd.ngay_tao DESC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues,
    );

    return { items, total, page, limit };
  }

  async patientCheckout(
    user: AccessTokenPayload,
    appointmentId: number,
    dto: { method?: string; idempotencyKey?: string; note?: string } = {},
  ) {
    if (user.role !== AppRole.PATIENT) {
      throw new AppException(403, 'PATIENT_ROLE_REQUIRED', 'Chỉ tài khoản bệnh nhân mới có thể thực hiện thanh toán trực tuyến.');
    }
    await this.db.transaction(async (manager) => {
      await this.ensureInvoiceForAppointment(manager, appointmentId);
      const visits = await manager.query(
        `SELECT lh.id_lich_hen::int "appointmentId", lh.trang_thai status, hd.id_hoa_don "invoiceId",
                hd.tong_tien total, hd.trang_thai_thanh_toan "invoiceStatus"
         FROM lich_hen lh
         JOIN phieu_kham pk ON pk.id_lich_hen = lh.id_lich_hen
         JOIN hoa_don hd ON hd.id_phieu_kham = pk.id_phieu_kham
         WHERE lh.id_lich_hen = $1
           AND (
             lh.id_tai_khoan_dat = $2::uuid
             OR EXISTS (
               SELECT 1 FROM tai_khoan_benh_nhan owner
               WHERE (owner.id_benh_nhan = lh.id_benh_nhan OR owner.id_benh_nhan = hd.id_benh_nhan)
                 AND owner.id_tai_khoan = $2::uuid
                 AND owner.trang_thai = 'Active'
             )
           )
         FOR UPDATE OF hd, lh`,
        [appointmentId, user.sub],
      );
      if (!visits.length) {
        throw new AppException(404, 'INVOICE_NOT_FOUND', 'Không tìm thấy hóa đơn của bạn.');
      }
      const visit = visits[0];
      if (visit.invoiceStatus === PaymentStatus.PAID) {
        throw new AppException(409, 'INVOICE_ALREADY_PAID', 'Hóa đơn đã được thanh toán đầy đủ.');
      }

      const paidRows = await manager.query(
        `SELECT COALESCE(SUM(so_tien), 0) paid
         FROM thanh_toan
         WHERE id_hoa_don = $1 AND trang_thai = $2`,
        [visit.invoiceId, PaymentTransactionStatus.SUCCESS],
      );
      const paid = Number(paidRows[0]?.paid ?? 0);
      const total = Number(visit.total);
      const remaining = Math.max(0, total - paid);

      if (remaining <= 0) {
        throw new AppException(409, 'INVOICE_ALREADY_PAID', 'Hóa đơn không còn dư nợ cần thanh toán.');
      }

      const key = dto.idempotencyKey?.trim() || `ONL-${appointmentId}-${Date.now()}`;
      const method = dto.method || 'Chuyen khoan';

      await manager.query(
        `INSERT INTO thanh_toan (
           id_hoa_don, so_tien, phuong_thuc_thanh_toan,
           ma_giao_dich, trang_thai, id_nguoi_xac_nhan, ghi_chu
         ) VALUES ($1, $2, $3, $4, $5, $6::uuid, $7)`,
        [
          visit.invoiceId,
          remaining,
          method,
          key,
          PaymentTransactionStatus.SUCCESS,
          user.sub,
          dto.note?.trim() || 'Thanh toán trực tuyến qua cổng điện tử',
        ],
      );

      await manager.query(
        `UPDATE hoa_don
         SET trang_thai_thanh_toan = $2, ngay_cap_nhat = CURRENT_TIMESTAMP
         WHERE id_hoa_don = $1`,
        [visit.invoiceId, PaymentStatus.PAID],
      );

      await manager.query(
        `UPDATE lich_hen
         SET trang_thai = $2,
             thoi_gian_hoan_tat_luot_kham = COALESCE(thoi_gian_hoan_tat_luot_kham, CURRENT_TIMESTAMP),
             ngay_cap_nhat = CURRENT_TIMESTAMP
         WHERE id_lich_hen = $1
         RETURNING id_lich_hen`,
        [appointmentId, AppointmentStatus.COMPLETED],
      );

      await manager.query(
        `INSERT INTO lich_su_lich_hen (
           id_lich_hen, trang_thai_cu, trang_thai_moi,
           loai_thay_doi, nguoi_thay_doi
         ) VALUES ($1, $2, $3, $4, $5::uuid)`,
        [
          appointmentId,
          visit.status,
          AppointmentStatus.COMPLETED,
          'Thanh toán trực tuyến',
          user.sub,
        ],
      );
    });
    return this.invoice(user, appointmentId);
  }

  async createInvoice(user: AccessTokenPayload, appointmentId: number, dto: InvoicePayload = {}) {
    await this.assertPaymentPermission(user);
    try {
      await this.db.transaction(async (manager) => {
        const visit = await this.lockInvoiceableVisit(manager, appointmentId);
        if (visit.invoiceId) {
          throw new AppException(409, 'INVOICE_EXISTS', 'Lượt khám này đã có hóa đơn.');
        }
        if (![AppointmentStatus.EXAM_COMPLETED, AppointmentStatus.COMPLETED].includes(visit.status as never)) {
          throw new AppException(409, 'VISIT_STATUS_INVALID', 'Chỉ lập hóa đơn sau khi bác sĩ hoàn tất khám.');
        }
        const medicineRows = await manager.query(
          `SELECT COALESCE(SUM(ct.so_luong * ct.don_gia_tai_thoi_diem_ke), 0) amount
           FROM don_thuoc dt
           JOIN chi_tiet_don_thuoc ct ON ct.id_don_thuoc = dt.id_don_thuoc
           WHERE dt.id_phieu_kham = $1`,
          [visit.recordId],
        );
        const serviceRows = await manager.query(
          `SELECT COALESCE(SUM(dv.don_gia),0) amount
           FROM chi_dinh_dich_vu_lam_sang cd
           JOIN danh_muc_dich_vu_lam_sang dv ON dv.id_dich_vu=cd.id_dich_vu
           JOIN phieu_kham pk ON pk.id_lich_hen=cd.id_lich_hen
           WHERE pk.id_phieu_kham=$1 AND cd.trang_thai<>'Huy'`,
          [visit.recordId],
        );
        const storedExamFee = Number(visit.examFee);
        const examFee = dto.examFee ?? storedExamFee;
        const medicineAmount = Number(medicineRows[0]?.amount ?? 0);
        const serviceAmount = Number(serviceRows[0]?.amount ?? 0);
        const total = examFee + serviceAmount + medicineAmount;
        if (!Number.isFinite(total) || total <= 0) {
          throw new AppException(
            409,
            'INVOICE_ZERO_TOTAL',
            'Chưa có mức phí thực tế hợp lệ để lập hóa đơn; hệ thống không tự đặt mức giá giả.',
          );
        }
        if (dto.examFee !== undefined && dto.examFee !== storedExamFee) {
          await manager.query(
            `UPDATE phieu_kham
             SET phi_kham = $2, ngay_cap_nhat = CURRENT_TIMESTAMP
             WHERE id_phieu_kham = $1`,
            [visit.recordId, examFee],
          );
        }
        const invoiceId = `HD-LH-${String(appointmentId).padStart(8, '0')}`;
        await manager.query(
          `INSERT INTO hoa_don (
             id_hoa_don, id_phieu_kham, id_benh_nhan, ngay_lap,
             phi_kham, tien_dich_vu, tien_thuoc, giam_tru,
             tong_tien, trang_thai_thanh_toan
           ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, 0, $7, $8)`,
          [
            invoiceId,
            visit.recordId,
            visit.patientId,
            examFee,
            serviceAmount,
            medicineAmount,
            total,
            PaymentStatus.UNPAID,
          ],
        );
      });
    } catch (error) {
      if (isDbConflict(error)) {
        throw new AppException(409, 'INVOICE_EXISTS', 'Lượt khám này đã có hóa đơn.');
      }
      throw error;
    }
    return this.invoice(user, appointmentId);
  }

  async recordPayment(user: AccessTokenPayload, appointmentId: number, dto: PaymentPayload) {
    await this.assertPaymentPermission(user);
    try {
      await this.db.transaction(async (manager) => {
        const invoice = await this.lockInvoice(manager, appointmentId);
        const duplicate = await manager.query(
          `SELECT id_hoa_don, so_tien, phuong_thuc_thanh_toan
           FROM thanh_toan WHERE ma_giao_dich = $1`,
          [dto.idempotencyKey.trim()],
        );
        if (duplicate.length) {
          if (
            duplicate[0].id_hoa_don === invoice.invoiceId
            && Number(duplicate[0].so_tien) === Number(dto.amount)
            && duplicate[0].phuong_thuc_thanh_toan === dto.method
          ) return;
          throw new AppException(409, 'PAYMENT_REFERENCE_EXISTS', 'Mã tham chiếu đã được dùng cho một giao dịch khác.');
        }
        if (invoice.status === PaymentStatus.PAID) {
          throw new AppException(409, 'INVOICE_ALREADY_PAID', 'Hóa đơn đã được thanh toán đầy đủ.');
        }
        const paidRows = await manager.query(
          `SELECT COALESCE(SUM(so_tien), 0) paid
           FROM thanh_toan
           WHERE id_hoa_don = $1 AND trang_thai = $2`,
          [invoice.invoiceId, PaymentTransactionStatus.SUCCESS],
        );
        const paid = Number(paidRows[0]?.paid ?? 0);
        const total = Number(invoice.total);
        const amount = Number(dto.amount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > total - paid) {
          throw new AppException(400, 'PAYMENT_AMOUNT_INVALID', 'Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn lại.');
        }
        await manager.query(
          `INSERT INTO thanh_toan (
             id_hoa_don, so_tien, phuong_thuc_thanh_toan,
             ma_giao_dich, trang_thai, id_nguoi_xac_nhan, ghi_chu
           ) VALUES ($1, $2, $3, $4, $5, $6::uuid, $7)`,
          [
            invoice.invoiceId,
            amount,
            dto.method,
            dto.idempotencyKey.trim(),
            PaymentTransactionStatus.SUCCESS,
            user.sub,
            dto.note?.trim() || null,
          ],
        );
        const nextPaid = paid + amount;
        const nextStatus = nextPaid >= total ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID;
        await manager.query(
          `UPDATE hoa_don
           SET trang_thai_thanh_toan = $2, ngay_cap_nhat = CURRENT_TIMESTAMP
           WHERE id_hoa_don = $1`,
          [invoice.invoiceId, nextStatus],
        );
        if (nextStatus === PaymentStatus.PAID) {
          const updated = await manager.query(
            `UPDATE lich_hen
             SET trang_thai = $2,
                 thoi_gian_hoan_tat_luot_kham = COALESCE(thoi_gian_hoan_tat_luot_kham, CURRENT_TIMESTAMP),
                 ngay_cap_nhat = CURRENT_TIMESTAMP
             WHERE id_lich_hen = $1 AND trang_thai = $3
             RETURNING id_lich_hen`,
            [appointmentId, AppointmentStatus.COMPLETED, AppointmentStatus.EXAM_COMPLETED],
          );
          if (updated.length) {
            await manager.query(
              `INSERT INTO lich_su_lich_hen (
                 id_lich_hen, trang_thai_cu, trang_thai_moi,
                 loai_thay_doi, nguoi_thay_doi
               ) VALUES ($1, $2, $3, $4, $5::uuid)`,
              [
                appointmentId,
                AppointmentStatus.EXAM_COMPLETED,
                AppointmentStatus.COMPLETED,
                'Hoan tat thanh toan',
                user.sub,
              ],
            );
          }
        }
      });
    } catch (error) {
      if (isDbConflict(error)) {
        throw new AppException(409, 'PAYMENT_REFERENCE_EXISTS', 'Giao dịch thanh toán này đã được ghi nhận.');
      }
      throw error;
    }
    return this.invoice(user, appointmentId);
  }

  private async lockInvoiceableVisit(manager: EntityManager, appointmentId: number): Promise<InvoiceableVisit> {
    const rows = await manager.query(
      `SELECT
         lh.id_lich_hen::int "appointmentId",
         pk.id_phieu_kham::int "recordId",
         pk.id_benh_nhan::int "patientId",
         lh.trang_thai status,
         pk.phi_kham "examFee",
         hd.id_hoa_don "invoiceId"
       FROM lich_hen lh
       JOIN phieu_kham pk ON pk.id_lich_hen = lh.id_lich_hen
       LEFT JOIN hoa_don hd ON hd.id_phieu_kham = pk.id_phieu_kham
       WHERE lh.id_lich_hen = $1
       FOR UPDATE OF lh, pk`,
      [appointmentId],
    ) as InvoiceableVisit[];
    if (!rows.length) {
      throw new AppException(404, 'MEDICAL_RECORD_NOT_FOUND', 'Lượt khám chưa có hồ sơ bệnh án hợp lệ.');
    }
    return rows[0];
  }

  private async assertPaymentPermission(user: AccessTokenPayload) {
    if (user.role !== AppRole.MANAGER) {
      throw new AppException(403, 'PAYMENT_PERMISSION_REQUIRED', 'Tài khoản chưa được cấp quyền thanh toán.');
    }
    const rows = await this.db.query(
      `SELECT 1
       FROM quan_ly
       WHERE id_tai_khoan = $1 AND quyen_thanh_toan = TRUE`,
      [user.sub],
    );
    if (!rows.length) {
      throw new AppException(403, 'PAYMENT_PERMISSION_REQUIRED', 'Tài khoản chưa được cấp quyền thanh toán.');
    }
  }

  private async lockInvoice(manager: EntityManager, appointmentId: number): Promise<LockedInvoice> {
    const rows = await manager.query(
      `SELECT
         hd.id_hoa_don "invoiceId",
         lh.id_lich_hen::int "appointmentId",
         hd.tong_tien total,
         hd.trang_thai_thanh_toan status
       FROM hoa_don hd
       JOIN phieu_kham pk ON pk.id_phieu_kham = hd.id_phieu_kham
       JOIN lich_hen lh ON lh.id_lich_hen = pk.id_lich_hen
       WHERE lh.id_lich_hen = $1
       FOR UPDATE OF hd, lh`,
      [appointmentId],
    ) as LockedInvoice[];
    if (!rows.length) {
      throw new AppException(404, 'INVOICE_NOT_FOUND', 'Lượt khám chưa có hóa đơn.');
    }
    return rows[0];
  }
}
