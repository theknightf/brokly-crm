import type { Unit } from '../types';

export const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

const round1 = (x: number) => Math.round(x * 10) / 10;

/** kg (storage) -> display unit */
export const toDisplay = (kg: number, unit: Unit) => (unit === 'kg' ? round1(kg) : round1(kg / KG_PER_LB));
/** display unit -> kg (storage) */
export const fromDisplay = (v: number, unit: Unit) => (unit === 'kg' ? v : v * KG_PER_LB);
export const weightStep = (unit: Unit) => (unit === 'kg' ? 2.5 : 5);

export const lenUnit = (unit: Unit) => (unit === 'kg' ? 'cm' : 'in');
export const lenToDisplay = (cm: number, unit: Unit) => (unit === 'kg' ? round1(cm) : round1(cm / CM_PER_IN));
export const lenFromDisplay = (v: number, unit: Unit) => (unit === 'kg' ? v : v * CM_PER_IN);

export const fmtWeight = (kg: number, unit: Unit) => `${toDisplay(kg, unit)} ${unit}`;
