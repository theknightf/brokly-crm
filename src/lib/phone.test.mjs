// Run: node --experimental-strip-types --test src/lib/phone.test.mjs   (Node 22.6+; flag not needed on 23.6+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storablePhone, isInternationalPhone, countryCodeOfPhone } from './phone.ts';

// What gets saved
const storable = [
  // international typed without "+": the "+" is added
  ['966500318426', '+966500318426'], // Saudi
  ['971 50 776 9714', '+971507769714'], // UAE with spaces
  ['96598933880', '+96598933880'], // Kuwait
  ['447920866157', '+447920866157'], // UK
  ['19175936411', '+19175936411'], // US
  ['+971507769714', '+971507769714'],
  ['00971507769714', '+971507769714'],
  // Egyptian numbers keep their national form
  ['01012345678', '01012345678'],
  ['1012345678', '01012345678'],
  ['201012345678', '01012345678'],
  ['+20 101 234 5678', '01012345678'],
  // too short / ambiguous: kept as typed, never turned into a country code
  ['501234567', '501234567'], // 9 digits: a local UAE number, not Belize (+501)
  ['22345678', '22345678'],
  ['', ''],
];
for (const [input, expected] of storable) {
  test(`storablePhone ${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => assert.equal(storablePhone(input), expected));
}

// Which numbers get the "International" tag
const intl = [
  ['+966500318426', true],
  ['966500318426', true],
  ['00971507769714', true],
  ['19175936411', true],
  ['01012345678', false],
  ['1012345678', false],
  ['+201012345678', false],
  ['201012345678', false],
  ['0222345678', false],
  ['', false],
];
for (const [input, expected] of intl) {
  test(`isInternationalPhone ${JSON.stringify(input)} -> ${expected}`, () => assert.equal(isInternationalPhone(input), expected));
}

test('country code', () => {
  assert.equal(countryCodeOfPhone('+966500318426'), '966');
  assert.equal(countryCodeOfPhone('96598933880'), '965');
  assert.equal(countryCodeOfPhone('+447920866157'), '44');
  assert.equal(countryCodeOfPhone('+19175936411'), '1');
  assert.equal(countryCodeOfPhone('01012345678'), null);
});
