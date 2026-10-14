-- Mo rong quy trinh kham theo huong tuong thich nguoc.
-- Migration chi bo sung cot/trang thai, khong chuyen doi hay xoa du lieu cu.

ALTER TABLE tiep_nhan_benh_nhan
    ADD COLUMN IF NOT EXISTS id_nguoi_tiep_nhan UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_tiep_nhan_nguoi_tiep_nhan'
    ) THEN
        ALTER TABLE tiep_nhan_benh_nhan
            ADD CONSTRAINT fk_tiep_nhan_nguoi_tiep_nhan
            FOREIGN KEY (id_nguoi_tiep_nhan) REFERENCES tai_khoan(id_tai_khoan)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE lich_hen
    ADD COLUMN IF NOT EXISTS thoi_gian_hoan_tat_luot_kham TIMESTAMPTZ;

ALTER TABLE lich_hen DROP CONSTRAINT IF EXISTS chk_lich_hen_trang_thai;
ALTER TABLE lich_hen
    ADD CONSTRAINT chk_lich_hen_trang_thai
    CHECK (trang_thai IN (
        'Cho xac nhan',
        'Da xac nhan',
        'Da check-in',
        'Dang kham',
        'Da kham xong',
        'Hoan thanh',
        'Huy'
    ));

ALTER TABLE hoa_don
    ADD COLUMN IF NOT EXISTS tien_dich_vu NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS giam_tru NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE hoa_don DROP CONSTRAINT IF EXISTS chk_hoa_don_tong_khop;
ALTER TABLE hoa_don
    ADD CONSTRAINT chk_hoa_don_tien_dich_vu CHECK (tien_dich_vu >= 0),
    ADD CONSTRAINT chk_hoa_don_giam_tru CHECK (giam_tru >= 0),
    ADD CONSTRAINT chk_hoa_don_tong_khop
        CHECK (tong_tien = phi_kham + tien_dich_vu + tien_thuoc - giam_tru AND tong_tien >= 0);

ALTER TABLE thanh_toan
    ADD COLUMN IF NOT EXISTS id_nguoi_xac_nhan UUID,
    ADD COLUMN IF NOT EXISTS ghi_chu TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_thanh_toan_nguoi_xac_nhan'
    ) THEN
        ALTER TABLE thanh_toan
            ADD CONSTRAINT fk_thanh_toan_nguoi_xac_nhan
            FOREIGN KEY (id_nguoi_xac_nhan) REFERENCES tai_khoan(id_tai_khoan)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lich_hen_hoan_tat
    ON lich_hen(thoi_gian_hoan_tat_luot_kham)
    WHERE thoi_gian_hoan_tat_luot_kham IS NOT NULL;

