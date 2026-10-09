export function Breadcrumb({ items }: { items: string[] }) {
  return <div className="mb-1.5 flex gap-2 text-[13px] text-muted">{items.join(' / ')}</div>;
}
