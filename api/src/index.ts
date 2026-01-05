export interface Env {
  DB: D1Database;
  APP_SECRET: string;
}

/* -------------------- utils -------------------- */

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
    ...init,
  });

const bad = (msg: string, status = 400) => json({ error: msg }, { status });

function requireSecret(req: Request, env: Env) {
  const provided = req.headers.get("x-app-secret") || "";
  if (!env.APP_SECRET || env.APP_SECRET.length < 16) return; // dev-friendly
  if (provided !== env.APP_SECRET) throw new Error("unauthorized");
}

function nowIso() {
  return new Date().toISOString();
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

/* -------------------- preferences -------------------- */

type StructurePref = "naked" | "spreads";
type WheelPref = "naked" | "spreads" | "auto";

type ReportPreferences = {
  directional_structure: StructurePref; // default naked
  wheel_structure_preference: WheelPref; // default naked unless requested
  mode: "directional" | "wheel" | "both"; // default both
};

function defaultPrefs(): ReportPreferences {
  return {
    directional_structure: "naked",
    wheel_structure_preference: "naked",
    mode: "both",
  };
}

/**
 * Very simple “AI prompt” parsing:
 * - If prompt includes "spread" => allow spreads for directional
 * - If prompt includes "wheel" => enable wheel context
 * - If prompt includes "wheel spreads" or "spreads for wheel" => wheel spreads
 * - Otherwise defaults: directional naked, wheel naked
 */
function parsePrefsFromPrompt(promptRaw?: string): ReportPreferences {
  const prefs = defaultPrefs();
  const prompt = (promptRaw || "").toLowerCase();

  const wantsWheel = /\bwheel\b/.test(prompt) || /\bcsp\b/.test(prompt) || /\bcc\b/.test(prompt);
  const wantsSpreads = /\bspread(s)?\b/.test(prompt) || /\bdebit spread\b/.test(prompt) || /\bcredit spread\b/.test(prompt);

  if (wantsWheel) prefs.mode = "both"; // wheel context becomes available

  // Directional default naked; only flip if explicitly asked
  if (wantsSpreads && !wantsWheel) prefs.directional_structure = "spreads";

  // Wheel structure: you choose at evaluation time
  if (wantsWheel) {
    prefs.wheel_structure_preference = "naked";
    if (wantsSpreads) prefs.wheel_structure_preference = "spreads";
  }

  // If prompt says "naked only" enforce naked everywhere
  if (/\bnaked\b/.test(prompt) && /\bonly\b/.test(prompt)) {
    prefs.directional_structure = "naked";
    prefs.wheel_structure_preference = "naked";
  }

  // If prompt says "auto" for wheel
  if (wantsWheel && /\bauto\b/.test(prompt)) {
    prefs.wheel_structure_preference = "auto";
  }

  return prefs;
}

/* -------------------- OHLCV (Stooq) -------------------- */

type OHLCV = { date: string; open: number; high: number; low: number; close: number; volume: number };

function toNum(x: string) {
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Stooq daily CSV endpoint pattern:
 *   https://stooq.com/q/d/l/?s=aapl.us&i=d
 */
async function fetchOHLCV_StooqDaily(symbol: string, bars = 260): Promise<OHLCV[]> {
  const stooqSym = `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d`;

  const res = await fetch(url, {
    headers: {
      "user-agent": "trader-hub/1.0",
      "accept": "text/csv,*/*",
    },
  });

  if (!res.ok) throw new Error(`stooq_fetch_failed ${res.status}`);
  const csv = await res.text();

  // CSV header: Date,Open,High,Low,Close,Volume
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 5) throw new Error("stooq_no_data");

  const out: OHLCV[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 6) continue;
    const date = parts[0];
    const o = toNum(parts[1]);
    const h = toNum(parts[2]);
    const l = toNum(parts[3]);
    const c = toNum(parts[4]);
    const v = toNum(parts[5]);
    if (!date || [o, h, l, c, v].some((n) => !Number.isFinite(n))) continue;
    out.push({ date, open: o, high: h, low: l, close: c, volume: v });
  }

  // Ensure ascending
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out.slice(Math.max(0, out.length - bars));
}

/* -------------------- indicators -------------------- */

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function trueRange(prevClose: number, high: number, low: number): number {
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

// Wilder ATR
function atrWilder(bars: OHLCV[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array(bars.length).fill(null);
  if (bars.length < period + 1) return out;

  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    tr.push(trueRange(bars[i - 1].close, bars[i].high, bars[i].low));
  }

  // first ATR is SMA of first `period` TR values
  let first = 0;
  for (let i = 0; i < period; i++) first += tr[i];
  first /= period;

  out[period] = first;

  // Wilder smoothing
  let prev = first;
  for (let i = period + 1; i < bars.length; i++) {
    const trVal = tr[i - 1];
    const next = (prev * (period - 1) + trVal) / period;
    out[i] = next;
    prev = next;
  }
  return out;
}

// Wilder RSI
function rsiWilder(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;

  let gain = 0;
  let loss = 0;

  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch;
    else loss += -ch;
  }

  gain /= period;
  loss /= period;

  const rs = loss === 0 ? Infinity : gain / loss;
  out[period] = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;

    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;

    const rs2 = loss === 0 ? Infinity : gain / loss;
    out[i] = 100 - 100 / (1 + rs2);
  }

  return out;
}

function avg(values: number[]): number {
  if (!values.length) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pickLiquidityGrade(avgDollarVol20: number, atrPct: number) {
  if (avgDollarVol20 >= 50_000_000 && atrPct >= 0.01 && atrPct <= 0.08) return "A";
  if (avgDollarVol20 >= 20_000_000 && atrPct >= 0.01 && atrPct <= 0.12) return "B";
  return "C";
}

// Pivot detection (simple): lowest low / highest high within ±lookback
function pivots(bars: OHLCV[], lookback = 3) {
  const lows: { i: number; date: string; price: number }[] = [];
  const highs: { i: number; date: string; price: number }[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const lo = bars[i].low;
    const hi = bars[i].high;

    let isLow = true;
    let isHigh = true;

    for (let k = i - lookback; k <= i + lookback; k++) {
      if (k === i) continue;
      if (bars[k].low <= lo) isLow = false;
      if (bars[k].high >= hi) isHigh = false;
      if (!isLow && !isHigh) break;
    }
    if (isLow) lows.push({ i, date: bars[i].date, price: lo });
    if (isHigh) highs.push({ i, date: bars[i].date, price: hi });
  }
  return { lows, highs };
}

/* -------------------- TA modules (v1) -------------------- */

type Gap = {
  date: string;
  type: "gap_up" | "gap_down";
  prev_close: number;
  open: number;
  zone_low: number;
  zone_high: number;
  size_pct: number;
  status: "unfilled" | "partial" | "filled";
};

function detectGaps(bars: OHLCV[], lookForwardBars = 40): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1];
    const cur = bars[i];

    const gapUp = cur.open > prev.high;
    const gapDown = cur.open < prev.low;
    if (!gapUp && !gapDown) continue;

    const zone_low = gapUp ? prev.high : cur.high;
    const zone_high = gapUp ? cur.low : prev.low;
    if (zone_high <= zone_low) continue;

    const size_pct = Math.abs(cur.open - prev.close) / prev.close;

    // Determine fill status within forward window
    let status: Gap["status"] = "unfilled";
    const end = Math.min(bars.length - 1, i + lookForwardBars);
    for (let k = i; k <= end; k++) {
      const b = bars[k];
      const tradedLow = b.low <= zone_high && b.high >= zone_low;
      const fullyFilled = gapUp ? b.low <= zone_low : b.high >= zone_high;

      if (tradedLow) status = "partial";
      if (fullyFilled) {
        status = "filled";
        break;
      }
    }

    gaps.push({
      date: cur.date,
      type: gapUp ? "gap_up" : "gap_down",
      prev_close: prev.close,
      open: cur.open,
      zone_low,
      zone_high,
      size_pct,
      status,
    });
  }
  return gaps.slice(-10);
}

type CandlePattern =
  | "doji"
  | "hammer"
  | "shooting_star"
  | "bull_engulf"
  | "bear_engulf"
  | "inside_day"
  | "outside_day";

function detectCandlePatterns(bars: OHLCV[]): Array<{ date: string; pattern: CandlePattern; note?: string }> {
  const out: Array<{ date: string; pattern: CandlePattern; note?: string }> = [];
  for (let i = 1; i < bars.length; i++) {
    const p = bars[i - 1];
    const c = bars[i];

    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range <= 0) continue;

    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    // doji
    if (body / range < 0.12) out.push({ date: c.date, pattern: "doji" });

    // hammer / shooting star
    if (body / range < 0.35) {
      if (lowerWick / range > 0.55 && upperWick / range < 0.2) out.push({ date: c.date, pattern: "hammer" });
      if (upperWick / range > 0.55 && lowerWick / range < 0.2) out.push({ date: c.date, pattern: "shooting_star" });
    }

    // engulfing
    const pBodyLow = Math.min(p.open, p.close);
    const pBodyHigh = Math.max(p.open, p.close);
    const cBodyLow = Math.min(c.open, c.close);
    const cBodyHigh = Math.max(c.open, c.close);

    const bullEngulf = c.close > c.open && p.close < p.open && cBodyLow <= pBodyLow && cBodyHigh >= pBodyHigh;
    const bearEngulf = c.close < c.open && p.close > p.open && cBodyLow <= pBodyLow && cBodyHigh >= pBodyHigh;

    if (bullEngulf) out.push({ date: c.date, pattern: "bull_engulf" });
    if (bearEngulf) out.push({ date: c.date, pattern: "bear_engulf" });

    // inside / outside day
    if (c.high <= p.high && c.low >= p.low) out.push({ date: c.date, pattern: "inside_day" });
    if (c.high >= p.high && c.low <= p.low) out.push({ date: c.date, pattern: "outside_day" });
  }
  return out.slice(-12);
}

type MASweep = { date: string; ma: "sma20" | "sma50"; type: "bull_sweep" | "bear_sweep" };

function detectMASweeps(bars: OHLCV[], sma20: (number|null)[], sma50: (number|null)[]): MASweep[] {
  const out: MASweep[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const m20 = sma20[i];
    const m50 = sma50[i];

    if (m20) {
      if (b.low < m20 && b.close > m20) out.push({ date: b.date, ma: "sma20", type: "bull_sweep" });
      if (b.high > m20 && b.close < m20) out.push({ date: b.date, ma: "sma20", type: "bear_sweep" });
    }
    if (m50) {
      if (b.low < m50 && b.close > m50) out.push({ date: b.date, ma: "sma50", type: "bull_sweep" });
      if (b.high > m50 && b.close < m50) out.push({ date: b.date, ma: "sma50", type: "bear_sweep" });
    }
  }
  return out.slice(-10);
}

type RSIDiv = { type: "bullish" | "bearish" | "none"; strength: number; pivot_dates: string[] };

function detectRSIDivergence(
  bars: OHLCV[],
  rsi: (number|null)[],
  lookback = 3
): RSIDiv {
  const { lows, highs } = pivots(bars, lookback);

  const last2Lows = lows.slice(-2);
  const last2Highs = highs.slice(-2);

  let best: RSIDiv = { type: "none", strength: 0, pivot_dates: [] };

  if (last2Lows.length === 2) {
    const a = last2Lows[0], b = last2Lows[1];
    const rA = rsi[a.i], rB = rsi[b.i];
    if (rA && rB && b.price < a.price && rB > rA) {
      let strength = 1;
      if (Math.abs(rB - rA) >= 5) strength++;
      if (bars.length - 1 - b.i <= 20) strength++;
      best = { type: "bullish", strength, pivot_dates: [a.date, b.date] };
    }
  }

  if (last2Highs.length === 2) {
    const a = last2Highs[0], b = last2Highs[1];
    const rA = rsi[a.i], rB = rsi[b.i];
    if (rA && rB && b.price > a.price && rB < rA) {
      let strength = 1;
      if (Math.abs(rB - rA) >= 5) strength++;
      if (bars.length - 1 - b.i <= 20) strength++;
      const cand: RSIDiv = { type: "bearish", strength, pivot_dates: [a.date, b.date] };
      if (cand.strength > best.strength) best = cand;
    }
  }

  return best;
}

type FVG = { created_date: string; type: "bullish" | "bearish"; zone_low: number; zone_high: number; rebalanced: boolean };

function detectFVG(bars: OHLCV[], lookForward = 40): FVG[] {
  const out: FVG[] = [];
  for (let i = 2; i < bars.length; i++) {
    const c1 = bars[i - 2];
    const c3 = bars[i];

    // Bullish
    if (c3.low > c1.high) {
      const zone_low = c1.high;
      const zone_high = c3.low;
      let rebalanced = false;
      const end = Math.min(bars.length - 1, i + lookForward);
      for (let k = i; k <= end; k++) {
        if (bars[k].low <= zone_high && bars[k].high >= zone_low) { rebalanced = true; break; }
      }
      out.push({ created_date: c3.date, type: "bullish", zone_low, zone_high, rebalanced });
    }

    // Bearish
    if (c3.high < c1.low) {
      const zone_low = c3.high;
      const zone_high = c1.low;
      let rebalanced = false;
      const end = Math.min(bars.length - 1, i + lookForward);
      for (let k = i; k <= end; k++) {
        if (bars[k].low <= zone_high && bars[k].high >= zone_low) { rebalanced = true; break; }
      }
      out.push({ created_date: c3.date, type: "bearish", zone_low, zone_high, rebalanced });
    }
  }
  return out.slice(-12);
}

type OrderBlock = { created_date: string; type: "bullish" | "bearish"; zone_low: number; zone_high: number; tapped: boolean };

function detectOrderBlocks(bars: OHLCV[], atr: (number|null)[], avgVol20: number[]): OrderBlock[] {
  const out: OrderBlock[] = [];
  for (let i = 21; i < bars.length; i++) {
    const b = bars[i];
    const a = atr[i];
    if (!a) continue;

    const tr = b.high - b.low;
    const vol = b.volume;
    const volBase = avgVol20[i] || 0;

    const displacement = tr >= 1.5 * a && volBase > 0 && vol >= 1.5 * volBase;
    if (!displacement) continue;

    const isBull = b.close > b.open;
    // last opposite candle before displacement
    let j = i - 1;
    while (j >= 0) {
      const c = bars[j];
      const opp = isBull ? (c.close < c.open) : (c.close > c.open);
      if (opp) {
        const zone_low = Math.min(c.open, c.close);
        const zone_high = Math.max(c.open, c.close);
        // tapped?
        let tapped = false;
        for (let k = i; k < Math.min(bars.length, i + 40); k++) {
          const x = bars[k];
          if (x.low <= zone_high && x.high >= zone_low) { tapped = true; break; }
        }
        out.push({ created_date: b.date, type: isBull ? "bullish" : "bearish", zone_low, zone_high, tapped });
        break;
      }
      j--;
    }
  }
  return out.slice(-10);
}

type Fib = {
  anchor: { from: number; to: number; from_date: string; to_date: string } | null;
  retracements: Array<{ level: number; price: number }>;
  extensions: Array<{ level: number; price: number }>;
  confluences: Array<{ price: number; reasons: string[] }>;
};

function computeFib(bars: OHLCV[], trendState: string, sma20Last: number|null, sma50Last: number|null, atrLast: number|null): Fib {
  const { lows, highs } = pivots(bars, 5);
  if (!lows.length || !highs.length) return { anchor: null, retracements: [], extensions: [], confluences: [] };

  // pick last meaningful swing based on trend
  let fromP: { date: string; price: number } | null = null;
  let toP: { date: string; price: number } | null = null;

  if (trendState === "uptrend") {
    const lastHigh = highs[highs.length - 1];
    const priorLow = [...lows].reverse().find((x) => x.i < lastHigh.i);
    if (priorLow) { fromP = { date: priorLow.date, price: priorLow.price }; toP = { date: lastHigh.date, price: lastHigh.price }; }
  } else if (trendState === "downtrend") {
    const lastLow = lows[lows.length - 1];
    const priorHigh = [...highs].reverse().find((x) => x.i < lastLow.i);
    if (priorHigh) { fromP = { date: priorHigh.date, price: priorHigh.price }; toP = { date: lastLow.date, price: lastLow.price }; }
  } else {
    const lastHigh = highs[highs.length - 1];
    const lastLow = lows[lows.length - 1];
    if (lastHigh.i > lastLow.i) {
      const priorLow = [...lows].reverse().find((x) => x.i < lastHigh.i);
      if (priorLow) { fromP = { date: priorLow.date, price: priorLow.price }; toP = { date: lastHigh.date, price: lastHigh.price }; }
    } else {
      const priorHigh = [...highs].reverse().find((x) => x.i < lastLow.i);
      if (priorHigh) { fromP = { date: priorHigh.date, price: priorHigh.price }; toP = { date: lastLow.date, price: lastLow.price }; }
    }
  }

  if (!fromP || !toP) return { anchor: null, retracements: [], extensions: [], confluences: [] };

  const from = fromP.price;
  const to = toP.price;
  const dirUp = to > from;
  const move = Math.abs(to - from);

  const retrLevels = [0.382, 0.5, 0.618];
  const extLevels = [1.272, 1.618];

  const retracements = retrLevels.map((lvl) => ({
    level: lvl,
    price: dirUp ? (to - move * lvl) : (to + move * lvl),
  }));

  const extensions = extLevels.map((lvl) => ({
    level: lvl,
    price: dirUp ? (to + move * (lvl - 1)) : (to - move * (lvl - 1)),
  }));

  // confluence: fib near MA within 0.5 ATR
  const confluences: Array<{ price: number; reasons: string[] }> = [];
  const tol = atrLast ? 0.5 * atrLast : 0;
  for (const r of retracements) {
    const reasons: string[] = [];
    if (tol && sma20Last && Math.abs(r.price - sma20Last) <= tol) reasons.push("near_SMA20");
    if (tol && sma50Last && Math.abs(r.price - sma50Last) <= tol) reasons.push("near_SMA50");
    if (reasons.length) confluences.push({ price: r.price, reasons: ["fib_retracement", ...reasons] });
  }

  return {
    anchor: { from, to, from_date: fromP.date, to_date: toP.date },
    retracements,
    extensions,
    confluences,
  };
}

/* -------------------- RSS ingest -------------------- */
/**
 * Starter pack feeds.
 * Some feeds change over time; remove any that break.
 */
const RSS_FEEDS: Array<{ url: string; source: string }> = [
  { url: "https://seekingalpha.com/market_currents.xml", source: "SeekingAlpha Market Currents" },
  { url: "https://seekingalpha.com/earnings/earnings.xml", source: "SeekingAlpha Earnings" },
  { url: "https://feeds.marketwatch.com/marketwatch/marketpulse/", source: "MarketWatch Market Pulse" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC Top News" },
  { url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&CIK=&type=&company=&dateb=&owner=include&start=0&count=40&output=atom", source: "SEC EDGAR Current Filings (Atom)" },
  { url: "https://www.benzinga.com/news/feed", source: "Benzinga News" },
  { url: "https://www.benzinga.com/stock/option_activity/feed", source: "Benzinga Options Activity" },
];

async function fetchText(url: string) {
  const res = await fetch(url, { headers: { "user-agent": "trader-hub/1.0" } });
  if (!res.ok) throw new Error(`fetch failed ${res.status} for ${url}`);
  return res.text();
}

// best-effort RSS/Atom parsing via regex (v1)
function parseFeedItems(xml: string): Array<{ title: string; link: string; pubDate?: string; description?: string }> {
  const items: Array<{ title: string; link: string; pubDate?: string; description?: string }> = [];

  // RSS <item>
  const rssBlocks = xml.split(/<item>/i).slice(1);
  for (const blk of rssBlocks) {
    const title =
      (blk.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/is)?.[1] ??
        blk.match(/<title>(.*?)<\/title>/is)?.[1] ??
        "").trim();
    const link = (blk.match(/<link>(.*?)<\/link>/is)?.[1] ?? "").trim();
    const pubDate = (blk.match(/<pubDate>(.*?)<\/pubDate>/is)?.[1] ?? "").trim();
    const description =
      (blk.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/is)?.[1] ??
        blk.match(/<description>(.*?)<\/description>/is)?.[1] ??
        "").trim();

    if (title && link) items.push({ title, link, pubDate, description });
  }

  // Atom <entry>
  const atomBlocks = xml.split(/<entry>/i).slice(1);
  for (const blk of atomBlocks) {
    const title = (blk.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] ?? "").trim();
    const updated = (blk.match(/<updated>(.*?)<\/updated>/is)?.[1] ?? "").trim();
    const summary = (blk.match(/<summary[^>]*>(.*?)<\/summary>/is)?.[1] ?? "").trim();
    const link = (blk.match(/<link[^>]*href="([^"]+)"/is)?.[1] ?? "").trim();
    if (title && link) items.push({ title, link, pubDate: updated, description: summary });
  }

  return items;
}

function cleanHtml(s: string) {
  return (s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// crude ticker extraction
function tryExtractSymbol(headline: string) {
  const m1 = headline.match(/\(([A-Z]{1,5})\)/);
  if (m1) return m1[1];
  const m2 = headline.match(/\b([A-Z]{1,5}):/);
  if (m2) return m2[1];
  return null;
}

// simple tag scoring
function scoreAndTags(headline: string, summary: string) {
  const text = `${headline} ${summary || ""}`.toLowerCase();
  const tags: string[] = [];

  const tagRules: Array<[string, string[]]> = [
    ["earnings", ["earnings", "eps", "guidance"]],
    ["merger", ["acquire", "acquisition", "merger", "buyout"]],
    ["offering", ["offering", "dilution", "secondary", "atm program"]],
    ["analyst", ["upgrade", "downgrade", "price target", "pt raised", "pt cut"]],
    ["regulatory", ["sec", "doj", "ftc", "investigation", "lawsuit", "settlement"]],
    ["macro", ["cpi", "jobs report", "fed", "rates", "inflation"]],
    ["energy", ["oil", "opec", "crude"]],
    ["geopolitics", ["sanction", "tariff", "war", "missile", "china", "taiwan"]],
    ["options_flow_proxy", ["options activity", "sweep", "unusual options"]],
  ];

  for (const [tag, words] of tagRules) if (words.some((w) => text.includes(w))) tags.push(tag);

  let score = 0;
  if (tags.includes("earnings")) score += 30;
  if (tags.includes("merger")) score += 40;
  if (tags.includes("offering")) score += 25;
  if (tags.includes("regulatory")) score += 20;
  if (tags.includes("macro")) score += 15;
  if (tags.includes("options_flow_proxy")) score += 20;
  if (text.includes("breaking")) score += 20;

  score = Math.min(100, score);
  return { score, tags };
}

async function stableIdFromLink(link: string) {
  const enc = new TextEncoder().encode(link);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(hash)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function upsertAlert(env: Env, it: { title: string; link: string; pubDate?: string; description?: string }, source: string) {
  const id = await stableIdFromLink(it.link);
  const created_at = it.pubDate ? new Date(it.pubDate).toISOString() : nowIso();
  const summary = cleanHtml(it.description || "").slice(0, 700);
  const symbol = tryExtractSymbol(it.title);

  const { score, tags } = scoreAndTags(it.title, summary);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO alerts (id, created_at, symbol, headline, summary, source, url, tags, score, alert_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'rss')`
  )
    .bind(id, created_at, symbol, it.title, summary, source, it.link, JSON.stringify(tags), score)
    .run();
}

/* -------------------- DB helpers -------------------- */

async function getCachedTickerReport(env: Env, symbol: string, asof: string, reportType: string) {
  return env.DB.prepare(
    `SELECT * FROM ticker_reports
     WHERE symbol = ? AND asof_date = ? AND report_type = ?
     ORDER BY datetime(created_at) DESC LIMIT 1`
  ).bind(symbol, asof, reportType).first<any>();
}

async function saveTickerReport(env: Env, symbol: string, asof: string, reportType: string, prefs: ReportPreferences, payload: any) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO ticker_reports (id, symbol, asof_date, report_type, preferences_json, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, symbol, asof, reportType, JSON.stringify(prefs), JSON.stringify(payload), nowIso())
    .run();
  return id;
}

async function saveWeeklyReport(env: Env, asof: string, prefs: ReportPreferences, payload: any) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO weekly_reports (id, asof_date, preferences_json, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, asof, JSON.stringify(prefs), JSON.stringify(payload), nowIso())
    .run();
  return id;
}

async function getLatestWeeklyReport(env: Env, asof: string) {
  return env.DB.prepare(
    `SELECT * FROM weekly_reports WHERE asof_date = ? ORDER BY datetime(created_at) DESC LIMIT 1`
  ).bind(asof).first<any>();
}

/* -------------------- daily report generator -------------------- */

async function generateDailyOutlookReport(env: Env, symbol: string, asof: string, prefs: ReportPreferences) {
  const bars = await fetchOHLCV_StooqDaily(symbol, 260);

  if (bars.length < 60) {
    throw new Error("not_enough_ohlcv_history");
  }

  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume);

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const atr14 = atrWilder(bars, 14);
  const rsi14 = rsiWilder(closes, 14);

  const last = bars[bars.length - 1];
  const lastClose = last.close;

  const lastSma20 = sma20[bars.length - 1];
  const lastSma50 = sma50[bars.length - 1];
  const lastSma200 = sma200[bars.length - 1];
  const lastAtr14 = atr14[bars.length - 1];
  const lastRsi14 = rsi14[bars.length - 1];

  // avgVol20 series for OB detection
  const avgVol20Series: number[] = Array(bars.length).fill(0);
  {
    const vSma = sma(vols, 20);
    for (let i = 0; i < bars.length; i++) avgVol20Series[i] = (vSma[i] ?? 0) as number;
  }

  // Liquidity (20-day avg dollar volume)
  const last20 = bars.slice(-20);
  const avgDollarVol20 = avg(last20.map((b) => b.close * b.volume));
  const atrPct = lastAtr14 && lastClose ? (lastAtr14 as number) / lastClose : NaN;
  const liqGrade = Number.isFinite(avgDollarVol20) && Number.isFinite(atrPct) ? pickLiquidityGrade(avgDollarVol20, atrPct) : null;

  // Trend state
  let trendState: "uptrend" | "downtrend" | "range" | "unknown" = "unknown";
  if (lastSma50 && sma50[bars.length - 11]) {
    const slopeUp = (lastSma50 as number) > (sma50[bars.length - 11] as number);
    if (lastClose > (lastSma50 as number) && slopeUp) trendState = "uptrend";
    else if (lastClose < (lastSma50 as number) && !slopeUp) trendState = "downtrend";
    else trendState = "range";
  }

  // Key levels from pivots (take recent 3 highs/lows)
  const { lows, highs } = pivots(bars, 3);
  const recentLows = lows.slice(-3).map((p) => ({ date: p.date, price: p.price }));
  const recentHighs = highs.slice(-3).map((p) => ({ date: p.date, price: p.price }));

  const gaps = detectGaps(bars);
  const candles = detectCandlePatterns(bars);
  const sweeps = detectMASweeps(bars, sma20, sma50);
  const div = detectRSIDivergence(bars, rsi14, 3);
  const fvgs = detectFVG(bars);
  const obs = detectOrderBlocks(bars, atr14, avgVol20Series);
  const fib = computeFib(bars, trendState, lastSma20 ?? null, lastSma50 ?? null, lastAtr14 ?? null);

  // Expected range next day = ±1 ATR (with v1 scaling rules)
  let atrMult = 1.0;
  if (Number.isFinite(atrPct) && atrPct > 0.08) atrMult = 0.8;
  if (Number.isFinite(atrPct) && atrPct < 0.02) atrMult = 1.2;

  const rangeLow = lastAtr14 ? lastClose - (lastAtr14 as number) * atrMult : null;
  const rangeHigh = lastAtr14 ? lastClose + (lastAtr14 as number) * atrMult : null;

  // News context: from stored alerts last 7d
  const newsRows = await env.DB.prepare(
    `SELECT headline, summary, tags, score, url, created_at
     FROM alerts
     WHERE symbol = ? AND datetime(created_at) >= datetime(?, '-7 days')
     ORDER BY datetime(created_at) DESC
     LIMIT 20`
  ).bind(symbol, asof).all();

  const notable_items = (newsRows.results || []).map((r: any) => ({
    created_at: r.created_at,
    headline: r.headline,
    url: r.url,
    score: r.score,
    tags: (() => { try { return JSON.parse(r.tags || "[]"); } catch { return []; } })(),
  }));

  const tagCounts = new Map<string, number>();
  for (const item of notable_items) for (const t of (item.tags || [])) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  const top_tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);

  // Bias score
  let score = 0;
  if (lastSma50) score += lastClose > (lastSma50 as number) ? 15 : -15;
  if (lastSma200) score += lastClose > (lastSma200 as number) ? 10 : -10;
  if (lastRsi14) score += (lastRsi14 as number) > 50 ? 10 : (lastRsi14 as number) < 50 ? -10 : 0;

  if (div.type === "bullish") score += 5 * div.strength;
  if (div.type === "bearish") score -= 5 * div.strength;

  for (const s of sweeps.slice(-3)) {
    if (s.type === "bull_sweep") score += 5;
    if (s.type === "bear_sweep") score -= 5;
  }

  if (fib.confluences.length) score += 5;
  if (liqGrade === "C") score -= 10;

  // light news score influence
  const newsScoreBoost = notable_items.slice(0, 10).reduce((acc: number, it: any) => acc + (Number(it.score) || 0), 0) / 50;
  score += Math.round(newsScoreBoost);

  const bias = score >= 20 ? "bullish" : score <= -20 ? "bearish" : "neutral";
  const confidence = bias === "neutral" ? 3 : liqGrade === "A" ? 4 : 3;

  const nearestSupport = recentLows.length ? recentLows[recentLows.length - 1].price : null;
  const nearestRes = recentHighs.length ? recentHighs[recentHighs.length - 1].price : null;

  const payload = {
    symbol,
    asof_date: asof,
    timeframe: "tomorrow",
    preferences: prefs,
    data_source: { ohlcv: "stooq_daily_csv", news: ["RSS(stored_alerts)"] },

    liquidity: {
      avg_dollar_vol_20: Math.round(avgDollarVol20),
      atr14: lastAtr14 ?? null,
      atr_pct: Number.isFinite(atrPct) ? atrPct : null,
      grade: liqGrade,
    },

    trend: {
      sma20: lastSma20 ?? null,
      sma50: lastSma50 ?? null,
      sma200: lastSma200 ?? null,
      state: trendState,
      notes: [],
    },

    momentum: {
      rsi14: lastRsi14 ?? null,
      rsi_divergence:
        div.type === "none"
          ? { type: "none", strength: 0, pivot_dates: [] }
          : { type: div.type, strength: div.strength, pivot_dates: div.pivot_dates },
    },

    technicals: {
      key_levels: { support: recentLows, resistance: recentHighs },
      gaps,
      ma_sweeps: sweeps,
      candles,
      order_blocks: obs,
      fair_value_gaps: fvgs,
      fibonacci: fib,
    },

    news_context: {
      headline_count_7d: (newsRows.results || []).length,
      top_tags,
      notable_items,
    },

    outlook: {
      bias,
      score,
      confidence_1_5: confidence,
      expected_range_next_day: {
        center: lastClose,
        low: rangeLow,
        high: rangeHigh,
        method: "ATR14",
      },

      scenarios: [
        {
          name: "bull",
          if: nearestRes ? `Break and hold above ~${nearestRes.toFixed(2)} (close above).` : "Break above recent resistance and hold.",
          entry_idea:
            prefs.directional_structure === "naked"
              ? "Default: naked calls on confirmation (risk defined by invalidation level)."
              : "Spreads enabled: use a debit spread on confirmation (risk-defined).",
          invalidation: nearestRes ? `Failed breakout / close back below ~${nearestRes.toFixed(2)}.` : "Close back below breakout level.",
          targets: nearestRes ? [{ price: nearestRes, note: "prior resistance" }] : [],
          risk_notes: top_tags.includes("earnings") ? ["Earnings/guidance risk in recent headlines."] : [],
        },
        {
          name: "bear",
          if: nearestSupport ? `Lose ~${nearestSupport.toFixed(2)} and fail to reclaim.` : "Lose recent support and fail to reclaim.",
          entry_idea:
            prefs.directional_structure === "naked"
              ? "Default: naked puts on confirmation (risk defined by invalidation level)."
              : "Spreads enabled: use a put spread on confirmation (risk-defined).",
          invalidation: nearestSupport ? `Reclaim and close back above ~${nearestSupport.toFixed(2)}.` : "Close back above support.",
          targets: nearestSupport ? [{ price: nearestSupport, note: "prior support" }] : [],
          risk_notes: top_tags.includes("offering") ? ["Offering/dilution language seen recently."] : [],
        },
        {
          name: "chop",
          if: nearestSupport && nearestRes ? `Stays between ~${nearestSupport.toFixed(2)} and ~${nearestRes.toFixed(2)}.` : "Stays range-bound.",
          plan: "Range play / reduce size; avoid forcing directional bets without confirmation.",
          range: { low: nearestSupport, high: nearestRes },
          risk_notes: [],
        },
      ],

      options_lens: {
        directional: {
          default: prefs.directional_structure,
          naked:
            prefs.directional_structure === "naked"
              ? ["Default is naked calls/puts. Use scenario triggers + invalidation to size and exit."]
              : [],
          spreads:
            prefs.directional_structure === "spreads"
              ? ["Spreads enabled by request (risk-defined)."]
              : [],
        },
        wheel: {
          preference: prefs.wheel_structure_preference,
          csp_cc: [
            "Wheel lens: CSP near support when neutral/bullish; CC near resistance when holding shares / neutral.",
          ],
          spreads:
            prefs.wheel_structure_preference !== "naked"
              ? ["Wheel spreads enabled by request (PCS/CCS framing)."]
              : [],
        },
      },
    },
  ,
  signals: buildSignals({
    timeframe: "D",
    bars: (technicals as any)?.ohlcv ?? (technicals as any)?.bars ?? [],
    rsi14: momentum?.rsi14 ?? null,
    rsi_divergence: momentum?.rsi_divergence ?? null,
    key_levels: technicals?.key_levels,
    ma: {
      sma20: trend?.sma20 ?? null,
      sma50: trend?.sma50 ?? null,
      sma200: trend?.sma200 ?? null,
    }
    spot: (technicals as any)?.last_close ?? null,
  })
};

  return payload;
}

/* -------------------- weekly picks generator -------------------- */

async function generateWeeklyPicks(env: Env, asof: string, prefs: ReportPreferences) {
  const wl = await env.DB.prepare(`SELECT DISTINCT symbol FROM watchlist_items`).all();
  const alertSyms = await env.DB.prepare(
    `SELECT symbol, COUNT(*) as n
     FROM alerts
     WHERE symbol IS NOT NULL AND datetime(created_at) >= datetime(?, '-10 days')
     GROUP BY symbol
     ORDER BY n DESC
     LIMIT 60`
  ).bind(asof).all();

  const set = new Set<string>();
  for (const r of (wl.results || [])) set.add(String((r as any).symbol).toUpperCase());
  for (const r of (alertSyms.results || [])) set.add(String((r as any).symbol).toUpperCase());

  const fallback = ["SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL"];
  if (set.size === 0) fallback.forEach((s) => set.add(s));

  const candidates = [...set].slice(0, 60);
  const scored: any[] = [];

  for (const sym of candidates) {
    try {
      const report = await generateDailyOutlookReport(env, sym, asof, prefs);
      const base = report.outlook.score ?? 0;
      const liq = report.liquidity?.grade ?? "C";
      const liqBonus = liq === "A" ? 10 : liq === "B" ? 5 : -10;
      const atrPct = report.liquidity?.atr_pct ?? 0;
      const volPenalty = atrPct > 0.12 ? -10 : 0;

      const newsCount = report.news_context?.headline_count_7d ?? 0;
      const newsBonus = Math.min(12, newsCount * 2);

      scored.push({
        symbol: sym,
        score: base + liqBonus + volPenalty + newsBonus,
        bias: report.outlook.bias,
        confidence: report.outlook.confidence_1_5,
        trend: report.trend.state,
        rsi14: report.momentum.rsi14,
        top_tags: report.news_context.top_tags,
        key_levels: report.technicals.key_levels,
        expected_range: report.outlook.expected_range_next_day,
      });
    } catch {
      // ignore
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 12);
  const picks = top.slice(0, 10);

  return {
    asof_date: asof,
    preferences: prefs,
    picks,
    generated_from: {
      watchlist: (wl.results || []).length,
      alert_symbols: (alertSyms.results || []).length,
      candidates: candidates.length,
    },
  };
}

/* -------------------- router -------------------- */

async function handleApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "");
  const method = req.method.toUpperCase();

  // CORS
  if (method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type,x-app-secret",
      },
    });
  }
  const corsHeaders = { "access-control-allow-origin": "*" };

  try {
    // Alerts list
    if (method === "GET" && path === "/alerts") {
      const limit = Math.min(200, Number(url.searchParams.get("limit") || "50"));
      const symbol = url.searchParams.get("symbol");
      const q = url.searchParams.get("q")?.toLowerCase();

      let sql = `SELECT * FROM alerts`;
      const binds: any[] = [];
      const where: string[] = [];

      if (symbol) {
        where.push("symbol = ?");
        binds.push(symbol.toUpperCase());
      }
      if (q) {
        where.push("(lower(headline) LIKE ? OR lower(summary) LIKE ?)");
        binds.push(`%${q}%`, `%${q}%`);
      }
      if (where.length) sql += ` WHERE ` + where.join(" AND ");
      sql += ` ORDER BY datetime(created_at) DESC LIMIT ?`;
      binds.push(limit);

      const rows = await env.DB.prepare(sql).bind(...binds).all();
      return json(rows.results, { headers: corsHeaders });
    }

    // Daily report
    if (method === "POST" && path === "/daily-report") {
      requireSecret(req, env);
      const body = await req.json<any>();

      const symbol = String(body.symbol || "").toUpperCase();
      if (!symbol) return bad("symbol required");
      const asof = String(body.asof_date || todayISODate());
      const prompt = String(body.prompt || "");
      const prefs = parsePrefsFromPrompt(prompt);

      const force = body.force === true;
      if (!force) {
        const cached = await getCachedTickerReport(env, symbol, asof, "daily_outlook");
        if (cached) {
          return json(
            { cached: true, preferences: JSON.parse(cached.preferences_json || "{}"), payload: JSON.parse(cached.payload_json) },
            { headers: corsHeaders }
          );
        }
      }

      const payload = await generateDailyOutlookReport(env, symbol, asof, prefs);
      const id = await saveTickerReport(env, symbol, asof, "daily_outlook", prefs, payload);
      return json({ cached: false, id, preferences: prefs, payload }, { headers: corsHeaders, status: 201 });
    }

    if (method === "GET" && path === "/daily-report") {
      const symbol = String(url.searchParams.get("symbol") || "").toUpperCase();
      const asof = String(url.searchParams.get("asof_date") || todayISODate());
      if (!symbol) return bad("symbol required");

      const cached = await getCachedTickerReport(env, symbol, asof, "daily_outlook");
      if (!cached) return bad("no report found", 404);

      return json(
        { cached: true, preferences: JSON.parse(cached.preferences_json || "{}"), payload: JSON.parse(cached.payload_json) },
        { headers: corsHeaders }
      );
    }

    // Watchlists
    if (method === "POST" && path === "/watchlists") {
      requireSecret(req, env);
      const body = await req.json<any>();
      const name = String(body.name || "My Watchlist");
      const id = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO watchlists (id, name, created_at) VALUES (?, ?, ?)`)
        .bind(id, name, nowIso())
        .run();
      return json({ id, name }, { headers: corsHeaders, status: 201 });
    }

    if (method === "POST" && path === "/watchlists/add") {
      requireSecret(req, env);
      const body = await req.json<any>();
      const watchlist_id = String(body.watchlist_id || "");
      const symbol = String(body.symbol || "").toUpperCase();
      if (!watchlist_id || !symbol) return bad("watchlist_id and symbol required");
      await env.DB.prepare(`INSERT OR IGNORE INTO watchlist_items (watchlist_id, symbol) VALUES (?, ?)`)
        .bind(watchlist_id, symbol)
        .run();
      return json({ ok: true }, { headers: corsHeaders, status: 201 });
    }

    if (method === "GET" && path === "/watchlists") {
      const lists = await env.DB.prepare(`SELECT * FROM watchlists ORDER BY datetime(created_at) DESC`).all();
      const items = await env.DB.prepare(`SELECT * FROM watchlist_items`).all();
      return json({ watchlists: lists.results, items: items.results }, { headers: corsHeaders });
    }

    if (method === "POST" && path === "/watchlists/run") {
      requireSecret(req, env);
      const body = await req.json<any>();
      const watchlist_id = String(body.watchlist_id || "");
      const asof = String(body.asof_date || todayISODate());
      const prompt = String(body.prompt || "daily outlook");
      if (!watchlist_id) return bad("watchlist_id required");

      const rows = await env.DB.prepare(`SELECT symbol FROM watchlist_items WHERE watchlist_id = ?`)
        .bind(watchlist_id).all();

      const results: any[] = [];
      for (const r of (rows.results || [])) {
        const symbol = String((r as any).symbol).toUpperCase();
        const prefs = parsePrefsFromPrompt(prompt);

        const cached = await getCachedTickerReport(env, symbol, asof, "daily_outlook");
        if (cached) {
          results.push({ symbol, cached: true, payload: JSON.parse(cached.payload_json) });
          continue;
        }
        const payload = await generateDailyOutlookReport(env, symbol, asof, prefs);
        await saveTickerReport(env, symbol, asof, "daily_outlook", prefs, payload);
        results.push({ symbol, cached: false, payload });
      }

      return json({ asof_date: asof, results }, { headers: corsHeaders, status: 201 });
    }

    // Weekly picks
    if (method === "POST" && path === "/weekly-picks") {
      requireSecret(req, env);
      const body = await req.json<any>();
      const asof = String(body.asof_date || todayISODate());
      const prompt = String(body.prompt || "best plays for this week");
      const prefs = parsePrefsFromPrompt(prompt);

      const force = body.force === true;
      if (!force) {
        const cached = await getLatestWeeklyReport(env, asof);
        if (cached) return json({ cached: true, payload: JSON.parse(cached.payload_json) }, { headers: corsHeaders });
      }

      const payload = await generateWeeklyPicks(env, asof, prefs);
      const id = await saveWeeklyReport(env, asof, prefs, payload);
      return json({ cached: false, id, payload }, { headers: corsHeaders, status: 201 });
    }

    if (method === "GET" && path === "/weekly-picks/latest") {
      const asof = String(url.searchParams.get("asof_date") || todayISODate());
      const cached = await getLatestWeeklyReport(env, asof);
      if (!cached) return bad("no weekly report found", 404);
      return json({ cached: true, payload: JSON.parse(cached.payload_json) }, { headers: corsHeaders });
    }

    return bad("not found", 404);
  } catch (e: any) {
    if (String(e?.message || "").includes("unauthorized")) return json({ error: "unauthorized" }, { status: 401, headers: corsHeaders });
    return json({ error: "server_error", detail: String(e?.message || e) }, { status: 500, headers: corsHeaders });
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return handleApi(req, env);
    return new Response("ok");
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        for (const feed of RSS_FEEDS) {
          try {
            const xml = await fetchText(feed.url);
            const items = parseFeedItems(xml).slice(0, 40);
            for (const it of items) await upsertAlert(env, it, feed.source);
          } catch {
            // keep cron resilient
          }
        }
      })()
    );
  },
};
