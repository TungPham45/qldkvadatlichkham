import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthModal, type AuthMode } from '../../components/AuthModal';
import { patientApi, patientProfileChangedEvent } from '../../features/patient/api';
import { useAuth } from '../../stores/auth-store';
import { hospitalHotline, hospitalName, hospitalSubtitle, initials, roleHome, roleLabel } from '../../utils/format';
import '../../styles/home-page.css';

function HospitalMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32">
      <path d="M16 3.5 25 7v7.2c0 6.1-3.8 11.3-9 14.3-5.2-3-9-8.2-9-14.3V7l9-3.5Z" />
      <path d="M16 9v10M11 14h10" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
      <path d="M8 13h1M12 13h1M16 13h1M8 17h1M12 17h1M16 17h1" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M9 5h6M9 3h6v4H9zM7 5H5v16h14V5h-2" />
      <path d="m8 14 2.2 2.2L16 10.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function HomePage() {
  const { user, ready, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountName, setAccountName] = useState('');
  const accountRef = useRef<HTMLDivElement>(null);
  const hotline = hospitalHotline || '1900 6422';
  const bookingPath = user?.role === 'PATIENT' ? '/patient/appointments/book' : user ? roleHome(user.role) : '/?auth=login';
  const appointmentsPath = user?.role === 'PATIENT' ? '/patient/appointments' : user ? roleHome(user.role) : '/?auth=login';
  const profilePath = user?.role === 'PATIENT' ? '/patient/profile' : user ? roleHome(user.role) : '/?auth=login';
  const authParam = searchParams.get('auth');
  const authMode: AuthMode | null = authParam === 'login' || authParam === 'register' ? authParam : null;

  function setAuthMode(mode: AuthMode | null) {
    if (!mode) {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ auth: mode }, { replace: true });
  }

  useEffect(() => {
    if (!user) {
      setAccountName('');
      return;
    }
    if (user.role !== 'PATIENT') {
      setAccountName(user.username);
      return;
    }
    let active = true;
    const loadName = () => patientApi.me()
      .then((profile) => { if (active) setAccountName(profile.hoTen); })
      .catch(() => { if (active) setAccountName(user.username); });
    void loadName();
    window.addEventListener(patientProfileChangedEvent, loadName);
    return () => {
      active = false;
      window.removeEventListener(patientProfileChangedEvent, loadName);
    };
  }, [user]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function closeMenu(event: PointerEvent) {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) setAccountMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    }
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);

  return (
    <div className="public-home">
      <header className="public-home__header">
        <div className="public-home__header-inner">
          <Link className="public-home__brand" to="/" aria-label="Về trang chủ">
            <span className="public-home__brand-mark"><HospitalMark /></span>
            <span className="public-home__brand-copy">
              <span className="public-home__brand-title">{hospitalName}</span>
              <span className="public-home__brand-subtitle">{hospitalSubtitle}</span>
            </span>
          </Link>

          <div className="public-home__header-actions">
            <div className="public-home__hotline">
              <span className="public-home__hotline-icon" aria-hidden="true">⌕</span>
              <span>Hotline:</span>
              <strong>{hotline}</strong>
            </div>

            {ready && user ? (
              <div className="public-home__account" ref={accountRef}>
                <button
                  className="public-home__account-button"
                  type="button"
                  aria-expanded={accountMenuOpen}
                  aria-controls="public-account-menu"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                >
                  <span className="public-home__avatar">{initials(accountName || user.username)}</span>
                  <span className="public-home__account-copy">
                    <strong>{accountName || user.username}</strong>
                    <small>{roleLabel(user.role)}</small>
                  </span>
                  <span className="public-home__chevron" aria-hidden="true">⌄</span>
                </button>
                {accountMenuOpen ? (
                  <div className="public-home__account-menu" id="public-account-menu">
                    {user.role === 'PATIENT' ? <Link to="/patient/profile" onClick={() => setAccountMenuOpen(false)}>Thông tin cá nhân</Link> : null}
                    <button type="button" onClick={() => { setAccountMenuOpen(false); void logout(); }}>Đăng xuất</button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="public-home__guest-actions">
                <button className="public-home__button public-home__button--secondary" type="button" onClick={() => setAuthMode('register')}>Đăng ký</button>
                <button className="public-home__button public-home__button--primary" type="button" onClick={() => setAuthMode('login')}>Đăng nhập</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="public-home__main">
        <section className="public-home__intro">
          <div className="public-home__content">
            <span className="public-home__eyebrow"><i aria-hidden="true" /> Cổng Dịch Vụ Y Tế Thông Minh</span>
            <h1>Đặt lịch và theo dõi lịch khám online</h1>
            <p className="public-home__lead">Chủ động đặt lịch khám theo chuyên khoa, theo dõi lịch hẹn và quản lý thông tin cá nhân an toàn, thuận tiện.</p>

            <div className="public-home__services" aria-label="Dịch vụ dành cho bệnh nhân">
              <Link className="public-home__service public-home__service--featured" to={bookingPath}>
                <span className="public-home__service-icon public-home__service-icon--blue"><CalendarIcon /></span>
                <span><strong>Đặt lịch khám</strong><small>Chủ động chọn bác sĩ, chuyên khoa và giờ khám phù hợp</small></span>
                <b aria-hidden="true">→</b>
              </Link>
              <Link className="public-home__service" to={profilePath}>
                <span className="public-home__service-icon public-home__service-icon--green"><ClipboardIcon /></span>
                <span><strong>Hồ sơ sức khỏe</strong><small>Xem và cập nhật thông tin hồ sơ cá nhân</small></span>
              </Link>
              <Link className="public-home__service" to={appointmentsPath}>
                <span className="public-home__service-icon public-home__service-icon--orange"><ClockIcon /></span>
                <span><strong>Lịch khám</strong><small>Theo dõi lịch hẹn và trạng thái xác nhận</small></span>
              </Link>
            </div>
          </div>

          <figure className="public-home__visual">
            <img src="/reception-patient.png" alt="Nhân viên bệnh viện hướng dẫn bệnh nhân đăng ký khám" />
          </figure>
        </section>
      </main>
      {authMode ? <AuthModal mode={authMode} onClose={() => setAuthMode(null)} onModeChange={setAuthMode} /> : null}
    </div>
  );
}
