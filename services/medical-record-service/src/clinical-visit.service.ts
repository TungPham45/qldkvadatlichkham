import { Injectable } from '@nestjs/common';
import {
  AccessTokenPayload,
  AppException,
  AppointmentStatus,
  todayInVietnam,
} from '@qlpk/common';
import { DataSource, EntityManager } from 'typeorm';

export interface MedicalRecordPayload {
  symptoms?: string;
  onset?: string;
  diseaseProgress?: string;
  postTreatmentProgress?: string;
  examResult?: string;
  conclusion?: string;
  treatment?: string;
  doctorNotes?: string;
  followUpDate?: string;
  careAdvice?: string;
  diseaseId?: number;
  secondaryDiseaseIds?: number[];
  diagnosisNote?: string;
  noClinicalServices?: boolean;
  noPrescription?: boolean;
  prescriptionLocked?: boolean;
  prescriptionNote?: string;
  prescriptionItems?: Array<{
    medicineId: number;
    quantity: number;
    dosage?: string;
    frequency?: string;
    days?: number;
    route?: string;
    instructions?: string;
  }>;
}

interface LockedVisit {
  appointmentId: number;
  patientId: number;
  doctorId: number;
  status: string;
  date: string;
}

function clean(value?: string) {
  return value?.trim() || null;
}

@Injectable()
export class ClinicalVisitService {
  constructor(private readonly db: DataSource) {}

  start(user: AccessTokenPayload, appointmentId: number) {
    return this.db.transaction(async (manager) => {
      const visit = await this.lockDoctorVisit(manager, user, appointmentId);
      if (visit.status !== AppointmentStatus.CHECKED_IN) {
        throw new AppException(
          409,
          'VISIT_STATUS_INVALID',
          'Chỉ có thể bắt đầu khám khi bệnh nhân đã được tiếp nhận.',
        );
      }
      if (visit.date !== todayInVietnam()) {
        throw new AppException(409, 'VISIT_DATE_INVALID', 'Chỉ có thể bắt đầu khám đúng ngày hẹn theo múi giờ Việt Nam.');
      }
      await manager.query(
        `UPDATE lich_hen
         SET trang_thai = $2,
             thoi_gian_bat_dau_kham = COALESCE(thoi_gian_bat_dau_kham, CURRENT_TIMESTAMP),
             ngay_cap_nhat = CURRENT_TIMESTAMP
         WHERE id_lich_hen = $1`,
        [appointmentId, AppointmentStatus.IN_PROGRESS],
      );
      await this.recordStatusChange(
        manager,
        appointmentId,
        visit.status,
        AppointmentStatus.IN_PROGRESS,
        'Bat dau kham',
        user.sub,
      );
      return { appointmentId, status: AppointmentStatus.IN_PROGRESS };
    });
  }

  saveRecord(user: AccessTokenPayload, appointmentId: number, dto: MedicalRecordPayload) {
    return this.db.transaction(async (manager) => {
      const visit = await this.lockDoctorVisit(manager, user, appointmentId);
      if (visit.status !== AppointmentStatus.IN_PROGRESS) {
        throw new AppException(
          409,
          'VISIT_STATUS_INVALID',
          'Hồ sơ chỉ được cập nhật khi lượt khám đang diễn ra.',
        );
      }

      const existingRecords = await manager.query(
        `SELECT id_phieu_kham::int id, trieu_chung symptoms, ket_qua_kham "examResult",
                ket_luan conclusion, huong_dieu_tri treatment, ghi_chu_bac_si "doctorNotes",
                ngay_tai_kham::text "followUpDate", thoi_gian_xuat_hien onset,
                dien_tien_benh "diseaseProgress", dien_tien_sau_dieu_tri "postTreatmentProgress",
                tu_van_cham_soc "careAdvice", khong_can_can_lam_sang "noClinicalServices",
                khong_ke_don "noPrescription"
         FROM phieu_kham WHERE id_lich_hen=$1 FOR UPDATE`,
        [appointmentId],
      );
      const previous = existingRecords[0] as Record<string, unknown> | undefined;
      const nextText = (key: keyof MedicalRecordPayload, previousKey: string) =>
        dto[key] !== undefined ? clean(dto[key] as string | undefined) : (previous?.[previousKey] ?? null);

      const records = await manager.query(
        `INSERT INTO phieu_kham (
           id_lich_hen, id_benh_nhan, id_bac_si, ngay_kham,
           trieu_chung, ket_qua_kham, ket_luan, huong_dieu_tri,
           ghi_chu_bac_si, ngay_tai_kham, thoi_gian_xuat_hien, dien_tien_benh,
           dien_tien_sau_dieu_tri, tu_van_cham_soc, khong_can_can_lam_sang, khong_ke_don
         ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id_lich_hen) DO UPDATE SET
           trieu_chung = EXCLUDED.trieu_chung,
           ket_qua_kham = EXCLUDED.ket_qua_kham,
           ket_luan = EXCLUDED.ket_luan,
           huong_dieu_tri = EXCLUDED.huong_dieu_tri,
           ghi_chu_bac_si = EXCLUDED.ghi_chu_bac_si,
           ngay_tai_kham = EXCLUDED.ngay_tai_kham,
           thoi_gian_xuat_hien = EXCLUDED.thoi_gian_xuat_hien,
           dien_tien_benh = EXCLUDED.dien_tien_benh,
           dien_tien_sau_dieu_tri = EXCLUDED.dien_tien_sau_dieu_tri,
           tu_van_cham_soc = EXCLUDED.tu_van_cham_soc,
           khong_can_can_lam_sang = EXCLUDED.khong_can_can_lam_sang,
           khong_ke_don = EXCLUDED.khong_ke_don,
           ngay_cap_nhat = CURRENT_TIMESTAMP
         RETURNING id_phieu_kham::int id`,
        [
          appointmentId,
          visit.patientId,
          visit.doctorId,
          nextText('symptoms', 'symptoms'),
          nextText('examResult', 'examResult'),
          nextText('conclusion', 'conclusion'),
          nextText('treatment', 'treatment'),
          nextText('doctorNotes', 'doctorNotes'),
          dto.followUpDate !== undefined ? (dto.followUpDate.slice(0, 10) || null) : (previous?.followUpDate ?? null),
          nextText('onset', 'onset'),
          nextText('diseaseProgress', 'diseaseProgress'),
          nextText('postTreatmentProgress', 'postTreatmentProgress'),
          nextText('careAdvice', 'careAdvice'),
          dto.noClinicalServices ?? previous?.noClinicalServices ?? false,
          dto.noPrescription ?? previous?.noPrescription ?? false,
        ],
      );
      const recordId = Number(records[0].id);
      const currentDiagnoses = await manager.query(
        `SELECT id_chan_doan::int id, id_danh_muc_ten_benh::int "diseaseId",
                la_chan_doan_chinh "primary", ghi_chu note
         FROM chan_doan
         WHERE id_phieu_kham = $1
         FOR UPDATE`,
        [recordId],
      );
      const currentPrimary = currentDiagnoses.find((item: { primary: boolean }) => item.primary) as
        { id: number; diseaseId: number; note: string | null } | undefined;
      const diagnosisTouched = dto.diseaseId !== undefined
        || dto.secondaryDiseaseIds !== undefined
        || dto.diagnosisNote !== undefined;
      if (diagnosisTouched) {
        const primaryDiseaseId = dto.diseaseId ?? currentPrimary?.diseaseId;
        const secondaryDiseaseIds = dto.secondaryDiseaseIds
          ?? currentDiagnoses.filter((item: { primary: boolean }) => !item.primary).map((item: { diseaseId: number }) => item.diseaseId);
        if (!primaryDiseaseId && (secondaryDiseaseIds.length || clean(dto.diagnosisNote))) {
          throw new AppException(400, 'PRIMARY_DIAGNOSIS_REQUIRED', 'Cần chọn chẩn đoán chính trước khi lưu chẩn đoán phụ.');
        }
        const diseaseIds = primaryDiseaseId ? [primaryDiseaseId, ...secondaryDiseaseIds] : [];
        if (new Set(diseaseIds).size !== diseaseIds.length) {
          throw new AppException(400, 'DIAGNOSIS_DUPLICATE', 'Chẩn đoán chính và chẩn đoán phụ không được trùng nhau.');
        }
        if (diseaseIds.length) {
          const diseases = await manager.query(
            `SELECT id_danh_muc_ten_benh
             FROM danh_muc_ten_benh
             WHERE id_danh_muc_ten_benh = ANY($1::bigint[]) AND trang_thai = 'Active'`,
            [diseaseIds],
          );
          if (diseases.length !== diseaseIds.length) {
            throw new AppException(404, 'DISEASE_NOT_FOUND', 'Không tìm thấy bệnh đang hoạt động trong danh mục.');
          }
        }
        if (primaryDiseaseId) {
          const diagnosisNote = dto.diagnosisNote !== undefined ? clean(dto.diagnosisNote) : currentPrimary?.note ?? null;
          if (currentPrimary) {
            await manager.query(
              `UPDATE chan_doan SET id_danh_muc_ten_benh=$2,ghi_chu=$3 WHERE id_chan_doan=$1`,
              [currentPrimary.id, primaryDiseaseId, diagnosisNote],
            );
          } else {
            await manager.query(
              `INSERT INTO chan_doan(id_phieu_kham,id_danh_muc_ten_benh,la_chan_doan_chinh,ghi_chu)
               VALUES($1,$2,TRUE,$3)`,
              [recordId, primaryDiseaseId, diagnosisNote],
            );
          }
        }
        if (dto.secondaryDiseaseIds !== undefined) {
          await manager.query(`DELETE FROM chan_doan WHERE id_phieu_kham=$1 AND la_chan_doan_chinh=FALSE`, [recordId]);
          for (const secondaryDiseaseId of secondaryDiseaseIds) {
            await manager.query(
              `INSERT INTO chan_doan(id_phieu_kham,id_danh_muc_ten_benh,la_chan_doan_chinh) VALUES($1,$2,FALSE)`,
              [recordId, secondaryDiseaseId],
            );
          }
        }
      }
      if (dto.prescriptionItems !== undefined) {
        if (dto.noPrescription && dto.prescriptionItems.length) {
          throw new AppException(400, 'PRESCRIPTION_DECISION_CONFLICT', 'Không thể vừa xác nhận không kê đơn vừa thêm thuốc.');
        }
        if (dto.prescriptionLocked && dto.prescriptionItems.length === 0) {
          throw new AppException(400, 'PRESCRIPTION_EMPTY', 'Đơn thuốc phải có ít nhất một thuốc trước khi khóa.');
        }
        const lockedPrescriptions = await manager.query(
          `SELECT dt.trang_thai status FROM don_thuoc dt WHERE dt.id_phieu_kham=$1 FOR UPDATE`,
          [recordId],
        );
        if (lockedPrescriptions[0]?.status === 'Da khoa') {
          throw new AppException(409, 'PRESCRIPTION_LOCKED', 'Đơn thuốc đã khóa và không thể chỉnh sửa.');
        }
        const medicineIds = dto.prescriptionItems.map((item) => item.medicineId);
        if (new Set(medicineIds).size !== medicineIds.length) {
          throw new AppException(400, 'PRESCRIPTION_DUPLICATE_MEDICINE', 'Đơn thuốc không được chứa thuốc trùng nhau.');
        }
        if (medicineIds.length) {
          const medicines = await manager.query(
            `SELECT id_thuoc::int id, don_gia "unitPrice"
             FROM thuoc
             WHERE id_thuoc = ANY($1::bigint[]) AND dang_hoat_dong = TRUE
             FOR SHARE`,
            [medicineIds],
          );
          if (medicines.length !== medicineIds.length) {
            throw new AppException(404, 'MEDICINE_NOT_FOUND', 'Đơn thuốc chứa thuốc không tồn tại hoặc đã ngừng hoạt động.');
          }
          const priceById = new Map<number, number>(medicines.map((item: { id: number; unitPrice: string }) => [Number(item.id), Number(item.unitPrice)]));
          const prescriptions = await manager.query(
            `INSERT INTO don_thuoc (
               id_phieu_kham, id_benh_nhan, id_bac_si, ngay_ke_don, ghi_chu, trang_thai
             ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5)
             ON CONFLICT (id_phieu_kham) DO UPDATE SET
               ghi_chu = EXCLUDED.ghi_chu,
               trang_thai = EXCLUDED.trang_thai,
               ngay_cap_nhat = CURRENT_TIMESTAMP
             RETURNING id_don_thuoc::int id`,
            [recordId, visit.patientId, visit.doctorId, clean(dto.prescriptionNote), dto.prescriptionLocked ? 'Da khoa' : 'Nhap'],
          );
          const prescriptionId = Number(prescriptions[0].id);
          for (const item of dto.prescriptionItems) {
            await manager.query(
              `INSERT INTO chi_tiet_don_thuoc (
                 id_don_thuoc, id_thuoc, so_luong, lieu_dung, tan_suat,
                 so_ngay_dung, duong_dung, huong_dan, don_gia_tai_thoi_diem_ke
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT (id_don_thuoc, id_thuoc) DO UPDATE SET
                 so_luong = EXCLUDED.so_luong,
                 lieu_dung = EXCLUDED.lieu_dung,
                 tan_suat = EXCLUDED.tan_suat,
                 so_ngay_dung = EXCLUDED.so_ngay_dung,
                 duong_dung = EXCLUDED.duong_dung,
                 huong_dan = EXCLUDED.huong_dan,
                 don_gia_tai_thoi_diem_ke = EXCLUDED.don_gia_tai_thoi_diem_ke`,
              [
                prescriptionId,
                item.medicineId,
                item.quantity,
                clean(item.dosage),
                clean(item.frequency),
                item.days ?? null,
                clean(item.route),
                clean(item.instructions),
                priceById.get(item.medicineId) ?? 0,
              ],
            );
          }
          await manager.query(
            `DELETE FROM chi_tiet_don_thuoc
             WHERE id_don_thuoc = $1 AND NOT (id_thuoc = ANY($2::bigint[]))`,
            [prescriptionId, medicineIds],
          );
        } else {
          const prescriptions = await manager.query(
            `SELECT id_don_thuoc::int id FROM don_thuoc WHERE id_phieu_kham = $1 FOR UPDATE`,
            [recordId],
          );
          if (prescriptions.length) {
            await manager.query(`DELETE FROM chi_tiet_don_thuoc WHERE id_don_thuoc = $1`, [prescriptions[0].id]);
          }
        }
      }
      return { id: recordId, appointmentId, status: visit.status };
    });
  }

  complete(user: AccessTokenPayload, appointmentId: number) {
    return this.db.transaction(async (manager) => {
      const visit = await this.lockDoctorVisit(manager, user, appointmentId);
      if (visit.status !== AppointmentStatus.IN_PROGRESS) {
        throw new AppException(
          409,
          'VISIT_STATUS_INVALID',
          'Chỉ có thể hoàn tất lượt khám đang diễn ra.',
        );
      }
      const records = await manager.query(
        `SELECT pk.id_phieu_kham
         FROM phieu_kham pk
         WHERE pk.id_lich_hen = $1
           AND NULLIF(BTRIM(pk.trieu_chung), '') IS NOT NULL
           AND NULLIF(BTRIM(pk.ket_qua_kham), '') IS NOT NULL
           AND NULLIF(BTRIM(pk.ket_luan), '') IS NOT NULL
           AND NULLIF(BTRIM(pk.huong_dieu_tri), '') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM chan_doan cd
             WHERE cd.id_phieu_kham = pk.id_phieu_kham
               AND cd.la_chan_doan_chinh = TRUE
           )
           AND (
             pk.khong_can_can_lam_sang = TRUE OR (
               EXISTS (SELECT 1 FROM chi_dinh_dich_vu_lam_sang cdv WHERE cdv.id_lich_hen=pk.id_lich_hen AND cdv.trang_thai<>'Huy')
               AND NOT EXISTS (SELECT 1 FROM chi_dinh_dich_vu_lam_sang cdv WHERE cdv.id_lich_hen=pk.id_lich_hen AND cdv.trang_thai NOT IN ('Da co ket qua','Da xem ket qua','Huy'))
             )
           )
           AND (
             pk.khong_ke_don = TRUE OR EXISTS (
               SELECT 1 FROM don_thuoc dt WHERE dt.id_phieu_kham=pk.id_phieu_kham AND dt.trang_thai='Da khoa'
                 AND EXISTS (SELECT 1 FROM chi_tiet_don_thuoc ct WHERE ct.id_don_thuoc=dt.id_don_thuoc)
             )
           )`,
        [appointmentId],
      );
      if (!records.length) {
        throw new AppException(
          409,
          'MEDICAL_RECORD_INCOMPLETE',
          'Cần hoàn tất hồ sơ, chẩn đoán, kết quả cận lâm sàng (hoặc xác nhận không cần) và khóa đơn thuốc (hoặc xác nhận không kê).',
        );
      }
      await manager.query(
        `UPDATE lich_hen
         SET trang_thai = $2,
             thoi_gian_ket_thuc_kham = COALESCE(thoi_gian_ket_thuc_kham, CURRENT_TIMESTAMP),
             ngay_cap_nhat = CURRENT_TIMESTAMP
         WHERE id_lich_hen = $1`,
        [appointmentId, AppointmentStatus.EXAM_COMPLETED],
      );
      await this.recordStatusChange(
        manager,
        appointmentId,
        visit.status,
        AppointmentStatus.EXAM_COMPLETED,
        'Hoan tat kham',
        user.sub,
      );

      // Auto-generate or update invoice upon examination completion
      const recordRows = await manager.query(
        `SELECT id_phieu_kham::int "recordId", id_benh_nhan::int "patientId", phi_kham "examFee"
         FROM phieu_kham WHERE id_lich_hen = $1`,
        [appointmentId],
      );
      if (recordRows.length) {
        const { recordId, patientId, examFee: rawExamFee } = recordRows[0];
        const examFee = Number(rawExamFee) || 150000;

        const serviceRows = await manager.query(
          `SELECT COALESCE(SUM(dv.don_gia), 0) amount
           FROM chi_dinh_dich_vu_lam_sang cd
           JOIN danh_muc_dich_vu_lam_sang dv ON dv.id_dich_vu = cd.id_dich_vu
           WHERE cd.id_lich_hen = $1 AND cd.trang_thai <> 'Huy'`,
          [appointmentId],
        );
        const serviceAmount = Number(serviceRows[0]?.amount || 0);

        const medicineRows = await manager.query(
          `SELECT COALESCE(SUM(ct.so_luong * ct.don_gia_tai_thoi_diem_ke), 0) amount
           FROM don_thuoc dt
           JOIN chi_tiet_don_thuoc ct ON ct.id_don_thuoc = dt.id_don_thuoc
           WHERE dt.id_phieu_kham = $1`,
          [recordId],
        );
        const medicineAmount = Number(medicineRows[0]?.amount || 0);
        const total = examFee + serviceAmount + medicineAmount;
        const invoiceId = `HD-LH-${String(appointmentId).padStart(8, '0')}`;

        await manager.query(
          `INSERT INTO hoa_don (
             id_hoa_don, id_phieu_kham, id_benh_nhan, ngay_lap,
             phi_kham, tien_dich_vu, tien_thuoc, giam_tru,
             tong_tien, trang_thai_thanh_toan
           ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, 0, $7, 'Chua thanh toan')
           ON CONFLICT (id_hoa_don) DO UPDATE SET
             phi_kham = EXCLUDED.phi_kham,
             tien_dich_vu = EXCLUDED.tien_dich_vu,
             tien_thuoc = EXCLUDED.tien_thuoc,
             tong_tien = EXCLUDED.tong_tien,
             ngay_cap_nhat = CURRENT_TIMESTAMP
           WHERE hoa_don.trang_thai_thanh_toan <> 'Da thanh toan'`,
          [invoiceId, recordId, patientId, examFee, serviceAmount, medicineAmount, total],
        );
      }

      return { appointmentId, status: AppointmentStatus.EXAM_COMPLETED };
    });
  }

  private async lockDoctorVisit(
    manager: EntityManager,
    user: AccessTokenPayload,
    appointmentId: number,
  ): Promise<LockedVisit> {
    const rows = await manager.query(
      `SELECT
         lh.id_lich_hen::int "appointmentId",
         lh.id_benh_nhan::int "patientId",
         lh.id_bac_si::int "doctorId",
         lh.trang_thai status,
         lh.ngay_hen::text date
       FROM lich_hen lh
       JOIN bac_si bs ON bs.id_bac_si = lh.id_bac_si
       WHERE lh.id_lich_hen = $1 AND bs.id_tai_khoan = $2
       FOR UPDATE OF lh`,
      [appointmentId, user.sub],
    ) as LockedVisit[];
    if (!rows.length) {
      throw new AppException(404, 'APPOINTMENT_NOT_FOUND', 'Không tìm thấy lượt khám thuộc phạm vi của bác sĩ.');
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
}
