/**
 * leads.notes is one text blob: people type in it and the apps append machine lines like
 *   "[Device Call Sync • 2026-11-03 13:54] Outgoing Call (Answered) • Duration: 40s"
 *   "[2026-11-03 13:55] [Call • Not Interested • 40s] text"
 * This splits the blob into what a person wrote and a readable call log, and puts it back together on save
 * (the machine lines are never dropped).
 */

export interface NoteLogEntry {
  raw: string;
  time: string;
  title: string;
  detail?: string;
}

export interface ParsedNotes {
  humanText: string;
  log: NoteLogEntry[]; // newest first
  rawLogLines: string[];
}

const DEVICE = /^\[Device Call Sync\s*•\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\]\s*(.*?)\s*\((.*?)\)\s*(?:•\s*Duration:\s*(\d+)s)?\s*$/i;
const CALL = /^\[(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\]\s*\[(Call|WhatsApp)\s*•\s*(.*?)\s*•\s*(\d+)s\]\s*(.*)$/i;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const when = (date: string, hm: string) => {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[Math.min(Math.max((m || 1) - 1, 0), 11)]} ${hm}`;
};
const dur = (s: number) => (s <= 0 ? 'no talk time' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ''}`);
const callType = (raw: string) => {
  const t = raw.toLowerCase();
  if (t.includes('missed')) return 'Missed call';
  if (t.includes('incoming')) return 'Incoming call';
  if (t.includes('outgoing')) return 'Outgoing call';
  return raw;
};

function parseLine(line: string): NoteLogEntry | null {
  const d = DEVICE.exec(line);
  if (d) {
    return { raw: line, time: when(d[1], d[2]), title: `${callType(d[3])} · ${d[4]} · ${dur(Number(d[5] || 0))}` };
  }
  const c = CALL.exec(line);
  if (c) {
    const text = (c[6] || '').trim();
    return {
      raw: line,
      time: when(c[1], c[2]),
      title: `${c[3].toLowerCase() === 'call' ? 'Call' : 'WhatsApp'} · ${c[4]} · ${dur(Number(c[5]))}`,
      detail: text && text !== 'Call outcome logged' ? text : undefined,
    };
  }
  return null;
}

export function parseLeadNotes(notes?: string | null): ParsedNotes {
  const human: string[] = [];
  const log: NoteLogEntry[] = [];
  const raw: string[] = [];
  for (const l of String(notes || '').split('\n')) {
    const line = l.trim();
    if (!line) continue;
    const e = parseLine(line);
    if (e) {
      log.push(e);
      raw.push(line);
    } else human.push(line);
  }
  return { humanText: human.join('\n'), log: log.reverse(), rawLogLines: raw };
}

/** Human text first, then the untouched machine lines. */
export function mergeLeadNotes(parsed: ParsedNotes, editedHuman: string): string {
  return [editedHuman.trim(), ...parsed.rawLogLines].filter(Boolean).join('\n');
}

/**
 * A lead comment as the apps write it: plain text, or "[Call • outcome • 40s] text" when it was typed while logging a call.
 * Mirrors the SQL function is_written_comment(): automatic entries (device sync, "Call outcome logged") are not notes.
 */
export function parseCommentBody(body: string): { written: boolean; text: string; outcome?: string; seconds?: number } {
  const b = String(body || '').trim();
  if (!b) return { written: false, text: '' };
  if (/^\[Device Call Sync/i.test(b)) return { written: false, text: '' };
  const m = /^\[(Call|WhatsApp)\s*•\s*(.*?)\s*•\s*(\d+)s\]\s*([\s\S]*)$/i.exec(b);
  if (m) {
    const text = (m[4] || '').trim();
    const written = !!text && text !== 'Call outcome logged';
    return { written, text: written ? text : '', outcome: m[2], seconds: Number(m[3]) };
  }
  return { written: true, text: b };
}
