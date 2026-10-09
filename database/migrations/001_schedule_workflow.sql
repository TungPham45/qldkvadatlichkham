-- Migration cong them cho luong dang ky / duyet lich lam viec va chong trung email.
-- KHONG doi ten bang, KHONG doi ten cot, KHONG xoa du lieu.
--
-- Schema goc thieu:
--   * lich_lam_viec.trang_thai khong co CHECK (seed dang dung 'Active').
--   * khong co unique/exclusion chong trung ca cua cung bac si.
--   * benh_nhan.email khong unique.
--   * lich_hen khong co gio_ket_thuc va khong co id_lich_lam_viec.
--
-- Quyet dinh:
--   * Giu 'Active' (du lieu seed) va coi la da duyet.
--   * Them gia tri 'Cho duyet' | 'Da duyet' | 'Tu choi' tren cung cot trang_thai.
--   * Ca lam viec luu bang gio_bat_dau/gio_ket_thuc (khong them cot ca).
--   * Ly do tu choi luu vao ghi_chu.
--   * gio ket thuc slot va lich lam viec duoc suy ra luc dat lich, khong them cot moi vao lich_hen.
--   * Unique index lich_hen (id_bac_si, ngay_hen, gio_hen) WHERE trang_thai <> 'Huy' da co san.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE lich_lam_viec DROP CONSTRAINT IF EXISTS chk_lich_lam_viec_trang_thai;
ALTER TABLE lich_lam_viec
    ADD CONSTRAINT chk_lich_lam_viec_trang_thai
    CHECK (trang_thai IN ('Active', 'Cho duyet', 'Da duyet', 'Tu choi'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_lich_lam_viec_bs_ngay_gio
    ON lich_lam_viec (id_bac_si, ngay_lam_viec, gio_bat_dau)
    WHERE trang_thai <> 'Tu choi';

ALTER TABLE lich_lam_viec DROP CONSTRAINT IF EXISTS excl_lich_lam_viec_overlap;
ALTER TABLE lich_lam_viec
    ADD CONSTRAINT excl_lich_lam_viec_overlap
    EXCLUDE USING gist (
        id_bac_si WITH =,
        ngay_lam_viec WITH =,
        tsrange((ngay_lam_viec + gio_bat_dau), (ngay_lam_viec + gio_ket_thuc), '[)') WITH &&
    )
    WHERE (trang_thai <> 'Tu choi');

CREATE UNIQUE INDEX IF NOT EXISTS uq_benh_nhan_email
    ON benh_nhan (lower(email))
    WHERE email IS NOT NULL AND btrim(email) <> '';
