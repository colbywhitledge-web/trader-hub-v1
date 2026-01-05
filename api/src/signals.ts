// api/src/signals.ts
// Lightweight "signals engine" for Trader Hub v1
// Goal: transform raw OHLCV + computed indicators into decision-ready signals
//
// This module is dependency-free and safe to run in Cloudflare Workers.
//
// Expected inputs are plain JS objects/arrays (numbers + strings).
// You can wire this into your daily-report handler by passing in the OHLCV series
// and any indicator series you've already computed (RSI, SMAs, etc).

export type Severity = "high" | "med" | "low" | "info";

export type SignalCategory = "candles" | "momentum" | "structure" | "liquidity" | "trend";

export type Signal = {
  id: string;
  category: SignalCategory;
  type: string;
  timeframe: string; // e.g. "D", "W", "60"
  severity: Severity;
  title: string;
  trigger: string;
  action: string;
  invalidation?: string;
  levels?: number[];
  meta?: Record<string, any>;
};

export type Bar = {
  t?: string; // date/time
  time?: string;
  date?: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
};

function n(x: any): number | null {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function fmt(x: any, d = 2): string {
  const v = n(x);
  if (v === null) return "—";
  return Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : v.toFixed(d);
}

function last<T>(arr: T[] | undefined | null): T | null {
  if (!arr || arr.length === 0) return null;
  return arr[arr.length - 1] ?? null;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function uid(prefix: string, key: string) {
  return `${prefix}:${key}`;
}

// --- Candle pattern helpers ---
function bodySize(b: Bar) {
  return Math.abs(b.c - b.o);
}
function rangeSize(b: Bar) {
  return Math.max(1e-9, b.h - b.l);
}
function isBull(b: Bar) {
  return b.c > b.o;
}
function isBear(b: Bar) {
  return b.c < b.o;
}

function detectCandleSignals(bars: Bar[], timeframe = "D"): Signal[] {
  const out: Signal[] = [];
  const a = bars.length >= 1 ? bars[bars.length - 1] : null;
  const b = bars.length >= 2 ? bars[bars.length - 2] : null;
  if (!a || !b) return out;

  const aBody = bodySize(a);
  const aRange = rangeSize(a);
  const upperWick = a.h - Math.max(a.o, a.c);
  const lowerWick = Math.min(a.o, a.c) - a.l;

  // Engulfing
  const bullEngulf = isBull(a) && isBear(b) && a.o <= b.c && a.c >= b.o;
  const bearEngulf = isBear(a) && isBull(b) && a.o >= b.c && a.c <= b.o;

  if (bullEngulf) {
    out.push({
      id: uid("candles", "bullish_engulfing"),
      category: "candles",
      type: "bullish_engulfing",
      timeframe,
      severity: "med",
      title: "Bullish engulfing",
      trigger: "Current candle body engulfed prior red candle",
      action: "Look for continuation if price holds above the engulfing midpoint; consider entry on reclaim after a pullback.",
      invalidation: `Close below ${fmt((a.o + a.c) / 2)} (engulf midpoint)`,
      meta: { t: a.t || a.time || a.date },
    });
  }
  if (bearEngulf) {
    out.push({
      id: uid("candles", "bearish_engulfing"),
      category: "candles",
      type: "bearish_engulfing",
      timeframe,
      severity: "med",
      title: "Bearish engulfing",
      trigger: "Current candle body engulfed prior green candle",
      action: "Avoid chasing longs; consider shorts only on confirmation (lower low / failed reclaim).",
      invalidation: `Close above ${fmt((a.o + a.c) / 2)} (engulf midpoint)`,
      meta: { t: a.t || a.time || a.date },
    });
  }

  // Pin bars / hammers (wick-dominant)
  const wickDom = Math.max(upperWick, lowerWick) / aRange;
  const smallBody = aBody / aRange;

  const hammer = lowerWick / aRange >= 0.55 && upperWick / aRange <= 0.25 && smallBody <= 0.35;
  const shootingStar = upperWick / aRange >= 0.55 && lowerWick / aRange <= 0.25 && smallBody <= 0.35;

  if (hammer) {
    out.push({
      id: uid("candles", "hammer"),
      category: "candles",
      type: "hammer",
      timeframe,
      severity: "med",
      title: "Hammer / long lower wick",
      trigger: "Long lower wick suggests rejection of lows",
      action: "Watch for follow-through above the hammer high; best when aligned with support / oversold.",
      invalidation: `Break below ${fmt(a.l)} (hammer low)`,
      levels: [a.l, a.h],
      meta: { wickDom: clamp01(wickDom), t: a.t || a.time || a.date },
    });
  }
  if (shootingStar) {
    out.push({
      id: uid("candles", "shooting_star"),
      category: "candles",
      type: "shooting_star",
      timeframe,
      severity: "med",
      title: "Shooting star / long upper wick",
      trigger: "Long upper wick suggests rejection of highs",
      action: "Watch for follow-through below the shooting-star low; best when aligned with resistance / overbought.",
      invalidation: `Break above ${fmt(a.h)} (wick high)`,
      levels: [a.l, a.h],
      meta: { wickDom: clamp01(wickDom), t: a.t || a.time || a.date },
    });
  }

  // Inside/Outside bars
  const inside = a.h <= b.h && a.l >= b.l;
  const outside = a.h >= b.h && a.l <= b.l;

  if (inside) {
    out.push({
      id: uid("candles", "inside_bar"),
      category: "candles",
      type: "inside_bar",
      timeframe,
      severity: "info",
      title: "Inside bar (compression)",
      trigger: "Range contracted inside prior candle",
      action: `Set alerts at ${fmt(a.h)} / ${fmt(a.l)}. Trade the break with confirmation.`,
      invalidation: "No-trade if chop persists (multiple inside bars).",
      levels: [a.l, a.h],
      meta: { t: a.t || a.time || a.date },
    });
  }
  if (outside) {
    out.push({
      id: uid("candles", "outside_bar"),
      category: "candles",
      type: "outside_bar",
      timeframe,
      severity: "info",
      title: "Outside bar (expansion)",
      trigger: "Range expanded beyond prior candle",
      action: "Treat as volatility expansion—wait for direction confirmation before size.",
      invalidation: "Chop / immediate reversal back inside prior range.",
      levels: [a.l, a.h],
      meta: { t: a.t || a.time || a.date },
    });
  }

  return out;
}

// --- RSI divergence (use your existing divergence output if you already compute pivots) ---
export type RSIDivergence = { type: "none" | "bullish" | "bearish"; strength?: number; pivot_dates?: string[] };

function detectRSISignals(rsi14: number | null, div: RSIDivergence | null, timeframe = "D"): Signal[] {
  const out: Signal[] = [];
  if (rsi14 !== null) {
    if (rsi14 <= 35) {
      out.push({
        id: uid("momentum", "rsi_oversold"),
        category: "momentum",
        type: "rsi_oversold",
        timeframe,
        severity: "med",
        title: `RSI ${fmt(rsi14, 1)} (oversold-ish)`,
        trigger: "RSI <= 35",
        action: "Look for bounce triggers at support; avoid fresh shorts into exhaustion.",
      });
    } else if (rsi14 >= 65) {
      out.push({
        id: uid("momentum", "rsi_overbought"),
        category: "momentum",
        type: "rsi_overbought",
        timeframe,
        severity: "med",
        title: `RSI ${fmt(rsi14, 1)} (overbought-ish)`,
        trigger: "RSI >= 65",
        action: "Avoid chasing; consider trimming longs into strength.",
      });
    } else if (rsi14 < 45) {
      out.push({
        id: uid("momentum", "rsi_weak"),
        category: "momentum",
        type: "rsi_weak",
        timeframe,
        severity: "info",
        title: `RSI ${fmt(rsi14, 1)} (weak momentum)`,
        trigger: "RSI < 45",
        action: "Be selective on longs; prefer buying only at support or on reclaim.",
      });
    } else if (rsi14 > 55) {
      out.push({
        id: uid("momentum", "rsi_positive"),
        category: "momentum",
        type: "rsi_positive",
        timeframe,
        severity: "info",
        title: `RSI ${fmt(rsi14, 1)} (positive momentum)`,
        trigger: "RSI > 55",
        action: "Prefer longs; look for continuation entries on break/hold.",
      });
    }
  }

  const divType = div?.type || "none";
  const strength = n(div?.strength) ?? 0;
  if (divType !== "none") {
    out.push({
      id: uid("momentum", "rsi_divergence"),
      category: "momentum",
      type: "rsi_divergence",
      timeframe,
      severity: strength >= 3 ? "high" : "med",
      title: `RSI divergence: ${divType}`,
      trigger: `Divergence detected (strength ${strength})`,
      action: "Momentum warning: tighten stops and require confirmation at key levels.",
      meta: { pivot_dates: div?.pivot_dates || [] },
    });
  }

  return out;
}

// --- FVG (3-bar imbalance) ---
export type FVG = { side: "bullish" | "bearish"; low: number; high: number; atIndex: number; t?: string };

function computeFVGs(bars: Bar[], lookback = 80): FVG[] {
  const out: FVG[] = [];
  const start = Math.max(1, bars.length - lookback);
  for (let i = start; i < bars.length - 1; i++) {
    const prev = bars[i - 1];
    const mid = bars[i];
    const next = bars[i + 1];
    if (!prev || !mid || !next) continue;

    if (prev.h < next.l) {
      out.push({ side: "bullish", low: prev.h, high: next.l, atIndex: i, t: mid.t || mid.time || mid.date });
    }
    if (prev.l > next.h) {
      out.push({ side: "bearish", low: next.h, high: prev.l, atIndex: i, t: mid.t || mid.time || mid.date });
    }
  }
  return out;
}

function detectFVGSignals(bars: Bar[], timeframe = "D"): Signal[] {
  const out: Signal[] = [];
  const latest = last(bars);
  if (!latest) return out;

  const fvgs = computeFVGs(bars);
  if (!fvgs.length) return out;

  const recent = fvgs.slice(-3).reverse();
  for (const f of recent) {
    out.push({
      id: uid("structure", `fvg_${f.side}_${f.atIndex}`),
      category: "structure",
      type: "fvg",
      timeframe,
      severity: "info",
      title: `FVG ${f.side === "bullish" ? "bullish" : "bearish"}: ${fmt(f.low)}–${fmt(f.high)}`,
      trigger: `Imbalance zone detected (${f.side})`,
      action: f.side === "bullish" ? "Watch for bullish reaction on retest; treat as magnet/target if above." : "Watch for bearish reaction on retest; treat as magnet/target if below.",
      invalidation: f.side === "bullish" ? `Clean breakdown below ${fmt(f.low)}` : `Clean breakout above ${fmt(f.high)}`,
      levels: [f.low, f.high],
      meta: { detected_at: f.t, index: f.atIndex },
    });
  }
  return out;
}

// --- Liquidity sweeps ---
function isSwingHigh(bars: Bar[], i: number, left = 2, right = 2) {
  const b = bars[i];
  if (!b) return false;
  for (let k = i - left; k <= i + right; k++) {
    if (k === i) continue;
    const x = bars[k];
    if (x && x.h >= b.h) return false;
  }
  return true;
}
function isSwingLow(bars: Bar[], i: number, left = 2, right = 2) {
  const b = bars[i];
  if (!b) return false;
  for (let k = i - left; k <= i + right; k++) {
    if (k === i) continue;
    const x = bars[k];
    if (x && x.l <= b.l) return false;
  }
  return true;
}

function detectLiquiditySweepSignals(bars: Bar[], timeframe = "D"): Signal[] {
  const out: Signal[] = [];
  if (bars.length < 10) return out;

  const look = Math.min(30, bars.length - 3);
  let swingHighIdx = -1;
  let swingLowIdx = -1;

  for (let i = bars.length - look; i < bars.length - 2; i++) {
    if (isSwingHigh(bars, i)) swingHighIdx = i;
    if (isSwingLow(bars, i)) swingLowIdx = i;
  }

  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];

  if (swingHighIdx !== -1) {
    const sh = bars[swingHighIdx];
    const swept = lastBar.h > sh.h && lastBar.c < sh.h;
    if (swept) {
      out.push({
        id: uid("liquidity", "sweep_high"),
        category: "liquidity",
        type: "liquidity_sweep_high",
        timeframe,
        severity: "high",
        title: `Liquidity sweep above swing high (${fmt(sh.h)})`,
        trigger: "Took highs then closed back below prior swing",
        action: "Reversal risk elevated. Prefer patience: wait for confirmation before sizing.",
        invalidation: `Sustained reclaim above ${fmt(sh.h)}`,
        levels: [sh.h],
        meta: { swing_idx: swingHighIdx, swing_t: sh.t || sh.time || sh.date },
      });
    }
  }

  if (swingLowIdx !== -1) {
    const sl = bars[swingLowIdx];
    const swept = lastBar.l < sl.l && lastBar.c > sl.l;
    if (swept) {
      out.push({
        id: uid("liquidity", "sweep_low"),
        category: "liquidity",
        type: "liquidity_sweep_low",
        timeframe,
        severity: "high",
        title: `Liquidity sweep below swing low (${fmt(sl.l)})`,
        trigger: "Took lows then closed back above prior swing",
        action: "Potential reversal/bounce. Look for confirmation before sizing.",
        invalidation: `Sustained breakdown below ${fmt(sl.l)}`,
        levels: [sl.l],
        meta: { swing_idx: swingLowIdx, swing_t: sl.t || sl.time || sl.date },
      });
    }
  }

  if (prevBar && lastBar) {
    const failed = lastBar.h > prevBar.h && lastBar.c < (lastBar.o + lastBar.c) / 2 && lastBar.c < lastBar.o;
    if (failed) {
      out.push({
        id: uid("liquidity", "failed_reclaim"),
        category: "liquidity",
        type: "failed_reclaim",
        timeframe,
        severity: "med",
        title: "Failed reclaim / rejection candle",
        trigger: "Expanded range then closed weak",
        action: "Treat as rejection—avoid chasing; wait for confirmation at levels.",
      });
    }
  }

  return out;
}

// --- Moving average crosses ---
export type MACrossInputs = {
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  prev_sma20?: number | null;
  prev_sma50?: number | null;
  prev_sma200?: number | null;
};

function crossUp(prevA: number | null, prevB: number | null, a: number | null, b: number | null) {
  if (prevA === null || prevB === null || a === null || b === null) return false;
  return prevA <= prevB && a > b;
}
function crossDown(prevA: number | null, prevB: number | null, a: number | null, b: number | null) {
  if (prevA === null || prevB === null || a === null || b === null) return false;
  return prevA >= prevB && a < b;
}

function detectMACrossSignals(ma: MACrossInputs, timeframe = "D"): Signal[] {
  const out: Signal[] = [];
  const s20 = n(ma.sma20);
  const s50 = n(ma.sma50);
  const s200 = n(ma.sma200);
  const p20 = n(ma.prev_sma20);
  const p50 = n(ma.prev_sma50);
  const p200 = n(ma.prev_sma200);

  if (crossUp(p20, p50, s20, s50)) {
    out.push({
      id: uid("trend", "sma20_cross_up_sma50"),
      category: "trend",
      type: "ma_cross_up",
      timeframe,
      severity: "med",
      title: "20SMA crossed above 50SMA",
      trigger: "Bullish MA cross",
      action: "Trend bias improves; favor long pullbacks while 20SMA holds.",
      invalidation: "Close back below 20SMA / cross failure",
      meta: { sma20: s20, sma50: s50 },
    });
  }
  if (crossDown(p20, p50, s20, s50)) {
    out.push({
      id: uid("trend", "sma20_cross_down_sma50"),
      category: "trend",
      type: "ma_cross_down",
      timeframe,
      severity: "med",
      title: "20SMA crossed below 50SMA",
      trigger: "Bearish MA cross",
      action: "Trend bias weakens; favor shorts/hedges on failed reclaim.",
      invalidation: "Close back above 20SMA / cross failure",
      meta: { sma20: s20, sma50: s50 },
    });
  }

  if (crossUp(p50, p200, s50, s200)) {
    out.push({
      id: uid("trend", "golden_cross_50_200"),
      category: "trend",
      type: "golden_cross",
      timeframe,
      severity: "low",
      title: "Golden cross (50SMA > 200SMA)",
      trigger: "Long-term trend shift signal",
      action: "Long bias improves; best trades are pullbacks above the 200SMA.",
      invalidation: "Sustained break back below 200SMA",
      meta: { sma50: s50, sma200: s200 },
    });
  }
  if (crossDown(p50, p200, s50, s200)) {
    out.push({
      id: uid("trend", "death_cross_50_200"),
      category: "trend",
      type: "death_cross",
      timeframe,
      severity: "low",
      title: "Death cross (50SMA < 200SMA)",
      trigger: "Long-term trend weakness signal",
      action: "Risk-off bias; rallies into key resistance tend to fade.",
      invalidation: "Reclaim 200SMA + failed follow-through lower",
      meta: { sma50: s50, sma200: s200 },
    });
  }

  return out;
}

// --- Key levels proximity (optional) ---
function detectKeyLevelSignals(spot: number | null, keyLevels: any, timeframe = "D"): Signal[] {
  const out: Signal[] = [];
  if (spot === null) return out;

  const lv = normalizeLevels(keyLevels);
  if (!lv.support.length && !lv.resistance.length) return out;

  const ns = nearestBelow(spot, lv.support);
  const nr = nearestAbove(spot, lv.resistance);

  if (ns !== null) {
    const away = Math.abs(((ns - spot) / spot) * 100);
    out.push({
      id: uid("structure", "closest_support"),
      category: "structure",
      type: "closest_support",
      timeframe,
      severity: away <= 1 ? "high" : "info",
      title: away <= 1 ? `Near support: ${fmt(ns)} (${fmt(away, 2)}% away)` : `Closest support: ${fmt(ns)}`,
      trigger: away <= 1 ? "Within 1% of support" : "Nearest support below spot",
      action: away <= 1 ? "Hold/reclaim → bounce setup. Break → risk-off / shorts favored." : "Watch for holds/reclaims here for long entries.",
      invalidation: away <= 1 ? `Clean break below ${fmt(ns)}` : undefined,
      levels: [ns],
    });
  }

  if (nr !== null) {
    const away = Math.abs(((nr - spot) / spot) * 100);
    out.push({
      id: uid("structure", "closest_resistance"),
      category: "structure",
      type: "closest_resistance",
      timeframe,
      severity: away <= 1 ? "high" : "info",
      title: away <= 1 ? `Near resistance: ${fmt(nr)} (${fmt(away, 2)}% away)` : `Closest resistance: ${fmt(nr)}`,
      trigger: away <= 1 ? "Within 1% of resistance" : "Nearest resistance above spot",
      action: away <= 1 ? "Break+hold → breakout. Reject → mean reversion / trim longs." : "Break/hold above this for continuation.",
      invalidation: away <= 1 ? `Failed hold above ${fmt(nr)}` : undefined,
      levels: [nr],
    });
  }

  return out;
}

export type BuildSignalsInput = {
  timeframe?: string; // "D" default
  bars: Bar[]; // required
  rsi14?: number | null;
  rsi_divergence?: RSIDivergence | null;
  key_levels?: any;
  ma?: MACrossInputs; // optional
  spot?: number | null; // optional
};

export function buildSignals(input: BuildSignalsInput): Signal[] {
  const timeframe = input.timeframe || "D";
  const bars = input.bars || [];
  const out: Signal[] = [];

  out.push(...detectCandleSignals(bars, timeframe));
  out.push(...detectRSISignals(input.rsi14 ?? null, input.rsi_divergence ?? null, timeframe));
  out.push(...detectFVGSignals(bars, timeframe));
  out.push(...detectLiquiditySweepSignals(bars, timeframe));
  if (input.ma) out.push(...detectMACrossSignals(input.ma, timeframe));
  out.push(...detectKeyLevelSignals(input.spot ?? null, input.key_levels ?? null, timeframe));

  const rank: Record<string, number> = { high: 4, med: 3, low: 2, info: 1 };
  out.sort((a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0));

  const seen = new Set<string>();
  const final: Signal[] = [];
  for (const s of out) {
    const k = `${s.category}:${s.type}:${s.title}`;
    if (seen.has(k)) continue;
    seen.add(k);
    final.push(s);
    if (final.length >= 12) break;
  }
  return final;
}
