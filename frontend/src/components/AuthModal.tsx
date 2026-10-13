import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../stores/auth-store';
import { roleHome } from '../utils/format';
import '../styles/auth-modal.css';

export type AuthMode = 'login' | 'register';

interface AuthModalProps {
  mode: AuthMode;
  onClose: () => void;
  onModeChange: (mode: AuthMode) => void;
}

const emptyRegisterForm = {
  hoTen: '',
  ngaySinh: '',
  gioiTinh: 'Nam',
  soDienThoai: '',
  email: '',
  diaChi: '',
  coBhyt: 'false',
  soBhyt: '',
  username: '',
  password: '',
};

const bhytPattern = /^[A-Za-z0-9]{10,15}$/;

function PasswordEye({ visible }: { visible: boolean }) {
  return visible ? (
    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.8 4.2A10.8 10.8 0 0 1 12 4c5.2 0 9 4.2 10 8a12.5 12.5 0 0 1-2.3 4.4M6.2 6.2A12.2 12.2 0 0 0 2 12c1 3.8 4.8 8 10 8 1.3 0 2.5-.3 3.6-.7" /></svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12c1-3.8 4.8-8 10-8s9 4.2 10 8c-1 3.8-4.8 8-10 8S3 15.8 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}

export function AuthModal({ mode, onClose, onModeChange }: AuthModalProps) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [registerForm, setRegisterForm] = useState(emptyRegisterForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => firstInputRef.current?.focus(), 0);
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [busy, mode, onClose]);

  useEffect(() => {
    setError('');
    setSuccess('');
  }, [mode]);

  function changeMode(nextMode: AuthMode) {
    setError('');
    setSuccess('');
    onModeChange(nextMode);
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const account = await login(username.trim(), password);
      setSuccess('Đăng nhập thành công. Đang chuyển đến trang của bạn...');
      setPassword('');
      window.setTimeout(() => navigate(roleHome(account.role), { replace: true }), 650);
    } catch (err) {
      setPassword('');
      setError(errorMessage(err, 'Tên đăng nhập hoặc mật khẩu chưa đúng.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister(event: FormEvent) {
    event.preventDefault();
    const hasBhyt = registerForm.coBhyt === 'true';
    const soBhyt = registerForm.soBhyt.trim().toUpperCase();
    if (hasBhyt && !bhytPattern.test(soBhyt)) {
      setError('Khi chọn có BHYT, hãy nhập số thẻ BHYT (10–15 ký tự chữ hoặc số).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await register({
        hoTen: registerForm.hoTen.trim(),
        ngaySinh: registerForm.ngaySinh,
        gioiTinh: registerForm.gioiTinh,
        soDienThoai: registerForm.soDienThoai.trim(),
        email: registerForm.email.trim(),
        diaChi: registerForm.diaChi.trim(),
        coBhyt: hasBhyt,
        soBhyt: hasBhyt ? soBhyt : null,
        username: registerForm.username.trim(),
        password: registerForm.password,
      });
      setSuccess('Đăng ký tài khoản thành công.');
    } catch (err) {
      setError(errorMessage(err, 'Không thể đăng ký tài khoản. Hãy kiểm tra lại thông tin.'));
    } finally {
      setBusy(false);
    }
  }

  function setRegisterField(field: keyof typeof registerForm, value: string) {
    setRegisterForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="auth-modal__backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className={`auth-modal ${mode === 'register' ? 'auth-modal--register' : ''}`} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <button className="auth-modal__close" type="button" aria-label="Đóng cửa sổ" disabled={busy} onClick={onClose}>×</button>

        {mode === 'login' ? (
          <>
            <header className="auth-modal__header">
              <span>Cổng thông tin bệnh viện</span>
              <h2 id="auth-modal-title">Đăng nhập</h2>
              <p>Nhập tài khoản để tiếp tục.</p>
            </header>
            <form className="auth-modal__form" onSubmit={submitLogin}>
              <label>
                <span>Tên đăng nhập</span>
                <input ref={firstInputRef} value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={100} autoComplete="username" required />
              </label>
              <label>
                <span>Mật khẩu</span>
                <span className="auth-modal__password"><input value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} maxLength={100} type={showLoginPassword ? 'text' : 'password'} autoComplete="current-password" required /><button type="button" aria-label={showLoginPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showLoginPassword} onClick={() => setShowLoginPassword((visible) => !visible)}><PasswordEye visible={showLoginPassword} /></button></span>
              </label>
              {error ? (
                <div className="auth-modal__message auth-modal__message--error" role="alert">
                  <strong>{error}</strong>
                  <span>Bạn có muốn nhập lại thông tin không?</span>
                  <div><button type="button" onClick={() => { setError(''); firstInputRef.current?.focus(); }}>Nhập lại</button><button type="button" onClick={onClose}>Đóng</button></div>
                </div>
              ) : null}
              {success ? <div className="auth-modal__message auth-modal__message--success" role="status">{success}</div> : null}
              <button className="auth-modal__submit" type="submit" disabled={busy || Boolean(success)}>{busy ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
            </form>
            <p className="auth-modal__switch">Chưa có tài khoản? <button type="button" onClick={() => changeMode('register')}>Đăng ký ngay</button></p>
          </>
        ) : (
          <>
            <header className="auth-modal__header">
              <span>Cổng thông tin bệnh viện</span>
              <h2 id="auth-modal-title">Đăng ký bệnh nhân</h2>
              <p>Tạo tài khoản mới với các thông tin cơ bản.</p>
            </header>
            {success ? (
              <div className="auth-modal__success-panel" role="status">
                <span aria-hidden="true">✓</span>
                <h3>{success}</h3>
                <p>Bạn muốn đăng nhập hay đăng ký thêm tài khoản khác?</p>
                <button className="auth-modal__submit" type="button" onClick={() => changeMode('login')}>Chuyển sang đăng nhập</button>
                <button className="auth-modal__secondary" type="button" onClick={() => { setRegisterForm(emptyRegisterForm); setSuccess(''); }}>Đăng ký tài khoản khác</button>
              </div>
            ) : (
              <form className="auth-modal__form" onSubmit={submitRegister}>
                <label className="auth-modal__full-row">
                  <span>Họ tên</span>
                  <input ref={firstInputRef} value={registerForm.hoTen} onChange={(event) => setRegisterField('hoTen', event.target.value)} maxLength={150} autoComplete="name" required />
                </label>
                <label>
                  <span>Ngày sinh</span>
                  <input value={registerForm.ngaySinh} onChange={(event) => setRegisterField('ngaySinh', event.target.value)} type="date" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" required />
                </label>
                <label>
                  <span>Giới tính</span>
                  <select value={registerForm.gioiTinh} onChange={(event) => setRegisterField('gioiTinh', event.target.value)} required>
                    <option value="Nam">Nam</option>
                    <option value="Nu">Nữ</option>
                  </select>
                </label>
                <label>
                  <span>Số điện thoại</span>
                  <input value={registerForm.soDienThoai} onChange={(event) => setRegisterField('soDienThoai', event.target.value)} pattern="0[0-9]{9,10}" title="Số điện thoại gồm 10 hoặc 11 chữ số và bắt đầu bằng số 0." inputMode="tel" autoComplete="tel" required />
                </label>
                <label>
                  <span>Email</span>
                  <input value={registerForm.email} onChange={(event) => setRegisterField('email', event.target.value)} maxLength={150} type="email" autoComplete="email" required />
                </label>
                <label className="auth-modal__full-row">
                  <span>Địa chỉ</span>
                  <input value={registerForm.diaChi} onChange={(event) => setRegisterField('diaChi', event.target.value)} maxLength={255} autoComplete="street-address" required />
                </label>
                <label>
                  <span>Sử dụng BHYT</span>
                  <select value={registerForm.coBhyt} onChange={(event) => {
                    const value = event.target.value;
                    setRegisterForm((current) => ({
                      ...current,
                      coBhyt: value,
                      soBhyt: value === 'true' ? current.soBhyt : '',
                    }));
                  }}>
                    <option value="true">Có</option>
                    <option value="false">Không</option>
                  </select>
                </label>
                {registerForm.coBhyt === 'true' ? (
                  <label>
                    <span>Số thẻ BHYT</span>
                    <input
                      value={registerForm.soBhyt}
                      onChange={(event) => setRegisterField('soBhyt', event.target.value.toUpperCase())}
                      pattern="[A-Za-z0-9]{10,15}"
                      title="Số BHYT gồm 10–15 ký tự chữ hoặc số"
                      maxLength={15}
                      autoComplete="off"
                      required
                    />
                  </label>
                ) : null}
                <label>
                  <span>Tên đăng nhập</span>
                  <input value={registerForm.username} onChange={(event) => setRegisterField('username', event.target.value)} pattern="[a-zA-Z0-9._]{3,100}" title="Từ 3 ký tự, chỉ gồm chữ, số, dấu chấm hoặc gạch dưới." autoComplete="username" required />
                </label>
                <label>
                  <span>Mật khẩu</span>
                  <span className="auth-modal__password"><input value={registerForm.password} onChange={(event) => setRegisterField('password', event.target.value)} minLength={6} maxLength={100} type={showRegisterPassword ? 'text' : 'password'} autoComplete="new-password" required /><button type="button" aria-label={showRegisterPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showRegisterPassword} onClick={() => setShowRegisterPassword((visible) => !visible)}><PasswordEye visible={showRegisterPassword} /></button></span>
                </label>
                <button className="auth-modal__submit auth-modal__full-row" type="submit" disabled={busy}>{busy ? 'Đang đăng ký...' : 'Đăng ký'}</button>
              </form>
            )}
            {!success ? <p className="auth-modal__switch">Đã có tài khoản? <button type="button" onClick={() => changeMode('login')}>Đăng nhập</button></p> : null}
            {error ? (
              <div className="auth-notice__backdrop" role="presentation">
                <section className="auth-notice" role="alertdialog" aria-modal="true" aria-labelledby="register-notice-title" aria-describedby="register-notice-description">
                  <span className="auth-notice__icon" aria-hidden="true">!</span>
                  <h3 id="register-notice-title">Không thể đăng ký</h3>
                  <p id="register-notice-description">{error}</p>
                  <p>Bạn có muốn sửa thông tin và đăng ký lại không?</p>
                  <div className="auth-notice__actions">
                    <button className="auth-modal__submit" type="button" onClick={() => { setError(''); firstInputRef.current?.focus(); }}>Sửa thông tin</button>
                    <button className="auth-modal__secondary" type="button" onClick={onClose}>Đóng đăng ký</button>
                  </div>
                </section>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
