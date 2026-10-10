/**
 * us-equity-market-calendar — the NYSE / NASDAQ trading calendar.
 *
 * Full-closure holidays (including Good Friday, and Juneteenth from 2022),
 * early-close half-days, weekend observance, unscheduled closures (presidential
 * days of mourning, 9/11, Hurricane Sandy, …), and session-aware open/closed
 * queries with US-Eastern DST handling. Zero dependencies.
 *
 * Supported years: 1971 (the first year of the Uniform Monday Holiday Act) to
 * 2200. Past years reproduce what the exchange actually did, rule changes and
 * one-off closures included. Future years apply the current rules; closures
 * the exchange has not yet announced cannot be known in advance.
 *
 * This is the STOCK market calendar: it closes on Good Friday (unlike the bond
 * market) and does NOT close on Columbus Day or Veterans Day (unlike the bond
 * market). Regular session 09:30–16:00 ET; early closes end 13:00 ET.
 */

export type DateInput = string | Date;

/** A wall-clock time in US Eastern Time, "HH:MM". */
export type TimeET = string;

export const MIN_YEAR = 1971;
export const MAX_YEAR = 2200;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface YMD {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

function toYMD(input: DateInput, label = "date"): YMD {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new RangeError(`Invalid Date for ${label}`);
    return { y: input.getUTCFullYear(), m: input.getUTCMonth() + 1, d: input.getUTCDate() };
  }
  const m = typeof input === "string" ? DATE_RE.exec(input) : null;
  if (!m) throw new RangeError(`Invalid date for ${label}: "${input}" (expected YYYY-MM-DD)`);
  const ymd = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const check = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  if (
    check.getUTCFullYear() !== ymd.y ||
    check.getUTCMonth() + 1 !== ymd.m ||
    check.getUTCDate() !== ymd.d
  ) {
    throw new RangeError(`Invalid calendar date for ${label}: "${input}"`);
  }
  return ymd;
}

function iso(a: YMD): string {
  return `${String(a.y).padStart(4, "0")}-${String(a.m).padStart(2, "0")}-${String(a.d).padStart(2, "0")}`;
}

function dow(a: YMD): number {
  return new Date(Date.UTC(a.y, a.m - 1, a.d)).getUTCDay(); // 0=Sun … 6=Sat
}

function addDays(a: YMD, n: number): YMD {
  const t = new Date(Date.UTC(a.y, a.m - 1, a.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function nthWeekday(y: number, m: number, weekday: number, n: number): YMD {
  const first = dow({ y, m, d: 1 });
  return { y, m, d: 1 + ((weekday - first + 7) % 7) + (n - 1) * 7 };
}

function lastWeekday(y: number, m: number, weekday: number): YMD {
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = dow({ y, m, d: lastDay });
  return { y, m, d: lastDay - ((last - weekday + 7) % 7) };
}

/** Gregorian Easter Sunday (Meeus/Jones/Butcher). */
function easterSunday(y: number): YMD {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31);
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return { y, m: month, d: day };
}

/**
 * Weekend observance: Saturday holiday → prior Friday, Sunday → next Monday.
 * `isNewYear` applies the NYSE rule that New Year's Day on a Saturday is NOT
 * observed (the Friday before ends an annual accounting period).
 */
function observed(a: YMD, isNewYear = false): YMD | null {
  const w = dow(a);
  if (w === 6) return isNewYear ? null : addDays(a, -1);
  if (w === 0) return addDays(a, 1);
  return a;
}

export interface MarketHoliday {
  date: string;
  name: string;
  /** "regular" for a recurring holiday, "special" for an unscheduled closure. */
  kind: "regular" | "special";
}

export interface EarlyClose {
  date: string;
  name: string;
  /** Session close, US Eastern Time: "13:00" since 1993, "14:00" before. */
  closeTimeET: TimeET;
}

/** Unscheduled full-day closures within the supported range. */
const SPECIAL_CLOSURES: Record<string, string> = {
  "1972-12-28": "Funeral of President Truman",
  "1973-01-25": "Funeral of President Johnson",
  "1977-07-14": "New York City blackout",
  "1985-09-27": "Hurricane Gloria",
  "1994-04-27": "Funeral of President Nixon",
  "2001-09-11": "September 11 attacks",
  "2001-09-12": "September 11 attacks",
  "2001-09-13": "September 11 attacks",
  "2001-09-14": "September 11 attacks",
  "2004-06-11": "Funeral of President Reagan",
  "2007-01-02": "Day of Mourning for President Ford",
  "2012-10-29": "Hurricane Sandy",
  "2012-10-30": "Hurricane Sandy",
  "2018-12-05": "Day of Mourning for President George H. W. Bush",
  "2025-01-09": "Day of Mourning for President Carter",
};

/** Unscheduled early closes within the supported range. */
const SPECIAL_EARLY_CLOSES: Record<string, { name: string; closeTimeET: TimeET }> = {
  "1997-12-26": { name: "Day after Christmas (early close)", closeTimeET: "13:00" },
  "1999-12-31": { name: "New Year's Eve 1999 (early close)", closeTimeET: "13:00" },
  "2003-12-26": { name: "Day after Christmas (early close)", closeTimeET: "13:00" },
};

const JUNETEENTH_FROM = 2022;
const MLK_FROM = 1998;
/** Presidential Election Day was a full closure through 1980. */
const ELECTION_DAY_YEARS = new Set([1972, 1976, 1980]);

function holidaysForYear(year: number): MarketHoliday[] {
  const out: MarketHoliday[] = [];
  const add = (d: YMD | null, name: string) => {
    if (d && d.y === year) out.push({ date: iso(d), name, kind: "regular" });
  };

  add(observed({ y: year, m: 1, d: 1 }, true), "New Year's Day");
  if (year >= MLK_FROM) add(nthWeekday(year, 1, 1, 3), "Martin Luther King Jr. Day");
  add(nthWeekday(year, 2, 1, 3), "Washington's Birthday");
  add(addDays(easterSunday(year), -2), "Good Friday");
  add(lastWeekday(year, 5, 1), "Memorial Day");
  if (year >= JUNETEENTH_FROM) add(observed({ y: year, m: 6, d: 19 }), "Juneteenth");
  add(observed({ y: year, m: 7, d: 4 }), "Independence Day");
  add(nthWeekday(year, 9, 1, 1), "Labor Day");
  if (ELECTION_DAY_YEARS.has(year)) {
    // First Tuesday after the first Monday in November.
    add(addDays(nthWeekday(year, 11, 1, 1), 1), "Election Day");
  }
  add(nthWeekday(year, 11, 4, 4), "Thanksgiving Day");
  add(observed({ y: year, m: 12, d: 25 }), "Christmas Day");

  const prefix = `${year}-`;
  for (const [date, name] of Object.entries(SPECIAL_CLOSURES)) {
    if (date.startsWith(prefix)) out.push({ date, name, kind: "special" });
  }

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

function earlyClosesForYear(year: number, closed: Map<string, MarketHoliday>): EarlyClose[] {
  const out: EarlyClose[] = [];
  const halfDay: TimeET = year >= 1993 ? "13:00" : "14:00";
  const add = (d: YMD, name: string, closeTimeET: TimeET = halfDay) => {
    out.push({ date: iso(d), name, closeTimeET });
  };

  // Day after Thanksgiving: 2 p.m. in 1992, 1 p.m. from 1993.
  if (year >= 1992) add(addDays(nthWeekday(year, 11, 4, 4), 1), "Day after Thanksgiving");

  // Christmas Eve, when it is a Mon–Thu trading day (Christmas falls Tue–Fri).
  const dec25 = dow({ y: year, m: 12, d: 25 });
  if (dec25 >= 2 && dec25 <= 5) add({ y: year, m: 12, d: 24 }, "Christmas Eve (early close)");

  // Around Independence Day, from 1995: July 3 when July 4 is Tue/Wed/Fri.
  // When July 4 is a Thursday the half-day was Friday July 5 until 2012 and
  // has been Wednesday July 3 since 2013.
  if (year >= 1995) {
    const jul4 = dow({ y: year, m: 7, d: 4 });
    if (jul4 === 4 && year < 2013) {
      add({ y: year, m: 7, d: 5 }, "Day after Independence Day (early close)");
    } else if (jul4 >= 2 && jul4 <= 5) {
      add({ y: year, m: 7, d: 3 }, "Independence Day (early close)");
    }
  }

  const prefix = `${year}-`;
  for (const [date, e] of Object.entries(SPECIAL_EARLY_CLOSES)) {
    if (date.startsWith(prefix)) out.push({ date, ...e });
  }

  // An unscheduled full closure overrides a scheduled half-day.
  const result = out.filter((e) => !closed.has(e.date));
  result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return result;
}

interface YearData {
  holidays: MarketHoliday[];
  early: EarlyClose[];
  holidayByDate: Map<string, MarketHoliday>;
  earlyByDate: Map<string, EarlyClose>;
}

const yearCache = new Map<number, YearData>();

function checkYear(year: number): void {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new RangeError(`Year out of supported range (${MIN_YEAR}–${MAX_YEAR}): ${year}`);
  }
}

function yearData(year: number): YearData {
  let data = yearCache.get(year);
  if (!data) {
    checkYear(year);
    const holidays = holidaysForYear(year);
    const holidayByDate = new Map(holidays.map((h) => [h.date, h]));
    const early = earlyClosesForYear(year, holidayByDate);
    data = { holidays, early, holidayByDate, earlyByDate: new Map(early.map((e) => [e.date, e])) };
    yearCache.set(year, data);
  }
  return data;
}

/** All NYSE/NASDAQ full-closure days for a year (holidays and special closures), sorted. */
export function getHolidays(year: number): MarketHoliday[] {
  return yearData(year).holidays.map((h) => ({ ...h }));
}

/** All early-close half-days for a year, sorted by date. */
export function getEarlyCloses(year: number): EarlyClose[] {
  return yearData(year).early.map((e) => ({ ...e }));
}

function isWeekend(a: YMD): boolean {
  const w = dow(a);
  return w === 0 || w === 6;
}

function tradingYMD(a: YMD): boolean {
  return !isWeekend(a) && !yearData(a.y).holidayByDate.has(iso(a));
}

/** The full-closure entry for a date, or null. */
export function isHoliday(date: DateInput): MarketHoliday | null {
  const a = toYMD(date);
  const h = yearData(a.y).holidayByDate.get(iso(a));
  return h ? { ...h } : null;
}

/** The early-close entry for a date, or null. Early-close days ARE trading days. */
export function isEarlyClose(date: DateInput): EarlyClose | null {
  const a = toYMD(date);
  const e = yearData(a.y).earlyByDate.get(iso(a));
  return e ? { ...e } : null;
}

/** True when the market trades that day: a weekday that is not a full closure. */
export function isTradingDay(date: DateInput): boolean {
  return tradingYMD(toYMD(date));
}

function stepTradingDay(a: YMD, step: 1 | -1): YMD {
  let cur = addDays(a, step);
  while (!tradingYMD(cur)) cur = addDays(cur, step);
  return cur;
}

/** The next trading day strictly after `date`. */
export function nextTradingDay(date: DateInput): string {
  return iso(stepTradingDay(toYMD(date), 1));
}

/** The previous trading day strictly before `date`. */
export function previousTradingDay(date: DateInput): string {
  return iso(stepTradingDay(toYMD(date), -1));
}

/**
 * Move `n` trading days from `date` (n may be negative). Each step lands on a
 * trading day; n = 0 returns `date` unchanged even if it is not a trading day.
 */
export function addTradingDays(date: DateInput, n: number): string {
  if (!Number.isInteger(n)) throw new RangeError(`n must be an integer, got ${n}`);
  let cur = toYMD(date);
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0; left--) cur = stepTradingDay(cur, step);
  return iso(cur);
}

function eachDay(from: DateInput, to: DateInput, visit: (a: YMD) => void): void {
  let a = toYMD(from, "from");
  const b = toYMD(to, "to");
  const end = iso(b);
  if (iso(a) > end) throw new RangeError("`from` must be on or before `to`");
  for (; iso(a) <= end; a = addDays(a, 1)) visit(a);
}

/** Every trading day in [from, to], both ends inclusive. */
export function getTradingDays(from: DateInput, to: DateInput): string[] {
  const out: string[] = [];
  eachDay(from, to, (a) => {
    if (tradingYMD(a)) out.push(iso(a));
  });
  return out;
}

/** The number of trading days in [from, to], both ends inclusive. */
export function countTradingDays(from: DateInput, to: DateInput): number {
  let count = 0;
  eachDay(from, to, (a) => {
    if (tradingYMD(a)) count++;
  });
  return count;
}

// --- Session hours ---

function regularOpen(a: YMD): TimeET {
  return iso(a) < "1985-09-30" ? "10:00" : "09:30";
}

function regularClose(a: YMD): TimeET {
  return iso(a) < "1974-10-01" ? "15:30" : "16:00";
}

function closeFor(a: YMD): TimeET {
  return yearData(a.y).earlyByDate.get(iso(a))?.closeTimeET ?? regularClose(a);
}

/**
 * The session open time for a trading day, in ET: "09:30" (10:00 before
 * 1985-09-30). Returns null on a non-trading day.
 */
export function sessionOpen(date: DateInput): TimeET | null {
  const a = toYMD(date);
  return tradingYMD(a) ? regularOpen(a) : null;
}

/**
 * The session close time for a trading day, in ET: "16:00" normally (15:30
 * before 1974-10-01), "13:00" on an early-close half-day ("14:00" before 1993).
 * Returns null on a non-trading day.
 */
export function sessionClose(date: DateInput): TimeET | null {
  const a = toYMD(date);
  return tradingYMD(a) ? closeFor(a) : null;
}

// --- US-Eastern time conversion via the built-in Intl API ---

interface ETParts extends YMD {
  hour: number;
  minute: number;
}

let easternFormat: Intl.DateTimeFormat | undefined;

function toEasternParts(instant: Date): ETParts {
  easternFormat ??= new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = easternFormat.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

/** Minutes Eastern Time is ahead of UTC at instant `t` (−300 EST, −240 EDT). */
function easternOffset(t: number): number {
  const minute = Math.floor(t / 60000) * 60000;
  const p = toEasternParts(new Date(minute));
  return (Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute) - minute) / 60000;
}

/** The instant at which the ET wall clock reads `time` on day `a`. */
function easternInstant(a: YMD, time: TimeET): Date {
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(a.y, a.m - 1, a.d, hh, mm);
  let t = wall - easternOffset(wall) * 60000;
  t = wall - easternOffset(t) * 60000; // correct when the guess straddles a DST switch
  return new Date(t);
}

function toMinutes(time: TimeET): number {
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  return hh * 60 + mm;
}

export interface Session {
  date: string;
  /** Session open as an absolute instant. */
  open: Date;
  /** Session close as an absolute instant. */
  close: Date;
  openET: TimeET;
  closeET: TimeET;
  earlyClose: boolean;
}

function sessionFor(a: YMD): Session {
  const openET = regularOpen(a);
  const closeET = closeFor(a);
  return {
    date: iso(a),
    open: easternInstant(a, openET),
    close: easternInstant(a, closeET),
    openET,
    closeET,
    earlyClose: yearData(a.y).earlyByDate.has(iso(a)),
  };
}

/** The regular session for a trading day (open/close as instants), or null. */
export function getSession(date: DateInput): Session | null {
  const a = toYMD(date);
  return tradingYMD(a) ? sessionFor(a) : null;
}

function checkInstant(instant: Date, fn: string): void {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new RangeError(`${fn} requires a valid Date`);
  }
}

/**
 * Is the regular equity session open at the given instant? Regular hours are
 * 09:30–16:00 ET (until 13:00 on early-close days). DST is handled via the
 * America/New_York time zone.
 */
export function isMarketOpen(instant: Date = new Date()): boolean {
  checkInstant(instant, "isMarketOpen");
  const et = toEasternParts(instant);
  if (!tradingYMD(et)) return false;
  const minutes = et.hour * 60 + et.minute;
  return minutes >= toMinutes(regularOpen(et)) && minutes < toMinutes(closeFor(et));
}

/** The next session open strictly after `instant`. */
export function nextMarketOpen(instant: Date = new Date()): Date {
  checkInstant(instant, "nextMarketOpen");
  const et = toEasternParts(instant);
  const day: YMD = { y: et.y, m: et.m, d: et.d };
  if (tradingYMD(day)) {
    const open = easternInstant(day, regularOpen(day));
    if (open.getTime() > instant.getTime()) return open;
  }
  const next = stepTradingDay(day, 1);
  return easternInstant(next, regularOpen(next));
}

/**
 * The next session close strictly after `instant`: today's close while the
 * market is open (or before today's open), otherwise the next session's close.
 */
export function nextMarketClose(instant: Date = new Date()): Date {
  checkInstant(instant, "nextMarketClose");
  const et = toEasternParts(instant);
  const day: YMD = { y: et.y, m: et.m, d: et.d };
  if (tradingYMD(day)) {
    const close = easternInstant(day, closeFor(day));
    if (close.getTime() > instant.getTime()) return close;
  }
  const next = stepTradingDay(day, 1);
  return easternInstant(next, closeFor(next));
}
