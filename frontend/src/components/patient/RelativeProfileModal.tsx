import { type FormEvent, useState } from 'react';
import type { BookablePatient } from '../../types';
import type { RelativeProfileInput } from '../../features/patient/api';
import { relationLabel, todayIso } from '../../utils/format';
import { Button } from '../Button';
import { Modal } from '../Modal';
import { SelectField } from '../SelectField';
import { TextField } from '../TextField';

const relations: Array<RelativeProfileInput['loaiQuanHe']> = ['Bo', 'Me', 'Con', 'Vo', 'Chong', 'NguoiThan', 'NguoiChamSoc'];

const bhytPattern = /^[A-Za-z0-9]{10,15}$/;

export type RelativeFormState = {
  hoTen: string;
  loaiQuanHe: RelativeProfileInput['loaiQuanHe'];
  ngaySinh: string;
  gioiTinh: string;
  soDienThoai: string;
  email: string;
  diaChi: string;
  coBhyt: boolean;
  soBhyt: string;
};

export const emptyRelativeForm: RelativeFormState = {
  hoTen: '',
  loaiQuanHe: 'NguoiThan',
  ngaySinh: '',
  gioiTinh: '',
  soDienThoai: '',
  email: '',
  diaChi: '',
  coBhyt: false,
  soBhyt: '',
};

export function relativeFormFromPatient(patient: BookablePatient): RelativeFormState {
  return {
    hoTen: patient.hoTen,
    loaiQuanHe: (relations.includes(patient.loaiQuanHe as RelativeProfileInput['loaiQuanHe'])
      ? patient.loaiQuanHe
      : 'NguoiThan') as RelativeProfileInput['loaiQuanHe'],
    ngaySinh: patient.ngaySinh || '',
    gioiTinh: patient.gioiTinh || '',
    soDienThoai: patient.soDienThoai || '',
    email: patient.email || '',
    diaChi: patient.diaChi || '',
    coBhyt: patient.coBhyt === true,
    soBhyt: patient.soBhyt || '',
  };
}

export function toRelativePayload(form: RelativeFormState): RelativeProfileInput {
  const soBhyt = form.soBhyt.trim().toUpperCase();
  return {
    hoTen: form.hoTen.trim(),
    loaiQuanHe: form.loaiQuanHe,
    ngaySinh: form.ngaySinh || null,
    gioiTinh: form.gioiTinh || null,
    soDienThoai: form.soDienThoai.trim(),
    email: form.email.trim() || null,
    diaChi: form.diaChi.trim() || null,
    coBhyt: form.coBhyt,
    soBhyt: form.coBhyt ? soBhyt : null,
  };
}

export function RelativeProfileModal({
  title,
  initial,
  busy,
  error,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: RelativeFormState;
  busy: boolean;
  error: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (payload: RelativeProfileInput) => Promise<void> | void;
}) {
  const [form, setForm] = useState(initial);
  const [localError, setLocalError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!form.hoTen.trim()) {
      setLocalError('Hãy nhập họ tên người thân.');
      return;
    }
    if (!/^0\d{9,10}$/.test(form.soDienThoai.trim())) {
      setLocalError('Số điện thoại bắt buộc, bắt đầu bằng 0 và có 10 hoặc 11 chữ số (dùng để gửi OTP).');
      return;
    }
    if (form.coBhyt && !bhytPattern.test(form.soBhyt.trim())) {
      setLocalError('Khi chọn có BHYT, hãy nhập số thẻ BHYT (10–15 ký tự chữ hoặc số).');
      return;
    }
    setLocalError('');
    await onSubmit(toRelativePayload(form));
  }

  return (
    <Modal title={title} onClose={() => { if (!busy) onClose(); }}>
      <form className="flex flex-col gap-3" onSubmit={save}>
        <TextField
          label="Họ tên (*)"
          value={form.hoTen}
          onChange={(event) => setForm((current) => ({ ...current, hoTen: event.target.value }))}
          maxLength={150}
          required
          autoFocus
        />
        <SelectField
          label="Quan hệ (*)"
          value={form.loaiQuanHe}
          onChange={(event) => setForm((current) => ({
            ...current,
            loaiQuanHe: event.target.value as RelativeProfileInput['loaiQuanHe'],
          }))}
          required
        >
          {relations.map((item) => (
            <option key={item} value={item}>{relationLabel(item)}</option>
          ))}
        </SelectField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Ngày sinh"
            type="date"
            max={todayIso()}
            value={form.ngaySinh}
            onChange={(event) => setForm((current) => ({ ...current, ngaySinh: event.target.value }))}
          />
          <SelectField
            label="Giới tính"
            value={form.gioiTinh}
            onChange={(event) => setForm((current) => ({ ...current, gioiTinh: event.target.value }))}
          >
            <option value="">Chưa cung cấp</option>
            <option value="Nam">Nam</option>
            <option value="Nu">Nữ</option>
            <option value="Khac">Khác</option>
          </SelectField>
        </div>
        <TextField
          label="Số điện thoại (*)"
          type="tel"
          pattern="0[0-9]{9,10}"
          title="Số điện thoại bắt đầu bằng 0 và có 10 hoặc 11 chữ số"
          value={form.soDienThoai}
          onChange={(event) => setForm((current) => ({ ...current, soDienThoai: event.target.value }))}
          maxLength={20}
          required
        />
        <TextField
          label="Email"
          type="email"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          maxLength={150}
        />
        <TextField
          label="Địa chỉ"
          value={form.diaChi}
          onChange={(event) => setForm((current) => ({ ...current, diaChi: event.target.value }))}
          maxLength={255}
        />
        <fieldset className="flex flex-col gap-1.5 text-[13px] font-semibold">
          <legend>Sử dụng BHYT (*)</legend>
          <div className="flex gap-4 text-sm font-normal">
            <label className="flex items-center gap-2">
              <input type="radio" name="relative-bhyt" checked={form.coBhyt} onChange={() => setForm((current) => ({ ...current, coBhyt: true }))} />
              Có
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="relative-bhyt" checked={!form.coBhyt} onChange={() => setForm((current) => ({ ...current, coBhyt: false, soBhyt: '' }))} />
              Không
            </label>
          </div>
          {form.coBhyt ? (
            <TextField
              label="Số thẻ BHYT (*)"
              value={form.soBhyt}
              onChange={(event) => setForm((current) => ({ ...current, soBhyt: event.target.value.toUpperCase() }))}
              pattern="[A-Za-z0-9]{10,15}"
              title="Số BHYT gồm 10–15 ký tự chữ hoặc số"
              maxLength={15}
              required
            />
          ) : null}
          <p className="text-xs font-normal text-muted">Chọn Có thì phải nhập số thẻ BHYT; khi đó chọn được cả bác sĩ nhận BHYT và ngoài BHYT.</p>
        </fieldset>
        {localError || error ? <p className="text-[13px] text-danger">{localError || error}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Đang lưu...' : submitLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
