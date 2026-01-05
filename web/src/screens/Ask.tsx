import React, { useMemo, useState } from "react";
import { dailyReport } from "../api";

/**
 * Ask.tsx (TA + Key Levels cleanup)
 * - No raw JSON blocks by default
 * - No [object Object]
 * - Compact, actionable summaries per TA category
 * - Safe across varied backend shapes
 */

function Card({ title, subtitle, right, children }: any) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 16,
        padding: 14,
        marginTop: 14,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>{title}</div>
          {subtitle ? <div style={{ marginTop: 4, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Pill({ tone = "neutral", text }: { tone?: "bull" | "bear" | "warn" | "info" | "neutral"; text: string }) {
  const c =
    tone === "bull"
      ? { bg: "rgba(34,197,94,0.14)", border: "rgba(34,197,94,0.35)", dot: "#22c55e" }
      : tone === "bear"
      ? { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.32)", dot: "#ef4444" }
      : tone === "warn"
      ? { bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.35)", dot: "#f59e0b" }
      : tone === "info"
      ? { bg: "rgba(96,165,250,0.14)", border: "rgba(96,165,250,0.35)", dot: "#60a5fa" }
      : { bg: "rgba(0,0,0,0.06)", border: "rgba(0,0,0,0.12)", dot: "rgba(0,0,0,0.35)" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        background: c.bg,
        border: `1px solid ${c.border}`,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: c.dot, display: "inline-block" }} />
      {text}
    </span>
  );
}

function MiniChip({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        background: "rgba(0,0,0,0.05)",
        border: "1px solid rgba(0,0,0,0.10)",
        color: "rgba(0,0,0,0.70)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function fmt(n: any, digits = 2) {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  if (Math.abs(num) >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: digits });
  return num.toFixed(digits);
}

function nnum(v: any): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function pick(obj: any, keys: string[]) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    const v = (obj as any)[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

function rangeFrom(obj: any): { a: number; b: number } | null {
  if (!obj || typeof obj !== "object") return null;
  const a = nnum(pick(obj, ["low", "lo", "min", "from", "start", "a"]));
  const b = nnum(pick(obj, ["high", "hi", "max", "to", "end", "b"]));
  if (a === null || b === null) return null;
  return a <= b ? { a, b } : { a: b, b: a };
}

function safeOneLine(obj: any, maxLen = 220) {
  try {
    const s = JSON.stringify(obj);
    if (!s) return "—";
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + "…";
  } catch {
    return "—";
  }
}

function cleanText(s: any) {
  const t = String(s ?? "").trim();
  return t.length ? t : "";
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function normalizeLevels(keyLevels: any) {
  if (!keyLevels || typeof keyLevels !== "object") return { support: [] as number[], resistance: [] as number[] };

  const support: number[] = [];
  const resistance: number[] = [];

  const pushNum = (arr: number[], val: any) => {
    if (val === null || val === undefined) return;
    if (Array.isArray(val)) return val.forEach((x) => pushNum(arr, x));
    if (typeof val === "object") return Object.values(val).forEach((x) => pushNum(arr, x));
    const n = Number(val);
    if (Number.isFinite(n)) arr.push(n);
  };

  pushNum(support, keyLevels.support ?? keyLevels.supports);
  pushNum(resistance, keyLevels.resistance ?? keyLevels.resistances);

  for (const [k, v] of Object.entries(keyLevels)) {
    const K = String(k).toUpperCase();
    if (K.startsWith("S")) pushNum(support, v);
    if (K.startsWith("R")) pushNum(resistance, v);
  }

  const sU = uniq(support.map((x) => Number(x)).filter((x) => Number.isFinite(x))).sort((a, b) => b - a);
  const rU = uniq(resistance.map((x) => Number(x)).filter((x) => Number.isFinite(x))).sort((a, b) => a - b);
  return { support: sU, resistance: rU };
}

function nearestBelow(price: number | null, arr: number[]) {
  if (!Number.isFinite(Number(price))) return null;
  let best: number | null = null;
  for (const x of arr) if (x <= (price as number) && (best === null || x > best)) best = x;
  return best;
}
function nearestAbove(price: number | null, arr: number[]) {
  if (!Number.isFinite(Number(price))) return null;
  let best: number | null = null;
  for (const x of arr) if (x >= (price as number) && (best === null || x < best)) best = x;
  return best;
}

/** --- Category-specific formatters (avoid [object Object]) --- */
function fmtGap(x: any) {
  if (x == null) return "";
  if (typeof x === "string") return cleanText(x);
  const r = rangeFrom(x);
  const dir = cleanText(pick(x, ["direction", "dir", "side", "bias"])) || "";
  const kind = cleanText(pick(x, ["kind", "type", "name", "label"])) || "Gap";
  const tf = cleanText(pick(x, ["timeframe", "tf", "interval"])) || "";
  const fill = pick(x, ["fill", "fill_level", "fillTarget", "fill_target", "target"]);
  const fillN = nnum(fill);
  const pieces = [];
  pieces.push(kind);
  if (dir) pieces.push(dir);
  if (tf) pieces.push(tf);
  const head = pieces.join(" • ");
  if (r) {
    const tail = fillN !== null ? `(${fmt(r.a)}–${fmt(r.b)}, fill ${fmt(fillN)})` : `(${fmt(r.a)}–${fmt(r.b)})`;
    return `${head} ${tail}`.trim();
  }
  const note = cleanText(pick(x, ["note", "summary", "desc", "description"])) || "";
  if (note) return `${head}: ${note}`;
  return head || safeOneLine(x);
}

function fmtCandle(x: any) {
  if (x == null) return "";
  if (typeof x === "string") return cleanText(x);
  const pattern = cleanText(pick(x, ["pattern", "name", "label", "type", "title"])) || "Candle";
  const bias = cleanText(pick(x, ["bias", "direction", "dir", "side"])) || "";
  const tf = cleanText(pick(x, ["timeframe", "tf", "interval"])) || "";
  const strength = pick(x, ["strength", "score", "confidence"]);
  const sN = nnum(strength);
  const parts = [pattern];
  if (bias) parts.push(bias);
  if (tf) parts.push(tf);
  if (sN !== null) parts.push(`strength ${fmt(sN, 0)}`);
  const note = cleanText(pick(x, ["note", "summary", "desc", "description"])) || "";
  return note ? `${parts.join(" • ")} — ${note}` : parts.join(" • ") || safeOneLine(x);
}

function fmtSweep(x: any) {
  if (x == null) return "";
  if (typeof x === "string") return cleanText(x);
  const ma = cleanText(pick(x, ["ma", "avg", "name", "label", "type"])) || "MA sweep";
  const dir = cleanText(pick(x, ["direction", "dir", "side", "bias"])) || "";
  const tf = cleanText(pick(x, ["timeframe", "tf", "interval"])) || "";
  const parts = [ma];
  if (dir) parts.push(dir);
  if (tf) parts.push(tf);
  const note = cleanText(pick(x, ["note", "summary", "desc", "description"])) || "";
  return note ? `${parts.join(" • ")} — ${note}` : parts.join(" • ") || safeOneLine(x);
}

function fmtFVG(x: any) {
  if (x == null) return "";
  if (typeof x === "string") return cleanText(x);
  const r = rangeFrom(x);
  const side = cleanText(pick(x, ["side", "direction", "dir", "bias"])) || "";
  const tf = cleanText(pick(x, ["timeframe", "tf", "interval"])) || "";
  const kind = cleanText(pick(x, ["type", "name", "label"])) || "FVG";
  const head = [kind, side, tf].filter(Boolean).join(" • ");
  if (r) return `${head} (${fmt(r.a)}–${fmt(r.b)})`.trim();
  const note = cleanText(pick(x, ["note", "summary", "desc", "description"])) || "";
  return note ? `${head} — ${note}` : head || safeOneLine(x);
}

function fmtOB(x: any) {
  if (x == null) return "";
  if (typeof x === "string") return cleanText(x);
  const r = rangeFrom(x);
  const side = cleanText(pick(x, ["side", "direction", "dir", "bias"])) || "";
  const tf = cleanText(pick(x, ["timeframe", "tf", "interval"])) || "";
  const kind = cleanText(pick(x, ["type", "name", "label"])) || "Order block";
  const head = [kind, side, tf].filter(Boolean).join(" • ");
  if (r) return `${head} (${fmt(r.a)}–${fmt(r.b)})`.trim();
  const note = cleanText(pick(x, ["note", "summary", "desc", "description"])) || "";
  return note ? `${head} — ${note}` : head || safeOneLine(x);
}

function fmtFib(x: any) {
  if (x == null) return "";
  if (typeof x === "string") return cleanText(x);
  if (typeof x !== "object") return String(x);

  const anchor = (x as any).anchor ?? (x as any).anchors ?? (x as any).swing ?? null;
  const aRange = rangeFrom(anchor) || rangeFrom(x);

  // Pull a few common retracement keys if present
  const retr = (x as any).retracements ?? (x as any).retracement ?? null;
  const ext = (x as any).extensions ?? (x as any).extension ?? null;

  const pullLevel = (obj: any, keys: string[]) => {
    if (!obj || typeof obj !== "object") return null;
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null) {
        const v = nnum(obj[k]);
        if (v !== null) return v;
      }
    }
    return null;
  };

  const fib0382 = pullLevel(retr, ["0.382", "0_382", "0382", "38.2", "382"]);
  const fib05 = pullLevel(retr, ["0.5", "0_5", "05", "50", "50.0"]);
  const fib0618 = pullLevel(retr, ["0.618", "0_618", "0618", "61.8", "618"]);

  const ex1272 = pullLevel(ext, ["1.272", "1_272", "1272"]);
  const ex1618 = pullLevel(ext, ["1.618", "1_618", "1618", "1.62"]);

  const parts: string[] = [];
  if (aRange) parts.push(`anchor ${fmt(aRange.a)} → ${fmt(aRange.b)}`);

  const lv: string[] = [];
  if (fib0382 !== null) lv.push(`38.2% ${fmt(fib0382)}`);
  if (fib05 !== null) lv.push(`50% ${fmt(fib05)}`);
  if (fib0618 !== null) lv.push(`61.8% ${fmt(fib0618)}`);
  if (lv.length) parts.push(`retr ${lv.join(" • ")}`);

  const ex: string[] = [];
  if (ex1272 !== null) ex.push(`1.272 ${fmt(ex1272)}`);
  if (ex1618 !== null) ex.push(`1.618 ${fmt(ex1618)}`);
  if (ex.length) parts.push(`ext ${ex.join(" • ")}`);

  const tf = cleanText(pick(x, ["timeframe", "tf", "interval"])) || "";
  if (tf) parts.push(tf);

  if (parts.length) return `Fib — ${parts.join(" | ")}`;

  // Fallback: if it's an object full of objects, summarize keys
  const keys = Object.keys(x);
  if (keys.length) return `Fib (${keys.slice(0, 6).join(", ")}${keys.length > 6 ? ", …" : ""})`;
  return "Fib";
}

function fmtDivergence(x: any) {
  if (x == null) return "";
  if (typeof x === "string") return cleanText(x);
  if (typeof x !== "object") return String(x);
  const t = cleanText(pick(x, ["type", "kind"])) || "";
  const s = pick(x, ["strength", "score"]);
  const sn = nnum(s);
  if (!t || t === "none") return "none";
  return sn !== null ? `${t} (strength ${fmt(sn, 0)})` : t;
}

function toArray(v: any) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function TopList({
  items,
  formatter,
  max = 8,
  emptyText = "—",
}: {
  items: any[];
  formatter: (x: any) => string;
  max?: number;
  emptyText?: string;
}) {
  const lines = useMemo(() => {
    const out: string[] = [];
    for (const it of items || []) {
      const s = cleanText(formatter(it));
      if (!s) continue;
      if (s === "{}" || s === "[]") continue;
      out.push(s);
    }
    // de-dup exact strings and keep top N
    return uniq(out).slice(0, max);
  }, [items, formatter, max]);

  if (!lines.length) return <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 12 }}>{emptyText}</div>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {lines.map((s, i) => (
        <div
          key={i}
          style={{
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
            padding: "10px 12px",
            background: "rgba(0,0,0,0.02)",
            display: "flex",
            gap: 10,
          }}
        >
          <div style={{ width: 18, lineHeight: "18px" }}>•</div>
          <div style={{ fontSize: 13, lineHeight: 1.25 }}>{s}</div>
        </div>
      ))}
    </div>
  );
}

function TASection({
  title,
  tone,
  subtitle,
  items,
  formatter,
}: {
  title: string;
  tone: "bull" | "bear" | "warn" | "info" | "neutral";
  subtitle: string;
  items: any[];
  formatter: (x: any) => string;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Pill tone={tone} text={title} />
        <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{subtitle}</div>
        <div style={{ marginLeft: "auto" }}>
          <MiniChip text={`${(items || []).length} item${(items || []).length === 1 ? "" : "s"}`} />
        </div>
      </div>
      <TopList items={items} formatter={formatter} />
    </div>
  );
}

export default function Ask() {
  const [symbol, setSymbol] = useState("TSLA");
  const [prompt, setPrompt] = useState("what will TSLA do tomorrow?");
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState<string>("");
  const [showRaw, setShowRaw] = useState(false);

  async function run() {
    setErr("");
    setLoading(true);
    try {
      const res = await dailyReport(symbol.trim().toUpperCase(), prompt);
      setOut(res.payload);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const outlook = out?.outlook;

  const tech = out?.technicals || {};
  const keyLevelsRaw = tech?.key_levels;
  const levels = useMemo(() => normalizeLevels(keyLevelsRaw), [keyLevelsRaw]);

  // price: try multiple likely locations without breaking if absent
  const price = useMemo(() => {
    const candidates = [
      out?.price,
      out?.last_price,
      out?.quote?.last,
      out?.quote?.c,
      out?.market?.price,
      outlook?.spot,
      outlook?.price,
    ];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }, [out, outlook]);

  const supportNear = useMemo(() => nearestBelow(price, levels.support), [price, levels.support]);
  const resistanceNear = useMemo(() => nearestAbove(price, levels.resistance), [price, levels.resistance]);

  // TA buckets (defensive)
  const gapsItems = toArray(tech?.gaps);
  const candlesItems = toArray(tech?.candles);
  const sweepsItems = toArray(tech?.ma_sweeps);
  const fvgItems = toArray(tech?.fair_value_gaps);
  const obItems = toArray(tech?.order_blocks);
  const fibItems = toArray(tech?.fibonacci);
  const div = out?.momentum?.rsi_divergence;
  const divLine = fmtDivergence(div);

  // Actionable summary: keep compact + actually actionable
  const summaryLines = useMemo(() => {
    const lines: { tone: "bull" | "bear" | "warn" | "info" | "neutral"; text: string }[] = [];

    const bias = outlook?.bias ? String(outlook.bias).toLowerCase() : "";
    if (bias.includes("bull")) lines.push({ tone: "bull", text: `Bias: ${outlook.bias}` });
    else if (bias.includes("bear")) lines.push({ tone: "bear", text: `Bias: ${outlook.bias}` });
    else if (outlook?.bias) lines.push({ tone: "neutral", text: `Bias: ${outlook.bias}` });

    if (outlook?.expected_range_next_day?.low != null && outlook?.expected_range_next_day?.high != null) {
      lines.push({
        tone: "info",
        text: `Next-day range: ${fmt(outlook.expected_range_next_day.low)} → ${fmt(outlook.expected_range_next_day.high)}`,
      });
    } else if (price !== null) {
      lines.push({ tone: "info", text: `Spot: ${fmt(price)}` });
    }

    if (supportNear !== null) lines.push({ tone: "info", text: `Hold above ${fmt(supportNear)} to keep bounce thesis intact` });
    if (resistanceNear !== null) lines.push({ tone: "info", text: `Break and hold above ${fmt(resistanceNear)} for continuation / breakout` });

    if (divLine && divLine !== "none") lines.push({ tone: "warn", text: `RSI divergence: ${divLine}` });

    // Pick 1–2 most important TA cues (by existence) without dumping noise
    if ((gapsItems || []).length) lines.push({ tone: "info", text: `Gaps present: watch fills near key levels` });
    if ((fvgItems || []).length) lines.push({ tone: "info", text: `FVG zones present: use as magnet / reaction areas` });
    if ((sweepsItems || []).length) lines.push({ tone: "warn", text: `MA sweeps present: mean reversion risk elevated` });

    return lines.slice(0, 6);
  }, [outlook, price, supportNear, resistanceNear, divLine, gapsItems.length, fvgItems.length, sweepsItems.length]);

  return (
    <div>
      <Card title="Ask the engine" subtitle="Run a daily report for a symbol and get a structured plan">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="TSLA"
            style={{ width: 90, padding: 10, borderRadius: 12, border: "1px solid rgba(0,0,0,0.14)" }}
          />
          <button
            onClick={run}
            disabled={loading}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.14)",
              fontWeight: 900,
              background: loading ? "rgba(0,0,0,0.04)" : "#fff",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Running..." : "Run"}
          </button>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 12, border: "1px solid rgba(0,0,0,0.14)" }}
        />
        <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 8 }}>
          Examples: “evaluate for wheel — spreads”, “use spreads”, “naked only”
        </div>
      </Card>

      {err && <div style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{err}</div>}

      {outlook && (
        <>
          <Card title={`${out.symbol} outlook`}>
            <div style={{ fontSize: 13, lineHeight: 1.35 }}>
              <b>Bias:</b> {outlook.bias} &nbsp; <b>Score:</b> {outlook.score} &nbsp; <b>Confidence:</b> {outlook.confidence_1_5}/5
            </div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <b>Expected range:</b>{" "}
              {outlook.expected_range_next_day?.low?.toFixed?.(2)} → {outlook.expected_range_next_day?.high?.toFixed?.(2)}
            </div>
          </Card>

          <Card title="Scenarios">
            {(outlook.scenarios || []).map((s: any) => (
              <div key={s.name} style={{ padding: "10px 0", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <div style={{ fontWeight: 900, textTransform: "uppercase" }}>{s.name}</div>
                <div>
                  <b>If:</b> {s.if}
                </div>
                {s.entry_idea && (
                  <div>
                    <b>Entry:</b> {s.entry_idea}
                  </div>
                )}
                {s.plan && (
                  <div>
                    <b>Plan:</b> {s.plan}
                  </div>
                )}
                <div>
                  <b>Invalidation:</b> {s.invalidation}
                </div>
              </div>
            ))}
          </Card>

          <Card title="Options lens">
            <div>
              <b>Directional default:</b> {outlook.options_lens?.directional?.default}
            </div>
            {(outlook.options_lens?.directional?.naked || []).map((t: string, i: number) => (
              <div key={i}>• {t}</div>
            ))}
            {(outlook.options_lens?.directional?.spreads || []).map((t: string, i: number) => (
              <div key={i}>• {t}</div>
            ))}
            <div style={{ marginTop: 8 }}>
              <b>Wheel preference:</b> {outlook.options_lens?.wheel?.preference}
            </div>
            {(outlook.options_lens?.wheel?.csp_cc || []).map((t: string, i: number) => (
              <div key={i}>• {t}</div>
            ))}
            {(outlook.options_lens?.wheel?.spreads || []).map((t: string, i: number) => (
              <div key={i}>• {t}</div>
            ))}
          </Card>

          <Card
            title="TA & Key Levels"
            subtitle="Readable signals (no blobs). Levels + the few cues that actually matter."
            right={
              <button
                onClick={() => setShowRaw((s) => !s)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.14)",
                  background: showRaw ? "rgba(0,0,0,0.05)" : "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                  fontSize: 12,
                }}
                title="Debug toggle"
              >
                {showRaw ? "Hide raw" : "Show raw"}
              </button>
            }
          >
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 12, background: "rgba(0,0,0,0.015)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>Actionable summary</div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>Use this to make a decision</div>
                </div>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {summaryLines.length === 0 ? (
                    <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 12 }}>No TA context returned for this symbol yet.</div>
                  ) : (
                    summaryLines.map((x, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            marginTop: 6,
                            background:
                              x.tone === "bull"
                                ? "#22c55e"
                                : x.tone === "bear"
                                ? "#ef4444"
                                : x.tone === "warn"
                                ? "#f59e0b"
                                : x.tone === "info"
                                ? "#60a5fa"
                                : "rgba(0,0,0,0.35)",
                          }}
                        />
                        <div style={{ fontSize: 13, lineHeight: 1.25 }}>{x.text}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 900 }}>Support</div>
                    <Pill tone="bull" text="Buy zones" />
                  </div>
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {levels.support.slice(0, 5).map((lv, i) => (
                      <div
                        key={i}
                        style={{
                          border: "1px solid rgba(0,0,0,0.08)",
                          borderRadius: 12,
                          padding: "10px 12px",
                          background: "rgba(34,197,94,0.06)",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(0,0,0,0.55)" }}>S{i + 1}</div>
                        <div style={{ fontWeight: 900 }}>{fmt(lv)}</div>
                      </div>
                    ))}
                    {levels.support.length === 0 ? <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 12 }}>—</div> : null}
                  </div>
                </div>

                <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 900 }}>Resistance</div>
                    <Pill tone="bear" text="Sell zones" />
                  </div>
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {levels.resistance.slice(0, 5).map((lv, i) => (
                      <div
                        key={i}
                        style={{
                          border: "1px solid rgba(0,0,0,0.08)",
                          borderRadius: 12,
                          padding: "10px 12px",
                          background: "rgba(239,68,68,0.05)",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(0,0,0,0.55)" }}>R{i + 1}</div>
                        <div style={{ fontWeight: 900 }}>{fmt(lv)}</div>
                      </div>
                    ))}
                    {levels.resistance.length === 0 ? <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 12 }}>—</div> : null}
                  </div>
                </div>
              </div>

              <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 12 }}>
                <div style={{ fontWeight: 900 }}>TA flags</div>
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 2 }}>
                  Compact readouts — ranges, patterns, and the “what/where”, not blobs.
                </div>

                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                  <TASection title="Gaps" tone="info" subtitle="Imbalances / potential fill targets" items={gapsItems} formatter={fmtGap} />
                  <TASection title="Candles" tone="info" subtitle="Reversal / continuation hints" items={candlesItems} formatter={fmtCandle} />
                  <TASection title="MA sweeps" tone="warn" subtitle="Liquidity / mean reversion risk" items={sweepsItems} formatter={fmtSweep} />
                  <TASection
                    title="RSI divergence"
                    tone={divLine && divLine !== "none" ? "warn" : "neutral"}
                    subtitle="Momentum warning"
                    items={div ? [divLine] : []}
                    formatter={(x) => String(x)}
                  />
                  <TASection title="FVG" tone="info" subtitle="Fair value gaps (reaction zones)" items={fvgItems} formatter={fmtFVG} />
                  <TASection title="Order blocks" tone="info" subtitle="Supply / demand zones" items={obItems} formatter={fmtOB} />
                </div>

                <div style={{ marginTop: 16 }}>
                  <TASection title="Fibonacci" tone="info" subtitle="Anchor + key retracements/extensions" items={fibItems} formatter={fmtFib} />
                </div>

                {showRaw ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 900, fontSize: 12, color: "rgba(0,0,0,0.65)" }}>Raw (debug)</div>
                    <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 12, background: "rgba(0,0,0,0.03)", padding: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
                      {safeOneLine(
                        {
                          key_levels: tech?.key_levels,
                          gaps: tech?.gaps,
                          candles: tech?.candles,
                          ma_sweeps: tech?.ma_sweeps,
                          rsi_divergence: out?.momentum?.rsi_divergence,
                          fvg: tech?.fair_value_gaps,
                          order_blocks: tech?.order_blocks,
                          fibonacci: tech?.fibonacci,
                        },
                        5000
                      )}
                    </pre>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <Card title="Recent news (if any)">
            {(out.news_context?.notable_items || []).length === 0 ? (
              <div style={{ color: "rgba(0,0,0,0.55)" }}>
                No stored headlines for this symbol in the last 7 days yet (RSS ingest needs time).
              </div>
            ) : (
              (out.news_context.notable_items || []).slice(0, 10).map((n: any, i: number) => (
                <div key={i} style={{ padding: "10px 0", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                  <div style={{ fontWeight: 800 }}>{n.headline}</div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{n.created_at}</div>
                  <div style={{ fontSize: 12 }}>tags: {(n.tags || []).join(", ")} | score: {n.score}</div>
                  {n.url && (
                    <a href={n.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                      open
                    </a>
                  )}
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}
