// ─── Attendance PDF Generator — RTL A4 Printable ──────────────────────────
// Enterprise: Multi-shift, Leaves & Permissions, 10 columns (No Employee ID)
// A4 Landscape for all views (team/individual/daily) per new spec.

import { ShiftConfig } from './attendanceLogic';
import { officeCfgToAr } from './attendanceLogic';

export type AttendancePdfOrientation = 'landscape' | 'portrait';

export interface AttendancePdfMeta {
  companyName?: string;
  branchName?: string;
  monthYearAr: string;
  monthYearEn: string;
  shifts: ShiftConfig[]; // both shifts for header
  headcount: number;
  workingDays: number;
  department?: string; // active department filter
  activeShiftLabel?: string; // e.g. All Shifts or specific
}

export interface AttendancePdfKpi {
  label: string;
  value: string;
}

export interface AttendancePdfTable {
  headers: string[]; // 10 columns
  rows: string[][];
  captionAr?: string;
  captionEn?: string;
}

export interface AttendancePdfOptions {
  titleAr?: string;
  titleEn?: string;
  meta: AttendancePdfMeta;
  kpis: AttendancePdfKpi[];
  tables: AttendancePdfTable[];
  orientation: AttendancePdfOrientation;
  filename?: string;
  showSignOff?: boolean;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportAttendancePDF(opts: AttendancePdfOptions): void {
  const {
    titleAr = 'سجل الحضور والانصراف - دوام رسمي',
    titleEn = 'Attendance & Departure Log - Official Shift',
    meta,
    kpis,
    tables,
    orientation,
    filename = 'attendance-report',
    showSignOff = true,
  } = opts;

  const isLandscape = orientation === 'landscape';
  const pageSize = isLandscape ? 'A4 landscape' : 'A4 portrait';
  // Build shift header: show both shifts + grace
  const shiftHeader = meta.shifts.length
    ? meta.shifts.map((s) => `${s.labelAr} ${officeCfgToAr(s)}`).join('  •  ')
    : '—';
  const todayStr = new Date().toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'short' });

  const kpiHtml = kpis
    .map(
      (k) => `
      <div class="kpi">
        <span class="kpi-val">${esc(k.value)}</span>
        <span class="kpi-lab">${esc(k.label)}</span>
      </div>`
    )
    .join('');

  const tablesHtml = tables
    .map((t) => {
      const head = `<thead><tr>${t.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>`;
      const body = `<tbody>${t.rows
        .map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      const cap = t.captionAr
        ? `<div class="tbl-cap"><span dir="rtl">${esc(t.captionAr)}</span><span class="cap-en" dir="ltr">${esc(t.captionEn || '')}</span></div>`
        : '';
      return `${cap}<div class="tbl-wrap"><table>${head}${body}</table></div>`;
    })
    .join('');

  const metaHtml = `
    <div class="meta-grid">
      <div class="meta-item"><span class="meta-k">الشركة / الفرع</span><span class="meta-v">${esc(meta.companyName || '—')} ${meta.branchName ? '— ' + esc(meta.branchName) : ''}</span></div>
      <div class="meta-item"><span class="meta-k">الشهر / السنة</span><span class="meta-v">${esc(meta.monthYearAr)} — ${esc(meta.monthYearEn)}</span></div>
      <div class="meta-item"><span class="meta-k">الورديات النشطة</span><span class="meta-v" style="font-size:10px;">${esc(shiftHeader)}</span></div>
      <div class="meta-item"><span class="meta-k">القسم / الوردية المختارة</span><span class="meta-v">${esc(meta.activeShiftLabel || 'All Shifts')} · ${esc(meta.department || 'All Departments')} · ${meta.headcount} موظف · ${meta.workingDays} يوم عمل</span></div>
    </div>`;

  const rulesHtml = `
    <div class="rules-box" dir="rtl">
      <h4>📋 لائحة الحضور والانصراف والورديات</h4>
      <ul>
        <li><b>الوردية القياسية:</b> 12:00 م – 08:00 م · سماح 20د حتى 12:20 م.</li>
        <li><b>الوردية المسائية:</b> 01:00 م – 09:00 م · سماح 20د حتى 01:20 م.</li>
        <li><b>التأخير:</b> بعد نهاية السماح يُحتسب متأخر بالدقائق من بداية الوردية، ويُخصم إذن التأخير المعتمد (Net Late = الخام – المعتمد).</li>
        <li><b>الانصراف المبكر:</b> قبل نهاية الوردية يُحتسب مبكر ويُخصم إذن الانصراف؛ مأمورية معتمدة تغطي اليوم كاملاً.</li>
        <li><b>الإضافي:</b> بعد نهاية الوردية (08:00 م أو 09:00 م حسب الوردية) يُحتسب إضافي بالساعات.</li>
        <li><b>الإجازات:</b> اعتيادية/سنوية، مرضي بطبيب، بدون راتب، عطلة رسمية — تُعرض كنوع إجازة بدلاً من غياب ولا تُحتسب تأخير.</li>
        <li><b>حدود الإذن:</b> كل إذن مسجل بحالة اعتماد (معتمد من HR/Admin)، السبب، والدقائق المعتمدة.</li>
      </ul>
    </div>`;

  const signOffHtml = showSignOff
    ? `
    <div class="signoff" dir="rtl">
      <div class="sign-box">
        <span class="sign-title">مسؤول الموارد البشرية</span>
        <span class="sign-line"></span>
        <span class="sign-sub">التوقيع / الختم — التاريخ: ____ / ____ / 20__</span>
      </div>
      <div class="sign-box">
        <span class="sign-title">مشرف الوردية</span>
        <span class="sign-line"></span>
        <span class="sign-sub">التوقيع — التاريخ: ____ / ____ / 20__</span>
      </div>
      <div class="sign-box primary">
        <span class="sign-title">المدير العام / الاعتماد النهائي</span>
        <span class="sign-line"></span>
        <span class="sign-sub">التوقيع / الختم الرسمي — التاريخ: ____ / ____ / 20__</span>
      </div>
    </div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${esc(titleAr)} — ${esc(meta.monthYearAr)}</title>
<style>
  @page { size: ${pageSize}; margin: 12mm; }
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; }
  body { font-family: 'Cairo','Segoe UI', Tahoma, Arial, sans-serif; color: #0f172a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 277mm; margin: 0 auto; padding: 10mm 8mm; }
  @media print { .page { padding:0; } }
  .hdr { display:flex; align-items:center; justify-content:space-between; gap:16px; border-bottom: 3px solid #65a30d; padding-bottom: 10px; margin-bottom: 10px; }
  .hdr-left { display:flex; align-items:center; gap:12px; }
  .logo { width:44px; height:44px; border-radius:12px; background: #65a30d; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:18px; flex-shrink:0; }
  .hdr h1 { font-size: 16px; margin:0; line-height:1.2; }
  .hdr .title-ar { font-weight:800; color:#0f172a; }
  .hdr .title-en { font-size:11px; color:#64748b; font-weight:600; }
  .hdr-meta { text-align:left; font-size:10px; color:#64748b; }
  .hdr-meta b { color:#65a30d; }
  .meta-grid { display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin: 10px 0 12px; }
  .meta-item { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; gap:2px; }
  .meta-k { font-size:9px; color:#64748b; letter-spacing:.06em; text-transform:uppercase; }
  .meta-v { font-size:11px; font-weight:700; color:#0f172a; }
  .kpis { display:flex; gap:8px; flex-wrap:wrap; margin-bottom: 14px; }
  .kpi { flex:1; min-width: 110px; background: #fff; border:1px solid #e2e8f0; border-radius:10px; padding:8px 10px; text-align:center; }
  .kpi-val { display:block; font-size:15px; font-weight:800; color:#0f172a; }
  .kpi-lab { display:block; font-size:8.5px; color:#64748b; margin-top:2px; line-height:1.2; }
  .tbl-cap { display:flex; justify-content:space-between; align-items:center; margin: 10px 0 6px; font-size:12px; font-weight:700; }
  .tbl-cap .cap-en { font-size:10px; color:#64748b; font-weight:600; }
  .tbl-wrap { overflow:hidden; border:1px solid #e2e8f0; border-radius:10px; }
  table { width:100%; border-collapse:collapse; font-size:9.2px; line-height:1.3; }
  th,td { border:1px solid #e2e8f0; padding:5px 6px; text-align:center; vertical-align:middle; }
  th { background:#0f172a; color:#fff; font-weight:700; font-size:8.5px; white-space:nowrap; }
  td { background:#fff; }
  tbody tr:nth-child(even) td { background:#f8fafc; }
  .rules-box { margin: 14px 0 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; }
  .rules-box h4 { margin:0 0 6px; font-size:11px; }
  .rules-box ul { margin:0; padding:0 18px 0 0; font-size:9.5px; color:#334155; line-height:1.6; }
  .rules-box li b { color:#0f172a; }
  .signoff { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-top:14px; }
  .sign-box { border:1.5px solid #0f172a; border-radius:12px; padding:14px 10px; text-align:center; display:flex; flex-direction:column; gap:10px; min-height:86px; justify-content:space-between; }
  .sign-box.primary { border-color:#65a30d; background:#f7fee7; }
  .sign-title { font-size:11px; font-weight:800; }
  .sign-line { display:block; height:1px; background:#0f172a; margin: 6px 18px 0; opacity:.18; }
  .sign-sub { font-size:8px; color:#64748b; }
  .foot { margin-top: 10px; border-top:1px solid #e2e8f0; padding-top:6px; display:flex; justify-content:space-between; font-size:8.5px; color:#94a3b8; }
  .foot b { color:#65a30d; }
</style>
</head>
<body>
  <div class="page" dir="rtl">
    <div class="hdr">
      <div class="hdr-left">
        <div class="logo">On</div>
        <div>
          <h1 class="title-ar">${esc(titleAr)}</h1>
          <div class="title-en">${esc(titleEn)} — ${esc(meta.monthYearEn)}</div>
        </div>
      </div>
      <div class="hdr-meta" dir="ltr">
        <div>Generated: ${esc(todayStr)}</div>
        <div>Orientation: <b>${esc(orientation)}</b> · A4 Landscape · RTL</div>
      </div>
    </div>
    ${metaHtml}
    <div class="kpis">${kpiHtml}</div>
    ${tablesHtml}
    ${rulesHtml}
    ${signOffHtml}
    <div class="foot">
      <span>Made by <b>Fares Mostafa</b> — Brokly CRM</span>
      <span>سجل الحضور والانصراف والورديات · ${esc(meta.monthYearAr)} · مستند رسمي</span>
    </div>
  </div>
  <script>window.onload=function(){window.focus(); setTimeout(function(){window.print();}, 400);};</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}
