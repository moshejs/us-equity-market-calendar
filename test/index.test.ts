import { describe, expect, it } from "vitest";
import {
  addTradingDays,
  countTradingDays,
  getEarlyCloses,
  getHolidays,
  getSession,
  getTradingDays,
  isEarlyClose,
  isHoliday,
  isMarketOpen,
  isTradingDay,
  MAX_YEAR,
  MIN_YEAR,
  nextMarketClose,
  nextMarketOpen,
  nextTradingDay,
  previousTradingDay,
  sessionClose,
  sessionOpen,
} from "../src/index.js";
import { EARLY_CLOSES, TRADING_DAYS_PER_YEAR } from "./fixtures.js";

// Authoritative NYSE full-closure dates (nyse.com published calendar, plus the
// 2025-01-09 Day of Mourning for President Carter announced afterwards).
const NYSE_HOLIDAYS: Record<number, string[]> = {
  2025: [
    "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26",
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

describe("history matches an independent reference calendar (1971–2040)", () => {
  it("trading-day count for every year", () => {
    for (let y = 1971; y <= 2040; y++) {
      expect([y, countTradingDays(`${y}-01-01`, `${y}-12-31`)]).toEqual([y, TRADING_DAYS_PER_YEAR[y]]);
    }
  });

  it("every early close and its close time", () => {
    const ours: Record<string, string> = {};
    for (let y = 1971; y <= 2040; y++) {
      for (const e of getEarlyCloses(y)) ours[e.date] = e.closeTimeET;
    }
    expect(ours).toEqual(EARLY_CLOSES);
  });
});

describe("historical rules and special closures", () => {
  it("includes unscheduled closures as special holidays", () => {
    expect(isHoliday("2025-01-09")).toEqual({
      date: "2025-01-09",
      name: "Day of Mourning for President Carter",
      kind: "special",
    });
    expect(getHolidays(2001).filter((h) => h.kind === "special").map((h) => h.date)).toEqual([
      "2001-09-11", "2001-09-12", "2001-09-13", "2001-09-14",
    ]);
    expect(isTradingDay("2012-10-29")).toBe(false); // Hurricane Sandy
    expect(nextTradingDay("2025-01-08")).toBe("2025-01-10");
  });

  it("observes MLK Day only from 1998 and Election Day only through 1980", () => {
    expect(isTradingDay("1997-01-20")).toBe(true);
    expect(isHoliday("1998-01-19")?.name).toBe("Martin Luther King Jr. Day");
    expect(isHoliday("1980-11-04")?.name).toBe("Election Day");
    expect(isTradingDay("1984-11-06")).toBe(true);
  });

  it("moved the Thursday-July-4 half-day from July 5 to July 3 in 2013", () => {
    expect(isEarlyClose("2002-07-05")?.closeTimeET).toBe("13:00");
    expect(isEarlyClose("2002-07-03")).toBeNull();
    expect(isEarlyClose("2013-07-03")?.closeTimeET).toBe("13:00");
    expect(isEarlyClose("1991-07-03")).toBeNull(); // before 1995: no July half-day
  });

  it("closed at 14:00 on half-days before 1993", () => {
    expect(sessionClose("1991-12-24")).toBe("14:00");
    expect(sessionClose("1996-12-24")).toBe("13:00");
  });

  it("models the historical session hours", () => {
    expect(sessionOpen("1985-09-27")).toBeNull(); // Hurricane Gloria
    expect(sessionOpen("1985-09-26")).toBe("10:00");
    expect(sessionOpen("1985-09-30")).toBe("09:30");
    expect(sessionClose("1974-09-30")).toBe("15:30");
    expect(sessionClose("1974-10-01")).toBe("16:00");
  });
});

describe("sessions as instants", () => {
  it("returns open/close instants across DST", () => {
    expect(getSession("2026-03-06")).toMatchObject({
      open: new Date("2026-03-06T14:30:00Z"), // EST
      close: new Date("2026-03-06T21:00:00Z"),
      earlyClose: false,
    });
    expect(getSession("2026-03-09")).toMatchObject({
      open: new Date("2026-03-09T13:30:00Z"), // EDT, the Monday after the switch
      close: new Date("2026-03-09T20:00:00Z"),
    });
    expect(getSession("2026-11-27")).toMatchObject({
      close: new Date("2026-11-27T18:00:00Z"),
      closeET: "13:00",
      earlyClose: true,
    });
    expect(getSession("2026-11-26")).toBeNull();
  });

  it("finds the next open and close", () => {
    // Before Tuesday's open → today's open.
    expect(nextMarketOpen(new Date("2026-03-17T12:00:00Z"))).toEqual(new Date("2026-03-17T13:30:00Z"));
    // During the session → next open is tomorrow; next close is today.
    expect(nextMarketOpen(new Date("2026-03-17T15:00:00Z"))).toEqual(new Date("2026-03-18T13:30:00Z"));
    expect(nextMarketClose(new Date("2026-03-17T15:00:00Z"))).toEqual(new Date("2026-03-17T20:00:00Z"));
    // Thursday evening before the Good Friday weekend → Monday.
    expect(nextMarketOpen(new Date("2026-04-02T22:00:00Z"))).toEqual(new Date("2026-04-06T13:30:00Z"));
    // After the 13:00 close on Christmas Eve → next session's close is Dec 28.
    expect(nextMarketClose(new Date("2026-12-24T19:00:00Z"))).toEqual(new Date("2026-12-28T21:00:00Z"));
  });

  it("lists trading days in a range", () => {
    expect(getTradingDays("2026-07-01", "2026-07-07")).toEqual([
      "2026-07-01", "2026-07-02", "2026-07-06", "2026-07-07",
    ]);
  });
});

describe("validation", () => {
  it("rejects out-of-range years and malformed dates", () => {
    expect(() => getHolidays(1800)).toThrow(RangeError);
    expect(() => getHolidays(MIN_YEAR - 1)).toThrow(RangeError);
    expect(() => isTradingDay("1960-01-04")).toThrow(RangeError); // every query is range-checked
    expect(() => nextTradingDay(`${MAX_YEAR}-12-31`)).toThrow(RangeError);
    expect(() => isTradingDay("2026-7-4")).toThrow(RangeError);
    expect(() => isTradingDay("2026-02-30")).toThrow(RangeError);
    expect(() => addTradingDays("2026-01-02", 1.5)).toThrow(RangeError);
    expect(() => isMarketOpen(new Date("nope"))).toThrow(RangeError);
    expect(() => countTradingDays("2026-02-01", "2026-01-01")).toThrow(RangeError);
  });
});
