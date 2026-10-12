import { FormEvent, useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { AdminModal } from '../components/AdminModal';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { ManagerPager } from '../components/ManagerPager';
import { clinicalApi, type Disease, type DiseaseInput } from '../features/clinical/api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const limit = 10;
const emptyForm: DiseaseInput = { code: '', name: '', group: '', description: '' };

export function DiseasesPage() {
  const [items, setItems] = useState<Disease[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query);
  const [group, setGroup] = useState('');
  const [editing, setEditing] = useState<Disease | null | undefined>();
  const [viewing, setViewing] = useState<Disease | null>(null);
  const [form, setForm] = useState<DiseaseInput>(emptyForm);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await clinicalApi.diseases({ page, limit, search: search || undefined, group: group || undefined });
      setItems(result.items);
      setGroups(result.groups);
      setTotal(result.total);
      setError('');
    } catch (requestError) {
      console.error('[DiseasesPage] Không tải được danh mục bệnh', requestError);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [page, search, group]);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
  }

  function openEdit(item: Disease) {
    setEditing(item);
    setForm({ code: item.code, name: item.name, group: item.group || '', description: item.description || '' });
    setFormError('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    const body = { code: form.code.trim(), name: form.name.trim(), group: form.group.trim(), description: form.description.trim() };
    try {
      if (editing) await clinicalApi.updateDisease(editing.id, body);
      else await clinicalApi.createDisease(body);
      setEditing(undefined);
      await load();
    } catch (requestError) {
      console.error('[DiseasesPage] Không lưu được bệnh', requestError);
      setFormError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="manager-page">
      <div className="manager-page__heading">
        <div><h1>Danh mục tên bệnh</h1><p>Quản lý danh mục dùng trong chẩn đoán.</p></div>
        <button className="manager-btn manager-btn--primary" type="button" onClick={openCreate}>＋ Thêm bệnh</button>
      </div>
      <section className="manager-card">
        <div className="manager-toolbar">
          <div className="manager-search"><span>⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm theo mã hoặc tên bệnh" /></div>
          <select value={group} onChange={(event) => { setGroup(event.target.value); setPage(1); }}><option value="">Tất cả nhóm bệnh</option>{groups.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        </div>
        {loading ? <LoadingState label="Đang tải danh mục bệnh..." /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : items.length === 0 ? <EmptyState title="Không có dữ liệu" description="Không tìm thấy bệnh phù hợp với bộ lọc hiện tại." /> : <>
          <div className="manager-table-wrap"><table className="manager-table disease-table"><thead><tr><th>Mã bệnh</th><th>Tên bệnh</th><th>Nhóm bệnh</th><th>Mô tả</th><th>Thao tác</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><span className="manager-code">{item.code}</span></td><td><strong>{item.name}</strong></td><td>{item.group || '—'}</td><td className="manager-table__description">{item.description || '—'}</td><td><div className="manager-row-actions"><button type="button" onClick={() => setViewing(item)}>Xem chi tiết</button><button type="button" onClick={() => openEdit(item)}>Chỉnh sửa</button></div></td></tr>)}</tbody></table></div>
          <ManagerPager page={page} pageSize={limit} total={total} onPage={setPage} />
        </>}
      </section>
      {viewing ? <AdminModal title="Chi tiết bệnh" onClose={() => setViewing(null)}><div className="clinical-detail"><dl><div><dt>Mã bệnh</dt><dd>{viewing.code}</dd></div><div><dt>Tên bệnh</dt><dd>{viewing.name}</dd></div><div><dt>Nhóm bệnh</dt><dd>{viewing.group || '—'}</dd></div><div><dt>Cập nhật</dt><dd>{new Date(viewing.updatedAt).toLocaleString('vi-VN')}</dd></div><div className="is-wide"><dt>Mô tả</dt><dd>{viewing.description || '—'}</dd></div></dl><div className="manager-form__actions"><button type="button" onClick={() => { const selected = viewing; setViewing(null); openEdit(selected); }}>Chỉnh sửa</button><button type="button" onClick={() => setViewing(null)}>Đóng</button></div></div></AdminModal> : null}
      {editing !== undefined ? <AdminModal title={editing ? 'Chỉnh sửa bệnh' : 'Thêm bệnh'} onClose={() => !busy && setEditing(undefined)}><form className="manager-form" onSubmit={submit}><label><span>Mã bệnh</span><input required maxLength={50} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label><label><span>Tên bệnh</span><input required maxLength={255} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="is-wide"><span>Nhóm bệnh</span><input maxLength={100} value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value })} /></label><label className="is-wide"><span>Mô tả</span><textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>{formError ? <p className="manager-form__error is-wide">{formError}</p> : null}<div className="manager-form__actions is-wide"><button type="button" onClick={() => setEditing(undefined)}>Hủy</button><button className="manager-btn--primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</button></div></form></AdminModal> : null}
    </main>
  );
}
