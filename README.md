# us-equity-market-calendar

The **NYSE / NASDAQ** trading calendar — holidays (including Good Friday and Juneteenth), **1:00 p.m. early closes**, trading-day navigation, and a DST-aware **is-market-open**. Algorithmic, zero dependencies — every past and future year is correct.

```
npm install us-equity-market-calendar
```

## Why

Python has `pandas_market_calendars`; JavaScript had no maintained equivalent. Existing npm packages give you federal holidays or a stale hard-coded list, but not the *equity* calendar with its early closes and session hours. This computes it from the rules, so it's right for any year.

```ts
import { isTradingDay, nextTradingDay, isMarketOpen, sessionClose } from "us-equity-market-calendar";

isTradingDay("2026-10-12");   // true  — Columbus Day: stocks trade (bonds don't)
isTradingDay("2026-04-03");   // false — Good Friday: stocks closed (bonds don't)

nextTradingDay("2026-07-02"); // "2026-07-06" — skips the Jul 3 holiday + weekend
sessionClose("2026-12-24");   // "13:00" — Christmas Eve early close
isMarketOpen(new Date());     // true/false, DST-correct
```

## API

Dates are `"YYYY-MM-DD"` strings or `Date` objects (UTC calendar dates).

- **`getHolidays(year)`** → `{ date, name }[]` — full closures.
- **`getEarlyCloses(year)`** → `{ date, name, closeTimeET: "13:00" }[]`.
- **`isHoliday(date)`** / **`isEarlyClose(date)`** → the entry or `null`.
- **`isTradingDay(date)`** — weekday and not a full closure.
- **`nextTradingDay` / `previousTradingDay` / `addTradingDays(date, n)` / `countTradingDays(from, to)`**.
- **`sessionClose(date)`** → `"16:00" | "13:00" | null`.
- **`isMarketOpen(instant?)`** — is the regular session (09:30–16:00 ET, 13:00 on early closes) open at a `Date`, with America/New_York DST handled via the built-in `Intl` API.

Out-of-range years and malformed dates throw `RangeError`.

## Correctness

Full-closure and early-close output is verified against the **published NYSE calendar for 2025–2028** — including Good Friday, the Juneteenth start in 2022, the Saturday-New-Year non-observance rule, and the exact early-close pattern (e.g. no July 3 early close in 2026 because it's the observed Independence Day). The rules are algorithmic (nth-weekday, Easter computus, weekend observance), so the same logic extends to any year; intraday open/close is checked across both EST and EDT.

## Related

The bond-market counterpart is [`sifma-holidays`](https://github.com/moshejs/sifma-holidays) (Columbus/Veterans Day closes, 2 p.m. early closes, T+1 settlement). Part of a markets toolkit: [`fx-value-date`](https://github.com/moshejs/fx-value-date) · [`32nds`](https://github.com/moshejs/32nds) · [`day-count`](https://github.com/moshejs/day-count) · [`newyorkfed`](https://github.com/moshejs/newyorkfed).

## Author

Built by **[Moshe Malka](https://moshemalka.com)** — engineering leader in New York City. Studio work at [Quentin.Code](https://www.quentin.software/).

MIT © Moshe Malka
