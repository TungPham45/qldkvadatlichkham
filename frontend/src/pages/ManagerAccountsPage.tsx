import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';
import { accountApi, type AccountStatus, type ManagedAccount } from '../features/account/api';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { FilterSelect } from '../components/FilterSelect';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { PageContainer } from '../components/PageContainer';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { SearchInput } from '../components/SearchInput';
import { StatusBadge } from '../components/StatusBadge';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useAuth } from '../stores/auth-store';
import { formatDate } from '../utils/format';

const roleLabels = { Admin: 'Admin', BacSi: 'Bác sĩ', NguoiDung: 'Bệnh nhân' };
const statusOptions = [
  { value: 'Active', label: 'Đang hoạt động' },
  { value: 'Inactive', label: 'Ngừng hoạt động' },
  { value: 'Locked', label: 'Đã khóa' },
];
const statusLabels = Object.fromEntries(statusOptions.map((option) => [option.value, option.label]));
const pageSize = 10;

export function ManagerAccountsPage() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const search = useDebouncedValue(q);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ManagedAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [action, setAction] = useState<{ kind: 'status' | 'delete'; account: ManagedAccount } | null>(null);
  const [nextStatus, setNextStatus] = useState<AccountStatus>('Active');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    try {
      const response = await accountApi.list({ page, pageSize, q: search || undefined, vaiTro: role || undefined, trangThai: status || undefined });
      if (current !== requestId.current) return;
      if (page > 1 && response.total <= (page - 1) * pageSize) {
        setPage(Math.max(1, Math.ceil(response.total / pageSize)));
        return;
      }
      setItems(response.items);
      setTotal(response.total);
      setError('');
    } catch (err) {
      if (current === requestId.current) setError(errorMessage(err));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [page, search, role, status]);
  const latestLoad = useRef(load);

  useEffect(() => { latestLoad.current = load; void load(); return () => { requestId.current += 1; }; }, [load]);

  function openAction(kind: 'status' | 'delete', account: ManagedAccount) {
    setAction({ kind, account });
    setNextStatus(account.trangThai);
    setActionError('');
    setSuccess('');
  }

  async function confirmAction() {
    if (!action) return;
    setBusy(true);
    setActionError('');
    try {
      if (action.kind === 'status') {
        await accountApi.updateStatus(action.account.id, nextStatus);
        setSuccess('Đã cập nhật trạng thái tài khoản.');
      } else {
        await accountApi.remove(action.account.id);
        setSuccess('Đã xóa tài khoản.');
      }
      setAction(null);
      await latestLoad.current();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader crumbs={['Admin', 'Tài khoản']} title="Quản lý tài khoản" description="Tìm kiếm và quản lý trạng thái tài khoản admin, bác sĩ và bệnh nhân." />
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Tìm tên đăng nhập, họ tên, email, SĐT" />
        <FilterSelect label="Vai trò" value={role} onChange={(value) => { setRole(value); setPage(1); }} options={[{ value: '', label: 'Tất cả' }, ...Object.entries(roleLabels).map(([value, label]) => ({ value, label }))]} />
        <FilterSelect label="Trạng thái" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[{ value: '', label: 'Tất cả' }, ...statusOptions]} />
      </div>
      {success ? <p role="status" className="rounded-xl bg-success-bg p-3 text-sm text-success">{success}</p> : null}
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : items.length === 0 ? (
        <EmptyState title="Không tìm thấy tài khoản" description="Thử thay đổi từ khóa hoặc bộ lọc." />
      ) : (
        <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-[18px] shadow-card">
          <DataTable rows={items} rowKey={(row) => row.id} columns={[
            { key: 'username', header: 'Tên đăng nhập', render: (row) => <span className="font-semibold">{row.username}{row.id === user?.id ? ' (Bạn)' : ''}</span> },
            { key: 'name', header: 'Họ tên', render: (row) => row.hoTen || '—' },
            { key: 'role', header: 'Vai trò', render: (row) => roleLabels[row.vaiTro] },
            { key: 'contact', header: 'Liên hệ', render: (row) => <div><div>{row.email || '—'}</div><div className="text-xs text-muted">{row.soDienThoai || '—'}</div></div> },
            { key: 'status', header: 'Trạng thái', render: (row) => <StatusBadge status={row.trangThai} label={statusLabels[row.trangThai]} /> },
            { key: 'created', header: 'Ngày tạo', render: (row) => formatDate(row.ngayTao) },
            { key: 'actions', header: 'Thao tác', render: (row) => <div className="flex gap-2"><Button variant="ghost" disabled={row.id === user?.id || busy} onClick={() => openAction('status', row)}>Sửa trạng thái</Button><Button variant="danger" disabled={row.id === user?.id || busy} onClick={() => openAction('delete', row)}>Xóa</Button></div> },
          ]} />
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
          <p className="text-xs text-muted">Tài khoản đang đăng nhập được bảo vệ khỏi thao tác khóa và xóa.</p>
        </section>
      )}
      {action ? (
        <Modal title={action.kind === 'status' ? 'Sửa trạng thái tài khoản' : 'Xóa tài khoản'} onClose={() => { if (!busy) setAction(null); }}>
          <p className="text-sm">Tài khoản: <strong>{action.account.username}</strong> · {roleLabels[action.account.vaiTro]}</p>
          {action.kind === 'status' ? (
            <FilterSelect label="Trạng thái" value={nextStatus} onChange={(value) => setNextStatus(value as AccountStatus)} options={statusOptions} />
          ) : (
            <p className="text-sm text-muted">Xác nhận xóa tài khoản này? Tài khoản có lịch làm việc, lịch khám hoặc hồ sơ y tế sẽ được giữ lại; bạn có thể khóa hoặc ngừng hoạt động tài khoản.</p>
          )}
          {actionError ? <p role="alert" className="text-sm text-danger">{actionError}</p> : null}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" disabled={busy} onClick={() => setAction(null)}>Hủy</Button>
            <Button variant={action.kind === 'delete' ? 'danger' : 'primary'} disabled={busy || (action.kind === 'status' && nextStatus === action.account.trangThai)} onClick={() => void confirmAction()}>{busy ? 'Đang xử lý…' : action.kind === 'status' ? 'Lưu trạng thái' : 'Xóa tài khoản'}</Button>
          </div>
        </Modal>
      ) : null}
    </PageContainer>
  );
}
