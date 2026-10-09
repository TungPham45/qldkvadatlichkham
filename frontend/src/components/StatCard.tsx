export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <article className="rounded-xl border border-line bg-white px-[18px] py-4 shadow-card">
      <span className="text-[13px] text-muted">{label}</span>
      <strong className="mt-2 block text-[28px]">{value}</strong>
      {hint ? <em className="text-xs text-muted not-italic">{hint}</em> : null}
    </article>
  );
}
