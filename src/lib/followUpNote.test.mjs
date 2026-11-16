// Run: node --experimental-strip-types --test src/lib/followUpNote.test.mjs   (Node 22.6+; flag not needed on 23.6+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFollowUpNote, formatCallChip } from './followUpNote.ts';

const SYNC = '[Device Call Sync • 2026-11-15 17:47] Outgoing Call (No Answer) • Duration: 0s';

test('empty input', () => {
  assert.deepEqual(parseFollowUpNote(''), { text: null, call: null, entries: [] });
  assert.deepEqual(parseFollowUpNote(null), { text: null, call: null, entries: [] });
});

test('run-on duplicated device sync lines collapse to one call, no text', () => {
  const r = parseFollowUpNote(`${SYNC} ${SYNC}\n${SYNC}`);
  assert.equal(r.entries.length, 1);
  assert.equal(r.text, null);
  assert.deepEqual(r.call, { result: 'No Answer', seconds: 0, channel: 'call', direction: 'outgoing', at: '2026-11-15 17:47' });
  assert.equal(formatCallChip(r.call), 'No answer · 0s');
});

test('latest typed text and latest call are picked by timestamp', () => {
  const blob = [
    '[2026-11-14 10:00] [Call • Interested • 95s] Wants a 3-bedroom in New Cairo',
    SYNC,
    '[2026-11-15 18:02] [WhatsApp • Follow Up • 0s] Sent brochure',
  ].join(' ');
  const r = parseFollowUpNote(blob);
  assert.equal(r.entries.length, 3);
  assert.equal(r.text, 'Sent brochure');
  assert.equal(r.call.channel, 'whatsapp');
  assert.equal(r.call.result, 'Follow Up');
});

test('plain typed note appended after logs wins as latest text', () => {
  const r = parseFollowUpNote(`[2026-11-14 10:00] [Call • Interested • 95s] Wants 3BR\n${SYNC}\nAsked to call back after Friday`);
  assert.equal(r.text, 'Asked to call back after Friday');
  assert.equal(r.call.result, 'No Answer');
});

test('"Call outcome logged" placeholder is not shown as text', () => {
  const r = parseFollowUpNote('[2026-11-15 12:00] [Call • Busy • 0s] Call outcome logged');
  assert.equal(r.text, null);
  assert.equal(formatCallChip(r.call), 'Busy · 0s');
});

test('duration formatting over a minute', () => {
  assert.equal(formatCallChip({ result: 'interested', seconds: 95, channel: 'call' }), 'Interested · 1m 35s');
  assert.equal(formatCallChip({ result: 'answered', seconds: 120, channel: 'call' }), 'Answered · 2m');
});
