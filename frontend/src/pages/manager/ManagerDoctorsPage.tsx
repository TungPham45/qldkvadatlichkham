import { FormEvent, useCallback, useEffect, useState } from 'react';
import { errorMessage, hasApiErrorCode } from '../../api/client';
import { AdminModal } from '../../components/AdminModal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ManagerPager } from '../../components/ManagerPager';
import { directoryApi, type ManagedDoctor } from '../../features/manager/directory-api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { exportCsv } from '../../utils/export-csv';
import { initials } from '../../utils/format';

const pageSize = 10;
const emptyForm = { hoTen: '', ngaySinh: '', gioiTinh: 'Nam', soDienThoai: '', email: '', bangCap: '', soChungChiHanhNghe: '', chuyenKhoaId: '', nhanBhyt: 'false', trangThai: 'Active', username: '', password: '' };
const doctorImage = (id: number) => `/doctors/doctor-${((id - 1) % 5) + 1}.png`;

function doctorSaveError(error: unknown) {
  if (hasApiErrorCode(error, 'USERNAME_ALREADY_EXISTS')) return 'Tên đăng nhập đã tồn tại. Vui lòng nhập tên đăng nhập khác.';
  if (hasApiErrorCode(error, 'PHONE_ALREADY_EXISTS')) return 'Số điện thoại đã được sử dụng bởi bác sĩ khác. Vui lòng kiểm tra lại.';
  if (hasApiErrorCode(error, 'LICENSE_ALREADY_EXISTS')) return 'Số chứng chỉ hành nghề (CCHN) đã tồn tại. Vui lòng nhập CCHN khác.';
  if (hasApiErrorCode(error, 'EMAIL_ALREADY_EXISTS')) return 'Email đã được sử dụng. Vui lòng nhập email khác.';
  return errorMessage(error);
}

function DoctorAvatar({ id, name, version = 0 }: { id: number; name: string; version?: number }) {
  const fallback = doctorImage(id);
  const [source, setSource] = useState(fallback);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setSource(fallback);
    directoryApi.doctorPhoto(id).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fallback, id, version]);
  return <span className="doctor-avatar"><img src={source} alt={`Ảnh bác sĩ ${name}`} onError={(event) => { if (source === fallback) event.currentTarget.hidden = true; else setSource(fallback); }} /><b>{initials(name)}</b></span>;
}

export function ManagerDoctorsPage() {
  const [items, setItems] = useState<ManagedDoctor[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1);
  const [q, setQ] = useState(''); const search = useDebouncedValue(q); const [gender, setGender] = useState(''); const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ManagedDoctor | null | undefined>(undefined); const [deleting, setDeleting] = useState<ManagedDoctor | null>(null);
  const [form, setForm] = useState(emptyForm); const [formError, setFormError] = useState(''); const [specialties, setSpecialties] = useState<Array<{ id: number; ten: string }>>([]);
  const [saveError, setSaveError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null); const [photoPreview, setPhotoPreview] = useState(''); const [photoVersion, setPhotoVersion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); try { const result = await directoryApi.doctors({ page, pageSize, q: search || undefined, gioiTinh: gender || undefined, trangThai: status || undefined }); if (page > 1 && result.total <= (page - 1) * pageSize) { setPage(Math.max(1, Math.ceil(result.total / pageSize))); return; } setItems(result.items); setTotal(result.total); setError(''); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  }, [gender, page, search, status]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { directoryApi.activeSpecialties().then(setSpecialties).catch(() => setSpecialties([])); }, []);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  function setField(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  function resetPhoto() { setPhoto(null); setPhotoPreview(''); }
  function openCreate() { setForm({ ...emptyForm, chuyenKhoaId: specialties[0] ? String(specialties[0].id) : '' }); resetPhoto(); setFormError(''); setSaveError(''); setEditing(null); }
  function openEdit(item: ManagedDoctor) { setForm({ hoTen: item.hoTen, ngaySinh: item.ngaySinh?.slice(0, 10) || '', gioiTinh: item.gioiTinh, soDienThoai: item.soDienThoai, email: item.email, bangCap: item.bangCap || '', soChungChiHanhNghe: item.soChungChiHanhNghe || '', chuyenKhoaId: item.chuyenKhoaId ? String(item.chuyenKhoaId) : '', nhanBhyt: item.nhanBhyt ? 'true' : 'false', trangThai: item.trangThai, username: item.username, password: '' }); resetPhoto(); setFormError(''); setSaveError(''); setEditing(item); }
  function choosePhoto(file?: File) {
    if (!file) { resetPhoto(); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setFormError('Ảnh phải có định dạng JPG, PNG hoặc WEBP.'); return; }
    if (file.size > 10 * 1024 * 1024) { setFormError('Ảnh bác sĩ không được vượt quá 10 MB.'); return; }
    setFormError(''); setPhoto(file); setPhotoPreview(URL.createObjectURL(file));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setFormError('');
    try {
      const profileBody = {
        hoTen: form.hoTen.trim(), ngaySinh: form.ngaySinh, gioiTinh: form.gioiTinh,
        soDienThoai: form.soDienThoai.trim(), email: form.email.trim(), bangCap: form.bangCap.trim(),
        soChungChiHanhNghe: form.soChungChiHanhNghe.trim(), chuyenKhoaId: Number(form.chuyenKhoaId),
        nhanBhyt: form.nhanBhyt === 'true', trangThai: form.trangThai,
      };
      let doctorId: number;
      if (editing) {
        await directoryApi.updateDoctor(editing.id, profileBody);
        doctorId = editing.id;
      } else {
        const created = await directoryApi.createDoctor({ ...profileBody, username: form.username.trim(), password: form.password });
        doctorId = created.id;
      }
      let uploadError = '';
      if (photo) {
        try { await directoryApi.uploadDoctorPhoto(doctorId, photo); setPhotoVersion((value) => value + 1); }
        catch (err) { uploadError = `Đã lưu thông tin bác sĩ nhưng tải ảnh thất bại: ${errorMessage(err)}`; }
      }
      resetPhoto(); setEditing(undefined); await load();
      if (uploadError) setError(uploadError);
    } catch (err) { setSaveError(doctorSaveError(err)); } finally { setBusy(false); }
  }
  async function remove() { if (!deleting) return; setBusy(true); try { await directoryApi.deleteDoctor(deleting.id); setDeleting(null); await load(); } catch (err) { setError(errorMessage(err)); setDeleting(null); } finally { setBusy(false); } }
  async function exportExcel() { const result = await directoryApi.doctors({ page: 1, pageSize: 100, q: search || undefined, gioiTinh: gender || undefined, trangThai: status || undefined }); exportCsv('danh-sach-bac-si.csv', ['Mã BS', 'Họ tên', 'Giới tính', 'Điện thoại', 'Email', 'Chuyên khoa', 'Bằng cấp', 'CCHN', 'BHYT', 'Trạng thái'], result.items.map((item) => [`BS-${String(item.id).padStart(4, '0')}`, item.hoTen, item.gioiTinh, item.soDienThoai, item.email, item.chuyenKhoa, item.bangCap, item.soChungChiHanhNghe, item.nhanBhyt ? 'Nhận BHYT' : 'Không BHYT', item.trangThai])); }

  return <main className="manager-page">
    <div className="manager-page__heading"><div><h1>Quản Lý Danh Sách Bác Sĩ</h1><p>Quản lý hồ sơ chuyên môn, chuyên khoa và tài khoản bác sĩ.</p></div><div className="manager-stat"><span>♙</span><div><small>Tổng số</small><strong>{total.toLocaleString('vi-VN')}</strong><em>Bác sĩ</em></div></div></div>
    <section className="manager-card"><div className="manager-toolbar"><div className="manager-search"><span>⌕</span><input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Tìm theo mã BS, họ tên, email, số điện thoại" /></div><select value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }}><option value="">Tất cả giới tính</option><option value="Nam">Nam</option><option value="Nu">Nữ</option></select><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Tất cả trạng thái</option><option value="Active">Hoạt động</option><option value="Inactive">Ngừng hoạt động</option><option value="Locked">Đã khóa</option></select><div className="manager-toolbar__actions"><button className="manager-btn manager-btn--outline" type="button" onClick={() => void exportExcel()}>⇩ Xuất Excel</button><button className="manager-btn manager-btn--primary" type="button" onClick={openCreate}>＋ Thêm bác sĩ</button></div></div>
      {error ? <div className="manager-alert">{error}</div> : null}
      <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Mã BS</th><th>Bác sĩ</th><th>Liên hệ</th><th>Chuyên khoa</th><th>Bằng cấp</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{loading ? <tr><td colSpan={7}>Đang tải dữ liệu...</td></tr> : items.length === 0 ? <tr><td colSpan={7}>Không tìm thấy bác sĩ.</td></tr> : items.map((item) => <tr key={item.id}><td><span className="manager-code">BS-{String(item.id).padStart(4, '0')}</span></td><td><div className="doctor-cell"><DoctorAvatar id={item.id} name={item.hoTen} version={photoVersion} /><span><strong>{item.hoTen}</strong><small>{item.soChungChiHanhNghe}</small></span></div></td><td>{item.soDienThoai}<small>{item.email}</small></td><td><span className="manager-specialty">{item.chuyenKhoa || 'Chưa phân khoa'}</span></td><td>{item.bangCap || '—'}</td><td><span className={`manager-status is-${item.trangThai.toLowerCase()}`}>{item.trangThai === 'Active' ? 'Hoạt động' : item.trangThai === 'Locked' ? 'Đã khóa' : 'Ngừng'}</span></td><td><div className="manager-row-actions"><button type="button" onClick={() => openEdit(item)}>Sửa</button><button className="is-danger" type="button" onClick={() => setDeleting(item)}>Xóa</button></div></td></tr>)}</tbody></table></div>
      <ManagerPager page={page} pageSize={pageSize} total={total} onPage={setPage} />
    </section>
    {editing !== undefined ? <AdminModal title={editing ? 'Sửa thông tin bác sĩ' : 'Thêm mới bác sĩ'} onClose={() => { if (!busy) { resetPhoto(); setEditing(undefined); } }}><form className="manager-form" onSubmit={submit}>
      <label className="is-wide"><span>Họ tên</span><input value={form.hoTen} onChange={(e) => setField('hoTen', e.target.value)} required /></label>
      <label className="is-wide"><span>Ảnh bác sĩ <small>JPG, PNG hoặc WEBP, tối đa 10 MB</small></span><div className="doctor-photo-field">{photoPreview ? <img src={photoPreview} alt="Ảnh bác sĩ đã chọn" /> : editing ? <DoctorAvatar id={editing.id} name={editing.hoTen} version={photoVersion} /> : <span className="doctor-photo-field__empty">Chưa chọn ảnh</span>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])} /></div></label>
      <label><span>Ngày sinh</span><input type="date" value={form.ngaySinh} onChange={(e) => setField('ngaySinh', e.target.value)} required /></label>
      <label><span>Giới tính</span><select value={form.gioiTinh} onChange={(e) => setField('gioiTinh', e.target.value)}><option value="Nam">Nam</option><option value="Nu">Nữ</option></select></label>
      <label><span>Số điện thoại</span><input value={form.soDienThoai} onChange={(e) => setField('soDienThoai', e.target.value)} pattern="0[0-9]{9,10}" required /></label>
      <label><span>Email</span><input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} required /></label>
      <label><span>Bằng cấp</span><input value={form.bangCap} onChange={(e) => setField('bangCap', e.target.value)} required /></label>
      <label><span>Số CCHN</span><input value={form.soChungChiHanhNghe} onChange={(e) => setField('soChungChiHanhNghe', e.target.value)} required /></label>
      <label><span>Chuyên khoa</span><select value={form.chuyenKhoaId} onChange={(e) => setField('chuyenKhoaId', e.target.value)} required><option value="">Chọn chuyên khoa</option>{specialties.map((item) => <option key={item.id} value={item.id}>{item.ten}</option>)}</select></label>
      <label><span>Nhận khám BHYT</span><select value={form.nhanBhyt} onChange={(e) => setField('nhanBhyt', e.target.value)}><option value="true">Có</option><option value="false">Không</option></select></label>
      <label><span>Trạng thái</span><select value={form.trangThai} onChange={(e) => setField('trangThai', e.target.value)}><option value="Active">Hoạt động</option><option value="Inactive">Ngừng hoạt động</option><option value="Locked">Đã khóa</option></select></label>
      {!editing ? <><label><span>Tên đăng nhập</span><input value={form.username} onChange={(e) => setField('username', e.target.value)} required /></label><label><span>Mật khẩu</span><input type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} minLength={6} required /></label></> : null}
      {formError ? <p className="manager-form__error is-wide">{formError}</p> : null}
      <div className="manager-form__actions is-wide"><button type="button" onClick={() => { resetPhoto(); setEditing(undefined); }}>Hủy</button><button className="manager-btn--primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu thông tin'}</button></div>
    </form></AdminModal> : null}
    {saveError ? <div className="manager-notice__backdrop" role="presentation"><section className="manager-notice" role="alertdialog" aria-modal="true" aria-labelledby="doctor-save-error-title"><div className="manager-notice__icon">!</div><h2 id="doctor-save-error-title">Không thể lưu bác sĩ</h2><p>{saveError}</p><button className="manager-btn manager-btn--primary" type="button" onClick={() => setSaveError('')}>Sửa lại thông tin</button></section></div> : null}
    {deleting ? <ConfirmDialog title="Xóa bác sĩ" message={`Bạn có chắc muốn xóa bác sĩ ${deleting.hoTen}? Bác sĩ đã có lịch làm việc sẽ được hệ thống bảo vệ.`} confirmLabel="Xóa bác sĩ" danger busy={busy} onClose={() => setDeleting(null)} onConfirm={() => void remove()} /> : null}
  </main>;
}
