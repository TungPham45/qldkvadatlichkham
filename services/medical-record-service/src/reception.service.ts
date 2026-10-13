import { Injectable } from '@nestjs/common';
import {
  AccessTokenPayload,
  AppException,
  AppRole,
  AppointmentStatus,
  isDbConflict,
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
}

function clean(value?: string) {
  return value?.trim() || null;
}

@Injectable()
export class ReceptionService {
  constructor(private readonly db: DataSource) {}

  async list(user: AccessTokenPayload, query: ReceptionListQuery) {
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      where.push(sql.replace('?', `$${values.length}`));
    };

    // Doctors are scoped through the account attached to their doctor profile.
    // Managers intentionally keep the system-wide view.
    if (user.role === AppRole.DOCTOR) add('bs.id_tai_khoan = ?', user.sub);
    if (user.role === AppRole.MANAGER && query.doctorId) add('lh.id_bac_si = ?', query.doctorId);
    if (query.appointmentId) add('lh.id_lich_hen = ?', query.appointmentId);
    if (query.date) add('lh.ngay_hen = ?', query.date.slice(0, 10));
    if (query.status) add('lh.trang_thai = ?', query.status);
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

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRows = await this.db.query(
      `SELECT COUNT(*)::int total
       FROM lich_hen lh
       JOIN benh_nhan bn ON bn.id_benh_nhan = lh.id_benh_nhan
       JOIN bac_si bs ON bs.id_bac_si = lh.id_bac_si
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
         lh.trang_thai status,
         lh.thoi_gian_check_in "checkedInAt",
         jsonb_build_object(
           'id', bn.id_benh_nhan,
           'code', 'BN-' || LPAD(bn.id_benh_nhan::text, 5, '0'),
           'name', bn.ho_ten,
           'phone', bn.so_dien_thoai
         ) patient,
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
           'recordedAt', tn.thoi_gian_ghi_nhan
         ) END reception
       FROM lich_hen lh
       JOIN benh_nhan bn ON bn.id_benh_nhan = lh.id_benh_nhan
       JOIN bac_si bs ON bs.id_bac_si = lh.id_bac_si
       LEFT JOIN bac_si_chuyen_khoa bsck
         ON bsck.id_bac_si = bs.id_bac_si
        AND bsck.la_chuyen_khoa_chinh = TRUE
       LEFT JOIN chuyen_khoa ck ON ck.id_chuyen_khoa = bsck.id_chuyen_khoa
       LEFT JOIN tiep_nhan_benh_nhan tn ON tn.id_lich_hen = lh.id_lich_hen
       ${clause}
       ORDER BY
         CASE
           WHEN lh.ngay_hen >= CURRENT_DATE AND lh.trang_thai IN ('Cho xac nhan', 'Da xac nhan') THEN 0
           WHEN lh.ngay_hen >= CURRENT_DATE THEN 1
           ELSE 2
         END,
         CASE WHEN lh.ngay_hen >= CURRENT_DATE THEN lh.ngay_hen END ASC,
         CASE WHEN lh.ngay_hen < CURRENT_DATE THEN lh.ngay_hen END DESC,
         lh.gio_hen ASC,
         lh.id_lich_hen ASC
       LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
      listValues,
    );

    return {
      items,
      total: Number(countRows[0]?.total ?? 0),
      page: query.page,
      limit: query.limit,
    };
  }

  async confirm(user: AccessTokenPayload, appointmentId: number) {
    return this.db.transaction(async (manager) => {
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
      return { appointmentId, status: AppointmentStatus.CONFIRMED };
    });
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
                 ghi_chu = $9, thoi_gian_ghi_nhan = CURRENT_TIMESTAMP
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

        const rows = await manager.query(
          `INSERT INTO tiep_nhan_benh_nhan (
             can_nang, chieu_cao, nhiet_do, huyet_ap_tam_thu,
             huyet_ap_tam_truong, nhip_tim, spo2,
             trieu_chung_ban_dau, ghi_chu, id_lich_hen
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id_tiep_nhan_benh_nhan::int id`,
          values,
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
        return { ...rows[0], appointmentId, status: AppointmentStatus.CHECKED_IN };
      });
    } catch (error) {
      if (isDbConflict(error)) {
        throw new AppException(409, 'RECEPTION_EXISTS', 'Lịch hẹn này đã được tiếp nhận.');
      }
      throw error;
    }
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
         tn.id_tiep_nhan_benh_nhan::int "receptionId"
       FROM lich_hen lh
       JOIN bac_si bs ON bs.id_bac_si = lh.id_bac_si
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
  ) {
    return manager.query(
      `INSERT INTO lich_su_lich_hen (
         id_lich_hen, trang_thai_cu, trang_thai_moi,
         loai_thay_doi, nguoi_thay_doi
       ) VALUES ($1, $2, $3, $4, $5)`,
      [appointmentId, previousStatus, nextStatus, changeType, accountId],
    );
  }

  private invalidStatus(message: string) {
    return new AppException(409, 'APPOINTMENT_STATUS_INVALID', message);
  }
}
