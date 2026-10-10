# us-equity-market-calendar

The **NYSE / NASDAQ** trading calendar — holidays (including Good Friday and Juneteenth), **1:00 p.m. early closes**, unscheduled closures (days of mourning, 9/11, Hurricane Sandy), trading-day navigation, and DST-aware session times. Zero dependencies, accurate from 1971 onward.

```
npm install us-equity-market-calendar
```

## Why

Python has `pandas_market_calendars`; JavaScript had no maintained equivalent. Existing npm packages give you federal holidays or a stale hard-coded list, but not the *equity* calendar with its early closes and session hours. This computes it from the rules, including the years the rules changed, so historical backtests and future scheduling both get the right answer.

```ts
import { isTradingDay, nextTradingDay, isMarketOpen, sessionClose, nextMarketOpen } from "us-equity-market-calendar";

isTradingDay("2026-10-12");   // true  — Columbus Day: stocks trade (bonds don't)
isTradingDay("2026-04-03");   // false — Good Friday: stocks closed (bonds don't)

nextTradingDay("2026-07-02"); // "2026-07-06" — skips the Jul 3 holiday + weekend
sessionClose("2026-12-24");   // "13:00" — Christmas Eve early close
isTradingDay("2025-01-09");   // false — Day of Mourning for President Carter
isMarketOpen(new Date());     // true/false, DST-correct
nextMarketOpen();             // Date of the next 09:30 ET bell
```

## API

Dates are `"YYYY-MM-DD"` strings or `Date` objects. A `Date` passed as a *date* is read by its **UTC** calendar day; build one with `new Date("2026-07-02")` or `Date.UTC(...)`, not `new Date(2026, 6, 2)`, which is local midnight and can land on the previous UTC day east of Greenwich. Functions that take an *instant* (`isMarketOpen`, `nextMarketOpen`, `nextMarketClose`) convert it to New York time themselves.

**Calendar**

- **`getHolidays(year)`** → `{ date, name, kind }[]`, every full closure. `kind` is `"regular"` for a recurring holiday or `"special"` for an unscheduled closure.
- **`getEarlyCloses(year)`** → `{ date, name, closeTimeET }[]`. `closeTimeET` is `"13:00"` (`"14:00"` before 1993).
- **`isHoliday(date)`** / **`isEarlyClose(date)`** → the entry or `null`.
- **`isTradingDay(date)`**: a weekday that is not a full closure.
- **`nextTradingDay` / `previousTradingDay` / `addTradingDays(date, n)`**.
- **`getTradingDays(from, to)`** / **`countTradingDays(from, to)`**: both ends inclusive.

**Sessions**

- **`sessionOpen(date)`** / **`sessionClose(date)`** → `"HH:MM"` ET, or `null` on a non-trading day.
- **`getSession(date)`** → `{ date, open, close, openET, closeET, earlyClose }` with `open`/`close` as `Date` instants, or `null`.
- **`isMarketOpen(instant?)`**: whether the regular session is open at that instant.
- **`nextMarketOpen(instant?)`** / **`nextMarketClose(instant?)`** → the next bell strictly after `instant` (default: now).

America/New_York DST is handled through the built-in `Intl` API. Only the regular session is modeled; pre-market and after-hours sessions are not.

Supported years are `MIN_YEAR` (1971) to `MAX_YEAR` (2200). Every function throws `RangeError` for a date outside that range or a malformed one.

## Correctness

- **1971 to today** reproduces what the NYSE actually did:
  - **Rule changes**: MLK Day from 1998, Juneteenth from 2022, Election Day closures through 1980, 2 p.m. half-days before 1993, July half-days from 1995, and the move of the Thursday-July-4 half-day from July 5 to July 3 in 2013.
  - **Session hours**: a 3:30 p.m. close until October 1974 and a 10:00 a.m. open until September 1985.
  - **Every unscheduled closure and early close**: presidential funerals and days of mourning, the 1977 blackout, Hurricanes Gloria and Sandy, and 9/11.
- **Cross-checked**: every trading day and early-close time from 1971 to 2040 is tested against [`exchange_calendars`](https://github.com/gerrymanoim/exchange_calendars), an independent implementation. The 2025–2028 output also matches the NYSE's published calendar.
- **Future years** apply today's rules. A closure the exchange hasn't announced yet (such as a day of mourning) can't be known in advance, so upgrade when one is announced.

## Related

The bond-market counterpart is [`sifma-holidays`](https://github.com/moshejs/sifma-holidays) (Columbus/Veterans Day closes, 2 p.m. early closes, T+1 settlement). Part of a markets toolkit: [`fx-value-date`](https://github.com/moshejs/fx-value-date) · [`32nds`](https://github.com/moshejs/32nds) · [`day-count`](https://github.com/moshejs/day-count) · [`newyorkfed`](https://github.com/moshejs/newyorkfed).

## Author

Built by **[Moshe Malka](https://moshemalka.com)** — engineering leader in New York City. Studio work at [Quentin.Code](https://www.quentin.software/).

MIT © Moshe Malka
