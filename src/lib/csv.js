export function escapeCsvValue(value) {
  if (value === undefined || value === null) return '';
  const text = Array.isArray(value) ? value.join('；') : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows, columns) {
  const header = columns.map((column) => escapeCsvValue(column)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvValue(row[column])).join(',')
  );
  return [header, ...body].join('\n') + '\n';
}
