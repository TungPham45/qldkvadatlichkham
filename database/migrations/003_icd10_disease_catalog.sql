-- Danh muc benh theo ICD-10 (TT 06/2026/TT-BYT / ICD-Vietnam TT06).
-- Tham chieu: https://icd.kcb.vn/icd-10-tt06/icd10-tt06
-- Xoa danh muc cu (BENH001...), nap ~50 ma ICD-10 mau da dang.
-- An toan chay lai: xoa phu thuoc roi nap lai.

BEGIN;

DELETE FROM goi_y_thuoc;
DELETE FROM chan_doan;
DELETE FROM danh_muc_ten_benh;

INSERT INTO danh_muc_ten_benh (id_danh_muc_ten_benh, ma_benh, ten_benh, mo_ta, nhom_benh, trang_thai) VALUES
(1,  'K30',   'Chứng khó tiêu', 'ICD-10 K30 — Functional dyspepsia', 'XI. Bệnh hệ tiêu hóa (K00–K93)', 'Active'),
(2,  'J02.9', 'Viêm họng cấp tính, không xác định', 'ICD-10 J02.9 — Acute pharyngitis, unspecified', 'X. Bệnh hệ hô hấp (J00–J99)', 'Active'),
(3,  'J18.9', 'Viêm phổi, không xác định', 'ICD-10 J18.9 — Pneumonia, unspecified', 'X. Bệnh hệ hô hấp (J00–J99)', 'Active'),
(4,  'K29.7', 'Viêm dạ dày, không xác định', 'ICD-10 K29.7 — Gastritis, unspecified', 'XI. Bệnh hệ tiêu hóa (K00–K93)', 'Active'),
(5,  'R53',   'Khó chịu và mệt mỏi', 'ICD-10 R53 — Malaise and fatigue', 'XVIII. Triệu chứng, dấu hiệu (R00–R99)', 'Active'),
(6,  'I10',   'Bệnh tăng huyết áp vô căn (nguyên phát)', 'ICD-10 I10 — Essential (primary) hypertension', 'IX. Bệnh hệ tuần hoàn (I00–I99)', 'Active'),
(7,  'T78.4', 'Dị ứng, không xác định', 'ICD-10 T78.4 — Allergy, unspecified', 'XIX. Chấn thương, ngộ độc (S00–T98)', 'Active'),
(8,  'J11.1', 'Cúm kèm biểu hiện hô hấp khác, virus không xác định', 'ICD-10 J11.1 — Influenza with other respiratory manifestations, virus not identified', 'X. Bệnh hệ hô hấp (J00–J99)', 'Active'),
(9,  'A09',   'Viêm dạ dày-ruột và viêm đại tràng do nhiễm trùng và nguyên nhân không xác định', 'ICD-10 A09 — Infectious gastroenteritis and colitis, unspecified', 'I. Bệnh nhiễm trùng và ký sinh trùng (A00–B99)', 'Active'),
(10, 'A90',   'Sốt xuất huyết dengue', 'ICD-10 A90 — Dengue fever [classical dengue]', 'I. Bệnh nhiễm trùng và ký sinh trùng (A00–B99)', 'Active'),
(11, 'B01.9', 'Thủy đậu không biến chứng', 'ICD-10 B01.9 — Varicella without complication', 'I. Bệnh nhiễm trùng và ký sinh trùng (A00–B99)', 'Active'),
(12, 'B18.1', 'Viêm gan virus B mạn tính', 'ICD-10 B18.1 — Chronic viral hepatitis B', 'I. Bệnh nhiễm trùng và ký sinh trùng (A00–B99)', 'Active'),
(13, 'B34.9', 'Nhiễm virus, không xác định', 'ICD-10 B34.9 — Viral infection, unspecified', 'I. Bệnh nhiễm trùng và ký sinh trùng (A00–B99)', 'Active'),
(14, 'E03.9', 'Suy giáp, không xác định', 'ICD-10 E03.9 — Hypothyroidism, unspecified', 'IV. Bệnh nội tiết, dinh dưỡng và chuyển hóa (E00–E90)', 'Active'),
(15, 'E11.9', 'Bệnh đái tháo đường típ 2 không có biến chứng', 'ICD-10 E11.9 — Type 2 diabetes mellitus without complications', 'IV. Bệnh nội tiết, dinh dưỡng và chuyển hóa (E00–E90)', 'Active'),
(16, 'E66.9', 'Béo phì, không xác định', 'ICD-10 E66.9 — Obesity, unspecified', 'IV. Bệnh nội tiết, dinh dưỡng và chuyển hóa (E00–E90)', 'Active'),
(17, 'E78.5', 'Tăng lipid máu, không xác định', 'ICD-10 E78.5 — Hyperlipidaemia, unspecified', 'IV. Bệnh nội tiết, dinh dưỡng và chuyển hóa (E00–E90)', 'Active'),
(18, 'F32.9', 'Giai đoạn trầm cảm, không xác định', 'ICD-10 F32.9 — Depressive episode, unspecified', 'V. Rối loạn tâm thần và hành vi (F00–F99)', 'Active'),
(19, 'F41.1', 'Rối loạn lo âu lan tỏa', 'ICD-10 F41.1 — Generalized anxiety disorder', 'V. Rối loạn tâm thần và hành vi (F00–F99)', 'Active'),
(20, 'G40.9', 'Động kinh, không xác định', 'ICD-10 G40.9 — Epilepsy, unspecified', 'VI. Bệnh hệ thần kinh (G00–G99)', 'Active'),
(21, 'G43.9', 'Đau nửa đầu, không xác định', 'ICD-10 G43.9 — Migraine, unspecified', 'VI. Bệnh hệ thần kinh (G00–G99)', 'Active'),
(22, 'H10.9', 'Viêm kết mạc, không xác định', 'ICD-10 H10.9 — Conjunctivitis, unspecified', 'VII. Bệnh mắt và phần phụ (H00–H59)', 'Active'),
(23, 'H66.9', 'Viêm tai giữa, không xác định', 'ICD-10 H66.9 — Otitis media, unspecified', 'VIII. Bệnh tai và xương chũm (H60–H95)', 'Active'),
(24, 'I20.9', 'Đau thắt ngực, không xác định', 'ICD-10 I20.9 — Angina pectoris, unspecified', 'IX. Bệnh hệ tuần hoàn (I00–I99)', 'Active'),
(25, 'I25.9', 'Bệnh tim thiếu máu cục bộ mạn tính, không xác định', 'ICD-10 I25.9 — Chronic ischaemic heart disease, unspecified', 'IX. Bệnh hệ tuần hoàn (I00–I99)', 'Active'),
(26, 'I48',   'Rung nhĩ và cuồng nhĩ', 'ICD-10 I48 — Atrial fibrillation and flutter', 'IX. Bệnh hệ tuần hoàn (I00–I99)', 'Active'),
(27, 'I63.9', 'Nhồi máu não, không xác định', 'ICD-10 I63.9 — Cerebral infarction, unspecified', 'IX. Bệnh hệ tuần hoàn (I00–I99)', 'Active'),
(28, 'J00',   'Viêm mũi họng cấp tính [cảm lạnh thông thường]', 'ICD-10 J00 — Acute nasopharyngitis [common cold]', 'X. Bệnh hệ hô hấp (J00–J99)', 'Active'),
(29, 'J03.9', 'Viêm amidan cấp tính, không xác định', 'ICD-10 J03.9 — Acute tonsillitis, unspecified', 'X. Bệnh hệ hô hấp (J00–J99)', 'Active'),
(30, 'J06.9', 'Nhiễm trùng đường hô hấp trên cấp tính, không xác định', 'ICD-10 J06.9 — Acute upper respiratory infection, unspecified', 'X. Bệnh hệ hô hấp (J00–J99)', 'Active'),
(31, 'J32.9', 'Viêm xoang mạn tính, không xác định', 'ICD-10 J32.9 — Chronic sinusitis, unspecified', 'X. Bệnh hệ hô hấp (J00–J99)', 'Active'),
(32, 'J44.9', 'Bệnh phổi tắc nghẽn mạn tính, không xác định', 'ICD-10 J44.9 — Chronic obstructive pulmonary disease, unspecified', 'X. Bệnh hệ hô hấp (J00–J99)', 'Active'),
(33, 'J45.9', 'Hen phế quản, không xác định', 'ICD-10 J45.9 — Asthma, unspecified', 'X. Bệnh hệ hô hấp (J00–J99)', 'Active'),
(34, 'K21.0', 'Bệnh trào ngược dạ dày-thực quản kèm viêm thực quản', 'ICD-10 K21.0 — Gastro-oesophageal reflux disease with oesophagitis', 'XI. Bệnh hệ tiêu hóa (K00–K93)', 'Active'),
(35, 'K58.9', 'Hội chứng ruột kích thích không xác định', 'ICD-10 K58.9 — Irritable bowel syndrome without diarrhoea', 'XI. Bệnh hệ tiêu hóa (K00–K93)', 'Active'),
(36, 'K80.2', 'Sỏi túi mật không kèm viêm túi mật', 'ICD-10 K80.2 — Calculus of gallbladder without cholecystitis', 'XI. Bệnh hệ tiêu hóa (K00–K93)', 'Active'),
(37, 'L20.9', 'Viêm da cơ địa, không xác định', 'ICD-10 L20.9 — Atopic dermatitis, unspecified', 'XII. Bệnh da và mô dưới da (L00–L99)', 'Active'),
(38, 'L30.9', 'Viêm da, không xác định', 'ICD-10 L30.9 — Dermatitis, unspecified', 'XII. Bệnh da và mô dưới da (L00–L99)', 'Active'),
(39, 'L50.9', 'Mày đay, không xác định', 'ICD-10 L50.9 — Urticaria, unspecified', 'XII. Bệnh da và mô dưới da (L00–L99)', 'Active'),
(40, 'M17.9', 'Thoái hóa khớp gối, không xác định', 'ICD-10 M17.9 — Gonarthrosis, unspecified', 'XIII. Bệnh hệ cơ xương khớp (M00–M99)', 'Active'),
(41, 'M54.5', 'Đau lưng dưới', 'ICD-10 M54.5 — Low back pain', 'XIII. Bệnh hệ cơ xương khớp (M00–M99)', 'Active'),
(42, 'M79.1', 'Đau cơ', 'ICD-10 M79.1 — Myalgia', 'XIII. Bệnh hệ cơ xương khớp (M00–M99)', 'Active'),
(43, 'N30.9', 'Viêm bàng quang, không xác định', 'ICD-10 N30.9 — Cystitis, unspecified', 'XIV. Bệnh hệ sinh dục-tiết niệu (N00–N99)', 'Active'),
(44, 'N39.0', 'Nhiễm trùng đường tiết niệu ở vị trí không xác định', 'ICD-10 N39.0 — Urinary tract infection, site not specified', 'XIV. Bệnh hệ sinh dục-tiết niệu (N00–N99)', 'Active'),
(45, 'N40',   'Tăng sản tuyến tiền liệt', 'ICD-10 N40 — Hyperplasia of prostate', 'XIV. Bệnh hệ sinh dục-tiết niệu (N00–N99)', 'Active'),
(46, 'N80.9', 'Lạc nội mạc tử cung, không xác định', 'ICD-10 N80.9 — Endometriosis, unspecified', 'XIV. Bệnh hệ sinh dục-tiết niệu (N00–N99)', 'Active'),
(47, 'R10.4', 'Đau bụng khác và không xác định', 'ICD-10 R10.4 — Other and unspecified abdominal pain', 'XVIII. Triệu chứng, dấu hiệu (R00–R99)', 'Active'),
(48, 'R51',   'Đau đầu', 'ICD-10 R51 — Headache', 'XVIII. Triệu chứng, dấu hiệu (R00–R99)', 'Active'),
(49, 'S06.0', 'Chấn động não', 'ICD-10 S06.0 — Concussion', 'XIX. Chấn thương, ngộ độc (S00–T98)', 'Active'),
(50, 'Z00.0', 'Khám tổng quát và điều tra người không có triệu chứng hoặc không có chẩn đoán được báo cáo', 'ICD-10 Z00.0 — General medical examination', 'XXI. Yếu tố ảnh hưởng sức khỏe (Z00–Z99)', 'Active');

-- Gan lai chan doan mau cho cac phieu kham hien co (xoay vong 50 ma ICD).
INSERT INTO chan_doan (id_phieu_kham, id_danh_muc_ten_benh, la_chan_doan_chinh, ghi_chu, ngay_tao)
SELECT
    pk.id_phieu_kham,
    ((pk.id_phieu_kham - 1) % 50) + 1,
    TRUE,
    NULL,
    COALESCE(pk.ngay_tao, CURRENT_TIMESTAMP)
FROM phieu_kham pk
ORDER BY pk.id_phieu_kham;

-- Goi y thuoc mau cho 8 ma ICD pho bien dau (neu con thuoc trong kho).
INSERT INTO goi_y_thuoc (id_danh_muc_ten_benh, id_thuoc, muc_do_uu_tien, muc_dich_su_dung, lieu_dung_goi_y, ghi_chu, dang_hoat_dong)
SELECT
    d.id_danh_muc_ten_benh,
    t.id_thuoc,
    t.rn,
    'Ho tro dieu tri theo chan doan ICD-10',
    'Theo chi dinh cua bac si',
    NULL,
    TRUE
FROM danh_muc_ten_benh d
CROSS JOIN LATERAL (
    SELECT id_thuoc, ROW_NUMBER() OVER (ORDER BY id_thuoc) AS rn
    FROM thuoc
    WHERE dang_hoat_dong = TRUE
    ORDER BY id_thuoc
    LIMIT 5
) t
WHERE d.id_danh_muc_ten_benh BETWEEN 1 AND 8;

SELECT setval(
    pg_get_serial_sequence('danh_muc_ten_benh', 'id_danh_muc_ten_benh'),
    COALESCE((SELECT MAX(id_danh_muc_ten_benh) FROM danh_muc_ten_benh), 0) + 1,
    FALSE
);
SELECT setval(
    pg_get_serial_sequence('chan_doan', 'id_chan_doan'),
    COALESCE((SELECT MAX(id_chan_doan) FROM chan_doan), 0) + 1,
    FALSE
);
SELECT setval(
    pg_get_serial_sequence('goi_y_thuoc', 'id_goi_y_thuoc'),
    COALESCE((SELECT MAX(id_goi_y_thuoc) FROM goi_y_thuoc), 0) + 1,
    FALSE
);

COMMIT;
