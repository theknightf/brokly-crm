// ─── Lead import (Excel / CSV) helpers ───────────────────────────────────────
// Parses .xlsx via SheetJS and .csv via PapaParse, auto-maps columns
// (English + Arabic headers), validates Egyptian mobile numbers and statuses,
// and returns mapped rows ready for preview + insertion.

import { ALL_STATUSES, LeadStatus } from '@/app/leads-management/components/mockLeads';

export type ImportField =
  | 'name'
  | 'phone'
  | 'status'
  | 'source'
  | 'email'
  | 'date'
  | 'developer'
  | 'project'
  | 'unit'
  | 'interestLevel'
  | 'assigned'
  | 'notes'
  | 'location';

/** Normalized interest-level values we accept (English + Arabic). */
const INTEREST_LEVELS = ['Hot', 'Warm', 'Cold', 'New'] as const;
interface InterestAlias {
  value: string;
  matches: RegExp;
}
const INTEREST_ALIASES: InterestAlias[] = [
  { value: 'Hot', matches: /hot|حار|ساخن|high|عالية|مرتفع/ },
  { value: 'Warm', matches: /warm|دافئ|متوسط|mid/ },
  { value: 'Cold', matches: /cold|بارد|low|منخفض|ضعيف/ },
];

/** Normalized field -> list of header aliases we accept (case/space/punct-insensitive). */
const FIELD_ALIASES: Record<ImportField, string[]> = {
  name: [
    'name',
    'full name',
    'customer name',
    'client name',
    'الاسم',
    'الاسم الكامل',
    'اسم العميل',
    'اسم',
  ],
  phone: [
    'mobile',
    'phone',
    'tel',
    'telephone',
    'mobile number',
    'phone number',
    'contact no',
    'whatsapp',
    'الموبايل',
    'موبايل',
    'جوال',
    'الهاتف',
    'رقم الهاتف',
    'رقم الموبايل',
    'تليفون',
    'هاتف',
    'رقم',
  ],
  status: ['status', 'stage', 'lead status', 'المرحلة', 'حالة', 'الحالة', 'ستاتوس'],
  source: ['source', 'lead source', 'channel', 'المصدر', 'مصدر', 'طريقة'],
  email: ['email', 'mail', 'e-mail', 'ايميل', 'البريد', 'بريد'],
  date: [
    'date',
    'creation date',
    'created',
    'contact date',
    'date added',
    'التاريخ',
    'تاريخ',
    'تاريخ الاضافة',
    'تاريخ الانشاء',
  ],
  developer: ['developer', 'dev', 'المطور', 'الشركة المطورة', 'مطور'],
  project: ['project', 'compound', 'المشروع', 'مشروع', 'كمبوند'],
  unit: [
    'unit',
    'unit number',
    'unit no',
    'apartment',
    'apartment number',
    'الوحدة',
    'رقم الوحدة',
    'شقة',
    'رقم الشقة',
    'فيلا',
  ],
  interestLevel: [
    'interest',
    'interest level',
    'level',
    'rating',
    'lead rating',
    'lead score',
    'درجة الاهتمام',
    'الاهتمام',
    'اهتمام',
    'تقييم',
    'مستوى الاهتمام',
  ],
  assigned: [
    'assigned',
    'assigned to',
    'assignee',
    'agent',
    'sales agent',
    'owner',
    'consultant',
    'المسؤول',
    'موظف',
    'مندوب',
    'العميل المسوق',
    'مستخدم',
  ],
  location: ['location', 'city', 'area', 'المدينة', 'المنطقة', 'موقع', 'عنوان'],
  notes: ['notes', 'note', 'comment', 'ملاحظات', 'ملاحظة'],
};

const SOURCE_FALLBACK = 'Other';
const DEFAULT_STATUS: LeadStatus = 'Fresh Leads';

function normalizeHeader(h: string): string {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Auto-detect the best candidate field for a given header (undefined = unmapped). */
export function detectField(header: string): ImportField | undefined {
  const key = normalizeHeader(header);
  for (const field of Object.keys(FIELD_ALIASES)) {
    if (FIELD_ALIASES[field as ImportField].some((a) => normalizeHeader(a) === key)) {
      return field as ImportField;
    }
  }
  // Loose "contains" fallback for very common stems.
  if (/mobile|phone|tel|موبايل|هاتف/.test(key)) return 'phone';
  if (/status|stage|المرحلة|الحالة/.test(key)) return 'status';
  if (/name|الاسم/.test(key)) return 'name';
  if (/mail|ايميل|بريد/.test(key)) return 'email';
  if (/date|التاريخ/.test(key)) return 'date';
  if (/develop|مطور/.test(key)) return 'developer';
  if (/project|مشروع/.test(key)) return 'project';
  if (/unit|شقة|وحدة/.test(key)) return 'unit';
  if (/interest|اهتمام|تقييم|rating/.test(key)) return 'interestLevel';
  if (/assigned|agent|مندوب|المسؤول/.test(key)) return 'assigned';
  if (/location|مدينة/.test(key)) return 'location';
  if (/source|مصدر/.test(key)) return 'source';
  return undefined;
}

function cellToStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return String(v);
  return String(v).trim();
}

/** Egyptian mobile number -> normalized digits-only Egyptian form, or '' if invalid. */
export function normalizeEgyptianPhone(raw: string | number): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0020')) digits = digits.slice(4);
  else if (digits.startsWith('20')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  if (/^1[0125]\d{8}$/.test(digits)) return '0' + digits;
  return '';
}

export function isValidEgyptianPhone(raw: string | number): boolean {
  return normalizeEgyptianPhone(raw) !== '';
}

/** Normalized status matching against ALL_STATUSES + legacy derivatives. */
export function normalizeStatus(raw: string): LeadStatus | '' {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const exact = ALL_STATUSES.find((v) => v.toLowerCase() === s.toLowerCase());
  if (exact) return exact as LeadStatus;
  const legacy: Record<string, LeadStatus> = {
    new: 'Fresh Leads',
    contacted: 'Cold Calls',
    qualified: 'Interested',
    won: 'Done Deal',
    lost: 'Not Interested',
    negotiation: 'Following Up',
    'site visit scheduled': 'Meeting',
  };
  const key = s.toLowerCase();
  for (const k of Object.keys(legacy)) {
    if (key.startsWith(k) || key.includes(k)) return legacy[k];
  }
  return '';
}

export interface ParsedRow {
  rowNumber: number;
  name?: string;
  phone?: string;
  status?: string;
  source?: string;
  email?: string;
  date?: string; // YYYY-MM-DD or ISO, may be empty
  developer?: string;
  project?: string;
  unit?: string;
  interestLevel?: string;
  assignedTo?: string; // resolved user id ('' if a name was given but not found)
  assignedName?: string;
  location?: string;
  notes?: string;
  reasons: string[]; // validation problems (empty = importable)
}

export interface ImportParseResult {
  headers: string[];
  rows: ParsedRow[];
  /** header index -> mapped field ('' = skip column). */
  mapping: Record<number, ImportField>;
}

/** Turn a string date-ish value into YYYY-MM-DD, or ''. */
function toIsoDate(raw: unknown): string {
  const s = cellToStr(raw);
  if (!s) return '';
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const eur = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (eur) {
    const d = Number(eur[1]);
    const m = Number(eur[2]);
    if (m > 12 && d > 0) {
      if (m > 12 && d <= 12)
        return `${eur[3]}-${eur[1].padStart(2, '0')}-${eur[2].padStart(2, '0')}`;
    }
    return `${eur[3]}-${eur[2].padStart(2, '0')}-${eur[1].padStart(2, '0')}`;
  }
  const t = new Date(s);
  if (!Number.isNaN(t.getTime()) && /^\d/.test(s)) return t.toISOString().slice(0, 10);
  return '';
}

function detectAutoMapping(headers: string[]): Record<number, ImportField> {
  const mapping: Record<number, ImportField> = {};
  const used = new Set<ImportField>();
  headers.forEach((h, i) => {
    const field = detectField(h);
    if (field && !used.has(field)) {
      mapping[i] = field;
      used.add(field);
    }
  });
  return mapping;
}

function getMapped(
  obj: Record<string, unknown>,
  headers: string[],
  mapping: Record<number, ImportField>,
  field: ImportField
): unknown {
  for (const [i, f] of Object.entries(mapping)) {
    if (f === field) {
      const header = headers[Number(i)];
      if (header in obj) return obj[header];
    }
  }
  return '';
}

/** Normalized interest-level matching (English + Arabic aliases), else '' */
export function normalizeInterest(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (INTEREST_LEVELS.includes(s as any)) return s;
  const key = s.toLowerCase();
  for (const a of INTEREST_ALIASES) if (a.matches.test(key)) return a.value;
  return '';
}

/**
 * Parse an uploaded .xlsx/.csv File into headers + rows + a best-guess column
 * mapping. Called from the browser; heavy libs are loaded lazily only when a
 * file is actually uploaded. Pass `users` so "assigned to" name columns can be
 * resolved to real user ids during parsing.
 */
export async function parseLeadFile(
  file: File,
  userMapping?: Record<number, ImportField>,
  users?: { id: string; name: string }[]
): Promise<ImportParseResult> {
  const isCsv = /\.csv$/i.test(file.name);
  const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
  if (!isCsv && !isXlsx) {
    throw new Error('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
  }

  let headers: string[] = [];
  let rawRows: Record<string, unknown>[] = [];

  if (isCsv) {
    const Papa = (await import('papaparse')).default;
    const text = await file.text();
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    const fatal = (result.errors || []).find((e) => e.type === 'Quotes');
    if (fatal) throw new Error('CSV parsing failed: ' + fatal.message);
    headers = result.meta.fields || [];
    rawRows = result.data as Record<string, unknown>[];
  } else {
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('The workbook has no sheets.');
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    if (json.length) {
      headers = Object.keys(json[0]);
      rawRows = json;
    } else {
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
      if (!matrix.length) throw new Error('The file appears to be empty.');
      headers = (matrix[0] || []).map((h) => String(h).trim()).filter(Boolean);
      rawRows = matrix.slice(1).map((cells) => {
        const row: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          if (h) row[h] = cells?.[i];
        });
        return row;
      });
    }
  }

  if (!headers.length) throw new Error('No column headers were found in the file.');

  const mapping =
    typeof userMapping === 'object' && userMapping !== null && Object.keys(userMapping).length
      ? userMapping
      : detectAutoMapping(headers);

  // A phone column is required; if auto-detection missed it, re-scan.
  const hasPhone = Object.values(mapping).includes('phone');
  if (!hasPhone) {
    headers.forEach((h, i) => {
      if (!mapping[i] && detectField(h) === 'phone') mapping[i] = 'phone';
    });
  }

  const rows: ParsedRow[] = rawRows.map((obj, idx) => {
    const phoneRaw = String(getMapped(obj, headers, mapping, 'phone'));
    const normalizedPhone = normalizeEgyptianPhone(phoneRaw);
    const statusRaw = String(getMapped(obj, headers, mapping, 'status'));
    const statusNorm = normalizeStatus(statusRaw);
    const reasons: string[] = [];

    const hasPhoneValue = phoneRaw.replace(/\D/g, '').length > 0;
    if (!hasPhoneValue) reasons.push('Missing phone number');
    else if (!normalizedPhone) reasons.push('Invalid Egyptian mobile format');

    if (statusRaw && !statusNorm)
      reasons.push(`Unknown status "${String(statusRaw).slice(0, 40)}"`);

    const dateVal = getMapped(obj, headers, mapping, 'date');
    const isoDate = dateVal ? toIsoDate(dateVal) : '';
    if (dateVal && !isoDate) reasons.push('Unrecognized date format');

    // Assigned user: resolve a name (or full name) to a user id when possible.
    const assignedNameRaw = cellToStr(getMapped(obj, headers, mapping, 'assigned'));
    let assignedId = '';
    let assignedName = '';
    if (assignedNameRaw) {
      const lower = assignedNameRaw.toLowerCase().trim();
      const match =
        (users || []).find((u) => u.name.toLowerCase().trim() === lower) ||
        (users || []).find((u) => u.name.toLowerCase().includes(lower) || lower.includes(u.name.toLowerCase()));
      if (match) {
        assignedId = match.id;
        assignedName = match.name;
      } else {
        assignedName = assignedNameRaw;
        reasons.push(`Unknown assigned user "${assignedNameRaw.slice(0, 40)}"`);
      }
    }

    const interestRaw = cellToStr(getMapped(obj, headers, mapping, 'interestLevel'));
    const interestNorm = normalizeInterest(interestRaw);
    if (interestRaw && !interestNorm)
      reasons.push(`Unknown interest level "${interestRaw.slice(0, 40)}"`);

    return {
      rowNumber: idx + 2,
      name: cellToStr(getMapped(obj, headers, mapping, 'name')) || undefined,
      phone: normalizedPhone,
      status: statusNorm || statusRaw || DEFAULT_STATUS,
      source: cellToStr(getMapped(obj, headers, mapping, 'source')) || SOURCE_FALLBACK,
      email: cellToStr(getMapped(obj, headers, mapping, 'email')) || undefined,
      date: isoDate || undefined,
      developer: cellToStr(getMapped(obj, headers, mapping, 'developer')) || undefined,
      project: cellToStr(getMapped(obj, headers, mapping, 'project')) || undefined,
      unit: cellToStr(getMapped(obj, headers, mapping, 'unit')) || undefined,
      interestLevel: interestNorm || undefined,
      assignedTo: assignedId || undefined,
      assignedName: assignedName || undefined,
      location: cellToStr(getMapped(obj, headers, mapping, 'location')) || undefined,
      notes: cellToStr(getMapped(obj, headers, mapping, 'notes')) || undefined,
      reasons,
    };
  });

  return { headers, rows, mapping };
}
