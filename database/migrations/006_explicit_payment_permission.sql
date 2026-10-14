-- Payment collection is an explicit capability. Admin accounts do not receive it by default.
ALTER TABLE quan_ly
  ADD COLUMN IF NOT EXISTS quyen_thanh_toan BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_quan_ly_quyen_thanh_toan
  ON quan_ly (id_tai_khoan)
  WHERE quyen_thanh_toan = TRUE;
