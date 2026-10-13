-- Bo sung so luong goi y mac dinh cho phac do thuoc theo benh.
-- An toan chay lai (IF NOT EXISTS).

ALTER TABLE goi_y_thuoc
    ADD COLUMN IF NOT EXISTS so_luong_goi_y INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_goi_y_so_luong'
    ) THEN
        ALTER TABLE goi_y_thuoc
            ADD CONSTRAINT chk_goi_y_so_luong
            CHECK (so_luong_goi_y IS NULL OR so_luong_goi_y > 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_goi_y_thuoc_benh ON goi_y_thuoc(id_danh_muc_ten_benh);
CREATE INDEX IF NOT EXISTS idx_goi_y_thuoc_thuoc ON goi_y_thuoc(id_thuoc);
