import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { AdminModal } from '../../components/AdminModal';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ManagerPager } from '../../components/ManagerPager';
import { billingApi, type InvoiceDetail } from '../../features/clinical/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { formatDate } from '../../utils/format';

const pageSize = 10;

function money(value: string | number) {
  return `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))} ₫`;
}

function statusBadge(status: string) {
  if (status === 'Da thanh toan') {
    return <span className="invoice-badge is-paid">Đã thanh toán</span>;
  }
  if (status === 'Thanh toan mot phan') {
    return <span className="invoice-badge is-partial">Đã trả một phần</span>;
  }
  return <span className="invoice-badge is-unpaid">Chưa thanh toán</span>;
}

export function MyInvoicesPage() {
  const [items, setItems] = useState<InvoiceDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const search = useDebouncedValue(q);
  const [statusFilter, setStatusFilter] = useState('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Detail Modal & Payment Modal state
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showItemDetails, setShowItemDetails] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await billingApi.myInvoices({
        page,
        limit: pageSize,
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      setError('');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(item: InvoiceDetail) {
    try {
      const fresh = await billingApi.invoice(item.appointmentId);
      setSelectedInvoice(fresh);
      setShowItemDetails(false);
      setShowPaymentModal(false);
    } catch {
      setSelectedInvoice(item);
    }
  }

  async function handleOnlinePayment() {
    if (!selectedInvoice) return;
    setBusy(true);
    try {
      const idempotencyKey = `PAY-${selectedInvoice.id}-${Date.now()}`;
      const updated = await billingApi.patientCheckout(selectedInvoice.appointmentId, {
        method: 'Chuyen khoan',
        idempotencyKey,
        note: `Thanh toán chuyển khoản trực tuyến cho hóa đơn ${selectedInvoice.id}`,
      });
      setSelectedInvoice(updated);
      setShowPaymentModal(false);
      setNotice(`Thanh toán thành công hóa đơn ${selectedInvoice.id}. Lượt khám đã hoàn tất!`);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  // VietQR URL for instant mobile banking scanning
  const vietQrUrl = selectedInvoice
    ? `https://img.vietqr.io/image/MB-0987654321-compact2.png?amount=${encodeURIComponent(
        selectedInvoice.balance,
      )}&addInfo=${encodeURIComponent(selectedInvoice.id)}&accountName=${encodeURIComponent(
        'PHONG KHAM DA KHOA QUOC TE',
      )}`
    : '';

  return (
    <main className="manager-page patient-invoice-page">
      <div className="manager-page__heading">
        <div>
          <h1>Hóa Đơn Của Tôi</h1>
          <p>Theo dõi viện phí, chi phí khám, xét nghiệm cận lâm sàng, thuốc và thanh toán trực tuyến.</p>
        </div>
        <div className="manager-stat">
          <span>🧾</span>
          <div>
            <small>Tổng số</small>
            <strong>{error ? '—' : total.toLocaleString('vi-VN')}</strong>
            <em>hóa đơn</em>
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
              placeholder="Tìm theo mã hóa đơn, mã lịch hẹn hoặc bác sĩ..."
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Tất cả trạng thái thanh toán</option>
            <option value="Chua thanh toan">Chưa thanh toán</option>
            <option value="Thanh toan mot phan">Đã trả một phần</option>
            <option value="Da thanh toan">Đã thanh toán</option>
          </select>
        </div>

        {loading ? (
          <LoadingState label="Đang tải danh sách hóa đơn của bạn..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          q || statusFilter !== 'all' ? (
            <EmptyState
              title="Không tìm thấy hóa đơn"
              description="Không có hóa đơn nào khớp với tiêu chí tìm kiếm hoặc bộ lọc được chọn."
            />
          ) : (
            <EmptyState
              title="Chưa có hóa đơn nào"
              description="Bạn chưa có hóa đơn khám bệnh nào. Khi bạn hoàn tất khám tại phòng khám, hóa đơn sẽ được cập nhật tại đây."
            />
          )
        ) : (
          <>
            <div className="manager-table-wrap">
              <table className="manager-table">
                <thead>
                  <tr>
                    <th>Mã hóa đơn</th>
                    <th>Ngày lập</th>
                    <th>Mã lịch hẹn</th>
                    <th>Bác sĩ / Khoa</th>
                    <th>Bệnh nhân</th>
                    <th style={{ textAlign: 'right' }}>Tổng tiền</th>
                    <th style={{ textAlign: 'right' }}>Còn lại</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong style={{ color: '#0058bd' }}>{item.id}</strong>
                      </td>
                      <td>{formatDate(item.date)}</td>
                      <td>
                        <span className="manager-code">{item.appointmentCode}</span>
                      </td>
                      <td>
                        <strong>{item.doctorName || 'Bác sĩ phụ trách'}</strong>
                        <small>{item.specialtyName || 'Đa khoa'}</small>
                      </td>
                      <td>
                        <strong>{item.patientName}</strong>
                        <small>{item.patientCode}</small>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {money(item.total)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: Number(item.balance) > 0 ? '#b02a37' : '#157347' }}>
                        {money(item.balance)}
                      </td>
                      <td>{statusBadge(item.status)}</td>
                      <td>
                        <div className="manager-row-actions" style={{ justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="manager-btn manager-btn--primary"
                            style={{ minHeight: '32px', padding: '0 10px', fontSize: '12px' }}
                            onClick={() => void openDetail(item)}
                          >
                            {item.status !== 'Da thanh toan' ? 'Thanh toán' : 'Xem chi tiết'}
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

      {/* CHI TIẾT HÓA ĐƠN MODAL (ĐỒNG BỘ VỚI HÌNH ẢNH MẪU ĐƯỢC CUNG CẤP) */}
      {selectedInvoice ? (
        <AdminModal
          title="Chi tiết hóa đơn khám bệnh"
          onClose={() => {
            setSelectedInvoice(null);
            setShowPaymentModal(false);
          }}
        >
          <div className="invoice-detail-card">
            {/* Header info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #edf2f7', paddingBottom: '18px', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: '#1a202c' }}>
                  Chi tiết hóa đơn
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#718096' }}>
                  Hệ thống quản lý đăng ký & khám bệnh trực tuyến
                </p>
              </div>
              <div>{statusBadge(selectedInvoice.status)}</div>
            </div>

            {/* Meta 2 cột */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '22px' }}>
              <div>
                <span style={{ display: 'block', fontSize: '12px', color: '#718096', marginBottom: '3px' }}>
                  Mã hóa đơn
                </span>
                <strong style={{ fontSize: '16px', color: '#1a202c' }}>{selectedInvoice.id}</strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '12px', color: '#718096', marginBottom: '3px' }}>
                  Bệnh nhân
                </span>
                <strong style={{ fontSize: '16px', color: '#1a202c' }}>
                  {selectedInvoice.patientName} ({selectedInvoice.patientCode})
                </strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '12px', color: '#718096', marginBottom: '3px' }}>
                  Mã lịch hẹn & Ngày khám
                </span>
                <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: 500 }}>
                  {selectedInvoice.appointmentCode} · {formatDate(selectedInvoice.appointmentDate || selectedInvoice.date)}
                </span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '12px', color: '#718096', marginBottom: '3px' }}>
                  Bác sĩ phụ trách
                </span>
                <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: 500 }}>
                  {selectedInvoice.doctorName || 'Bác sĩ điều trị'} ({selectedInvoice.specialtyName || 'Chuyên khoa'})
                </span>
              </div>
            </div>

            {/* Chi tiết chi phí */}
            <div style={{ borderTop: '1px solid #edf2f7', paddingTop: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: 700, color: '#2d3748' }}>
                Chi tiết chi phí
              </h3>

              <div style={{ display: 'grid', gap: '11px', fontSize: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#4a5568' }}>Khám chuyên khoa</span>
                  <strong style={{ color: '#1a202c' }}>{money(selectedInvoice.examFee)}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: '#4a5568' }}>Dịch vụ cận lâm sàng</span>
                    {selectedInvoice.services && selectedInvoice.services.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowItemDetails((prev) => !prev)}
                        style={{ border: 0, background: 'none', color: '#0058bd', fontSize: '12px', cursor: 'pointer', marginLeft: '8px', textDecoration: 'underline' }}
                      >
                        {showItemDetails ? 'Ẩn chi tiết' : `Xem ${selectedInvoice.services.length} dịch vụ`}
                      </button>
                    ) : null}
                  </div>
                  <strong style={{ color: '#1a202c' }}>{money(selectedInvoice.serviceAmount)}</strong>
                </div>

                {/* Danh sách chi tiết cận lâm sàng nếu người dùng bấm xem */}
                {showItemDetails && selectedInvoice.services && selectedInvoice.services.length > 0 ? (
                  <div style={{ padding: '8px 12px', background: '#f7fafc', borderRadius: '6px', margin: '4px 0 8px 16px', fontSize: '12px' }}>
                    {selectedInvoice.services.map((svc, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: idx < (selectedInvoice.services?.length || 0) - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                        <span>• {svc.name} ({svc.code})</span>
                        <span>{money(svc.unitPrice)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: '#4a5568' }}>Thuốc</span>
                    {selectedInvoice.medicines && selectedInvoice.medicines.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowItemDetails((prev) => !prev)}
                        style={{ border: 0, background: 'none', color: '#0058bd', fontSize: '12px', cursor: 'pointer', marginLeft: '8px', textDecoration: 'underline' }}
                      >
                        {showItemDetails ? 'Ẩn chi tiết' : `Xem ${selectedInvoice.medicines.length} thuốc`}
                      </button>
                    ) : null}
                  </div>
                  <strong style={{ color: '#1a202c' }}>{money(selectedInvoice.medicineAmount)}</strong>
                </div>

                {/* Danh sách chi tiết thuốc nếu người dùng bấm xem */}
                {showItemDetails && selectedInvoice.medicines && selectedInvoice.medicines.length > 0 ? (
                  <div style={{ padding: '8px 12px', background: '#f7fafc', borderRadius: '6px', margin: '4px 0 8px 16px', fontSize: '12px' }}>
                    {selectedInvoice.medicines.map((med, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: idx < (selectedInvoice.medicines?.length || 0) - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                        <span>• {med.name} {med.strength || ''} (SL: {med.quantity} {med.unit || ''})</span>
                        <span>{money(med.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#4a5568' }}>Giảm trừ</span>
                  <strong style={{ color: '#1a202c' }}>- {money(selectedInvoice.discount)}</strong>
                </div>
              </div>
            </div>

            {/* Tổng thanh toán */}
            <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '16px', paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px' }}>
              <span style={{ fontSize: '17px', fontWeight: 700, color: '#1a202c' }}>Tổng thanh toán</span>
              <strong style={{ fontSize: '24px', fontWeight: 800, color: '#1a202c' }}>
                {money(selectedInvoice.total)}
              </strong>
            </div>

            {/* Thông tin thanh toán đã trả / còn lại nếu có */}
            {Number(selectedInvoice.paidAmount) > 0 ? (
              <div style={{ padding: '10px 14px', background: '#ebf8ff', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>Đã thanh toán: <b>{money(selectedInvoice.paidAmount)}</b></span>
                <span>Còn phải thanh toán: <strong style={{ color: '#b02a37', fontSize: '14px' }}>{money(selectedInvoice.balance)}</strong></span>
              </div>
            ) : null}

            {/* Lịch sử thanh toán nếu có */}
            {selectedInvoice.payments && selectedInvoice.payments.length > 0 ? (
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <strong style={{ display: 'block', fontSize: '14px', color: '#2d3748', marginBottom: '8px' }}>
                  Lịch sử thanh toán ({selectedInvoice.payments.length})
                </strong>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {selectedInvoice.payments.map((p, idx) => (
                    <div
                      key={p.id || idx}
                      style={{
                        padding: '8px 12px',
                        background: '#ffffff',
                        border: '1px solid #edf2f7',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '13px',
                      }}
                    >
                      <div>
                        <strong>{money(p.amount)}</strong> · <span>{p.method}</span>
                        {p.reference ? <small style={{ marginLeft: '6px', color: '#718096' }}>({p.reference})</small> : null}
                        {p.note ? <div style={{ fontSize: '11px', color: '#718096' }}>{p.note}</div> : null}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="invoice-badge is-paid" style={{ fontSize: '11px', padding: '2px 8px' }}>
                          {p.status}
                        </span>
                        {p.paidAt ? (
                          <small style={{ display: 'block', color: '#a0aec0', fontSize: '11px' }}>
                            {formatDate(p.paidAt)}
                          </small>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Phương thức thanh toán section (giống ảnh mẫu) */}
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '18px' }}>💳</span>
                <strong style={{ fontSize: '14px', color: '#2d3748' }}>Phương thức thanh toán</strong>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#718096', lineHeight: 1.5 }}>
                Thanh toán tại phòng khám hoặc chọn phương thức trực tuyến khi đã được tích hợp.
              </p>
            </div>

            {/* NÚT THANH TOÁN (Yêu cầu bổ sung của người dùng) */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="manager-btn manager-btn--outline"
                onClick={() => window.print()}
              >
                🖨 In hóa đơn
              </button>

              {selectedInvoice.status !== 'Da thanh toan' ? (
                <button
                  type="button"
                  className="manager-btn manager-btn--primary"
                  style={{ minWidth: '160px', fontWeight: 700, fontSize: '14px' }}
                  onClick={() => setShowPaymentModal(true)}
                >
                  💳 Thanh toán ngay
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#157347', fontWeight: 600 }}>
                  <span>✓ Hóa đơn đã được thanh toán</span>
                </div>
              )}
            </div>

            {/* MODAL PHƯƠNG THỨC THANH TOÁN & QUÉT MÃ QR */}
            {showPaymentModal ? (
              <div
                style={{
                  marginTop: '20px',
                  padding: '18px',
                  background: '#f0f9ff',
                  border: '2px solid #bee3f8',
                  borderRadius: '10px',
                }}
              >
                <h4 style={{ margin: '0 0 10px', fontSize: '16px', color: '#2b6cb0', fontWeight: 700 }}>
                  Thanh toán hóa đơn {selectedInvoice.id}
                </h4>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#4a5568' }}>
                  Số tiền cần thanh toán: <strong style={{ color: '#c53030', fontSize: '16px' }}>{money(selectedInvoice.balance)}</strong>
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 200px', gap: '16px', alignItems: 'center' }}>
                  <div>
                    <h5 style={{ margin: '0 0 6px', fontSize: '14px', color: '#2d3748' }}>
                      Cách 1: Chuyển khoản VietQR (Napas 24/7)
                    </h5>
                    <dl style={{ margin: 0, fontSize: '13px', lineHeight: 1.6 }}>
                      <div><strong>Ngân hàng:</strong> MBBank (Ngân hàng TMCP Quân Đội)</div>
                      <div><strong>Số tài khoản:</strong> <code>0987654321</code></div>
                      <div><strong>Chủ tài khoản:</strong> BENH VIEN DA KHOA QUOC TE</div>
                      <div><strong>Số tiền:</strong> {money(selectedInvoice.balance)}</div>
                      <div><strong>Nội dung CK:</strong> <code>{selectedInvoice.id}</code></div>
                    </dl>
                    <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#718096' }}>
                      Quét mã QR bên cạnh để điền sẵn toàn bộ thông tin thanh toán trên ứng dụng ngân hàng.
                    </p>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <img
                      src={vietQrUrl}
                      alt="Mã VietQR thanh toán"
                      style={{ width: '160px', height: '160px', borderRadius: '8px', border: '1px solid #cbd5e0', background: '#fff' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <small style={{ display: 'block', marginTop: '4px', color: '#718096', fontSize: '11px' }}>
                      Quét mã VietQR 24/7
                    </small>
                  </div>
                </div>

                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #cbd5e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <small style={{ color: '#4a5568', fontSize: '12px' }}>
                    Hoặc thanh toán tiền mặt trực tiếp tại Quầy Thu ngân (Tầng 1).
                  </small>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="manager-btn manager-btn--outline"
                      onClick={() => setShowPaymentModal(false)}
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      className="manager-btn manager-btn--primary"
                      disabled={busy}
                      onClick={() => void handleOnlinePayment()}
                    >
                      {busy ? 'Đang xác nhận...' : '✓ Xác nhận đã thanh toán'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </AdminModal>
      ) : null}
    </main>
  );
}
