export function PageContainer({ children, flush = false }: { children: React.ReactNode; flush?: boolean }) {
  return <div className={`flex flex-col gap-[18px] ${flush ? '' : 'p-6 max-desk:p-4'}`}>{children}</div>;
}
