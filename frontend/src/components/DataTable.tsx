export function DataTable<T>({ columns, rows, rowKey }: {
  columns: Array<{ key: string; header: string; render: (row: T) => React.ReactNode }>;
  rows: T[];
  rowKey: (row: T) => string | number;
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>{columns.map((column) => <th key={column.key} className="border-b border-line px-2.5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key} className="border-b border-line px-2.5 py-3 text-left text-sm">{column.render(row)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
