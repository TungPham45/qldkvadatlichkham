export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-[rgba(10,22,40,.45)] p-5" onClick={onClose}>
      <div className="flex w-full max-w-[480px] flex-col gap-3 rounded-2xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
