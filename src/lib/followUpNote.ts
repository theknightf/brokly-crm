/**
 * Follow-up notes arrive as one blob of appended machine logs and typed text, sometimes on a single line, often with
 * the same sync entry repeated, e.g.
 *   "[Device Call Sync • 2026-11-15 17:47] Outgoing Call (No Answer) • Duration: 0s [Device Call Sync • 2026-11-15 17:47] Outgoing Call (No Answer) • Duration: 0s"
 *   "[2026-11-15 18:02] [Call • Interested • 95s] Wants a 3-bedroom in New Cairo"
 *   "Asked to call back after Friday"
 * parseFollowUpNote() splits that into entries, drops exact duplicates, and returns what a list row needs:
 * the latest human-written text and the latest call result + duration.
 *
 * Kept free of path aliases and runtime imports so the unit test can run with plain `node --test`.
 */

export interface FollowUpCall {
  /** Call result as logged, e.g. "No Answer", "Interested". */
  result: string;
  seconds: number;
  channel: 'call' | 'whatsapp';
  /** "outgoing" | "incoming" | "missed" for device-synced calls. */
  direction?: string;
  at?: string; // "YYYY-MM-DD HH:MM"
}

export interface FollowUpNoteEntry {
  kind: 'device' | 'call' | 'text';
  raw: string;
  at?: string;
  text?: string;
  call?: FollowUpCall;
}

export interface ParsedFollowUpNote {
  /** Latest thing a person wrote, or null when the blob is only machine logs. */
  text: string | null;
  /** Latest logged call, or null. */
  call: FollowUpCall | null;
  /** Unique entries in their original order (oldest first). */
  entries: FollowUpNoteEntry[];
}

// Where a new entry starts inside a run-on blob.
const ENTRY_START = /(?=\[Device Call Sync\s*•)|(?=\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\])/gi;
const DEVICE = /^\[Device Call Sync\s*•\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\]\s*(.*?)\s*\(([^)]*)\)\s*(?:•\s*Duration:\s*(\d+)\s*s)?\s*(.*)$/i;
const CALL = /^\[(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\]\s*\[(Call|WhatsApp)\s*•\s*(.*?)\s*•\s*(\d+)\s*s\]\s*(.*)$/i;
const STAMPED_TEXT = /^\[(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\]\s*(.*)$/;
const AUTO_TEXT = /^(call outcome logged)$/i;

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function direction(raw: string): string | undefined {
  const t = raw.toLowerCase();
  if (t.includes('missed')) return 'missed';
  if (t.includes('incoming')) return 'incoming';
  if (t.includes('outgoing')) return 'outgoing';
  return undefined;
}

function parseSegment(seg: string): FollowUpNoteEntry | null {
  const raw = norm(seg);
  if (!raw) return null;

  const d = DEVICE.exec(raw);
  if (d) {
    const at = `${d[1]} ${d[2]}`;
    const rest = norm(d[6] || '');
    return {
      kind: 'device',
      raw,
      at,
      text: rest && !AUTO_TEXT.test(rest) ? rest : undefined,
      call: { result: norm(d[4]), seconds: Number(d[5] || 0), channel: 'call', direction: direction(d[3]), at },
    };
  }

  const c = CALL.exec(raw);
  if (c) {
    const at = `${c[1]} ${c[2]}`;
    const text = norm(c[6] || '');
    return {
      kind: 'call',
      raw,
      at,
      text: text && !AUTO_TEXT.test(text) ? text : undefined,
      call: { result: norm(c[4]), seconds: Number(c[5]), channel: c[3].toLowerCase() === 'whatsapp' ? 'whatsapp' : 'call', at },
    };
  }

  const s = STAMPED_TEXT.exec(raw);
  if (s) {
    const text = norm(s[3]);
    return text && !AUTO_TEXT.test(text) ? { kind: 'text', raw, at: `${s[1]} ${s[2]}`, text } : null;
  }

  return AUTO_TEXT.test(raw) ? null : { kind: 'text', raw, text: raw };
}

export function parseFollowUpNote(notes?: string | null): ParsedFollowUpNote {
  const seen = new Set<string>();
  const entries: FollowUpNoteEntry[] = [];

  for (const line of String(notes || '').split(/\r?\n/)) {
    for (const seg of line.split(ENTRY_START)) {
      const e = parseSegment(seg);
      if (!e) continue;
      const key = e.raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(e);
    }
  }

  // Latest = newest timestamp; entries without one count as newer than everything before them (appended later).
  const pickLatest = (pred: (e: FollowUpNoteEntry) => boolean): FollowUpNoteEntry | undefined => {
    let best: FollowUpNoteEntry | undefined;
    let bestAt = '';
    for (const e of entries) {
      if (!pred(e)) continue;
      const at = e.at || bestAt; // untimed entry inherits the running time, so later position wins ties
      if (!best || at >= bestAt) {
        best = e;
        bestAt = at;
      }
    }
    return best;
  };

  const latestText = pickLatest((e) => !!e.text);
  const latestCall = pickLatest((e) => !!e.call);
  return { text: latestText?.text ?? null, call: latestCall?.call ?? null, entries };
}

/** "No answer · 0s", "Interested · 1m 35s". */
export function formatCallChip(call: FollowUpCall): string {
  const r = call.result ? call.result.charAt(0).toUpperCase() + call.result.slice(1).toLowerCase() : 'Call';
  const s = call.seconds;
  const d = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ''}`;
  return `${r} · ${d}`;
}
