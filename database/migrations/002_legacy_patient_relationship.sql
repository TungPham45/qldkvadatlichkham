-- Upgrade the original one-account/one-patient schema to the independent
-- patient profile model used by the current services. Legacy columns are kept
-- for rollback/reference; their data is copied, never dropped.

ALTER TABLE bac_si
  ADD COLUMN IF NOT EXISTS nhan_bhyt BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE benh_nhan
  ADD COLUMN IF NOT EXISTS co_bhyt BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE benh_nhan
  ADD COLUMN IF NOT EXISTS so_bhyt VARCHAR(20);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'benh_nhan'
      AND column_name = 'so_bao_hiem_y_te'
  ) THEN
    EXECUTE $sql$
      UPDATE benh_nhan
      SET so_bhyt = upper(btrim(so_bao_hiem_y_te))
      WHERE so_bhyt IS NULL
        AND NULLIF(btrim(so_bao_hiem_y_te), '') IS NOT NULL
    $sql$;
  END IF;
END
$$;

UPDATE benh_nhan
SET co_bhyt = (NULLIF(btrim(so_bhyt), '') IS NOT NULL)
WHERE co_bhyt IS DISTINCT FROM (NULLIF(btrim(so_bhyt), '') IS NOT NULL);

CREATE TABLE IF NOT EXISTS tai_khoan_benh_nhan (
  id_tai_khoan UUID NOT NULL,
  id_benh_nhan BIGINT NOT NULL,
  loai_quan_he VARCHAR(50) NOT NULL,
  la_chu_ho_so BOOLEAN NOT NULL DEFAULT FALSE,
  duoc_dat_lich_ho BOOLEAN NOT NULL DEFAULT TRUE,
  trang_thai VARCHAR(30) NOT NULL DEFAULT 'Active',
  ngay_tao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_tai_khoan, id_benh_nhan),
  CONSTRAINT fk_tkbn_tai_khoan
    FOREIGN KEY (id_tai_khoan) REFERENCES tai_khoan(id_tai_khoan)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_tkbn_benh_nhan
    FOREIGN KEY (id_benh_nhan) REFERENCES benh_nhan(id_benh_nhan)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_tkbn_loai_quan_he CHECK (loai_quan_he IN (
    'BanThan', 'Bo', 'Me', 'Con', 'Vo', 'Chong', 'NguoiThan', 'NguoiChamSoc'
  )),
  CONSTRAINT chk_tkbn_trang_thai CHECK (trang_thai IN ('Active', 'Inactive')),
  CONSTRAINT chk_tkbn_chu_ho_so CHECK (
    (la_chu_ho_so = TRUE AND loai_quan_he = 'BanThan')
    OR (la_chu_ho_so = FALSE AND loai_quan_he <> 'BanThan')
  )
);

DO $$
DECLARE
  legacy_count BIGINT;
  migrated_count BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'benh_nhan'
      AND column_name = 'id_tai_khoan'
  ) THEN
    EXECUTE 'SELECT count(*) FROM benh_nhan WHERE id_tai_khoan IS NOT NULL'
      INTO legacy_count;
    EXECUTE $sql$
      INSERT INTO tai_khoan_benh_nhan
        (id_tai_khoan, id_benh_nhan, loai_quan_he, la_chu_ho_so, duoc_dat_lich_ho, trang_thai)
      SELECT id_tai_khoan, id_benh_nhan, 'BanThan', TRUE, TRUE, 'Active'
      FROM benh_nhan
      WHERE id_tai_khoan IS NOT NULL
      ON CONFLICT (id_tai_khoan, id_benh_nhan) DO NOTHING
    $sql$;
    EXECUTE $sql$
      SELECT count(*)
      FROM benh_nhan patient
      JOIN tai_khoan_benh_nhan link
        ON link.id_tai_khoan = patient.id_tai_khoan
       AND link.id_benh_nhan = patient.id_benh_nhan
      WHERE patient.id_tai_khoan IS NOT NULL
    $sql$ INTO migrated_count;
    IF migrated_count <> legacy_count THEN
      RAISE EXCEPTION 'Patient-account migration incomplete: expected %, copied %', legacy_count, migrated_count;
    END IF;

    -- The relation now lives in tai_khoan_benh_nhan. Nulling only the deprecated
    -- copy prevents its RESTRICT FK from blocking safe account deletion.
    EXECUTE 'ALTER TABLE benh_nhan ALTER COLUMN id_tai_khoan DROP NOT NULL';
    EXECUTE 'UPDATE benh_nhan SET id_tai_khoan = NULL WHERE id_tai_khoan IS NOT NULL';
    EXECUTE 'COMMENT ON COLUMN benh_nhan.id_tai_khoan IS ''Deprecated: migrated to tai_khoan_benh_nhan by migration 002''';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_tkbn_tai_khoan
  ON tai_khoan_benh_nhan(id_tai_khoan);
CREATE INDEX IF NOT EXISTS idx_tkbn_benh_nhan
  ON tai_khoan_benh_nhan(id_benh_nhan);
CREATE UNIQUE INDEX IF NOT EXISTS uq_benh_nhan_chu_ho_so
  ON tai_khoan_benh_nhan(id_benh_nhan)
  WHERE la_chu_ho_so = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tkbn_mot_ban_than
  ON tai_khoan_benh_nhan(id_tai_khoan)
  WHERE loai_quan_he = 'BanThan';

ALTER TABLE lich_hen
  ADD COLUMN IF NOT EXISTS id_tai_khoan_dat UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lich_hen_tai_khoan_dat') THEN
    ALTER TABLE lich_hen
      ADD CONSTRAINT fk_lich_hen_tai_khoan_dat
      FOREIGN KEY (id_tai_khoan_dat) REFERENCES tai_khoan(id_tai_khoan)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END
$$;

UPDATE lich_hen appointment
SET id_tai_khoan_dat = link.id_tai_khoan
FROM tai_khoan_benh_nhan link
WHERE link.id_benh_nhan = appointment.id_benh_nhan
  AND link.la_chu_ho_so = TRUE
  AND appointment.id_tai_khoan_dat IS NULL;

CREATE INDEX IF NOT EXISTS idx_lich_hen_tai_khoan_dat
  ON lich_hen(id_tai_khoan_dat);
CREATE INDEX IF NOT EXISTS idx_benh_nhan_co_bhyt
  ON benh_nhan(co_bhyt);
CREATE INDEX IF NOT EXISTS idx_benh_nhan_ngay_sinh
  ON benh_nhan(ngay_sinh);
CREATE INDEX IF NOT EXISTS idx_benh_nhan_so_dien_thoai
  ON benh_nhan(so_dien_thoai);
CREATE UNIQUE INDEX IF NOT EXISTS uq_benh_nhan_so_bhyt
  ON benh_nhan(upper(btrim(so_bhyt)))
  WHERE so_bhyt IS NOT NULL AND btrim(so_bhyt) <> '';
