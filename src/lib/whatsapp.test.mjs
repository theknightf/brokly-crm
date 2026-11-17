// Run: node --experimental-strip-types --test src/lib/whatsapp.test.mjs   (Node 22.6+; flag not needed on 23.6+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEgyptPhone } from './whatsapp.ts';

const cases = [
  // Egyptian numbers keep getting Egypt's 20
  ['01012345678', '201012345678'],
  ['+20 101 234 5678', '201012345678'],
  ['201012345678', '201012345678'],
  ['1012345678', '201012345678'],
  ['0222345678', '20222345678'], // Cairo landline
  ['20862328404', '20862328404'], // Egyptian landline already with the code
  ['0020 101 234 5678', '201012345678'],
  // International numbers must NOT get 20 (the bug: stored without a "+")
  ['966500318426', '966500318426'], // Saudi
  ['971507769714', '971507769714'], // UAE
  ['96598933880', '96598933880'], // Kuwait
  ['97433010580', '97433010580'], // Qatar
  ['447920866157', '447920866157'], // UK
  ['19175936411', '19175936411'], // US
  ['+971 50 776 9714', '971507769714'],
  ['00971507769714', '971507769714'],
  ['+1 (917) 593-6411', '19175936411'],
  // Empty / junk
  ['', ''],
  [null, ''],
  ['abc', ''],
];

for (const [input, expected] of cases) {
  test(`${JSON.stringify(input)} -> ${expected}`, () => {
    assert.equal(sanitizeEgyptPhone(input), expected);
  });
}
