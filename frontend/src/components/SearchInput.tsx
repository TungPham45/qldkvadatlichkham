export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="min-w-[220px]">
      <input className="w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-sm text-ink" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
