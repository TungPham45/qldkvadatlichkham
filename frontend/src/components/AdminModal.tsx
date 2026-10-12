export function AdminModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="admin-modal__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
        <header><h2 id="admin-modal-title">{title}</h2><button type="button" aria-label="Đóng" onClick={onClose}>×</button></header>
        {children}
      </section>
    </div>
  );
}
