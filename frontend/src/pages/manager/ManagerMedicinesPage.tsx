import { FormEvent, useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { AdminModal } from '../../components/AdminModal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ManagerPager } from '../../components/ManagerPager';
import { medicinesApi, type Medicine, type MedicineInput } from '../../features/manager/medicines-api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { exportCsv } from '../../utils/export-csv';

const pageSize = 10;
const unitOptions = ['Viên', 'Vien', 'Ống', 'Ong', 'Tuýp', 'Chai', 'Gói', 'Goi', 'Hộp', 'Hop'];
const emptyForm: MedicineInput = {
  name: '', activeIngredient: '', strength: '', unit: 'Viên', group: '',
  unitPrice: 0, stockQuantity: 0, lowStockThreshold: 50, expiryDate: '', manufacturer: '', active: true,
};

function formatPrice(value: number, unit?: string | null) {
  const price = Number(value || 0).toLocaleString('vi-VN');
  return unit ? `${price} đ / ${unitLabel(unit).toLowerCase()}` : `${price} đ`;
}

function unitLabel(unit: string) {
  const map: Record<string, string> = {
    Vien: 'Viên', Ong: 'Ống', Goi: 'Gói', Hop: 'Hộp', Chai: 'Chai', Vao: 'Gói',
  };
  return map[unit] || unit;
}

function unitTone(unit: string) {
  const key = unitLabel(unit).toLowerCase();
  if (key.includes('viên')) return 'is-pill';
  if (key.includes('ống')) return 'is-ampoule';
  if (key.includes('tuýp')) return 'is-tube';
  if (key.includes('chai')) return 'is-bottle';
  return 'is-pack';
}

export function ManagerMedicinesPage() {
  const [items, setItems] = useState<Medicine[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [stats, setStats] = useState({ total: 0, safe: 0, low: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const search = useDebouncedValue(q);
  const [group, setGroup] = useState('');
  const [stockStatus, setStockStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Medicine | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Medicine | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await medicinesApi.list({
        page, limit: pageSize, search: search || undefined, group: group || undefined,
        stockStatus: stockStatus || undefined, active: 'true',
      });
      if (page > 1 && result.total <= (page - 1) * pageSize) {
        setPage(Math.max(1, Math.ceil(result.total / pageSize)));
        return;
      }
      setItems(result.items);
      setGroups(result.groups);
      setStats(result.stats);
      setTotal(result.total);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, group, stockStatus]);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setForm(emptyForm);
    setFormError('');
    setEditing(null);
  }

  function openEdit(item: Medicine) {
    setForm({
      name: item.name,
      activeIngredient: item.activeIngredient || '',
      strength: item.strength || '',
      unit: item.unit || 'Viên',
      group: item.group || '',
      unitPrice: item.unitPrice,
      stockQuantity: item.stockQuantity,
      lowStockThreshold: item.lowStockThreshold,
      expiryDate: item.expiryDate || '',
      manufacturer: item.manufacturer || '',
      active: item.active,
    });
    setFormError('');
    setEditing(item);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    const body: MedicineInput = {
      name: form.name.trim(),
      activeIngredient: form.activeIngredient.trim(),
      strength: form.strength.trim(),
      unit: form.unit.trim(),
      group: form.group.trim(),
      unitPrice: Number(form.unitPrice) || 0,
      stockQuantity: Number(form.stockQuantity) || 0,
      lowStockThreshold: Number(form.lowStockThreshold) || 0,
      expiryDate: form.expiryDate,
      manufacturer: form.manufacturer.trim(),
      active: form.active,
    };
    try {
      if (editing) await medicinesApi.update(editing.id, body);
      else await medicinesApi.create(body);
      setEditing(undefined);
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      const result = await medicinesApi.remove(deleting.id);
      setDeleting(null);
      if (result.deactivated) {
        setError(`Thuốc ${deleting.name} đang được dùng trong đơn/gợi ý nên đã được ngừng hoạt động thay vì xóa hẳn.`);
      }
      await load();
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  async function exportExcel() {
    const result = await medicinesApi.list({
      page: 1, limit: 100, search: search || undefined, group: group || undefined,
      stockStatus: stockStatus || undefined, active: 'true',
    });
    exportCsv(
      'danh-sach-thuoc.csv',
      ['Mã thuốc', 'Tên thuốc', 'Hoạt chất', 'Hàm lượng', 'Nhóm thuốc', 'Đơn vị', 'Đơn giá', 'Tồn kho', 'Ngưỡng cảnh báo', 'Trạng thái tồn', 'HSD', 'NSX'],
      result.items.map((item) => [
        item.code, item.name, item.activeIngredient, item.strength, item.group, item.unit,
        item.unitPrice, item.stockQuantity, item.lowStockThreshold, item.stockLabel,
        item.expiryDate, item.manufacturer,
      ]),
    );
  }

  return (
    <main className="manager-page">
      <div className="manager-page__heading">
        <div>
          <h1>Quản Lý Danh Sách Thuốc &amp; Vật Tư</h1>
          <p>Theo dõi tồn kho, đơn giá và danh mục thuốc đang dùng tại phòng khám.</p>
        </div>
        <div className="manager-stat-row">
          <div className="manager-stat"><span>▦</span><div><small>Tổng số danh mục</small><strong>{stats.total.toLocaleString('vi-VN')}</strong><em>Loại thuốc</em></div></div>
          <div className="manager-stat is-safe"><span>✓</span><div><small>Trạng thái an toàn</small><strong>{stats.safe.toLocaleString('vi-VN')}</strong><em>Mặt hàng</em></div></div>
          <div className="manager-stat is-warn"><span>!</span><div><small>Sắp hết / Cảnh báo</small><strong>{stats.low.toLocaleString('vi-VN')}</strong><em>Mặt hàng</em></div></div>
        </div>
      </div>

      <section className="manager-card">
        <div className="manager-toolbar">
          <div className="manager-search">
            <span>⌕</span>
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Tìm kiếm thuốc theo mã, tên thuốc, hoạt chất..." />
          </div>
          <select value={group} onChange={(e) => { setGroup(e.target.value); setPage(1); }}>
            <option value="">Tất cả nhóm thuốc</option>
            {groups.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={stockStatus} onChange={(e) => { setStockStatus(e.target.value); setPage(1); }}>
            <option value="">Tất cả tồn kho</option>
            <option value="safe">Đủ tồn kho</option>
            <option value="low">Sắp hết</option>
          </select>
          <div className="manager-toolbar__actions">
            <button className="manager-btn manager-btn--outline" type="button" onClick={() => void exportExcel()}>⇩ Xuất Excel</button>
            <button className="manager-btn manager-btn--primary" type="button" onClick={openCreate}>＋ Thêm mới thuốc</button>
          </div>
        </div>

        {error ? <div className="manager-alert">{error}</div> : null}

        <div className="manager-table-wrap">
          <table className="manager-table">
            <thead>
              <tr>
                <th>Mã thuốc</th>
                <th>Tên thuốc</th>
                <th>Đơn vị tính</th>
                <th>Đơn giá</th>
                <th>Tồn kho</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}>Đang tải dữ liệu...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6}>Không tìm thấy thuốc.</td></tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td><span className="manager-code">{item.code}</span></td>
                  <td>
                    <strong>{item.name}</strong>
                    <small>
                      {[item.activeIngredient, item.strength].filter(Boolean).join(' · ') || '—'}
                      {item.group ? ` · ${item.group}` : ''}
                    </small>
                  </td>
                  <td>{item.unit ? <span className={`medicine-unit ${unitTone(item.unit)}`}>{unitLabel(item.unit)}</span> : '—'}</td>
                  <td>{formatPrice(item.unitPrice, item.unit)}</td>
                  <td>
                    <strong>{item.stockQuantity.toLocaleString('vi-VN')}</strong>
                    <span className={`manager-status ${item.lowStock ? 'is-inactive' : 'is-active'}`}>{item.stockLabel}</span>
                  </td>
                  <td>
                    <div className="manager-row-actions">
                      <button type="button" onClick={() => openEdit(item)}>Sửa</button>
                      <button className="is-danger" type="button" onClick={() => setDeleting(item)}>Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ManagerPager page={page} pageSize={pageSize} total={total} onPage={setPage} />
      </section>

      {editing !== undefined ? (
        <AdminModal title={editing ? 'Sửa thông tin thuốc' : 'Thêm mới thuốc'} onClose={() => !busy && setEditing(undefined)}>
          <form className="manager-form" onSubmit={submit}>
            <label><span>Tên thuốc</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={255} /></label>
            <label><span>Nhóm thuốc</span><input value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} list="medicine-groups" maxLength={100} placeholder="Kháng sinh, Kháng Histamin..." /></label>
            <datalist id="medicine-groups">{groups.map((value) => <option key={value} value={value} />)}</datalist>
            <label><span>Hoạt chất</span><input value={form.activeIngredient} onChange={(e) => setForm({ ...form, activeIngredient: e.target.value })} maxLength={255} /></label>
            <label><span>Hàm lượng</span><input value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} maxLength={100} placeholder="500 mg" /></label>
            <label><span>Đơn vị tính</span>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} list="medicine-units" maxLength={50} />
            </label>
            <datalist id="medicine-units">{unitOptions.map((value) => <option key={value} value={value} />)}</datalist>
            <label><span>Đơn giá (đ)</span><input type="number" min={0} step="100" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })} required /></label>
            <label><span>Tồn kho</span><input type="number" min={0} step="1" value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: Number(e.target.value) })} required /></label>
            <label><span>Ngưỡng cảnh báo</span><input type="number" min={0} step="1" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) })} /></label>
            <label><span>Hạn sử dụng</span><input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></label>
            <label className="is-wide"><span>Nhà sản xuất</span><input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} maxLength={255} /></label>
            {formError ? <p className="manager-form__error is-wide">{formError}</p> : null}
            <div className="manager-form__actions is-wide">
              <button type="button" onClick={() => setEditing(undefined)}>Hủy</button>
              <button className="manager-btn--primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu thuốc'}</button>
            </div>
          </form>
        </AdminModal>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="Xóa thuốc"
          message={`Bạn có chắc muốn xóa thuốc ${deleting.name}? Nếu thuốc đã dùng trong đơn/gợi ý, hệ thống sẽ ngừng hoạt động thay vì xóa hẳn.`}
          confirmLabel="Xóa thuốc"
          danger
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </main>
  );
}
