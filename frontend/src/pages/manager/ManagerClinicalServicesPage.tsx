import { FormEvent, useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { AdminModal } from '../../components/AdminModal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ManagerPager } from '../../components/ManagerPager';
import {
  clinicalApi,
  type ClinicalServiceCatalogInput,
  type ClinicalServiceCatalogItem,
} from '../../features/clinical/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const pageSize = 10;

const emptyForm: ClinicalServiceCatalogInput = {
  code: '',
  name: '',
  group: '',
  performingUnit: '',
  unitPrice: 0,
  active: true,
};

function money(value: string | number) {
  return `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))} ₫`;
}

export function ManagerClinicalServicesPage() {
  const [items, setItems] = useState<ClinicalServiceCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [groups, setGroups] = useState<string[]>([]);

  // Filters
  const [q, setQ] = useState('');
  const search = useDebouncedValue(q);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Modal / Form state
  const [editing, setEditing] = useState<ClinicalServiceCatalogItem | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<ClinicalServiceCatalogItem | null>(null);
  const [form, setForm] = useState<ClinicalServiceCatalogInput>(emptyForm);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await clinicalApi.catalogList({
        page,
        limit: pageSize,
        search: search || undefined,
        group: selectedGroup || undefined,
        active: activeFilter,
      });
      setItems(result.items);
      setTotal(result.total);
      if (result.groups) setGroups(result.groups);
      setError('');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedGroup, activeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setForm(emptyForm);
    setFormError('');
    setEditing(null);
  }

  function openEdit(item: ClinicalServiceCatalogItem) {
    setForm({
      code: item.code,
      name: item.name,
      group: item.group || '',
      performingUnit: item.performingUnit || '',
      unitPrice: Number(item.unitPrice) || 0,
      active: item.active !== false,
    });
    setFormError('');
    setEditing(item);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.code.trim()) {
      setFormError('Vui lòng nhập mã dịch vụ.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Vui lòng nhập tên dịch vụ.');
      return;
    }
    if (form.unitPrice < 0) {
      setFormError('Đơn giá không được âm.');
      return;
    }

    setBusy(true);
    setFormError('');
    try {
      if (editing) {
        await clinicalApi.updateCatalogItem(editing.id, form);
        setNotice(`Đã cập nhật dịch vụ ${form.name}.`);
      } else {
        await clinicalApi.createCatalogItem(form);
        setNotice(`Đã thêm mới dịch vụ ${form.name}.`);
      }
      setEditing(undefined);
      await load();
    } catch (requestError) {
      setFormError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(item: ClinicalServiceCatalogItem) {
    setBusy(true);
    try {
      await clinicalApi.updateCatalogItem(item.id, {
        code: item.code,
        name: item.name,
        group: item.group || undefined,
        performingUnit: item.performingUnit || undefined,
        unitPrice: Number(item.unitPrice),
        active: !item.active,
      });
      setNotice(`Đã ${item.active ? 'ngừng hoạt động' : 'kích hoạt'} dịch vụ ${item.name}.`);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await clinicalApi.deleteCatalogItem(deleting.id);
      setNotice(`Đã xóa dịch vụ ${deleting.name}.`);
      setDeleting(null);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="manager-page">
      <div className="manager-page__heading">
        <div>
          <h1>Quản Lý Dịch Vụ Cận Lâm Sàng</h1>
          <p>Danh mục xét nghiệm, chẩn đoán hình ảnh, siêu âm và bảng giá dịch vụ y tế.</p>
        </div>
        <div className="manager-stat">
          <span>🔬</span>
          <div>
            <small>Tổng số</small>
            <strong>{total.toLocaleString('vi-VN')}</strong>
            <em>dịch vụ</em>
          </div>
        </div>
      </div>

      {notice ? (
        <div className="manager-alert is-success" role="status">
          <span>✓ {notice}</span>
          <button type="button" onClick={() => setNotice('')}>×</button>
        </div>
      ) : null}

      <section className="manager-card">
        <div className="manager-toolbar">
          <div className="manager-search">
            <span>⌕</span>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo mã hoặc tên dịch vụ..."
            />
          </div>

          <select
            value={selectedGroup}
            onChange={(e) => {
              setSelectedGroup(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả nhóm dịch vụ</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          <select
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="true">Đang hoạt động</option>
            <option value="false">Ngừng hoạt động</option>
          </select>

          <div className="manager-toolbar__actions">
            <button
              className="manager-btn manager-btn--primary"
              type="button"
              onClick={openCreate}
            >
              ＋ Thêm dịch vụ mới
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Đang tải danh mục dịch vụ cận lâm sàng..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Chưa có dịch vụ cận lâm sàng nào"
            description="Không tìm thấy dịch vụ phù hợp với bộ lọc hiện tại."
          />
        ) : (
          <>
            <div className="manager-table-wrap">
              <table className="manager-table">
                <thead>
                  <tr>
                    <th>Mã dịch vụ</th>
                    <th>Tên dịch vụ</th>
                    <th>Nhóm dịch vụ</th>
                    <th>Đơn vị thực hiện</th>
                    <th style={{ textAlign: 'right' }}>Đơn giá</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="manager-code">{item.code}</span>
                      </td>
                      <td>
                        <strong>{item.name}</strong>
                      </td>
                      <td>{item.group || '—'}</td>
                      <td>{item.performingUnit || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#174d79' }}>
                        {money(item.unitPrice)}
                      </td>
                      <td>
                        <span
                          className={`manager-status ${
                            item.active !== false ? 'is-active' : 'is-inactive'
                          }`}
                        >
                          {item.active !== false ? 'Hoạt động' : 'Ngừng hoạt động'}
                        </span>
                      </td>
                      <td>
                        <div className="manager-row-actions" style={{ justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            title="Chỉnh sửa dịch vụ"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleActive(item)}
                            title={item.active !== false ? 'Ngừng hoạt động' : 'Kích hoạt'}
                          >
                            {item.active !== false ? 'Khóa' : 'Kích hoạt'}
                          </button>
                          <button
                            type="button"
                            className="is-danger"
                            onClick={() => setDeleting(item)}
                            title="Xóa dịch vụ"
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ManagerPager
              page={page}
              pageSize={pageSize}
              total={total}
              onPage={setPage}
            />
          </>
        )}
      </section>

      {/* Modal Thêm / Sửa dịch vụ */}
      {editing !== undefined ? (
        <AdminModal
          title={editing ? `Chỉnh sửa dịch vụ: ${editing.name}` : 'Thêm mới dịch vụ cận lâm sàng'}
          onClose={() => setEditing(undefined)}
        >
          <form className="manager-form" onSubmit={submit}>
            {formError ? <p className="manager-form__error">{formError}</p> : null}

            <label>
              <span>Mã dịch vụ *</span>
              <input
                required
                value={form.code}
                onChange={(e) => setForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))}
                placeholder="VD: XN-001, CDHA-002, SA-003..."
              />
            </label>

            <label className="is-wide">
              <span>Tên dịch vụ cận lâm sàng *</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                placeholder="VD: Tổng phân tích tế bào máu ngoại vi..."
              />
            </label>

            <label>
              <span>Nhóm dịch vụ</span>
              <input
                list="service-groups"
                value={form.group || ''}
                onChange={(e) => setForm((c) => ({ ...c, group: e.target.value }))}
                placeholder="VD: Xét nghiệm máu, Chẩn đoán hình ảnh..."
              />
              <datalist id="service-groups">
                <option value="Xét nghiệm máu" />
                <option value="Xét nghiệm nước tiểu" />
                <option value="Chẩn đoán hình ảnh" />
                <option value="Siêu âm" />
                <option value="Thăm dò chức năng" />
                <option value="Nội soi" />
              </datalist>
            </label>

            <label>
              <span>Đơn vị thực hiện</span>
              <input
                value={form.performingUnit || ''}
                onChange={(e) => setForm((c) => ({ ...c, performingUnit: e.target.value }))}
                placeholder="VD: Khoa Xét nghiệm, Khoa Chẩn đoán hình ảnh..."
              />
            </label>

            <label>
              <span>Đơn giá (VNĐ) *</span>
              <input
                required
                type="number"
                min="0"
                step="1000"
                value={form.unitPrice}
                onChange={(e) => setForm((c) => ({ ...c, unitPrice: Number(e.target.value) || 0 }))}
                placeholder="VD: 150000"
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '18px' }}>
              <input
                type="checkbox"
                checked={form.active !== false}
                onChange={(e) => setForm((c) => ({ ...c, active: e.target.checked }))}
                style={{ width: '18px', height: '18px' }}
              />
              <span style={{ margin: 0, fontWeight: 600 }}>Đang hoạt động (cho phép bác sĩ chỉ định)</span>
            </label>

            <div className="manager-form__actions">
              <button
                className="manager-btn manager-btn--outline"
                type="button"
                onClick={() => setEditing(undefined)}
              >
                Hủy
              </button>
              <button
                className="manager-btn manager-btn--primary"
                type="submit"
                disabled={busy}
              >
                {busy ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Thêm dịch vụ'}
              </button>
            </div>
          </form>
        </AdminModal>
      ) : null}

      {/* Dialog xác nhận xóa */}
      {deleting ? (
        <ConfirmDialog
          title="Xác nhận xóa dịch vụ"
          message={`Bạn có chắc muốn xóa dịch vụ "${deleting.name}" (${deleting.code})? Nếu dịch vụ đã được sử dụng trong các hồ sơ khám trước đây, hệ thống sẽ yêu cầu chuyển sang ngưng hoạt động.`}
          confirmLabel="Xóa dịch vụ"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </main>
  );
}
