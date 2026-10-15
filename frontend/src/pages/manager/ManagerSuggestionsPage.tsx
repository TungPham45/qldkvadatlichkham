import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ManagerPager } from '../../components/ManagerPager';
import { SelectField } from '../../components/SelectField';
import { medicinesApi, type Medicine } from '../../features/manager/medicines-api';
import {
  suggestionsApi,
  type MedicineSuggestion,
  type SuggestionDisease,
  type SuggestionStats,
} from '../../features/manager/suggestions-api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const diseasePageSize = 12;

const ROMAN_ORDER: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
  XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15, XVI: 16, XVII: 17, XVIII: 18,
  XIX: 19, XX: 20, XXI: 21, XXII: 22,
};

function groupSortKey(label: string) {
  const match = label.trim().match(/^([IVXLC]+)\./i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return ROMAN_ORDER[match[1].toUpperCase()] ?? Number.MAX_SAFE_INTEGER;
}

function sortDiseaseGroups(items: string[]) {
  return [...items].sort((a, b) => {
    const byRoman = groupSortKey(a) - groupSortKey(b);
    return byRoman !== 0 ? byRoman : a.localeCompare(b, 'vi');
  });
}

function shortGroupLabel(label: string) {
  const match = label.match(/^([IVXLC]+)\.\s*(.+?)(?:\s*\(|$)/i);
  if (!match) return label;
  const name = match[2].trim();
  return name.length > 42 ? `${match[1]}. ${name.slice(0, 40)}…` : `${match[1]}. ${name}`;
}

type DraftItem = {
  key: string;
  suggestionId?: number;
  medicineId: number;
  medicine: MedicineSuggestion['medicine'] | Medicine;
  dosage: string;
  quantity: string;
  purpose: string;
  priority: number;
};

function medicineLabel(med: { name: string; strength?: string | null; code?: string }) {
  return [med.name, med.strength].filter(Boolean).join(' · ');
}

function formatRelative(iso: string | null) {
  if (!iso) return 'Chưa có';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '—';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return new Date(iso).toLocaleString('vi-VN');
}

export function ManagerSuggestionsPage() {
  const [stats, setStats] = useState<SuggestionStats | null>(null);
  const [diseases, setDiseases] = useState<SuggestionDisease[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query);
  const [group, setGroup] = useState('');
  const [configured, setConfigured] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [applying, setApplying] = useState(true);
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [baseline, setBaseline] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [busy, setBusy] = useState(false);
  const [medicineQuery, setMedicineQuery] = useState('');
  const medicineSearch = useDebouncedValue(medicineQuery);
  const [medicineOptions, setMedicineOptions] = useState<Medicine[]>([]);
  const [confirmLoad, setConfirmLoad] = useState(false);
  const [toast, setToast] = useState('');

  const dirty = useMemo(() => {
    const snapshot = JSON.stringify({ applying, items: draft.map((item) => ({
      medicineId: item.medicineId,
      dosage: item.dosage,
      quantity: item.quantity,
      purpose: item.purpose,
      priority: item.priority,
    })) });
    return snapshot !== baseline;
  }, [applying, baseline, draft]);

  const selectedDisease = diseases.find((item) => item.id === selectedId) || null;
  const sortedGroups = useMemo(() => sortDiseaseGroups(groups), [groups]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await suggestionsApi.stats());
    } catch (error) {
      console.error('[ManagerSuggestionsPage] Không tải được thống kê', error);
    }
  }, []);

  const loadDiseases = useCallback(async () => {
    setListLoading(true);
    try {
      const result = await suggestionsApi.diseases({
        page,
        limit: diseasePageSize,
        search: search || undefined,
        group: group || undefined,
        configured: configured || undefined,
      });
      if (page > 1 && result.total <= (page - 1) * diseasePageSize) {
        setPage(Math.max(1, Math.ceil(result.total / diseasePageSize)));
        return;
      }
      setDiseases(result.items);
      setGroups(result.groups);
      setTotal(result.total);
      setListError('');
      setSelectedId((current) => current ?? result.items[0]?.id ?? null);
    } catch (error) {
      setListError(errorMessage(error));
    } finally {
      setListLoading(false);
    }
  }, [configured, group, page, search]);

  const applyProtocol = useCallback((protocol: Awaited<ReturnType<typeof suggestionsApi.byDisease>>) => {
    const items: DraftItem[] = protocol.items.map((item, index) => ({
      key: `s-${item.id}`,
      suggestionId: item.id,
      medicineId: item.medicineId,
      medicine: item.medicine,
      dosage: item.dosage || '',
      quantity: item.quantity == null ? '' : String(item.quantity),
      purpose: item.purpose || '',
      priority: item.priority || index + 1,
    }));
    setDraft(items);
    setApplying(protocol.applying);
    setBaseline(JSON.stringify({
      applying: protocol.applying,
      items: items.map((item) => ({
        medicineId: item.medicineId,
        dosage: item.dosage,
        quantity: item.quantity,
        purpose: item.purpose,
        priority: item.priority,
      })),
    }));
    setDetailError('');
  }, []);

  const loadProtocol = useCallback(async (diseaseId: number) => {
    setDetailLoading(true);
    try {
      const protocol = await suggestionsApi.byDisease(diseaseId);
      applyProtocol(protocol);
    } catch (error) {
      setDetailError(errorMessage(error));
      setDraft([]);
      setBaseline('');
    } finally {
      setDetailLoading(false);
    }
  }, [applyProtocol]);

  useEffect(() => { void loadStats(); }, [loadStats]);
  useEffect(() => { void loadDiseases(); }, [loadDiseases]);
  useEffect(() => {
    if (selectedId) void loadProtocol(selectedId);
  }, [loadProtocol, selectedId]);

  useEffect(() => {
    if (!medicineSearch.trim()) {
      setMedicineOptions([]);
      return;
    }
    let cancelled = false;
    void medicinesApi.list({ page: 1, limit: 8, search: medicineSearch, active: 'true' })
      .then((result) => {
        if (!cancelled) setMedicineOptions(result.items);
      })
      .catch(() => {
        if (!cancelled) setMedicineOptions([]);
      });
    return () => { cancelled = true; };
  }, [medicineSearch]);

  function updateDraft(key: string, patch: Partial<DraftItem>) {
    setDraft((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function removeDraft(key: string) {
    setDraft((current) => current
      .filter((item) => item.key !== key)
      .map((item, index) => ({ ...item, priority: index + 1 })));
  }

  function addMedicine(medicine: Medicine) {
    if (draft.some((item) => item.medicineId === medicine.id)) {
      setToast('Thuốc này đã có trong phác đồ.');
      return;
    }
    setDraft((current) => [
      ...current,
      {
        key: `n-${medicine.id}-${Date.now()}`,
        medicineId: medicine.id,
        medicine,
        dosage: 'Theo chỉ định của bác sĩ',
        quantity: '',
        purpose: 'Hỗ trợ điều trị theo chẩn đoán',
        priority: current.length + 1,
      },
    ]);
    setMedicineQuery('');
    setMedicineOptions([]);
  }

  async function save() {
    if (!selectedId) return;
    setBusy(true);
    setDetailError('');
    try {
      const protocol = await suggestionsApi.save(selectedId, {
        applying,
        items: draft.map((item, index) => ({
          medicineId: item.medicineId,
          priority: index + 1,
          dosage: item.dosage.trim() || undefined,
          purpose: item.purpose.trim() || undefined,
          quantity: item.quantity.trim() ? Number(item.quantity) : undefined,
          active: true,
        })),
      });
      applyProtocol(protocol);
      await Promise.all([loadDiseases(), loadStats()]);
      setToast('Đã lưu cấu hình gợi ý thuốc.');
    } catch (error) {
      setDetailError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function cancelChanges() {
    if (!selectedId) return;
    await loadProtocol(selectedId);
  }

  async function toggleApplying() {
    if (!selectedId) return;
    const next = !applying;
    setApplying(next);
    if (!dirty && draft.length) {
      setBusy(true);
      try {
        const protocol = await suggestionsApi.setApplying(selectedId, next);
        applyProtocol(protocol);
        await Promise.all([loadDiseases(), loadStats()]);
      } catch (error) {
        setApplying(!next);
        setDetailError(errorMessage(error));
      } finally {
        setBusy(false);
      }
    }
  }

  async function loadTemplate() {
    if (!selectedId) return;
    setBusy(true);
    setConfirmLoad(false);
    try {
      const protocol = await suggestionsApi.loadTemplate(selectedId);
      applyProtocol(protocol);
      await Promise.all([loadDiseases(), loadStats()]);
      setToast('Đã nạp phác đồ mẫu theo nhóm bệnh.');
    } catch (error) {
      setDetailError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <main className="manager-page suggestion-page">
      <div className="manager-page__heading">
        <div>
          <h1>Gợi ý thuốc theo bệnh lý</h1>
          <p>Cấu hình phác đồ mẫu để bác sĩ kê đơn nhanh theo mã ICD.</p>
        </div>
        <div className="manager-stat-row">
          <div className="manager-stat">
            <span>▦</span>
            <div>
              <small>Phác đồ đã cấu hình</small>
              <strong>{stats?.configuredDiseases ?? '—'}</strong>
              <em>/ {stats?.diseaseTotal ?? '—'} bệnh</em>
            </div>
          </div>
          <div className="manager-stat is-safe">
            <span>⬡</span>
            <div>
              <small>Thuốc trong phác đồ</small>
              <strong>{stats?.suggestionTotal ?? '—'}</strong>
              <em>gợi ý</em>
            </div>
          </div>
          <div className="manager-stat">
            <span>◷</span>
            <div>
              <small>Cập nhật gần nhất</small>
              <strong style={{ fontSize: 14 }}>{formatRelative(stats?.lastUpdatedAt ?? null)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="suggestion-layout">
        <section className="manager-card suggestion-diseases">
          <div className="suggestion-diseases__toolbar">
            <div className="manager-search">
              <span>⌕</span>
              <input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                placeholder="Tìm theo mã ICD hoặc tên bệnh"
              />
            </div>
            <div className="suggestion-diseases__filters">
              <SelectField
                className="suggestion-filter-select"
                label="Nhóm bệnh"
                value={group}
                onChange={(event) => { setGroup(event.target.value); setPage(1); }}
              >
                <option value="">Tất cả nhóm</option>
                {sortedGroups.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </SelectField>
              <SelectField
                className="suggestion-filter-select"
                label="Trạng thái"
                value={configured}
                onChange={(event) => { setConfigured(event.target.value); setPage(1); }}
              >
                <option value="">Tất cả</option>
                <option value="yes">Đã cấu hình</option>
                <option value="no">Chưa cấu hình</option>
              </SelectField>
            </div>
          </div>

          {listLoading ? <LoadingState label="Đang tải danh mục bệnh..." /> : listError ? (
            <ErrorState message={listError} onRetry={() => void loadDiseases()} />
          ) : diseases.length === 0 ? (
            <EmptyState title="Không có bệnh" description="Không tìm thấy bệnh phù hợp với bộ lọc." />
          ) : (
            <>
              <div className="suggestion-disease-list">
                {diseases.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`suggestion-disease-card ${selectedId === item.id ? 'is-selected' : ''}`}
                    onClick={() => {
                      if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Đổi bệnh khác sẽ mất thay đổi. Tiếp tục?')) return;
                      setSelectedId(item.id);
                    }}
                  >
                    <div className="suggestion-disease-card__top">
                      <span className="manager-code">{item.code}</span>
                      {item.configured
                        ? <span className="manager-status is-active">Phác đồ chuẩn</span>
                        : <span className="manager-status is-inactive">Chưa cấu hình</span>}
                    </div>
                    <strong>{item.name}</strong>
                    <small>
                      <em>{item.suggestionCount} thuốc gợi ý</em>
                      {item.group ? <span title={item.group}>{shortGroupLabel(item.group)}</span> : null}
                    </small>
                  </button>
                ))}
              </div>
              <ManagerPager page={page} pageSize={diseasePageSize} total={total} onPage={setPage} />
            </>
          )}
        </section>

        <section className="manager-card suggestion-editor">
          {!selectedId ? (
            <EmptyState title="Chọn một bệnh" description="Chọn bệnh bên trái để cấu hình gợi ý thuốc." />
          ) : detailLoading ? (
            <LoadingState label="Đang tải phác đồ..." />
          ) : (
            <>
              <header className="suggestion-editor__header">
                <div>
                  <div className="suggestion-editor__codes">
                    <span className="manager-code">{selectedDisease?.code || '—'}</span>
                    {selectedDisease?.group ? <span className="manager-specialty">{selectedDisease.group}</span> : null}
                  </div>
                  <h2>{selectedDisease?.name || 'Phác đồ thuốc'}</h2>
                </div>
                <label className={`suggestion-switch ${applying ? 'is-on' : ''}`}>
                  <input type="checkbox" checked={applying} onChange={() => void toggleApplying()} disabled={busy} />
                  <span />
                  {applying ? 'Đang áp dụng phác đồ' : 'Tạm ngưng phác đồ'}
                </label>
              </header>

              <div className="suggestion-editor__actions">
                <button className="manager-btn manager-btn--outline" type="button" disabled={busy} onClick={() => setConfirmLoad(true)}>
                  Nạp phác đồ mẫu theo nhóm bệnh
                </button>
              </div>

              <form
                className="suggestion-add"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  if (medicineOptions[0]) addMedicine(medicineOptions[0]);
                }}
              >
                <div className="manager-search">
                  <span>⌕</span>
                  <input
                    value={medicineQuery}
                    onChange={(event) => setMedicineQuery(event.target.value)}
                    placeholder="Tìm và thêm thuốc vào phác đồ (vd: Paracetamol...)"
                  />
                </div>
                <button className="manager-btn manager-btn--primary" type="submit" disabled={!medicineOptions[0]}>
                  ＋ Thêm thuốc
                </button>
                {medicineOptions.length > 0 ? (
                  <div className="suggestion-medicine-dropdown">
                    {medicineOptions.map((medicine) => (
                      <button key={medicine.id} type="button" onClick={() => addMedicine(medicine)}>
                        <strong>{medicineLabel(medicine)}</strong>
                        <small>{medicine.code}{medicine.group ? ` · ${medicine.group}` : ''}{medicine.unit ? ` · ${medicine.unit}` : ''}</small>
                      </button>
                    ))}
                  </div>
                ) : null}
              </form>

              {detailError ? <p className="manager-alert">{detailError}</p> : null}

              {draft.length === 0 ? (
                <EmptyState title="Chưa có thuốc gợi ý" description="Thêm thuốc hoặc nạp phác đồ mẫu để bắt đầu." />
              ) : (
                <div className="manager-table-wrap">
                  <table className="manager-table suggestion-table">
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Chi tiết thuốc</th>
                        <th>Liều dùng mặc định</th>
                        <th>Số lượng</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.map((item, index) => (
                        <tr key={item.key}>
                          <td>{index + 1}</td>
                          <td>
                            <strong>{medicineLabel(item.medicine)}</strong>
                            <small>
                              {[item.medicine.group, item.medicine.unit, 'code' in item.medicine ? item.medicine.code : `TH-${String(item.medicineId).padStart(4, '0')}`]
                                .filter(Boolean)
                                .join(' · ')}
                            </small>
                          </td>
                          <td>
                            <input
                              value={item.dosage}
                              onChange={(event) => updateDraft(item.key, { dosage: event.target.value })}
                              placeholder="Vd: Uống 1 viên × 2 lần/ngày sau ăn"
                            />
                          </td>
                          <td>
                            <div className="suggestion-qty">
                              <input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(event) => updateDraft(item.key, { quantity: event.target.value })}
                                placeholder="14"
                              />
                              <span>{item.medicine.unit || 'đơn vị'}</span>
                            </div>
                          </td>
                          <td>
                            <div className="manager-row-actions">
                              <button className="is-danger" type="button" onClick={() => removeDraft(item.key)} aria-label="Xóa">✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <footer className="suggestion-editor__footer">
                <p>Thay đổi sẽ cập nhật danh sách gợi ý khi bác sĩ kê đơn theo chẩn đoán này.</p>
                <div>
                  <button className="manager-btn manager-btn--outline" type="button" disabled={!dirty || busy} onClick={() => void cancelChanges()}>
                    Hủy thay đổi
                  </button>
                  <button className="manager-btn manager-btn--primary" type="button" disabled={!dirty || busy} onClick={() => void save()}>
                    {busy ? 'Đang lưu...' : 'Lưu cấu hình'}
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      {confirmLoad ? (
        <ConfirmDialog
          title="Nạp phác đồ mẫu?"
          message="Phác đồ hiện tại sẽ được thay bằng danh sách thuốc mẫu theo nhóm bệnh. Bạn có thể chỉnh sửa trước khi lưu."
          confirmLabel="Nạp mẫu"
          busy={busy}
          onConfirm={() => void loadTemplate()}
          onClose={() => setConfirmLoad(false)}
        />
      ) : null}

      {toast ? <div className="suggestion-toast">{toast}</div> : null}
    </main>
  );
}
