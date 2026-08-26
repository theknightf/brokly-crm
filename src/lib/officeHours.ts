// Shared helpers to derive concrete office-hour values (grid hours, late
// tolerance, shift window) from the configurable WorkingHours setting stored
// in company_settings ('workingHours', edited in Admin → Payroll → Working
// Hours & Payroll Rules). Every attendance/report surface falls back to the
// default Cairo office 12:00–20:00 with a 30-minute grace when no setting
// exists, keeping the old behavior identical until an owner changes it.

export interface OfficeHoursConfig {
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  graceMinutes: number;
  /** start + grace — arrival after this wall-clock minute counts as late. */
  toleranceMinutes: number;
  flexibleHours: boolean;
  /** Whole hours from start..end inclusive (used for the per-hour grid). */
  officeHours: number[];
}

const DEFAULT_START = '12:00';
const DEFAULT_END = '20:00';
const DEFAULT_GRACE = 30;

export function toMinutes(time: string | undefined | null): number {
  if (!time) return -1;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return -1;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return -1;
  return h * 60 + min;
}

export function formatMinutes(total: number): string {
  const c = Math.max(0, Math.round(total));
  const h = Math.floor(c / 60) % 24;
  const m = c % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildOfficeHours(
  wh:
    | {
        start?: string | null;
        end?: string | null;
        lateGraceMinutes?: number | null;
        flexibleHours?: boolean | null;
      }
    | null
    | undefined
): OfficeHoursConfig {
  const start = wh?.start || DEFAULT_START;
  const end = wh?.end || DEFAULT_END;
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  const grace = Number(wh?.lateGraceMinutes ?? DEFAULT_GRACE);

  const officeHours: number[] = [];
  if (startMinutes >= 0 && endMinutes >= 0 && endMinutes >= startMinutes) {
    for (let h = Math.floor(startMinutes / 60); h <= Math.floor(endMinutes / 60); h++) {
      officeHours.push(h);
    }
  }
  if (officeHours.length === 0) {
    for (let h = 12; h <= 20; h++) officeHours.push(h);
  }

  return {
    start,
    end,
    startMinutes,
    endMinutes,
    graceMinutes: grace,
    toleranceMinutes:
      startMinutes >= 0 ? startMinutes + grace : toMinutes(DEFAULT_START) + DEFAULT_GRACE,
    flexibleHours: !!wh?.flexibleHours,
    officeHours,
  };
}

/**
 * Reads the working-hours setting through a Supabase client (server or
 * browser). Falls back to the default office hours on any failure so callers
 * never need to handle errors.
 */
export async function loadOfficeHours(supabase: {
  from: (table: string) => any;
}): Promise<OfficeHoursConfig> {
  try {
    const { data } = await supabase
      .from('company_settings')
      .select('value')
      .eq('key', 'workingHours')
      .maybeSingle();
    return buildOfficeHours(data?.value);
  } catch {
    return buildOfficeHours(null);
  }
}
