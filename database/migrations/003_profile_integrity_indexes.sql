-- Align database-enforced uniqueness with the checks performed by the backend.
-- Every statement is additive. Existing duplicate data causes this migration to
-- fail and roll back instead of deleting or rewriting records.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM benh_nhan
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY lower(btrim(email)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate patient emails must be resolved before migration 002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM benh_nhan
    WHERE so_dien_thoai IS NOT NULL AND btrim(so_dien_thoai) <> ''
    GROUP BY btrim(so_dien_thoai) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate patient phone numbers must be resolved before migration 002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM bac_si
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY lower(btrim(email)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate doctor emails must be resolved before migration 002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM bac_si
    WHERE so_dien_thoai IS NOT NULL AND btrim(so_dien_thoai) <> ''
    GROUP BY btrim(so_dien_thoai) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate doctor phone numbers must be resolved before migration 002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM bac_si
    WHERE so_chung_chi_hanh_nghe IS NOT NULL AND btrim(so_chung_chi_hanh_nghe) <> ''
    GROUP BY lower(btrim(so_chung_chi_hanh_nghe)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate doctor license numbers must be resolved before migration 002';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_benh_nhan_email
  ON benh_nhan (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_benh_nhan_so_dien_thoai
  ON benh_nhan (btrim(so_dien_thoai))
  WHERE so_dien_thoai IS NOT NULL AND btrim(so_dien_thoai) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_bac_si_email
  ON bac_si (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_bac_si_so_dien_thoai
  ON bac_si (btrim(so_dien_thoai))
  WHERE so_dien_thoai IS NOT NULL AND btrim(so_dien_thoai) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_bac_si_so_chung_chi_ci
  ON bac_si (lower(btrim(so_chung_chi_hanh_nghe)))
  WHERE so_chung_chi_hanh_nghe IS NOT NULL AND btrim(so_chung_chi_hanh_nghe) <> '';

CREATE INDEX IF NOT EXISTS idx_thong_bao_tai_khoan_chua_doc
  ON thong_bao (id_tai_khoan, ngay_tao DESC)
  WHERE thoi_gian_doc IS NULL;
