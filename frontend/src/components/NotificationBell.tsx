import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { notificationApi, type AppNotification } from '../features/clinical/api';
import { useAuth } from '../stores/auth-store';

function notificationTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const [page, unread] = await Promise.all([
        notificationApi.list({ page: 1, limit }),
        notificationApi.count(),
      ]);
      setItems(page.items);
      setTotal(page.total);
      setCount(unread);
      setError('');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [limit, user?.id]);

  useEffect(() => {
    setItems([]);
    setCount(0);
    setTotal(0);
    setLimit(10);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    void load();
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load, user?.id]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  async function markRead(item: AppNotification, followLink: boolean) {
    try {
      if (!item.readAt) {
        const readAt = new Date().toISOString();
        await notificationApi.read(item.id);
        setCount((value) => Math.max(0, value - 1));
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt } : entry));
      }
      if (followLink && item.link?.startsWith('/')) {
        setOpen(false);
        navigate(item.link);
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function markAllRead() {
    try {
      await notificationApi.readAll();
      const readAt = new Date().toISOString();
      setCount(0);
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || readAt })));
      setError('');
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  return <div className="notification-bell" ref={ref}>
    <button
      ref={triggerRef}
      type="button"
      className="notification-bell__button"
      aria-label={`Thông báo${count ? `, ${count} chưa đọc` : ''}`}
      aria-expanded={open}
      aria-controls="header-notification-panel"
      onClick={() => setOpen((value) => !value)}
    >
      🔔{count > 0 ? <b>{count > 99 ? '99+' : count}</b> : null}
    </button>
    {open ? <section id="header-notification-panel" className="notification-panel" aria-label="Danh sách thông báo">
      <header><span><strong>Thông báo</strong><small>{count} chưa đọc</small></span>{count > 0 ? <button type="button" onClick={() => void markAllRead()}>Đánh dấu tất cả đã đọc</button> : null}</header>
      <div className="notification-panel__list">
        {error ? <p className="notification-panel__error">{error}</p> : loading && items.length === 0 ? <p className="notification-panel__empty">Đang tải thông báo...</p> : items.length === 0 ? <p className="notification-panel__empty">Bạn chưa có thông báo.</p> : items.map((item) => <article key={item.id} className={item.readAt ? '' : 'is-unread'}>
          <button type="button" className="notification-panel__item" onClick={() => void markRead(item, true)}>
            <span className="notification-panel__dot" aria-hidden="true" />
            <span><strong>{item.title}</strong><em>{item.content}</em><small>{notificationTime(item.createdAt)} · {item.readAt ? 'Đã đọc' : 'Chưa đọc'}</small></span>
          </button>
          {!item.readAt ? <button type="button" className="notification-panel__read" onClick={() => void markRead(item, false)}>Đánh dấu đã đọc</button> : null}
        </article>)}
      </div>
      {items.length < total ? <footer><button type="button" disabled={loading} onClick={() => setLimit((value) => Math.min(100, value + 10))}>{loading ? 'Đang tải...' : 'Tải thêm thông báo cũ'}</button></footer> : null}
    </section> : null}
  </div>;
}
