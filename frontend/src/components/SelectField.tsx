import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

type OptionData = { value: string; label: string; disabled: boolean };

function readOptions(children: ReactNode): OptionData[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child) || child.type !== 'option') return [];
    const option = child as ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>;
    const value = option.props.value == null ? '' : String(option.props.value);
    const label = Children.toArray(option.props.children).join('');
    return [{ value, label, disabled: Boolean(option.props.disabled) }];
  });
}

export function SelectField({
  label,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  name,
  id,
  className = '',
  'aria-label': ariaLabel,
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const options = useMemo(() => readOptions(children), [children]);
  const selectedValue = value == null ? String(defaultValue ?? options[0]?.value ?? '') : String(value);
  const selected = options.find((item) => item.value === selectedValue) || options[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function pick(next: string) {
    setOpen(false);
    if (!onChange || next === selectedValue) return;
    onChange({ target: { value: next, name: name || '' } } as ChangeEvent<HTMLSelectElement>);
  }

  return (
    <div ref={rootRef} className={`relative flex flex-col gap-1.5 text-[13px] font-semibold ${className}`}>
      <label htmlFor={fieldId}>{label}</label>
      <button
        id={fieldId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || label}
        aria-required={required}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border border-line bg-white px-3 py-2.5 text-left text-sm font-normal text-ink outline-none transition hover:border-primary-600 hover:bg-[#f7faff] focus:border-primary-600 focus:shadow-[0_0_0_3px_rgba(29,106,223,.12)] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => { if (!disabled) setOpen((current) => !current); }}
      >
        <span className="min-w-0 truncate">{selected?.label || 'Chọn'}</span>
        <span className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label={ariaLabel || label}
          className="absolute left-0 right-0 top-[calc(100%-2px)] z-30 mt-1 max-h-64 overflow-auto rounded-2xl border border-line bg-white py-1 shadow-[0_12px_28px_rgba(15,35,70,.12)]"
        >
          {options.map((item) => {
            const active = item.value === selectedValue;
            return (
              <li key={`${item.value}::${item.label}`} role="option" aria-selected={active} aria-disabled={item.disabled}>
                <button
                  type="button"
                  disabled={item.disabled}
                  className={`flex w-full cursor-pointer px-3 py-2.5 text-left text-sm font-normal transition disabled:cursor-not-allowed disabled:opacity-45 ${
                    active ? 'bg-primary-600 text-white' : 'text-ink hover:bg-primary-50'
                  }`}
                  onClick={() => { if (!item.disabled) pick(item.value); }}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
