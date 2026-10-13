import axios from 'axios';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import {
  emptyRelativeForm,
  RelativeProfileModal,
  relativeFormFromPatient,
} from '../../components/patient/RelativeProfileModal';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { patientApi, type PatientProfileInput, type RelativeProfileInput } from '../../features/patient/api';
import type { BookablePatient, PatientProfile } from '../../types';
import { ageLabel, formatDate, genderLabel, initials, relationLabel } from '../../utils/format';

const emptyForm = { hoTen: '', ngaySinh: '', gioiTinh: '', soDienThoai: '', email: '', diaChi: '', coBhyt: 'false', soBhyt: '' };
const bhytPattern = /^[A-Za-z0-9]{10,15}$/;

function formFromProfile(profile: PatientProfile | null): typeof emptyForm {
  return profile ? {
    hoTen: profile.hoTen, ngaySinh: profile.ngaySinh || '', gioiTinh: profile.gioiTinh || '',
    soDienThoai: profile.soDienThoai || '', email: profile.email || '', diaChi: profile.diaChi || '',
    coBhyt: profile.coBhyt ? 'true' : 'false', soBhyt: profile.soBhyt || '',
  } : { ...emptyForm };
}

function isSelf(item: BookablePatient) {
  return item.laChuHoSo || item.loaiQuanHe === 'BanThan';
}

export function PatientProfilePage() {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [relatives, setRelatives] = useState<BookablePatient[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [relativeModal, setRelativeModal] = useState<'create' | BookablePatient | null>(null);
  const [relativeBusy, setRelativeBusy] = useState(false);
  const [relativeError, setRelativeError] = useState('');
  const [confirmRemoveRelative, setConfirmRemoveRelative] = useState<BookablePatient | null>(null);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const [bookable, own] = await Promise.all([
        patientApi.bookable().catch(() => [] as BookablePatient[]),
        patientApi.me().catch((err) => {
          if (axios.isAxiosError(err) && err.response?.status === 404) return null;
          throw err;
        }),
      ]);
      setProfile(own);
      setForm(formFromProfile(own));
      setRelatives(bookable.filter((item) => !isSelf(item)));
    } catch (err) {
      setLoadError(String(errorMessage(err)));
    } finally {
      setLoading(false);
    }
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
    if (!/^0\d{9,10}$/.test(form.soDienThoai.trim())) {
      setError('Số điện thoại bắt buộc, bắt đầu bằng 0 và có 10 hoặc 11 chữ số (dùng để gửi OTP).');
      return;
    }
    const hasBhyt = form.coBhyt === 'true';
    const soBhyt = form.soBhyt.trim().toUpperCase();
    if (hasBhyt && !bhytPattern.test(soBhyt)) {
      setError('Khi chọn có BHYT, hãy nhập số thẻ BHYT (10–15 ký tự chữ hoặc số).');
      return;
    }
    const payload: PatientProfileInput = {
      hoTen: form.hoTen.trim(), ngaySinh: form.ngaySinh || null, gioiTinh: form.gioiTinh || null,
      soDienThoai: form.soDienThoai.trim(), email: form.email.trim() || null,
      diaChi: form.diaChi.trim() || null, coBhyt: hasBhyt, soBhyt: hasBhyt ? soBhyt : null,
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

  async function saveRelative(payload: RelativeProfileInput) {
    if (relativeBusy || !relativeModal) return;
    setRelativeBusy(true);
    setRelativeError('');
    try {
      if (relativeModal === 'create') {
        const created = await patientApi.createRelative(payload);
        setRelatives((current) => [...current, created]);
        setMessage(`Đã thêm hồ sơ người thân ${created.hoTen}.`);
      } else {
        const updated = await patientApi.updateRelative(relativeModal.id, payload);
        setRelatives((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setMessage(`Đã cập nhật hồ sơ ${updated.hoTen}.`);
      }
      setRelativeModal(null);
    } catch (err) {
      setRelativeError(String(errorMessage(err)));
    } finally {
      setRelativeBusy(false);
    }
  }

  async function removeRelative() {
    if (!confirmRemoveRelative || relativeBusy) return;
    setRelativeBusy(true);
    setError('');
    try {
      await patientApi.deleteRelative(confirmRemoveRelative.id);
      setRelatives((current) => current.filter((item) => item.id !== confirmRemoveRelative.id));
      setMessage(`Đã gỡ hồ sơ người thân ${confirmRemoveRelative.hoTen} khỏi danh sách đặt hộ.`);
      setConfirmRemoveRelative(null);
    } catch (err) {
      setError(String(errorMessage(err)));
      setConfirmRemoveRelative(null);
    } finally {
      setRelativeBusy(false);
    }
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const details = profile ? [
    ['Họ tên', profile.hoTen], ['Ngày sinh', formatDate(profile.ngaySinh)],
    ['Giới tính', genderLabel(profile.gioiTinh)], ['Số điện thoại', profile.soDienThoai || '—'],
    ['Email', profile.email || '—'], ['Địa chỉ', profile.diaChi || '—'],
    ['Bảo hiểm y tế', profile.coBhyt ? (profile.soBhyt ? `Có · ${profile.soBhyt}` : 'Có') : 'Không'],
  ] : [];

  const relativeModalInitial = useMemo(() => {
    if (!relativeModal) return emptyRelativeForm;
    if (relativeModal === 'create') return emptyRelativeForm;
    return relativeFormFromPatient(relativeModal);
  }, [relativeModal]);

  return (
    <div className="flex flex-col gap-4">
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
                  <TextField label="Số điện thoại (*)" type="tel" autoComplete="tel" pattern="0[0-9]{9,10}" title="Số điện thoại bắt đầu bằng 0 và có 10 hoặc 11 chữ số" value={form.soDienThoai} onChange={(event) => set('soDienThoai', event.target.value)} maxLength={20} required />
                  <TextField label="Email" type="email" autoComplete="email" value={form.email} onChange={(event) => set('email', event.target.value)} maxLength={150} />
                  <SelectField label="Sử dụng BHYT (*)" value={form.coBhyt} onChange={(event) => {
                    const value = event.target.value;
                    setForm((current) => ({ ...current, coBhyt: value, soBhyt: value === 'true' ? current.soBhyt : '' }));
                  }} required>
                    <option value="true">Có</option>
                    <option value="false">Không</option>
                  </SelectField>
                  {form.coBhyt === 'true' ? (
                    <TextField
                      label="Số thẻ BHYT (*)"
                      value={form.soBhyt}
                      onChange={(event) => set('soBhyt', event.target.value.toUpperCase())}
                      pattern="[A-Za-z0-9]{10,15}"
                      title="Số BHYT gồm 10–15 ký tự chữ hoặc số"
                      maxLength={15}
                      required
                    />
                  ) : null}
                  <TextField className="desk:col-span-2" label="Địa chỉ" autoComplete="street-address" value={form.diaChi} onChange={(event) => set('diaChi', event.target.value)} maxLength={255} />
                </fieldset>
                <p className="mt-3 text-xs text-muted">Họ tên và số điện thoại là bắt buộc (SĐT dùng gửi OTP). Chọn Có BHYT thì phải nhập số thẻ để xác nhận; khi đó bạn chọn được cả bác sĩ nhận BHYT và ngoài BHYT.</p>
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
          </>
        )}
      </section>

      {!loading && !loadError ? (
        <section className="rounded-xl border border-line bg-white p-5 shadow-card desk:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-navy-900">Hồ sơ người thân (đặt hộ)</h2>
              <p className="mt-1 text-sm text-muted">Thêm và sửa thông tin người được bạn đặt lịch hộ.</p>
            </div>
            <Button onClick={() => { setRelativeError(''); setRelativeModal('create'); setMessage(''); }} disabled={relativeBusy}>
              + Thêm người thân
            </Button>
          </div>
          {relatives.length === 0 ? (
            <EmptyState
              title="Chưa có hồ sơ người thân"
              description="Thêm hồ sơ để đặt khám hộ bố mẹ, con cái hoặc người thân khác."
              action={<Button onClick={() => { setRelativeError(''); setRelativeModal('create'); }}>Thêm hồ sơ người thân</Button>}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {relatives.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-[#f8fbff] p-3.5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-50 text-sm font-bold text-primary-700">
                    {initials(item.hoTen)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="block text-[15px] text-navy-900">{item.hoTen}</strong>
                    <span className="mt-0.5 block text-xs text-muted">
                      {relationLabel(item.loaiQuanHe)}
                      {' · '}
                      {genderLabel(item.gioiTinh)}
                      {ageLabel(item.ngaySinh) ? ` · ${ageLabel(item.ngaySinh)}` : ''}
                      {item.soDienThoai ? ` · ${item.soDienThoai}` : ''}
                    </span>
                    {item.diaChi ? <span className="mt-1 block text-xs text-muted">{item.diaChi}</span> : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" disabled={relativeBusy} onClick={() => { setRelativeError(''); setMessage(''); setRelativeModal(item); }}>
                      Sửa
                    </Button>
                    <Button variant="danger" disabled={relativeBusy} onClick={() => { setError(''); setConfirmRemoveRelative(item); }}>
                      Gỡ
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 border-t border-line pt-4 text-sm">
            <Link className="font-semibold text-primary-700" to="/patient/appointments/book">Đặt khám</Link>
            <span className="mx-2 text-muted">·</span>
            <Link className="font-semibold text-primary-700" to="/">Về trang chủ</Link>
          </div>
        </section>
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Xóa thông tin cá nhân"
          message="Bạn muốn xóa thông tin cá nhân? Tài khoản đăng nhập vẫn được giữ để thêm lại thông tin. Hồ sơ đã có lịch hẹn hoặc dữ liệu khám bệnh sẽ không thể xóa."
          confirmLabel={busy ? 'Đang xóa...' : 'Xóa thông tin'}
          danger
          busy={busy}
          onConfirm={() => { void remove(); }}
          onClose={() => { if (!busy) setConfirmDelete(false); }}
        />
      ) : null}

      {confirmRemoveRelative ? (
        <ConfirmDialog
          title="Gỡ hồ sơ người thân"
          message={`Gỡ ${confirmRemoveRelative.hoTen} khỏi danh sách đặt hộ? Nếu hồ sơ chưa có lịch khám, dữ liệu sẽ bị xóa.`}
          confirmLabel={relativeBusy ? 'Đang gỡ...' : 'Gỡ hồ sơ'}
          danger
          busy={relativeBusy}
          onConfirm={() => { void removeRelative(); }}
          onClose={() => { if (!relativeBusy) setConfirmRemoveRelative(null); }}
        />
      ) : null}

      {relativeModal ? (
        <RelativeProfileModal
          key={relativeModal === 'create' ? 'create' : relativeModal.id}
          title={relativeModal === 'create' ? 'Thêm hồ sơ người thân' : 'Sửa hồ sơ người thân'}
          initial={relativeModalInitial}
          busy={relativeBusy}
          error={relativeError}
          submitLabel={relativeModal === 'create' ? 'Thêm hồ sơ' : 'Lưu thay đổi'}
          onClose={() => { if (!relativeBusy) setRelativeModal(null); }}
          onSubmit={saveRelative}
        />
      ) : null}
    </div>
  );
}
