import { describe, expect, it } from "vitest";
import {
  addTradingDays,
  countTradingDays,
  getEarlyCloses,
  getHolidays,
  isEarlyClose,
  isHoliday,
  isMarketOpen,
  isTradingDay,
  nextTradingDay,
  previousTradingDay,
  sessionClose,
} from "../src/index.js";

// Authoritative NYSE full-closure dates (nyse.com published calendar).
const NYSE_HOLIDAYS: Record<number, string[]> = {
  2025: [
    "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26",
    "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
  ],
  2026: [
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
    "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  ],
  2027: [
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
    "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  ],
  2028: [
    // New Year's Day 2028-01-01 is a Saturday → NOT observed
    "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19",
    "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25",
  ],
};

// Authoritative NYSE 1 p.m. early closes.
const NYSE_EARLY: Record<number, string[]> = {
  2025: ["2025-07-03", "2025-11-28", "2025-12-24"],
  2026: ["2026-11-27", "2026-12-24"], // no July 3 (it's the observed holiday)
  2027: ["2027-11-26"], // no Christmas Eve (Dec 24 is observed Christmas); July 4 is Sunday
  2028: ["2028-07-03", "2028-11-24"], // Dec 24 is a Sunday → no early close
};

describe("full-closure holidays reproduce the published NYSE calendar", () => {
  for (const year of [2025, 2026, 2027, 2028]) {
    it(`${year}`, () => {
      expect(getHolidays(year).map((h) => h.date)).toEqual(NYSE_HOLIDAYS[year]);
    });
  }

  it("closes on Good Friday but NOT on Columbus/Veterans Day (unlike the bond market)", () => {
    expect(isHoliday("2026-04-03")?.name).toBe("Good Friday");
    expect(isHoliday("2026-10-12")).toBeNull(); // Columbus Day — market open
    expect(isHoliday("2026-11-11")).toBeNull(); // Veterans Day — market open
    expect(isTradingDay("2026-10-12")).toBe(true);
  });

  it("New Year's Day on a Saturday is not observed (2028)", () => {
    expect(isHoliday("2028-01-01")).toBeNull();
    expect(getHolidays(2028).some((h) => h.name === "New Year's Day")).toBe(false);
  });

  it("has no Juneteenth before 2022", () => {
    expect(getHolidays(2021).some((h) => h.name === "Juneteenth")).toBe(false);
    expect(getHolidays(2022).some((h) => h.name === "Juneteenth")).toBe(true);
  });
});

describe("early closes reproduce the published NYSE calendar", () => {
  for (const year of [2025, 2026, 2027, 2028]) {
    it(`${year}`, () => {
      expect(getEarlyCloses(year).map((e) => e.date)).toEqual(NYSE_EARLY[year]);
    });
  }

  it("early-close days are trading days closing at 13:00", () => {
    expect(isTradingDay("2026-12-24")).toBe(true);
    expect(isEarlyClose("2026-12-24")?.closeTimeET).toBe("13:00");
    expect(sessionClose("2026-12-24")).toBe("13:00");
    expect(sessionClose("2026-12-23")).toBe("16:00");
    expect(sessionClose("2026-12-25")).toBeNull(); // holiday
  });
});

describe("trading-day navigation", () => {
  it("skips weekends and holidays", () => {
    // Fri 2026-07-02 → next trading day skips the Jul 3 holiday + weekend
    expect(nextTradingDay("2026-07-02")).toBe("2026-07-06");
    expect(previousTradingDay("2026-07-06")).toBe("2026-07-02");
    expect(isTradingDay("2026-07-03")).toBe(false); // Independence Day observed
    expect(isTradingDay("2026-07-04")).toBe(false); // Saturday
  });

  it("adds trading days forward and backward", () => {
    expect(addTradingDays("2026-07-02", 1)).toBe("2026-07-06");
    expect(addTradingDays("2026-07-06", -1)).toBe("2026-07-02");
    expect(addTradingDays("2026-01-02", 0)).toBe("2026-01-02");
  });

  it("counts trading days across a holiday week", () => {
    // 2026-07-01 (Wed) … 2026-07-07 (Tue): Wed,Thu open; Fri holiday; wknd; Mon,Tue open = 4
    expect(countTradingDays("2026-07-01", "2026-07-07")).toBe(4);
  });
});

describe("intraday open/closed (US-Eastern, DST-aware)", () => {
  it("open during regular hours, closed before/after", () => {
    // 2026-03-17 is a normal Tuesday. 14:30 UTC = 10:30 EDT → open.
    expect(isMarketOpen(new Date("2026-03-17T14:30:00Z"))).toBe(true);
    // 13:00 UTC = 09:00 EDT → before the open
    expect(isMarketOpen(new Date("2026-03-17T13:00:00Z"))).toBe(false);
    // 21:00 UTC = 17:00 EDT → after the close
    expect(isMarketOpen(new Date("2026-03-17T21:00:00Z"))).toBe(false);
  });

  it("handles the 09:30 open and 16:00 close boundaries (EDT)", () => {
    expect(isMarketOpen(new Date("2026-03-17T13:30:00Z"))).toBe(true); // 09:30 EDT exactly
    expect(isMarketOpen(new Date("2026-03-17T13:29:00Z"))).toBe(false); // 09:29
    expect(isMarketOpen(new Date("2026-03-17T20:00:00Z"))).toBe(false); // 16:00 EDT (closed)
  });

  it("handles standard time (EST) in winter", () => {
    // 2026-01-06 Tuesday. 15:00 UTC = 10:00 EST → open.
    expect(isMarketOpen(new Date("2026-01-06T15:00:00Z"))).toBe(true);
    // 14:00 UTC = 09:00 EST → closed
    expect(isMarketOpen(new Date("2026-01-06T14:00:00Z"))).toBe(false);
  });

  it("respects the 13:00 early close", () => {
    // 2026-12-24 early close. 18:30 UTC = 13:30 EST → closed (past 13:00).
    expect(isMarketOpen(new Date("2026-12-24T18:30:00Z"))).toBe(false);
    // 17:00 UTC = 12:00 EST → open
    expect(isMarketOpen(new Date("2026-12-24T17:00:00Z"))).toBe(true);
  });

  it("closed on weekends and holidays", () => {
    expect(isMarketOpen(new Date("2026-07-04T15:00:00Z"))).toBe(false); // Saturday
    expect(isMarketOpen(new Date("2026-12-25T15:00:00Z"))).toBe(false); // Christmas
  });
});

describe("validation", () => {
  it("rejects out-of-range years and malformed dates", () => {
    expect(() => getHolidays(1800)).toThrow(RangeError);
    expect(() => isTradingDay("2026-7-4")).toThrow(RangeError);
    expect(() => isTradingDay("2026-02-30")).toThrow(RangeError);
    expect(() => addTradingDays("2026-01-02", 1.5)).toThrow(RangeError);
    expect(() => isMarketOpen(new Date("nope"))).toThrow(RangeError);
  });
});
