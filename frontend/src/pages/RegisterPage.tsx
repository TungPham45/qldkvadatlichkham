import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { Button } from '../components/Button';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { AuthLayout } from '../layouts/AuthLayout';
import { useAuth } from '../stores/auth-store';
import { roleHome } from '../utils/format';

export function RegisterPage() {
  const { user, ready, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    hoTen: '', ngaySinh: '', gioiTinh: 'Nam', soDienThoai: '', email: '', diaChi: '', username: '', password: '', confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (ready && user) return <Navigate to={roleHome(user.role)} replace />;

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const account = await register(form);
      navigate(roleHome(account.role));
    } catch (err) {
      setError(errorMessage(err, 'Đăng ký thất bại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="flex w-full max-w-[460px] flex-col gap-3.5 rounded-2xl border border-line bg-white p-7 shadow-card" onSubmit={onSubmit}>
        <h2 className="text-xl font-semibold">Đăng ký bệnh nhân</h2>
        <p className="text-[13px] text-muted">Chỉ tạo tài khoản bệnh nhân. Tài khoản bác sĩ và quản lý không đăng ký công khai.</p>
        <div className="grid grid-cols-1 gap-3.5 desk:grid-cols-2">
          <TextField className="desk:col-span-2" label="Họ tên" value={form.hoTen} onChange={(event) => set('hoTen', event.target.value)} required />
          <TextField label="Ngày sinh" type="date" value={form.ngaySinh} onChange={(event) => set('ngaySinh', event.target.value)} required />
          <SelectField label="Giới tính" value={form.gioiTinh} onChange={(event) => set('gioiTinh', event.target.value)}>
            <option value="Nam">Nam</option>
            <option value="Nu">Nữ</option>
            <option value="Khac">Khác</option>
          </SelectField>
          <TextField label="Số điện thoại" value={form.soDienThoai} onChange={(event) => set('soDienThoai', event.target.value)} required />
          <TextField label="Email" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} required />
          <TextField className="desk:col-span-2" label="Địa chỉ" value={form.diaChi} onChange={(event) => set('diaChi', event.target.value)} required />
          <TextField label="Tên đăng nhập" value={form.username} onChange={(event) => set('username', event.target.value)} required />
          <TextField label="Mật khẩu" type="password" value={form.password} onChange={(event) => set('password', event.target.value)} required />
          <TextField className="desk:col-span-2" label="Xác nhận mật khẩu" type="password" value={form.confirmPassword} onChange={(event) => set('confirmPassword', event.target.value)} required />
        </div>
        {error ? <div className="text-[13px] text-danger">{error}</div> : null}
        <Button disabled={busy}>{busy ? 'Đang tạo tài khoản...' : 'Đăng ký'}</Button>
        <span className="text-[13px] text-muted">Đã có tài khoản? <Link className="font-semibold text-primary-700" to="/login">Đăng nhập</Link></span>
      </form>
    </AuthLayout>
  );
}
