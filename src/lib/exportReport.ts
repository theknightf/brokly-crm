// ─── Client-side report export helpers ────────────────────────────────────────
// Excel: emits UTF-8 CSV (opens directly in Excel) with a .csv extension.
// PDF: opens a clean print-optimized HTML document and triggers the browser
// print dialog ("Save as PDF"). No extra dependencies required.

function escapeCsv(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Download a CSV file (Excel-compatible). Include a UTF-8 BOM so Excel
 * renders non-ASCII (Arabic etc.) correctly.
 */
export function exportCSV(filename: string, headers: (string | number)[], rows: unknown[][]): void {
  const lines = [headers.map(escapeCsv).join(',')];
  rows.forEach((r) => lines.push(r.map(escapeCsv).join(',')));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

/**
 * Download a generic text/Excel file from a string (used for HTML table output).
 */
export function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface PdfTable {
  caption: string;
  headers: string[];
  rows: string[][];
  footer?: string;
}

/**
 * Open a print-ready report window. The user can "Save as PDF" or print.
 * `summary` is shown under the title; `tables` render as styled tables.
 */
export function exportPDF(
  title: string,
  subtitle: string,
  summary: { label: string; value: string }[],
  tables: PdfTable[],
  filename = 'report'
): void {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const tableHtml = tables
    .map((t) => {
      const head = `<thead><tr>${t.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>`;
      const body = `<tbody>${t.rows
        .map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      const footer = t.footer
        ? `<tfoot><tr><td colspan="${t.headers.length}">${esc(t.footer)}</td></tr></tfoot>`
        : '';
      return `<h3>${esc(t.caption)}</h3><table>${head}${body}${footer}</table>`;
    })
    .join('');

  const summaryHtml = summary
    .map((s) => `<div class="kpi"><span>${esc(s.value)}</span><small>${esc(s.label)}</small></div>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 32px; }
  .brand { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #65a30d; padding-bottom: 12px; margin-bottom: 16px; }
  .brand .logo { width: 40px; height: 40px; border-radius: 10px; background: #65a30d; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; flex-shrink: 0; }
  .brand h1 { font-size: 18px; margin: 0; }
  .brand p { font-size: 12px; color: #64748b; margin: 2px 0 0; }
  .subtitle { font-size: 13px; color: #475569; margin: 0 0 18px; }
  .kpis { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 22px; }
  .kpi { background: #f1f5f9; border-radius: 8px; padding: 10px 14px; min-width: 120px; }
  .kpi span { display: block; font-size: 18px; font-weight: 700; }
  .kpi small { color: #64748b; font-size: 11px; }
  h3 { font-size: 14px; margin: 22px 0 8px; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; }
  tfoot td { background: #f8fafc; font-weight: 600; color: #64748b; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .footer { margin-top: 22px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; }
  .footer b { color: #65a30d; font-weight: 700; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <div class="brand">
    <div class="logo">On</div>
    <div>
      <h1>OnPoint Real Estate Broker</h1>
      <p>${esc(title)}</p>
    </div>
  </div>
  <p class="subtitle">${esc(subtitle)}</p>
  <div class="kpis">${summaryHtml}</div>
  ${tableHtml}
  <div class="footer">
    <span>Made by <b>Fares Mostafa</b></span>
    <span>Generated on ${new Date().toLocaleString()}</span>
  </div>
  <script>window.onload = function () { window.focus(); setTimeout(function(){ window.print(); }, 350); };</script>
</body>
</html>`;

  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (!w) {
    downloadBlob(`print-${filename}.html`, html, 'text/html;charset=utf-8');
  }
}
