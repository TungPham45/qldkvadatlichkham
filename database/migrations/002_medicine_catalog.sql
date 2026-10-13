-- Bo sung nhom thuoc + nguong canh bao ton kho cho quan ly danh muc thuoc.
-- An toan chay lai (IF NOT EXISTS / WHERE nhom_thuoc IS NULL).

ALTER TABLE thuoc
    ADD COLUMN IF NOT EXISTS nhom_thuoc VARCHAR(100);

ALTER TABLE thuoc
    ADD COLUMN IF NOT EXISTS nguong_canh_bao INTEGER NOT NULL DEFAULT 50;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_thuoc_nguong'
    ) THEN
        ALTER TABLE thuoc
            ADD CONSTRAINT chk_thuoc_nguong CHECK (nguong_canh_bao >= 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_thuoc_nhom_thuoc ON thuoc(nhom_thuoc);

UPDATE thuoc SET nhom_thuoc = CASE
    WHEN ten_thuoc ILIKE '%Paracetamol%' OR ten_thuoc ILIKE '%Ibuprofen%' THEN 'Giảm đau - Hạ sốt'
    WHEN ten_thuoc ILIKE '%Amoxicillin%' OR ten_thuoc ILIKE '%Azithromycin%' THEN 'Kháng sinh'
    WHEN ten_thuoc ILIKE '%Cetirizine%' OR ten_thuoc ILIKE '%Loratadine%' THEN 'Kháng Histamin'
    WHEN ten_thuoc ILIKE '%Omeprazole%' OR ten_thuoc ILIKE '%Esomeprazole%'
      OR ten_thuoc ILIKE '%Pantoprazole%' OR ten_thuoc ILIKE '%Domperidone%'
      OR ten_thuoc ILIKE '%Gaviscon%' THEN 'Tiêu hóa'
    WHEN ten_thuoc ILIKE '%Metformin%' THEN 'Đái tháo đường'
    WHEN ten_thuoc ILIKE '%Amlodipine%' OR ten_thuoc ILIKE '%Losartan%' THEN 'Tim mạch'
    WHEN ten_thuoc ILIKE '%Atorvastatin%' OR ten_thuoc ILIKE '%Simvastatin%' THEN 'Lipid máu'
    WHEN ten_thuoc ILIKE '%Dextromethorphan%' OR ten_thuoc ILIKE '%Bromhexine%'
      OR ten_thuoc ILIKE '%Ambroxol%' THEN 'Hô hấp'
    WHEN ten_thuoc ILIKE '%Vitamin%' OR ten_thuoc ILIKE '%Zinc%'
      OR ten_thuoc ILIKE '%Calcium%' OR ten_thuoc ILIKE '%Magnesium%' THEN 'Vitamin - Khoáng chất'
    WHEN ten_thuoc ILIKE '%Prednisolone%' THEN 'Corticoid'
    WHEN ten_thuoc ILIKE '%ORS%' THEN 'Bù nước điện giải'
    ELSE 'Khác'
END
WHERE nhom_thuoc IS NULL;
