import { FormEvent, useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { AdminModal } from '../components/AdminModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ManagerPager } from '../components/ManagerPager';
import { directoryApi, type ManagedPatient } from '../features/manager/directory-api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { exportCsv } from '../utils/export-csv';
import { ageLabel, formatDate } from '../utils/format';

const pageSize = 10;
const emptyForm = { hoTen: '', ngaySinh: '', gioiTinh: 'Nam', soDienThoai: '', email: '', diaChi: '', coBhyt: 'false', soBhyt: '', trangThai: 'Active', username: '', password: '' };
const bhytPattern = /^[A-Za-z0-9]{10,15}$/;

export function ManagerPatientsPage() {
  const [items, setItems] = useState<ManagedPatient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const search = useDebouncedValue(q);
  const [gender, setGender] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<ManagedPatient | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<ManagedPatient | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await directoryApi.patients({ page, pageSize, q: search || undefined, gioiTinh: gender || undefined, trangThai: status || undefined });
      if (page > 1 && result.total <= (page - 1) * pageSize) { setPage(Math.max(1, Math.ceil(result.total / pageSize))); return; }
      setItems(result.items); setTotal(result.total); setError('');
    } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  }, [gender, page, search, status]);

  useEffect(() => { void load(); }, [load]);

  function openCreate() { setForm(emptyForm); setFormError(''); setEditing(null); }
  function openEdit(item: ManagedPatient) {
    setForm({ hoTen: item.hoTen, ngaySinh: item.ngaySinh?.slice(0, 10) || '', gioiTinh: item.gioiTinh, soDienThoai: item.soDienThoai, email: item.email, diaChi: item.diaChi, coBhyt: item.coBhyt ? 'true' : 'false', soBhyt: item.soBhyt || '', trangThai: item.trangThai, username: item.username, password: '' });
    setFormError(''); setEditing(item);
  }
  function setField(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const hasBhyt = form.coBhyt === 'true';
    const soBhyt = form.soBhyt.trim().toUpperCase();
    if (hasBhyt && !bhytPattern.test(soBhyt)) {
      setFormError('Khi chọn có BHYT, hãy nhập số thẻ BHYT (10–15 ký tự chữ hoặc số).');
      return;
    }
    setBusy(true); setFormError('');
    try {
      const profileBody = {
        hoTen: form.hoTen.trim(), ngaySinh: form.ngaySinh, gioiTinh: form.gioiTinh,
        soDienThoai: form.soDienThoai.trim(), email: form.email.trim(), diaChi: form.diaChi.trim(),
        coBhyt: hasBhyt, soBhyt: hasBhyt ? soBhyt : null, trangThai: form.trangThai,
      };
      if (editing) {
        await directoryApi.updatePatient(editing.id, profileBody);
      } else {
        await directoryApi.createPatient({ ...profileBody, username: form.username.trim(), password: form.password });
      }
      setEditing(undefined); await load();
    } catch (err) { setFormError(errorMessage(err)); } finally { setBusy(false); }
  }

  async function remove() {
    if (!deleting) return; setBusy(true);
    try { await directoryApi.deletePatient(deleting.id); setDeleting(null); await load(); } catch (err) { setError(errorMessage(err)); setDeleting(null); } finally { setBusy(false); }
  }

  async function exportExcel() {
    const result = await directoryApi.patients({ page: 1, pageSize: 100, q: search || undefined, gioiTinh: gender || undefined, trangThai: status || undefined });
    exportCsv('danh-sach-benh-nhan.csv', ['Mã BN', 'Họ tên', 'Ngày sinh', 'Giới tính', 'Số điện thoại', 'Email', 'Địa chỉ', 'BHYT', 'Số BHYT', 'Trạng thái'], result.items.map((item) => [`BN-${String(item.id).padStart(5, '0')}`, item.hoTen, formatDate(item.ngaySinh), item.gioiTinh, item.soDienThoai, item.email, item.diaChi, item.coBhyt ? 'Có' : 'Không', item.soBhyt || '', item.trangThai]));
  }

  return (
    <main className="manager-page">
      <div className="manager-page__heading">
        <div><h1>Quản Lý Danh Sách Bệnh Nhân</h1><p>Tra cứu hồ sơ bệnh nhân và quản lý thông tin hành chính.</p></div>
        <div className="manager-stat"><span>♟</span><div><small>Tổng số</small><strong>{total.toLocaleString('vi-VN')}</strong><em>Bệnh nhân</em></div></div>
      </div>
      <section className="manager-card">
        <div className="manager-toolbar">
          <div className="manager-search"><span>⌕</span><input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Tìm theo mã BN, họ tên, số điện thoại, email" /></div>
          <select value={gender} onChange={(event) => { setGender(event.target.value); setPage(1); }}><option value="">Tất cả giới tính</option><option value="Nam">Nam</option><option value="Nu">Nữ</option></select>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Tất cả trạng thái</option><option value="Active">Hoạt động</option><option value="Inactive">Ngừng hoạt động</option><option value="Locked">Đã khóa</option></select>
          <div className="manager-toolbar__actions"><button className="manager-btn manager-btn--outline" type="button" onClick={() => void exportExcel()}>⇩ Xuất Excel</button><button className="manager-btn manager-btn--primary" type="button" onClick={openCreate}>＋ Thêm bệnh nhân</button></div>
        </div>
        {error ? <div className="manager-alert">{error}</div> : null}
        <div className="manager-table-wrap">
          <table className="manager-table"><thead><tr><th>Mã BN</th><th>Họ và tên</th><th>Số điện thoại</th><th>Ngày sinh</th><th>Giới tính</th><th>Địa chỉ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>{loading ? <tr><td colSpan={8}>Đang tải dữ liệu...</td></tr> : items.length === 0 ? <tr><td colSpan={8}>Không tìm thấy bệnh nhân.</td></tr> : items.map((item) => (
              <tr key={item.id}><td><span className="manager-code">BN-{String(item.id).padStart(5, '0')}</span></td><td><strong>{item.hoTen}</strong><small>{item.email}</small></td><td>{item.soDienThoai}</td><td>{formatDate(item.ngaySinh)}<small>{ageLabel(item.ngaySinh)}</small></td><td><span className={`manager-gender ${item.gioiTinh === 'Nu' ? 'is-female' : ''}`}>{item.gioiTinh === 'Nu' ? 'Nữ' : 'Nam'}</span></td><td className="manager-table__address">{item.diaChi}</td><td><span className={`manager-status is-${item.trangThai.toLowerCase()}`}>{item.trangThai === 'Active' ? 'Hoạt động' : item.trangThai === 'Locked' ? 'Đã khóa' : 'Ngừng'}</span></td><td><div className="manager-row-actions"><button type="button" onClick={() => openEdit(item)}>Sửa</button><button className="is-danger" type="button" onClick={() => setDeleting(item)}>Xóa</button></div></td></tr>
            ))}</tbody></table>
        </div>
        <ManagerPager page={page} pageSize={pageSize} total={total} onPage={setPage} />
      </section>
      {editing !== undefined ? <AdminModal title={editing ? 'Sửa thông tin bệnh nhân' : 'Thêm mới bệnh nhân'} onClose={() => !busy && setEditing(undefined)}><form className="manager-form" onSubmit={submit}>
        <label className="is-wide"><span>Họ tên</span><input value={form.hoTen} onChange={(e) => setField('hoTen', e.target.value)} required /></label>
        <label><span>Ngày sinh</span><input type="date" value={form.ngaySinh} onChange={(e) => setField('ngaySinh', e.target.value)} required /></label>
        <label><span>Giới tính</span><select value={form.gioiTinh} onChange={(e) => setField('gioiTinh', e.target.value)}><option value="Nam">Nam</option><option value="Nu">Nữ</option></select></label>
        <label><span>Số điện thoại</span><input value={form.soDienThoai} onChange={(e) => setField('soDienThoai', e.target.value)} pattern="0[0-9]{9,10}" required /></label>
        <label><span>Email</span><input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} required /></label>
        <label className="is-wide"><span>Địa chỉ</span><input value={form.diaChi} onChange={(e) => setField('diaChi', e.target.value)} required /></label>
        <label><span>Sử dụng BHYT</span><select value={form.coBhyt} onChange={(e) => {
          const value = e.target.value;
          setForm((current) => ({ ...current, coBhyt: value, soBhyt: value === 'true' ? current.soBhyt : '' }));
        }}><option value="true">Có</option><option value="false">Không</option></select></label>
        {form.coBhyt === 'true' ? (
          <label><span>Số thẻ BHYT</span><input value={form.soBhyt} onChange={(e) => setField('soBhyt', e.target.value.toUpperCase())} pattern="[A-Za-z0-9]{10,15}" title="Số BHYT gồm 10–15 ký tự chữ hoặc số" maxLength={15} required /></label>
        ) : null}
        <label><span>Trạng thái</span><select value={form.trangThai} onChange={(e) => setField('trangThai', e.target.value)}><option value="Active">Hoạt động</option><option value="Inactive">Ngừng hoạt động</option><option value="Locked">Đã khóa</option></select></label>
        {!editing ? <><label><span>Tên đăng nhập</span><input value={form.username} onChange={(e) => setField('username', e.target.value)} required /></label><label><span>Mật khẩu</span><input type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} minLength={6} required /></label></> : null}
        {formError ? <p className="manager-form__error is-wide">{formError}</p> : null}<div className="manager-form__actions is-wide"><button type="button" onClick={() => setEditing(undefined)}>Hủy</button><button className="manager-btn--primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu thông tin'}</button></div>
      </form></AdminModal> : null}
      {deleting ? <ConfirmDialog title="Xóa bệnh nhân" message={`Bạn có chắc muốn xóa bệnh nhân ${deleting.hoTen}? Dữ liệu đã phát sinh lịch khám sẽ được bảo vệ.`} confirmLabel="Xóa bệnh nhân" danger busy={busy} onClose={() => setDeleting(null)} onConfirm={() => void remove()} /> : null}
    </main>
  );
}
