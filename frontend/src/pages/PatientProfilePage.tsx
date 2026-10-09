import axios from 'axios';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { patientApi, type PatientProfileInput } from '../features/patient/api';
import type { PatientProfile } from '../types';
import { formatDate, genderLabel } from '../utils/format';

const emptyForm = { hoTen: '', ngaySinh: '', gioiTinh: '', soDienThoai: '', email: '', diaChi: '', soBaoHiemYTe: '' };

function formFromProfile(profile: PatientProfile | null): typeof emptyForm {
  return profile ? {
    hoTen: profile.hoTen, ngaySinh: profile.ngaySinh || '', gioiTinh: profile.gioiTinh || '',
    soDienThoai: profile.soDienThoai || '', email: profile.email || '', diaChi: profile.diaChi || '',
    soBaoHiemYTe: profile.soBaoHiemYTe || '',
  } : { ...emptyForm };
}

export function PatientProfilePage() {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const current = await patientApi.me();
      setProfile(current);
      setForm(formFromProfile(current));
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setProfile(null);
        setForm({ ...emptyForm });
      } else setLoadError(String(errorMessage(err)));
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  function beginEdit() {
    setForm(formFromProfile(profile));
    setEditing(true);
    setError('');
    setMessage('');
  }

  function set<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!form.hoTen.trim()) { setError('Hãy nhập họ tên.'); return; }
    const payload: PatientProfileInput = {
      hoTen: form.hoTen.trim(), ngaySinh: form.ngaySinh || null, gioiTinh: form.gioiTinh || null,
      soDienThoai: form.soDienThoai.trim() || null, email: form.email.trim() || null,
      diaChi: form.diaChi.trim() || null, soBaoHiemYTe: form.soBaoHiemYTe.trim() || null,
    };
    setBusy(true);
    setError('');
    try {
      const saved = await (profile ? patientApi.updateMine(payload) : patientApi.createMine(payload));
      setProfile(saved);
      setForm(formFromProfile(saved));
      setEditing(false);
      setMessage(profile ? 'Đã cập nhật thông tin cá nhân.' : 'Đã thêm thông tin cá nhân.');
    } catch (err) { setError(String(errorMessage(err))); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await patientApi.deleteMine();
      setProfile(null);
      setForm({ ...emptyForm });
      setEditing(false);
      setMessage('Đã xóa thông tin cá nhân. Bạn có thể thêm lại thông tin để tiếp tục đặt khám.');
    } catch (err) { setError(String(errorMessage(err))); }
    finally { setBusy(false); setConfirmDelete(false); }
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const details = profile ? [
    ['Họ tên', profile.hoTen], ['Ngày sinh', formatDate(profile.ngaySinh)],
    ['Giới tính', genderLabel(profile.gioiTinh)], ['Số điện thoại', profile.soDienThoai || '—'],
    ['Email', profile.email || '—'], ['Địa chỉ', profile.diaChi || '—'],
    ['Số bảo hiểm y tế', profile.soBaoHiemYTe || '—'],
  ] : [];

  return (
    <section className="rounded-xl border border-line bg-white p-5 shadow-card desk:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-900">Thông tin cá nhân</h1>
          <p className="mt-1 text-sm text-muted">Quản lý thông tin của chính bạn dùng khi đặt lịch khám.</p>
        </div>
        {profile && !editing && !loading && !loadError ? (
          <div className="flex gap-2">
            <Button onClick={beginEdit} disabled={busy}>Sửa thông tin</Button>
            <Button variant="danger" onClick={() => { setError(''); setMessage(''); setConfirmDelete(true); }} disabled={busy}>Xóa thông tin</Button>
          </div>
        ) : null}
      </div>
      {loading ? <LoadingState /> : loadError ? <ErrorState message={loadError} onRetry={() => { void load(); }} /> : (
        <>
          {message ? <p className="mb-4 rounded-lg bg-[#e7f7ef] p-3 text-sm text-success" role="status">{message}</p> : null}
          {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-danger" role="alert">{error}</p> : null}
          {editing ? (
            <form onSubmit={save}>
              <fieldset disabled={busy} className="grid grid-cols-1 gap-4 desk:grid-cols-2">
                <TextField label="Họ tên" autoComplete="name" value={form.hoTen} onChange={(event) => set('hoTen', event.target.value)} maxLength={150} required />
                <TextField label="Ngày sinh" type="date" max={today} value={form.ngaySinh} onChange={(event) => set('ngaySinh', event.target.value)} />
                <SelectField label="Giới tính" value={form.gioiTinh} onChange={(event) => set('gioiTinh', event.target.value)}>
                  <option value="">Chưa cung cấp</option>
                  <option value="Nam">Nam</option><option value="Nu">Nữ</option><option value="Khac">Khác</option>
                </SelectField>
                <TextField label="Số điện thoại" type="tel" autoComplete="tel" pattern="0[0-9]{9,10}" title="Số điện thoại bắt đầu bằng 0 và có 10 hoặc 11 chữ số" value={form.soDienThoai} onChange={(event) => set('soDienThoai', event.target.value)} maxLength={20} />
                <TextField label="Email" type="email" autoComplete="email" value={form.email} onChange={(event) => set('email', event.target.value)} maxLength={150} />
                <TextField label="Số bảo hiểm y tế" value={form.soBaoHiemYTe} onChange={(event) => set('soBaoHiemYTe', event.target.value)} maxLength={50} />
                <TextField className="desk:col-span-2" label="Địa chỉ" autoComplete="street-address" value={form.diaChi} onChange={(event) => set('diaChi', event.target.value)} maxLength={255} />
              </fieldset>
              <p className="mt-3 text-xs text-muted">Họ tên là bắt buộc. Có thể để trống các thông tin khác.</p>
              <div className="mt-5 flex gap-3">
                <Button type="submit" disabled={busy}>{busy ? 'Đang lưu...' : profile ? 'Lưu thay đổi' : 'Thêm thông tin'}</Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Hủy</Button>
              </div>
            </form>
          ) : profile ? (
            <dl className="grid grid-cols-1 gap-3 desk:grid-cols-2">
              {details.map(([label, value]) => (
                <div key={label} className="rounded-xl bg-[#f8fbff] p-4">
                  <dt className="mb-1 text-xs text-muted">{label}</dt><dd className="break-words font-semibold text-navy-900">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <EmptyState title="Chưa có thông tin cá nhân" description="Thêm thông tin của bạn để phòng khám liên hệ và tiếp nhận khi đặt khám." action={<Button onClick={beginEdit}>Thêm thông tin cá nhân</Button>} />
          )}
          <div className="mt-5 border-t border-line pt-4 text-sm"><Link className="font-semibold text-primary-700" to="/patient/dashboard">Về trang chủ</Link></div>
        </>
      )}
      {confirmDelete ? <ConfirmDialog title="Xóa thông tin cá nhân" message="Bạn muốn xóa thông tin cá nhân? Tài khoản đăng nhập vẫn được giữ để thêm lại thông tin. Hồ sơ đã có lịch hẹn hoặc dữ liệu khám bệnh sẽ không thể xóa." confirmLabel={busy ? 'Đang xóa...' : 'Xóa thông tin'} danger busy={busy} onConfirm={() => { void remove(); }} onClose={() => { if (!busy) setConfirmDelete(false); }} /> : null}
    </section>
  );
}
