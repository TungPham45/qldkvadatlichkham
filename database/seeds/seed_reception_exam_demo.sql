-- Demo data for tiếp nhận + khám bệnh (DoctorVisitDetailPage).
-- Idempotent: xóa seed cũ cùng marker rồi tạo lại theo ngày VN hiện tại.
-- Tài khoản thử: bs1 / 123456

BEGIN;

DO $$
DECLARE
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_marker text := 'SEED_DEMO_RECEPTION_EXAM';
  v_doctor_id bigint := 1; -- bs1 Nguyen Van A
  v_doctor_account uuid := '00000000-0000-0000-0000-000000000101';
  v_id_pending bigint;
  v_id_confirmed bigint;
  v_id_checked_in bigint;
  v_id_in_progress bigint;
  v_id_in_progress_cls bigint;
  v_reception_checked_in bigint;
  v_reception_in_progress bigint;
  v_reception_cls bigint;
  v_order_id bigint;
  v_service_id bigint;
BEGIN
  -- Đảm bảo bs1 có lịch làm việc hôm nay (ca sáng + chiều đã duyệt).
  INSERT INTO lich_lam_viec (id_bac_si, ngay_lam_viec, gio_bat_dau, gio_ket_thuc, thoi_luong_moi_ca, trang_thai, ghi_chu)
  SELECT v_doctor_id, v_today, s.start_time, s.end_time, 30, 'Da duyet', v_marker
  FROM (VALUES ('07:30'::time, '11:30'::time), ('13:30'::time, '17:30'::time)) AS s(start_time, end_time)
  WHERE NOT EXISTS (
    SELECT 1
    FROM lich_lam_viec llv
    WHERE llv.id_bac_si = v_doctor_id
      AND llv.ngay_lam_viec = v_today
      AND llv.gio_bat_dau = s.start_time
      AND llv.gio_ket_thuc = s.end_time
      AND llv.trang_thai IN ('Da duyet', 'Active')
  );

  -- Dọn seed demo cũ (mọi ngày) theo marker.
  DELETE FROM ket_qua_dich_vu_lam_sang kq
  USING chi_dinh_dich_vu_lam_sang cd
  JOIN lich_hen lh ON lh.id_lich_hen = cd.id_lich_hen
  WHERE kq.id_chi_dinh = cd.id_chi_dinh
    AND lh.ghi_chu = v_marker;

  DELETE FROM chi_dinh_dich_vu_lam_sang cd
  USING lich_hen lh
  WHERE cd.id_lich_hen = lh.id_lich_hen
    AND lh.ghi_chu = v_marker;

  DELETE FROM chi_tiet_don_thuoc ct
  USING don_thuoc dt
  JOIN phieu_kham pk ON pk.id_phieu_kham = dt.id_phieu_kham
  JOIN lich_hen lh ON lh.id_lich_hen = pk.id_lich_hen
  WHERE ct.id_don_thuoc = dt.id_don_thuoc
    AND lh.ghi_chu = v_marker;

  DELETE FROM don_thuoc dt
  USING phieu_kham pk
  JOIN lich_hen lh ON lh.id_lich_hen = pk.id_lich_hen
  WHERE dt.id_phieu_kham = pk.id_phieu_kham
    AND lh.ghi_chu = v_marker;

  DELETE FROM thanh_toan tt
  USING hoa_don hd
  JOIN phieu_kham pk ON pk.id_phieu_kham = hd.id_phieu_kham
  JOIN lich_hen lh ON lh.id_lich_hen = pk.id_lich_hen
  WHERE tt.id_hoa_don = hd.id_hoa_don
    AND lh.ghi_chu = v_marker;

  DELETE FROM hoa_don hd
  USING phieu_kham pk
  JOIN lich_hen lh ON lh.id_lich_hen = pk.id_lich_hen
  WHERE hd.id_phieu_kham = pk.id_phieu_kham
    AND lh.ghi_chu = v_marker;

  DELETE FROM chan_doan cd
  USING phieu_kham pk
  JOIN lich_hen lh ON lh.id_lich_hen = pk.id_lich_hen
  WHERE cd.id_phieu_kham = pk.id_phieu_kham
    AND lh.ghi_chu = v_marker;

  DELETE FROM phieu_kham pk
  USING lich_hen lh
  WHERE pk.id_lich_hen = lh.id_lich_hen
    AND lh.ghi_chu = v_marker;

  DELETE FROM tiep_nhan_benh_nhan tn
  USING lich_hen lh
  WHERE tn.id_lich_hen = lh.id_lich_hen
    AND lh.ghi_chu = v_marker;

  DELETE FROM lich_su_lich_hen ls
  USING lich_hen lh
  WHERE ls.id_lich_hen = lh.id_lich_hen
    AND lh.ghi_chu = v_marker;

  DELETE FROM thong_bao tb
  USING lich_hen lh
  WHERE tb.id_lich_hen = lh.id_lich_hen
    AND lh.ghi_chu = v_marker;

  DELETE FROM lich_hen
  WHERE ghi_chu = v_marker;

  -- 1) Chờ xác nhận — bs1 xác nhận / từ chối
  INSERT INTO lich_hen (
    id_benh_nhan, id_bac_si, id_tai_khoan_dat, ngay_hen, gio_hen,
    ly_do_kham, trang_thai, nguon_dat_lich, ghi_chu
  ) VALUES (
    3, v_doctor_id, '00000000-0000-0000-0000-000000001003', v_today, '08:00',
    'Đau họng, sốt nhẹ 1 ngày', 'Cho xac nhan', 'Truc tuyen', v_marker
  )
  RETURNING id_lich_hen INTO v_id_pending;

  -- 2) Đã xác nhận — sẵn sàng tiếp nhận (check-in đúng ngày)
  INSERT INTO lich_hen (
    id_benh_nhan, id_bac_si, id_tai_khoan_dat, ngay_hen, gio_hen,
    ly_do_kham, trang_thai, nguon_dat_lich, ghi_chu
  ) VALUES (
    4, v_doctor_id, '00000000-0000-0000-0000-000000001004', v_today, '08:30',
    'Ho khan, nghẹt mũi 3 ngày', 'Da xac nhan', 'Truc tuyen', v_marker
  )
  RETURNING id_lich_hen INTO v_id_confirmed;

  -- 3) Đã check-in + sinh hiệu — sẵn sàng bấm "Bắt đầu khám"
  INSERT INTO lich_hen (
    id_benh_nhan, id_bac_si, id_tai_khoan_dat, ngay_hen, gio_hen,
    ly_do_kham, trang_thai, nguon_dat_lich, ghi_chu,
    thoi_gian_check_in
  ) VALUES (
    5, v_doctor_id, '00000000-0000-0000-0000-000000001005', v_today, '09:00',
    'Đau đầu, mệt mỏi', 'Da check-in', 'Truc tuyen', v_marker,
    (v_today + TIME '08:45') AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )
  RETURNING id_lich_hen INTO v_id_checked_in;

  INSERT INTO tiep_nhan_benh_nhan (
    id_lich_hen, can_nang, chieu_cao, nhiet_do,
    huyet_ap_tam_thu, huyet_ap_tam_truong, nhip_tim, spo2,
    trieu_chung_ban_dau, ghi_chu, id_nguoi_tiep_nhan, thoi_gian_ghi_nhan
  ) VALUES (
    v_id_checked_in, 58.5, 162.0, 37.2,
    118, 76, 84, 98.0,
    'Đau đầu vùng trán, mệt', 'Seed: chờ bắt đầu khám', v_doctor_account,
    (v_today + TIME '08:45') AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )
  RETURNING id_tiep_nhan_benh_nhan INTO v_reception_checked_in;

  -- 4) Đang khám — mở DoctorVisitDetailPage và ghi hồ sơ / chỉ định / kê đơn
  INSERT INTO lich_hen (
    id_benh_nhan, id_bac_si, id_tai_khoan_dat, ngay_hen, gio_hen,
    ly_do_kham, trang_thai, nguon_dat_lich, ghi_chu,
    thoi_gian_check_in, thoi_gian_bat_dau_kham
  ) VALUES (
    6, v_doctor_id, '00000000-0000-0000-0000-000000001006', v_today, '09:30',
    'Đau bụng thượng vị, buồn nôn', 'Dang kham', 'Truc tuyen', v_marker,
    (v_today + TIME '09:10') AT TIME ZONE 'Asia/Ho_Chi_Minh',
    (v_today + TIME '09:20') AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )
  RETURNING id_lich_hen INTO v_id_in_progress;

  INSERT INTO tiep_nhan_benh_nhan (
    id_lich_hen, can_nang, chieu_cao, nhiet_do,
    huyet_ap_tam_thu, huyet_ap_tam_truong, nhip_tim, spo2,
    trieu_chung_ban_dau, ghi_chu, id_nguoi_tiep_nhan, thoi_gian_ghi_nhan
  ) VALUES (
    v_id_in_progress, 62.0, 168.0, 36.8,
    120, 78, 80, 99.0,
    'Đau thượng vị sau ăn, buồn nôn nhẹ', 'Seed: đang khám', v_doctor_account,
    (v_today + TIME '09:10') AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )
  RETURNING id_tiep_nhan_benh_nhan INTO v_reception_in_progress;

  -- 5) Đang khám + chỉ định CLS đã có kết quả — test bước Kết quả / Chẩn đoán
  INSERT INTO lich_hen (
    id_benh_nhan, id_bac_si, id_tai_khoan_dat, ngay_hen, gio_hen,
    ly_do_kham, trang_thai, nguon_dat_lich, ghi_chu,
    thoi_gian_check_in, thoi_gian_bat_dau_kham
  ) VALUES (
    7, v_doctor_id, '00000000-0000-0000-0000-000000001007', v_today, '14:00',
    'Ho, sốt, mệt mỏi', 'Dang kham', 'Truc tuyen', v_marker,
    (v_today + TIME '13:40') AT TIME ZONE 'Asia/Ho_Chi_Minh',
    (v_today + TIME '13:50') AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )
  RETURNING id_lich_hen INTO v_id_in_progress_cls;

  INSERT INTO tiep_nhan_benh_nhan (
    id_lich_hen, can_nang, chieu_cao, nhiet_do,
    huyet_ap_tam_thu, huyet_ap_tam_truong, nhip_tim, spo2,
    trieu_chung_ban_dau, ghi_chu, id_nguoi_tiep_nhan, thoi_gian_ghi_nhan
  ) VALUES (
    v_id_in_progress_cls, 70.0, 172.0, 38.1,
    125, 80, 92, 97.0,
    'Ho đờm, sốt 38°C', 'Seed: đang khám có CLS', v_doctor_account,
    (v_today + TIME '13:40') AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )
  RETURNING id_tiep_nhan_benh_nhan INTO v_reception_cls;

  SELECT id_dich_vu INTO v_service_id
  FROM danh_muc_dich_vu_lam_sang
  WHERE ma_dich_vu = 'XN-001' AND dang_hoat_dong = TRUE
  LIMIT 1;

  IF v_service_id IS NOT NULL THEN
    INSERT INTO chi_dinh_dich_vu_lam_sang (
      id_lich_hen, id_dich_vu, id_bac_si_chi_dinh, muc_dich, muc_uu_tien, trang_thai, ngay_chi_dinh
    ) VALUES (
      v_id_in_progress_cls, v_service_id, v_doctor_id,
      'Đánh giá nhiễm trùng hô hấp', 'Thuong', 'Da co ket qua',
      (v_today + TIME '13:55') AT TIME ZONE 'Asia/Ho_Chi_Minh'
    )
    RETURNING id_chi_dinh INTO v_order_id;

    INSERT INTO ket_qua_dich_vu_lam_sang (
      id_chi_dinh, ket_qua, ket_luan, nguoi_tra_ket_qua, thoi_gian_tra_ket_qua
    ) VALUES (
      v_order_id,
      'WBC 11.2 G/L; Neu 72%; Lympho 20%; Hb 13.5 g/dL; PLT 245 G/L',
      'Bạch cầu tăng nhẹ, gợi ý nhiễm trùng cấp',
      v_doctor_account,
      (v_today + TIME '14:20') AT TIME ZONE 'Asia/Ho_Chi_Minh'
    );
  END IF;

  INSERT INTO lich_su_lich_hen (
    id_lich_hen, ngay_moi, gio_moi, trang_thai_moi, loai_thay_doi, ly_do, nguoi_thay_doi
  ) VALUES
    (v_id_pending, v_today, '08:00', 'Cho xac nhan', 'Tao lich', 'Seed demo tiếp nhận/khám', v_doctor_account),
    (v_id_confirmed, v_today, '08:30', 'Da xac nhan', 'Tao lich', 'Seed demo tiếp nhận/khám', v_doctor_account),
    (v_id_checked_in, v_today, '09:00', 'Da check-in', 'Tao lich', 'Seed demo tiếp nhận/khám', v_doctor_account),
    (v_id_in_progress, v_today, '09:30', 'Dang kham', 'Tao lich', 'Seed demo tiếp nhận/khám', v_doctor_account),
    (v_id_in_progress_cls, v_today, '14:00', 'Dang kham', 'Tao lich', 'Seed demo tiếp nhận/khám', v_doctor_account);

  RAISE NOTICE 'Seed demo tiếp nhận/khám ngày %:', v_today;
  RAISE NOTICE '  Cho xac nhan  -> LH-% (id=%)', lpad(v_id_pending::text, 6, '0'), v_id_pending;
  RAISE NOTICE '  Da xac nhan   -> LH-% (id=%) — tiếp nhận', lpad(v_id_confirmed::text, 6, '0'), v_id_confirmed;
  RAISE NOTICE '  Da check-in   -> LH-% (id=%) — bắt đầu khám', lpad(v_id_checked_in::text, 6, '0'), v_id_checked_in;
  RAISE NOTICE '  Dang kham     -> LH-% (id=%) — ghi hồ sơ', lpad(v_id_in_progress::text, 6, '0'), v_id_in_progress;
  RAISE NOTICE '  Dang kham+CLS -> LH-% (id=%) — xem kết quả CLS', lpad(v_id_in_progress_cls::text, 6, '0'), v_id_in_progress_cls;
END $$;

COMMIT;

-- Tóm tắt lịch seed hôm nay
SELECT
  lh.id_lich_hen AS appointment_id,
  'LH-' || LPAD(lh.id_lich_hen::text, 6, '0') AS code,
  lh.ngay_hen,
  to_char(lh.gio_hen, 'HH24:MI') AS gio_hen,
  lh.trang_thai,
  bn.ho_ten AS benh_nhan,
  bs.ho_ten AS bac_si,
  CASE
    WHEN lh.trang_thai = 'Cho xac nhan' THEN 'Xác nhận lịch'
    WHEN lh.trang_thai = 'Da xac nhan' THEN 'Tiếp nhận / check-in'
    WHEN lh.trang_thai = 'Da check-in' THEN 'Bắt đầu khám'
    WHEN lh.trang_thai = 'Dang kham' AND EXISTS (
      SELECT 1 FROM chi_dinh_dich_vu_lam_sang cd WHERE cd.id_lich_hen = lh.id_lich_hen
    ) THEN 'Khám + xem kết quả CLS'
    WHEN lh.trang_thai = 'Dang kham' THEN 'Ghi hồ sơ / chỉ định / kê đơn'
    ELSE lh.trang_thai
  END AS huong_dan_dung,
  '/doctor/examinations/' || lh.id_lich_hen::text AS duong_dan_kham
FROM lich_hen lh
JOIN benh_nhan bn ON bn.id_benh_nhan = lh.id_benh_nhan
JOIN bac_si bs ON bs.id_bac_si = lh.id_bac_si
WHERE lh.ghi_chu = 'SEED_DEMO_RECEPTION_EXAM'
ORDER BY lh.gio_hen;
