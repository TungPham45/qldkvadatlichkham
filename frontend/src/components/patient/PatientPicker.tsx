import { useEffect, useId, useRef, useState } from 'react';
import type { BookablePatient } from '../../types';
import { ageLabel, genderLabel, initials, relationLabel } from '../../utils/format';

function isSelf(item: BookablePatient) {
  return item.laChuHoSo || item.loaiQuanHe === 'BanThan';
}

export function PatientPicker({
  label,
  patients,
  value,
  onChange,
  onAddRelative,
}: {
  label: string;
  patients: BookablePatient[];
  value: string;
  onChange: (id: string) => void;
  onAddRelative: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = patients.find((item) => String(item.id) === value) || null;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="flex flex-col gap-1.5" ref={rootRef}>
      <span className="text-[13px] font-semibold">{label}</span>
      <div className="relative">
        <button
          type="button"
          className={`flex w-full cursor-pointer items-center gap-2.5 rounded-2xl border bg-[#f7faff] px-3 py-2.5 text-left transition ${
            open ? 'border-primary-600 bg-white shadow-[0_0_0_3px_rgba(29,106,223,.12)]' : 'border-line hover:border-[#b9d2f5]'
          }`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((current) => !current)}
        >
          {selected ? (
            <>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">
                {initials(selected.hoTen)}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm text-ink">{selected.hoTen}</strong>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {isSelf(selected) ? 'Bản thân' : relationLabel(selected.loaiQuanHe)}
                  {' · '}
                  {genderLabel(selected.gioiTinh)}
                  {ageLabel(selected.ngaySinh) ? ` · ${ageLabel(selected.ngaySinh)}` : ''}
                </span>
              </span>
            </>
          ) : (
            <span className="flex-1 text-sm text-muted">Chọn người tới khám</span>
          )}
          <span className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
        </button>

        {open ? (
          <div
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_16px_40px_rgba(16,42,80,.14)]"
          >
            <div className="max-h-[260px] overflow-auto p-1.5">
              {patients.map((item) => {
                const active = String(item.id) === value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                      active ? 'bg-primary-50' : 'hover:bg-[#f7faff]'
                    }`}
                    onClick={() => {
                      onChange(String(item.id));
                      setOpen(false);
                    }}
                  >
                    <span className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      active ? 'bg-primary-600 text-white' : 'bg-[#eef4fc] text-primary-700'
                    }`}>
                      {initials(item.hoTen)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">{item.hoTen}</strong>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {isSelf(item) ? 'Bản thân' : relationLabel(item.loaiQuanHe)}
                        {item.soDienThoai ? ` · ${item.soDienThoai}` : ''}
                      </span>
                    </span>
                    {active ? <span className="text-xs font-bold text-primary-700">✓</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-[#eef2f7] p-1.5">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left font-semibold text-primary-700 transition hover:bg-primary-50"
                onClick={() => {
                  setOpen(false);
                  onAddRelative();
                }}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-dashed border-primary-600 text-lg leading-none">+</span>
                <span className="text-sm">Thêm hồ sơ người thân mới</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
