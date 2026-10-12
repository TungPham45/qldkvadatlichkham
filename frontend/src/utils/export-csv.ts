export function exportCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const quote = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(quote).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
