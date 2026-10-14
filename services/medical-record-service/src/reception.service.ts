import { Injectable } from '@nestjs/common';
import {
  AccessTokenPayload,
  AppException,
  AppRole,
  AppointmentStatus,
  PaymentStatus,
  PaymentTransactionStatus,
  internalRequest,
  isDbConflict,
  todayInVietnam,
} from '@qlpk/common';
import { DataSource, EntityManager } from 'typeorm';

export interface ReceptionListQuery {
  page: number;
  limit: number;
  search?: string;
  doctorId?: number;
  appointmentId?: number;
  date?: string;
  status?: string;
  stage?: string;
  paymentStatus?: string;
}

export interface ReceptionPayload {
  appointmentId: number;
  weight?: number;
  height?: number;
  temperature?: number;
  systolicBloodPressure?: number;
  diastolicBloodPressure?: number;
  heartRate?: number;
  spo2?: number;
  initialSymptoms?: string;
  notes?: string;
}

interface LockedAppointment {
  id: number;
  status: string;
  receptionId: number | null;
  bookingAccountId: string | null;
  date: string;
  time: string;
  doctorId: number;
  doctorName: string;
  doctorAccountId: string | null;
  patientName: string;
}

function clean(value?: string) {
  return value?.trim() || null;
}

@Injectable()
export class ReceptionService {
  constructor(private readonly db: DataSource) {}

  async list(user: AccessTokenPayload, query: ReceptionListQuery) {
    const { clause, values } = this.buildFilters(user, query);
    const countRows = await this.db.query(
      `SELECT COUNT(*)::int total
       FROM lich_hen lh
       JOIN benh_nhan bn ON bn.id_benh_nhan = lh.id_benh_nhan
       JOIN bac_si bs ON bs.id_bac_si = lh.id_bac_si
       LEFT JOIN tiep_nhan_benh_nhan tn ON tn.id_lich_hen = lh.id_lich_hen
       LEFT JOIN phieu_kham pk ON pk.id_lich_hen = lh.id_lich_hen
       LEFT JOIN hoa_don hd ON hd.id_phieu_kham = pk.id_phieu_kham
       ${clause}`,
      values,
    );

    const listValues = [...values, query.limit, (query.page - 1) * query.limit];
    const limitParameter = `$${listValues.length - 1}`;
    const offsetParameter = `$${listValues.length}`;
    const items = await this.db.query(
      `SELECT
         lh.id_lich_hen::int "appointmentId",
         'LH-' || LPAD(lh.id_lich_hen::text, 6, '0') code,
         lh.ngay_hen::text date,
         lh.gio_hen::text time,
         lh.ly_do_kham reason,
         lh.ly_do_huy "cancellationReason",
         lh.trang_thai status,
         lh.ngay_tao "bookedAt",
         lh.thoi_gian_check_in "checkedInAt",
         lh.thoi_gian_bat_dau_kham "examStartedAt",
         lh.thoi_gian_ket_thuc_kham "examCompletedAt",
         lh.thoi_gian_hoan_tat_luot_kham "visitCompletedAt",
         jsonb_build_object(
           'id', bn.id_benh_nhan,
           'code', 'BN-' || LPAD(bn.id_benh_nhan::text, 5, '0'),
           'name', bn.ho_ten,
           'phone', bn.so_dien_thoai,
           'birthDate', bn.ngay_sinh::text,
           'gender', bn.gioi_tinh,
            'address', bn.dia_chi,
           'hasInsurance', bn.co_bhyt,
           'insuranceNumber', bn.so_bhyt
         ) patient,
         CASE WHEN EXISTS (
           SELECT 1
           FROM phieu_kham previous_record
           WHERE previous_record.id_benh_nhan = bn.id_benh_nhan
             AND previous_record.id_lich_hen <> lh.id_lich_hen
         ) THEN 'Tai kham' ELSE 'Kham lan dau' END "visitType",
         jsonb_build_object(
           'id', bs.id_bac_si,
           'code', bs.so_chung_chi_hanh_nghe,
           'name', bs.ho_ten,
           'specialty', CASE WHEN ck.id_chuyen_khoa IS NULL THEN NULL ELSE jsonb_build_object(
             'id', ck.id_chuyen_khoa,
             'name', ck.ten_chuyen_khoa
           ) END
         ) doctor,
         CASE WHEN tn.id_tiep_nhan_benh_nhan IS NULL THEN NULL ELSE jsonb_build_object(
           'id', tn.id_tiep_nhan_benh_nhan,
           'weight', tn.can_nang,
           'height', tn.chieu_cao,
           'temperature', tn.nhiet_do,
           'systolicBloodPressure', tn.huyet_ap_tam_thu,
           'diastolicBloodPressure', tn.huyet_ap_tam_truong,
           'heartRate', tn.nhip_tim,
           'spo2', tn.spo2,
           'initialSymptoms', tn.trieu_chung_ban_dau,
           'notes', tn.ghi_chu,
           'recordedAt', tn.thoi_gian_ghi_nhan,
           'recordedBy', recorder.ten_dang_nhap
         ) END reception,
         CASE WHEN pk.id_phieu_kham IS NULL THEN NULL ELSE jsonb_build_object(
           'id', pk.id_phieu_kham,
           'symptoms', pk.trieu_chung,
            'onset', pk.thoi_gian_xuat_hien,
            'diseaseProgress', pk.dien_tien_benh,
            'postTreatmentProgress', pk.dien_tien_sau_dieu_tri,
           'examResult', pk.ket_qua_kham,
           'conclusion', pk.ket_luan,
           'treatment', pk.huong_dieu_tri,
           'doctorNotes', pk.ghi_chu_bac_si,
           'followUpDate', pk.ngay_tai_kham::text,
            'careAdvice', pk.tu_van_cham_soc,
            'noClinicalServices', pk.khong_can_can_lam_sang,
            'noPrescription', pk.khong_ke_don,
           'diseaseId', primary_disease.id_danh_muc_ten_benh,
           'diseaseCode', primary_disease.ma_benh,
           'diseaseName', primary_disease.ten_benh,
           'diagnosisNote', primary_diagnosis.ghi_chu,
            'diagnoses', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', diagnosis.id_danh_muc_ten_benh,
                'code', disease.ma_benh,
                'name', disease.ten_benh,
                'primary', diagnosis.la_chan_doan_chinh,
                'note', diagnosis.ghi_chu
              ) ORDER BY diagnosis.la_chan_doan_chinh DESC, disease.ma_benh)
              FROM chan_doan diagnosis
              JOIN danh_muc_ten_benh disease ON disease.id_danh_muc_ten_benh=diagnosis.id_danh_muc_ten_benh
              WHERE diagnosis.id_phieu_kham=pk.id_phieu_kham
            ), '[]'::jsonb),
           'prescription', (
             SELECT jsonb_build_object(
               'id', dt.id_don_thuoc,
               'note', dt.ghi_chu,
                'status', dt.trang_thai,
               'items', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                   'medicineId', ct.id_thuoc,
                   'medicineName', medicine.ten_thuoc,
                   'strength', medicine.ham_luong,
                   'quantity', ct.so_luong,
                   'dosage', ct.lieu_dung,
                   'frequency', ct.tan_suat,
                   'days', ct.so_ngay_dung,
                   'route', ct.duong_dung,
                   'instructions', ct.huong_dan
                 ) ORDER BY ct.id_chi_tiet_don_thuoc)
                 FROM chi_tiet_don_thuoc ct
                 JOIN thuoc medicine ON medicine.id_thuoc = ct.id_thuoc
                 WHERE ct.id_don_thuoc = dt.id_don_thuoc
               ), '[]'::jsonb)
             )
             FROM don_thuoc dt WHERE dt.id_phieu_kham = pk.id_phieu_kham
           )
         ) END "medicalRecord",
         CASE WHEN hd.id_hoa_don IS NULL THEN NULL ELSE jsonb_build_object(
           'id', hd.id_hoa_don,
           'date', hd.ngay_lap::text,
           'createdAt', hd.ngay_tao,
           'examFee', hd.phi_kham,
           'serviceAmount', hd.tien_dich_vu,
           'medicineAmount', hd.tien_thuoc,
           'discount', hd.giam_tru,
           'total', hd.tong_tien,
           'paidAmount', COALESCE(payment.total_paid, 0),
           'balance', GREATEST(hd.tong_tien - COALESCE(payment.total_paid, 0), 0),
           'status', hd.trang_thai_thanh_toan,
           'lastPaidAt', payment.last_paid_at
         ) END invoice
       FROM lich_hen lh
       JOIN benh_nhan bn ON bn.id_benh_nhan = lh.id_benh_nhan
       JOIN bac_si bs ON bs.id_bac_si = lh.id_bac_si
       LEFT JOIN bac_si_chuyen_khoa bsck
         ON bsck.id_bac_si = bs.id_bac_si
        AND bsck.la_chuyen_khoa_chinh = TRUE
       LEFT JOIN chuyen_khoa ck ON ck.id_chuyen_khoa = bsck.id_chuyen_khoa
       LEFT JOIN tiep_nhan_benh_nhan tn ON tn.id_lich_hen = lh.id_lich_hen
       LEFT JOIN tai_khoan recorder ON recorder.id_tai_khoan = tn.id_nguoi_tiep_nhan
       LEFT JOIN phieu_kham pk ON pk.id_lich_hen = lh.id_lich_hen
       LEFT JOIN chan_doan primary_diagnosis
         ON primary_diagnosis.id_phieu_kham = pk.id_phieu_kham
        AND primary_diagnosis.la_chan_doan_chinh = TRUE
       LEFT JOIN danh_muc_ten_benh primary_disease
         ON primary_disease.id_danh_muc_ten_benh = primary_diagnosis.id_danh_muc_ten_benh
       LEFT JOIN hoa_don hd ON hd.id_phieu_kham = pk.id_phieu_kham
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(SUM(tt.so_tien) FILTER (WHERE tt.trang_thai = '${PaymentTransactionStatus.SUCCESS}'), 0) total_paid,
           MAX(tt.thoi_gian_thanh_toan) FILTER (WHERE tt.trang_thai = '${PaymentTransactionStatus.SUCCESS}') last_paid_at
         FROM thanh_toan tt
         WHERE tt.id_hoa_don = hd.id_hoa_don
       ) payment ON TRUE
       ${clause}
       ORDER BY
         CASE lh.trang_thai
           WHEN '${AppointmentStatus.CONFIRMED}' THEN 0
           WHEN '${AppointmentStatus.CHECKED_IN}' THEN 1
           WHEN '${AppointmentStatus.IN_PROGRESS}' THEN 2
           WHEN '${AppointmentStatus.EXAM_COMPLETED}' THEN 3
           WHEN '${AppointmentStatus.PENDING}' THEN 4
           ELSE 5
         END,
         CASE WHEN lh.trang_thai = '${AppointmentStatus.CHECKED_IN}' THEN tn.thoi_gian_ghi_nhan END ASC,
         lh.ngay_hen DESC,
         lh.gio_hen ASC,
         lh.id_lich_hen ASC
       LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
      listValues,
    );
    const [stats, tabs] = await Promise.all([
      this.stats(user, query),
      this.tabCounts(user, query),
    ]);

    return {
      items,
      total: Number(countRows[0]?.total ?? 0),
      page: query.page,
      limit: query.limit,
      stats,
      tabs,
    };
  }

  async detail(user: AccessTokenPayload, appointmentId: number) {
    const result = await this.list(user, { page: 1, limit: 1, appointmentId });
    if (!result.items.length) {
      throw new AppException(404, 'APPOINTMENT_NOT_FOUND', 'Không tìm thấy lượt khám phù hợp.');
    }
    return result.items[0];
  }

  async confirm(user: AccessTokenPayload, appointmentId: number) {
    const result = await this.db.transaction(async (manager) => {
      const appointment = await this.lockAppointment(manager, user, appointmentId);
      if (appointment.status !== AppointmentStatus.PENDING) {
        throw this.invalidStatus('Chỉ có thể xác nhận lịch đang ở trạng thái Chờ xác nhận.');
      }

      await manager.query(
        `UPDATE lich_hen
         SET trang_thai = $2, ngay_cap_nhat = CURRENT_TIMESTAMP
         WHERE id_lich_hen = $1`,
        [appointmentId, AppointmentStatus.CONFIRMED],
      );
      await this.recordStatusChange(
        manager,
        appointmentId,
        appointment.status,
        AppointmentStatus.CONFIRMED,
        'Xac nhan lich',
        user.sub,
      );
      await this.notifyAppointmentDecision(manager, appointment, true);
      return { appointmentId, status: AppointmentStatus.CONFIRMED };
    });
    return result;
  }

  async reject(user: AccessTokenPayload, appointmentId: number, reason: string) {
    const result = await this.db.transaction(async (manager) => {
      const appointment = await this.lockAppointment(manager, user, appointmentId);
      if (appointment.status !== AppointmentStatus.PENDING) {
        throw this.invalidStatus('Chỉ có thể từ chối lịch đang ở trạng thái Chờ xác nhận.');
      }

      const rejectionReason = reason.trim();
      await manager.query(
        `UPDATE lich_hen
         SET trang_thai = $2,
             ly_do_huy = $3,
             thoi_gian_huy = CURRENT_TIMESTAMP,
             ngay_cap_nhat = CURRENT_TIMESTAMP
         WHERE id_lich_hen = $1`,
        [appointmentId, AppointmentStatus.CANCELLED, rejectionReason],
      );
      await this.recordStatusChange(
        manager,
        appointmentId,
        appointment.status,
        AppointmentStatus.CANCELLED,
        'Bac si tu choi',
        user.sub,
        rejectionReason,
      );
      await this.notifyAppointmentDecision(manager, appointment, false, rejectionReason);
      return {
        appointmentId,
        status: AppointmentStatus.CANCELLED,
        reason: rejectionReason,
        doctorId: appointment.doctorId,
        date: appointment.date,
      };
    });
    await this.invalidateAvailability(result.doctorId, result.date);
    return { appointmentId: result.appointmentId, status: result.status, reason: result.reason };
  }

  async save(user: AccessTokenPayload, appointmentId: number, dto: ReceptionPayload, update: boolean) {
    try {
      return await this.db.transaction(async (manager) => {
        const appointment = await this.lockAppointment(manager, user, appointmentId);
        const values = [
          dto.weight ?? null,
          dto.height ?? null,
          dto.temperature ?? null,
          dto.systolicBloodPressure ?? null,
          dto.diastolicBloodPressure ?? null,
          dto.heartRate ?? null,
          dto.spo2 ?? null,
          clean(dto.initialSymptoms),
          clean(dto.notes),
          appointmentId,
        ];

        if (update) {
          if (!appointment.receptionId) {
            throw new AppException(404, 'RECEPTION_NOT_FOUND', 'Lịch hẹn chưa được tiếp nhận.');
          }
          const editableStatuses: string[] = [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS];
          if (!editableStatuses.includes(appointment.status)) {
            throw this.invalidStatus('Không thể cập nhật tiếp nhận ở trạng thái hiện tại.');
          }
          const rows = await manager.query(
            `UPDATE tiep_nhan_benh_nhan
             SET can_nang = $1, chieu_cao = $2, nhiet_do = $3,
                 huyet_ap_tam_thu = $4, huyet_ap_tam_truong = $5,
                 nhip_tim = $6, spo2 = $7, trieu_chung_ban_dau = $8,
                 ghi_chu = $9
             WHERE id_lich_hen = $10
             RETURNING id_tiep_nhan_benh_nhan::int id`,
            values,
          );
          return { ...rows[0], appointmentId, status: appointment.status };
        }

        if (appointment.receptionId) {
          throw new AppException(409, 'RECEPTION_EXISTS', 'Lịch hẹn này đã được tiếp nhận.');
        }
        if (appointment.status !== AppointmentStatus.CONFIRMED) {
          throw this.invalidStatus('Lịch hẹn phải được xác nhận trước khi tiếp nhận bệnh nhân.');
        }
        if (appointment.date !== todayInVietnam()) {
          throw this.invalidStatus('Chỉ có thể check-in bệnh nhân đúng ngày hẹn theo múi giờ Việt Nam.');
        }

        const rows = await manager.query(
          `INSERT INTO tiep_nhan_benh_nhan (
             can_nang, chieu_cao, nhiet_do, huyet_ap_tam_thu,
             huyet_ap_tam_truong, nhip_tim, spo2,
             trieu_chung_ban_dau, ghi_chu, id_lich_hen, id_nguoi_tiep_nhan
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id_tiep_nhan_benh_nhan::int id`,
          [...values, user.sub],
        );
        await manager.query(
          `UPDATE lich_hen
           SET trang_thai = $2,
               thoi_gian_check_in = COALESCE(thoi_gian_check_in, CURRENT_TIMESTAMP),
               ngay_cap_nhat = CURRENT_TIMESTAMP
           WHERE id_lich_hen = $1`,
          [appointmentId, AppointmentStatus.CHECKED_IN],
        );
        await this.recordStatusChange(
          manager,
          appointmentId,
          appointment.status,
          AppointmentStatus.CHECKED_IN,
          'Tiep nhan benh nhan',
          user.sub,
        );
        if (appointment.doctorAccountId) {
          await manager.query(
            `INSERT INTO thong_bao (
               id_tai_khoan,id_lich_hen,loai,kenh,tieu_de,noi_dung,
               trang_thai,thoi_gian_gui,duong_dan,ma_su_kien
             ) VALUES ($1,$2,'Benh nhan check-in','Ung dung','Bệnh nhân đã check-in',$3,
                       'Chua doc',CURRENT_TIMESTAMP,$4,$5)
             ON CONFLICT (ma_su_kien) DO NOTHING`,
            [
              appointment.doctorAccountId,
              appointmentId,
              `${appointment.patientName} đã check-in cho lịch ${appointment.time.slice(0, 5)}, ngày ${appointment.date}.`,
              `/doctor/examinations/${appointmentId}`,
              `appointment-checkin-doctor:${appointmentId}`,
            ],
          );
        }
        return { ...rows[0], appointmentId, status: AppointmentStatus.CHECKED_IN };
      });
    } catch (error) {
      if (isDbConflict(error)) {
        throw new AppException(409, 'RECEPTION_EXISTS', 'Lịch hẹn này đã được tiếp nhận.');
      }
      throw error;
    }
  }

  private async stats(user: AccessTokenPayload, query: ReceptionListQuery) {
    const { clause, values } = this.buildFilters(user, query);
    const rows = await this.db.query(
      `SELECT
         COUNT(*)::int total,
         COUNT(*) FILTER (
           WHERE lh.trang_thai IN ('${AppointmentStatus.PENDING}', '${AppointmentStatus.CONFIRMED}')
             AND tn.id_tiep_nhan_benh_nhan IS NULL
         )::int "awaitingReception",
         COUNT(*) FILTER (WHERE lh.trang_thai = '${AppointmentStatus.CHECKED_IN}')::int waiting,
         COUNT(*) FILTER (WHERE lh.trang_thai = '${AppointmentStatus.IN_PROGRESS}')::int "inProgress",
         COUNT(*) FILTER (WHERE lh.trang_thai = '${AppointmentStatus.EXAM_COMPLETED}')::int "examCompleted",
         COUNT(*) FILTER (
           WHERE lh.trang_thai = '${AppointmentStatus.EXAM_COMPLETED}'
             AND COALESCE(hd.trang_thai_thanh_toan, '${PaymentStatus.UNPAID}') <> '${PaymentStatus.PAID}'
         )::int unpaid,
         COUNT(*) FILTER (WHERE lh.trang_thai = '${AppointmentStatus.COMPLETED}')::int completed
       FROM lich_hen lh
       JOIN benh_nhan bn ON bn.id_benh_nhan = lh.id_benh_nhan
       JOIN bac_si bs ON bs.id_bac_si = lh.id_bac_si
       LEFT JOIN tiep_nhan_benh_nhan tn ON tn.id_lich_hen = lh.id_lich_hen
       LEFT JOIN phieu_kham pk ON pk.id_lich_hen = lh.id_lich_hen
       LEFT JOIN hoa_don hd ON hd.id_phieu_kham = pk.id_phieu_kham
       ${clause}`,
      values,
    );
    return rows[0] ?? {
      total: 0,
      awaitingReception: 0,
      waiting: 0,
      inProgress: 0,
      examCompleted: 0,
      unpaid: 0,
      completed: 0,
    };
  }

  private async tabCounts(user: AccessTokenPayload, query: ReceptionListQuery) {
    const countQuery = { ...query, status: undefined, stage: undefined, paymentStatus: undefined };
    const { clause, values } = this.buildFilters(user, countQuery);
    const rows = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE lh.trang_thai = '${AppointmentStatus.PENDING}')::int pending,
         COUNT(*) FILTER (WHERE lh.trang_thai IN (
           '${AppointmentStatus.CONFIRMED}', '${AppointmentStatus.CHECKED_IN}',
           '${AppointmentStatus.IN_PROGRESS}', '${AppointmentStatus.EXAM_COMPLETED}',
           '${AppointmentStatus.COMPLETED}'
         ))::int confirmed,
         COUNT(*) FILTER (WHERE lh.trang_thai = '${AppointmentStatus.CANCELLED}')::int cancelled,
         COUNT(*) FILTER (WHERE lh.trang_thai = '${AppointmentStatus.CHECKED_IN}')::int waiting,
         COUNT(*) FILTER (WHERE lh.trang_thai = '${AppointmentStatus.IN_PROGRESS}')::int "inProgress",
         COUNT(*) FILTER (WHERE lh.trang_thai IN (
           '${AppointmentStatus.EXAM_COMPLETED}', '${AppointmentStatus.COMPLETED}'
         ))::int completed
       FROM lich_hen lh
       JOIN benh_nhan bn ON bn.id_benh_nhan = lh.id_benh_nhan
       JOIN bac_si bs ON bs.id_bac_si = lh.id_bac_si
       LEFT JOIN tiep_nhan_benh_nhan tn ON tn.id_lich_hen = lh.id_lich_hen
       LEFT JOIN phieu_kham pk ON pk.id_lich_hen = lh.id_lich_hen
       LEFT JOIN hoa_don hd ON hd.id_phieu_kham = pk.id_phieu_kham
       ${clause}`,
      values,
    );
    return rows[0] ?? {
      pending: 0,
      confirmed: 0,
      cancelled: 0,
      waiting: 0,
      inProgress: 0,
      completed: 0,
    };
  }

  private buildFilters(user: AccessTokenPayload, query: ReceptionListQuery) {
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      where.push(sql.replace('?', `$${values.length}`));
    };

    if (user.role === AppRole.DOCTOR) add('bs.id_tai_khoan = ?', user.sub);
    if (user.role === AppRole.PATIENT) {
      values.push(user.sub);
      const parameter = `$${values.length}`;
      where.push(`(
        lh.id_tai_khoan_dat = ${parameter}
        OR EXISTS (
          SELECT 1 FROM tai_khoan_benh_nhan owner
          WHERE owner.id_benh_nhan = lh.id_benh_nhan
            AND owner.id_tai_khoan = ${parameter}
            AND owner.trang_thai = 'Active'
        )
      )`);
    }
    if (user.role === AppRole.MANAGER && query.doctorId) add('lh.id_bac_si = ?', query.doctorId);
    if (query.appointmentId) add('lh.id_lich_hen = ?', query.appointmentId);
    if (query.date) add('lh.ngay_hen = ?', query.date.slice(0, 10));
    if (query.status) add('lh.trang_thai = ?', query.status);
    if (query.stage === 'CONFIRMATION_PENDING') {
      add('lh.trang_thai = ?', AppointmentStatus.PENDING);
    } else if (query.stage === 'CONFIRMATION_CONFIRMED') {
      where.push(`lh.trang_thai IN (
        '${AppointmentStatus.CONFIRMED}', '${AppointmentStatus.CHECKED_IN}',
        '${AppointmentStatus.IN_PROGRESS}', '${AppointmentStatus.EXAM_COMPLETED}',
        '${AppointmentStatus.COMPLETED}'
      )`);
    } else if (query.stage === 'CONFIRMATION_REJECTED') {
      add('lh.trang_thai = ?', AppointmentStatus.CANCELLED);
    } else if (query.stage === 'EXAM_SCHEDULED') {
      add('lh.trang_thai = ?', AppointmentStatus.CONFIRMED);
    } else if (query.stage === 'EXAM_WAITING') {
      add('lh.trang_thai = ?', AppointmentStatus.CHECKED_IN);
    } else if (query.stage === 'EXAM_IN_PROGRESS') {
      add('lh.trang_thai = ?', AppointmentStatus.IN_PROGRESS);
    } else if (query.stage === 'EXAM_COMPLETED') {
      where.push(`lh.trang_thai IN ('${AppointmentStatus.EXAM_COMPLETED}', '${AppointmentStatus.COMPLETED}')`);
    }
    if (query.paymentStatus === 'NOT_INVOICED') where.push('hd.id_hoa_don IS NULL');
    else if (query.paymentStatus) add('hd.trang_thai_thanh_toan = ?', query.paymentStatus);
    if (query.search?.trim()) {
      values.push(`%${query.search.trim()}%`);
      const parameter = `$${values.length}`;
      where.push(`(
        bn.ho_ten ILIKE ${parameter}
        OR bn.so_dien_thoai ILIKE ${parameter}
        OR bs.ho_ten ILIKE ${parameter}
        OR ('BN-' || LPAD(bn.id_benh_nhan::text, 5, '0')) ILIKE ${parameter}
        OR ('LH-' || LPAD(lh.id_lich_hen::text, 6, '0')) ILIKE ${parameter}
        OR lh.id_lich_hen::text ILIKE ${parameter}
      )`);
    }
    return {
      clause: where.length ? `WHERE ${where.join(' AND ')}` : '',
      values,
    };
  }

  private async lockAppointment(
    manager: EntityManager,
    user: AccessTokenPayload,
    appointmentId: number,
  ): Promise<LockedAppointment> {
    const doctorScope = user.role === AppRole.DOCTOR ? ' AND bs.id_tai_khoan = $2' : '';
    const parameters = user.role === AppRole.DOCTOR ? [appointmentId, user.sub] : [appointmentId];
    const rows = await manager.query(
      `SELECT
         lh.id_lich_hen::int id,
         lh.trang_thai status,
         tn.id_tiep_nhan_benh_nhan::int "receptionId",
         lh.id_tai_khoan_dat "bookingAccountId",
         lh.ngay_hen::text date,
         lh.gio_hen::text time,
         bs.id_bac_si::int "doctorId",
         bs.ho_ten "doctorName",
         bs.id_tai_khoan "doctorAccountId",
         bn.ho_ten "patientName"
       FROM lich_hen lh
       JOIN bac_si bs ON bs.id_bac_si = lh.id_bac_si
       JOIN benh_nhan bn ON bn.id_benh_nhan = lh.id_benh_nhan
       LEFT JOIN tiep_nhan_benh_nhan tn ON tn.id_lich_hen = lh.id_lich_hen
       WHERE lh.id_lich_hen = $1${doctorScope}
       FOR UPDATE OF lh`,
      parameters,
    ) as LockedAppointment[];
    if (!rows.length) {
      throw new AppException(404, 'APPOINTMENT_NOT_FOUND', 'Không tìm thấy lịch hẹn phù hợp.');
    }
    return rows[0];
  }

  private recordStatusChange(
    manager: EntityManager,
    appointmentId: number,
    previousStatus: string,
    nextStatus: string,
    changeType: string,
    accountId: string,
    reason: string | null = null,
  ) {
    return manager.query(
      `INSERT INTO lich_su_lich_hen (
         id_lich_hen, trang_thai_cu, trang_thai_moi,
         loai_thay_doi, nguoi_thay_doi, ly_do
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [appointmentId, previousStatus, nextStatus, changeType, accountId, reason],
    );
  }

  private async notifyAppointmentDecision(
    manager: EntityManager,
    appointment: LockedAppointment,
    accepted: boolean,
    rejectionReason?: string,
  ) {
    if (!appointment.bookingAccountId) return;
    const date = new Date(`${appointment.date}T00:00:00`).toLocaleDateString('vi-VN');
    const time = appointment.time.slice(0, 5);
    const title = accepted ? 'Lịch hẹn đã được xác nhận' : 'Lịch hẹn đã bị từ chối';
    const content = accepted
      ? `Bác sĩ ${appointment.doctorName} đã xác nhận lịch khám lúc ${time}, ngày ${date}.`
      : `Bác sĩ ${appointment.doctorName} đã từ chối lịch khám lúc ${time}, ngày ${date}. Lý do: ${rejectionReason}.`;
    await manager.query(
      `INSERT INTO thong_bao (
         id_tai_khoan, id_lich_hen, loai, kenh, tieu_de,
         noi_dung, trang_thai, thoi_gian_gui, duong_dan, ma_su_kien
       ) VALUES ($1, $2, $3, 'Ung dung', $4, $5, 'Chua doc', CURRENT_TIMESTAMP, '/patient/appointments', $6)
       ON CONFLICT (ma_su_kien) DO NOTHING`,
      [
        appointment.bookingAccountId,
        appointment.id,
        accepted ? 'Lich hen duoc xac nhan' : 'Lich hen bi tu choi',
        title,
        content,
        `appointment-decision-patient:${appointment.id}:${accepted ? 'accepted' : 'rejected'}`,
      ],
    );
  }

  private async invalidateAvailability(doctorId: number, date: string) {
    try {
      await internalRequest(
        `${process.env.APPOINTMENT_SERVICE_URL}/internal/appointments/cache?doctorId=${doctorId}&date=${date.slice(0, 10)}`,
        { method: 'DELETE' },
      );
    } catch (error) {
      console.error('Khong xoa duoc cache khung gio sau khi tu choi lich hen', error);
    }
  }

  private invalidStatus(message: string) {
    return new AppException(409, 'APPOINTMENT_STATUS_INVALID', message);
  }
}
