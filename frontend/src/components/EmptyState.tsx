export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="px-4 py-9 text-center text-muted">
      <h3 className="mb-1.5 font-semibold text-ink">{title}</h3>
      <p>{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
