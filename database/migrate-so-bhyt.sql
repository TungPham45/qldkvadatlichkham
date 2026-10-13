-- Cap nhat DB dang chay (khong can import lai toan bo qlphongkham.sql).
ALTER TABLE benh_nhan ADD COLUMN IF NOT EXISTS so_bhyt VARCHAR(20);

UPDATE benh_nhan
SET so_bhyt = 'DN401' || lpad(id_benh_nhan::text, 10, '0')
WHERE co_bhyt = TRUE AND (so_bhyt IS NULL OR so_bhyt = '');

UPDATE benh_nhan
SET so_bhyt = NULL
WHERE co_bhyt = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_benh_nhan_so_bhyt
  ON benh_nhan (upper(so_bhyt))
  WHERE so_bhyt IS NOT NULL;
