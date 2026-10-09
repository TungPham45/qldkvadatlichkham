import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { AuthLayout } from '../layouts/AuthLayout';
import { useAuth } from '../stores/auth-store';
import { hospitalName, roleHome } from '../utils/format';

export function LoginPage() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to={roleHome(user.role)} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const account = await login(username.trim(), password);
      navigate(roleHome(account.role));
    } catch (err) {
      setError(errorMessage(err, 'Đăng nhập thất bại.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="flex w-full max-w-[460px] flex-col gap-3.5 rounded-2xl border border-line bg-white p-7 shadow-card" onSubmit={onSubmit}>
        <h2 className="text-xl font-semibold">Đăng nhập</h2>
        <p className="text-[13px] text-muted">{hospitalName}</p>
        <TextField label="Tên đăng nhập" value={username} onChange={(event) => setUsername(event.target.value)} required />
        <TextField label="Mật khẩu" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error ? <div className="text-[13px] text-danger">{error}</div> : null}
        <Button disabled={busy}>{busy ? 'Đang đăng nhập...' : 'Đăng nhập'}</Button>
        <span className="text-[13px] text-muted">Chưa có tài khoản bệnh nhân? <Link className="font-semibold text-primary-700" to="/register">Đăng ký</Link></span>
      </form>
    </AuthLayout>
  );
}
