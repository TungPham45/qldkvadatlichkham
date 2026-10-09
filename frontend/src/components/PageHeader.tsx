import { Breadcrumb } from './Breadcrumb';

export function PageHeader({ title, description, crumbs, actions }: { title: string; description?: string; crumbs: string[]; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Breadcrumb items={crumbs} />
        <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
