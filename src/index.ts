/**
 * us-equity-market-calendar — the NYSE / NASDAQ trading calendar.
 *
 * Full-closure holidays (including Good Friday and Juneteenth from 2022),
 * 1:00 p.m. early-close half-days, weekend observance, and session-aware
 * open/closed queries with US-Eastern DST handling. Zero dependencies — the
 * holiday rules are algorithmic, so every past and future year is correct.
 *
 * This is the STOCK market calendar: it closes on Good Friday (unlike the bond
 * market) and does NOT close on Columbus Day or Veterans Day (unlike the bond
 * market). Regular session 09:30–16:00 ET; early closes end 13:00 ET.
 */

export type DateInput = string | Date;

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
  const m = DATE_RE.exec(input);
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
 * `nyNewYear` applies the NYSE special rule that New Year's Day on a Saturday
 * is NOT observed.
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
}

export interface EarlyClose {
  date: string;
  name: string;
  /** Session close, US Eastern Time. Equity early closes are 13:00. */
  closeTimeET: "13:00";
}

const JUNETEENTH_FROM = 2022;

function holidaysForYear(year: number): MarketHoliday[] {
  const items: (MarketHoliday | null)[] = [];
  const add = (d: YMD | null, name: string) => {
    if (d && d.y === year) items.push({ date: iso(d), name });
  };

  // Fixed-date holidays with weekend observance.
  add(observed({ y: year, m: 1, d: 1 }, true), "New Year's Day");
  add(nthWeekday(year, 1, 1, 3), "Martin Luther King Jr. Day");
  add(nthWeekday(year, 2, 1, 3), "Washington's Birthday");
  add(addDays(easterSunday(year), -2), "Good Friday");
  add(lastWeekday(year, 5, 1), "Memorial Day");
  if (year >= JUNETEENTH_FROM) add(observed({ y: year, m: 6, d: 19 }), "Juneteenth");
  add(observed({ y: year, m: 7, d: 4 }), "Independence Day");
  add(nthWeekday(year, 9, 1, 1), "Labor Day");
  add(nthWeekday(year, 11, 4, 4), "Thanksgiving Day");
  add(observed({ y: year, m: 12, d: 25 }), "Christmas Day");

  // New Year's of the following year can be observed back into December
  // (Jan 1 on Sunday → Mon; never back into the prior year, so nothing to add).

  const out = items.filter((h): h is MarketHoliday => h !== null);
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

function earlyClosesForYear(year: number): EarlyClose[] {
  const out: EarlyClose[] = [];

  // Day after Thanksgiving — always a 1 p.m. close.
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  out.push({ date: iso(addDays(thanksgiving, 1)), name: "Day after Thanksgiving", closeTimeET: "13:00" });

  // Day before Independence Day / Christmas — early close iff the holiday
  // falls Tue–Fri (so the prior day is Mon–Thu, a real trading day, and the
  // holiday itself is a weekday full closure, not weekend-observed).
  const jul4 = dow({ y: year, m: 7, d: 4 });
  if (jul4 >= 2 && jul4 <= 5) {
    out.push({ date: iso({ y: year, m: 7, d: 3 }), name: "Independence Day (early close)", closeTimeET: "13:00" });
  }
  const dec25 = dow({ y: year, m: 12, d: 25 });
  if (dec25 >= 2 && dec25 <= 5) {
    out.push({ date: iso({ y: year, m: 12, d: 24 }), name: "Christmas Eve (early close)", closeTimeET: "13:00" });
  }

  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

const holidayCache = new Map<number, Map<string, string>>();
const earlyCache = new Map<number, Map<string, EarlyClose>>();

function holidayMap(year: number): Map<string, string> {
  let m = holidayCache.get(year);
  if (!m) {
    m = new Map(holidaysForYear(year).map((h) => [h.date, h.name]));
    holidayCache.set(year, m);
  }
  return m;
}

function earlyMap(year: number): Map<string, EarlyClose> {
  let m = earlyCache.get(year);
  if (!m) {
    m = new Map(earlyClosesForYear(year).map((e) => [e.date, e]));
    earlyCache.set(year, m);
  }
  return m;
}

function checkYear(year: number): void {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new RangeError(`Year out of supported range (1900–2200): ${year}`);
  }
}

/** All NYSE/NASDAQ full-closure holidays for a year, sorted by date. */
export function getHolidays(year: number): MarketHoliday[] {
  checkYear(year);
  return holidaysForYear(year);
}

/** All 1 p.m. early-close half-days for a year, sorted by date. */
export function getEarlyCloses(year: number): EarlyClose[] {
  checkYear(year);
  return earlyClosesForYear(year);
}

function isWeekend(a: YMD): boolean {
  const w = dow(a);
  return w === 0 || w === 6;
}

/** The holiday entry for a date, or null. */
export function isHoliday(date: DateInput): MarketHoliday | null {
  const a = toYMD(date);
  const name = holidayMap(a.y).get(iso(a));
  return name ? { date: iso(a), name } : null;
}

/** The early-close entry for a date, or null. Early-close days ARE trading days. */
export function isEarlyClose(date: DateInput): EarlyClose | null {
  const a = toYMD(date);
  return earlyMap(a.y).get(iso(a)) ?? null;
}

/** True when the market trades that day: a weekday that is not a full closure. */
export function isTradingDay(date: DateInput): boolean {
  const a = toYMD(date);
  return !isWeekend(a) && !holidayMap(a.y).has(iso(a));
}

/** The next trading day strictly after `date`. */
export function nextTradingDay(date: DateInput): string {
  let cur = addDays(toYMD(date), 1);
  while (!isTradingDay(iso(cur))) cur = addDays(cur, 1);
  return iso(cur);
}

/** The previous trading day strictly before `date`. */
export function previousTradingDay(date: DateInput): string {
  let cur = addDays(toYMD(date), -1);
  while (!isTradingDay(iso(cur))) cur = addDays(cur, -1);
  return iso(cur);
}

/** Add `n` trading days (n may be negative; 0 returns the date unchanged). */
export function addTradingDays(date: DateInput, n: number): string {
  if (!Number.isInteger(n)) throw new RangeError(`n must be an integer, got ${n}`);
  let cur = toYMD(date);
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0; left--) {
    cur = addDays(cur, step);
    while (!isTradingDay(iso(cur))) cur = addDays(cur, step);
  }
  return iso(cur);
}

/** Count trading days in [from, to] inclusive of neither endpoint's non-trading days. */
export function countTradingDays(from: DateInput, to: DateInput): number {
  let a = toYMD(from);
  const b = toYMD(to);
  if (iso(a) > iso(b)) throw new RangeError("`from` must be on or before `to`");
  let count = 0;
  while (iso(a) <= iso(b)) {
    if (isTradingDay(iso(a))) count++;
    a = addDays(a, 1);
  }
  return count;
}

/**
 * The regular-session close time for a trading day, in ET: "16:00" normally,
 * "13:00" on an early-close half-day. Returns null on a non-trading day.
 */
export function sessionClose(date: DateInput): "16:00" | "13:00" | null {
  if (!isTradingDay(date)) return null;
  return isEarlyClose(date) ? "13:00" : "16:00";
}

// --- Intraday open/closed with US-Eastern DST via the built-in Intl API ---

interface ETParts {
  y: number;
  m: number;
  d: number;
  hour: number;
  minute: number;
}

function toEasternParts(instant: Date): ETParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  return { y: get("year"), m: get("month"), d: get("day"), hour, minute: get("minute") };
}

/**
 * Is the regular equity session open at the given instant? Regular hours are
 * 09:30–16:00 ET (until 13:00 on early-close days). DST is handled via the
 * America/New_York time zone.
 */
export function isMarketOpen(instant: Date = new Date()): boolean {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new RangeError("isMarketOpen requires a valid Date");
  }
  const et = toEasternParts(instant);
  const dateStr = iso({ y: et.y, m: et.m, d: et.d });
  if (!isTradingDay(dateStr)) return false;
  const minutes = et.hour * 60 + et.minute;
  const open = 9 * 60 + 30;
  const close = isEarlyClose(dateStr) ? 13 * 60 : 16 * 60;
  return minutes >= open && minutes < close;
}
