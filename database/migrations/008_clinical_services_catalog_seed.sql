-- Seed real clinical service catalog items into danh_muc_dich_vu_lam_sang.
-- Additive only: preserves existing records and uses ON CONFLICT (ma_dich_vu) DO NOTHING.

INSERT INTO danh_muc_dich_vu_lam_sang (ma_dich_vu, ten_dich_vu, nhom_dich_vu, don_vi_thuc_hien, don_gia, dang_hoat_dong)
VALUES
  ('XN-001', 'Tổng phân tích tế bào máu ngoại vi (18 - 24 thông số)', 'Xét nghiệm máu', 'Khoa Xét nghiệm', 85000.00, TRUE),
  ('XN-002', 'Định lượng Glucose máu', 'Xét nghiệm máu', 'Khoa Xét nghiệm', 45000.00, TRUE),
  ('XN-003', 'Định lượng HbA1c (Đánh giá kiểm soát đường huyết)', 'Xét nghiệm máu', 'Khoa Xét nghiệm', 120000.00, TRUE),
  ('XN-004', 'Định lượng Ure, Creatinin huyết thanh (Chức năng thận)', 'Xét nghiệm máu', 'Khoa Xét nghiệm', 70000.00, TRUE),
  ('XN-005', 'Định lượng AST (GOT), ALT (GPT) (Đánh giá men gan)', 'Xét nghiệm máu', 'Khoa Xét nghiệm', 70000.00, TRUE),
  ('XN-006', 'Bộ Bilan Lipid máu (Cholesterol, Triglycerid, HDL, LDL)', 'Xét nghiệm máu', 'Khoa Xét nghiệm', 150000.00, TRUE),
  ('XN-007', 'Định lượng Axit Uric huyết thanh (Tầm soát Gout)', 'Xét nghiệm máu', 'Khoa Xét nghiệm', 55000.00, TRUE),
  ('XN-008', 'Định lượng CRP (C-Reactive Protein) huyết thanh', 'Xét nghiệm máu', 'Khoa Xét nghiệm', 90000.00, TRUE),
  ('XN-009', 'Tổng phân tích nước tiểu (10 thông số)', 'Xét nghiệm nước tiểu', 'Khoa Xét nghiệm', 50000.00, TRUE),
  ('CDHA-001', 'Chụp X-quang tim phổi thẳng kỹ thuật số (CR/DR)', 'Chẩn đoán hình ảnh', 'Khoa Chẩn đoán hình ảnh', 110000.00, TRUE),
  ('CDHA-002', 'Chụp X-quang cột sống thắt lưng thẳng - nghiêng', 'Chẩn đoán hình ảnh', 'Khoa Chẩn đoán hình ảnh', 160000.00, TRUE),
  ('CDHA-003', 'Chụp X-quang khớp gối thẳng - nghiêng', 'Chẩn đoán hình ảnh', 'Khoa Chẩn đoán hình ảnh', 140000.00, TRUE),
  ('CDHA-004', 'Chụp cắt lớp vi tính (CT-Scanner) sọ não không tiêm thuốc', 'Chẩn đoán hình ảnh', 'Khoa Chẩn đoán hình ảnh', 950000.00, TRUE),
  ('SA-001', 'Siêu âm ổ bụng tổng quát (màu)', 'Siêu âm', 'Khoa Chẩn đoán hình ảnh', 150000.00, TRUE),
  ('SA-002', 'Siêu âm tuyến giáp Doppler màu', 'Siêu âm', 'Khoa Chẩn đoán hình ảnh', 150000.00, TRUE),
  ('SA-003', 'Siêu âm tim Doppler màu', 'Siêu âm', 'Khoa Thăm dò chức năng', 300000.00, TRUE),
  ('SA-004', 'Siêu âm Doppler mạch máu chi dưới', 'Siêu âm', 'Khoa Thăm dò chức năng', 250000.00, TRUE),
  ('TDCN-001', 'Ghi điện tim (ECG 12 chuyển đạo)', 'Thăm dò chức năng', 'Khoa Thăm dò chức năng', 60000.00, TRUE),
  ('NS-001', 'Nội soi tai mũi họng bằng ống mềm', 'Nội soi', 'Trung tâm Nội soi', 220000.00, TRUE),
  ('NS-002', 'Nội soi thực quản - dạ dày - tá tràng không gây mê', 'Nội soi', 'Trung tâm Nội soi', 650000.00, TRUE)
ON CONFLICT (ma_dich_vu) DO NOTHING;
