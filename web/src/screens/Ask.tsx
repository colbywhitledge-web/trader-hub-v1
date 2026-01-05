import React, { useMemo, useState } from "react";
import { dailyReport } from "../api";

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

function fmt(n: any, digits = 2) {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  if (Math.abs(num) >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: digits });
  return num.toFixed(digits);
}

function safeStringify(v: any, maxLen = 160) {
  try {
    const s = JSON.stringify(v);
    if (!s) return "—";
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + "…";
  } catch {
    return "—";
  }
}

function compactObjectSummary(obj: any) {
  if (!obj || typeof obj !== "object") return "—";
  const preferred = ["name", "label", "title", "pattern", "type", "side", "note", "summary", "description", "desc", "reason"];
  for (const k of preferred) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return String(obj[k]);
  }
  // if range-ish
  const lo = obj.low ?? obj.lo ?? obj.min;
  const hi = obj.high ?? obj.hi ?? obj.max;
  if (lo !== undefined && hi !== undefined && (Number.isFinite(Number(lo)) || Number.isFinite(Number(hi)))) return `${fmt(lo)} → ${fmt(hi)}`;

  const from = obj.from ?? obj.start;
  const to = obj.to ?? obj.end;
  if (from !== undefined && to !== undefined && (Number.isFinite(Number(from)) || Number.isFinite(Number(to)))) return `${fmt(from)} → ${fmt(to)}`;

  // scalar kv pairs (up to 4)
  const scalars = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && typeof v !== "object");
  if (scalars.length) {
    return scalars
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${typeof v === "number" ? fmt(v) : String(v)}`)
      .join(" • ");
  }
  return safeStringify(obj);
}

function renderLine(v: any) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.trim() || "—";
  if (typeof v === "number") return fmt(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    // if simple list
    if (v.every((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean")) {
      return v.map((x) => (typeof x === "number" ? fmt(x) : String(x))).join(" • ");
    }
    return `${v.length} item${v.length === 1 ? "" : "s"}`;
  }
  if (typeof v === "object") return compactObjectSummary(v);
  return String(v);
}

function normalizeLevels(keyLevels: any) {
  if (!keyLevels || typeof keyLevels !== "object") return { support: [], resistance: [] };

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

  // Also parse S1/R1-style keys
  for (const [k, v] of Object.entries(keyLevels)) {
    const K = String(k).toUpperCase();
    if (K.startsWith("S")) pushNum(support, v);
    if (K.startsWith("R")) pushNum(resistance, v);
  }

  const uniq = (arr: number[]) => Array.from(new Set(arr.map((x) => Number(x)).filter((x) => Number.isFinite(x))));
  const sU = uniq(support).sort((a, b) => b - a); // high-to-low supports
  const rU = uniq(resistance).sort((a, b) => a - b); // low-to-high resistances
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

function ListBox({ items }: { items: any[] }) {
  if (!items || items.length === 0) return <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 12 }}>—</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((it, i) => (
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
          <div style={{ fontSize: 13, lineHeight: 1.25 }}>{renderLine(it)}</div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, tone, subtitle, items }: any) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Pill tone={tone} text={title} />
        {subtitle ? <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{subtitle}</div> : null}
      </div>
      <ListBox items={items} />
    </div>
  );
}

export default function Ask() {
  const [symbol, setSymbol] = useState("TSLA");
  const [prompt, setPrompt] = useState("what will TSLA do tomorrow?");
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState<string>("");

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

  // TA buckets (defensive; accept arrays or objects)
  const gapsItems = Array.isArray(tech?.gaps) ? tech.gaps : tech?.gaps ? [tech.gaps] : [];
  const candlesItems = Array.isArray(tech?.candles) ? tech.candles : tech?.candles ? [tech.candles] : [];
  const sweepsItems = Array.isArray(tech?.ma_sweeps) ? tech.ma_sweeps : tech?.ma_sweeps ? [tech.ma_sweeps] : [];
  const fvgItems = Array.isArray(tech?.fair_value_gaps) ? tech.fair_value_gaps : tech?.fair_value_gaps ? [tech.fair_value_gaps] : [];
  const obItems = Array.isArray(tech?.order_blocks) ? tech.order_blocks : tech?.order_blocks ? [tech.order_blocks] : [];
  const fibRaw = tech?.fibonacci;
  const fibItems = fibRaw ? (Array.isArray(fibRaw) ? fibRaw : [fibRaw]) : [];
  const div = out?.momentum?.rsi_divergence;
  const divItems = div ? (Array.isArray(div) ? div : [div]) : [];

  // Actionable summary: keep compact and never show [object Object]
  const summaryLines = useMemo(() => {
    const lines: { tone: any; text: string }[] = [];

    // bias-ish from outlook if present
    const bias = outlook?.bias ? String(outlook.bias).toLowerCase() : "";
    if (bias.includes("bull")) lines.push({ tone: "bull", text: `Bias: ${outlook.bias}` });
    else if (bias.includes("bear")) lines.push({ tone: "bear", text: `Bias: ${outlook.bias}` });
    else if (outlook?.bias) lines.push({ tone: "neutral", text: `Bias: ${outlook.bias}` });

    if (price !== null) lines.push({ tone: "info", text: `Spot: ${fmt(price)}` });

    if (supportNear !== null) lines.push({ tone: "info", text: `Support to watch: ${fmt(supportNear)}` });
    if (resistanceNear !== null) lines.push({ tone: "info", text: `Resistance to watch: ${fmt(resistanceNear)}` });

    // divergence quick hint
    const divType = typeof div === "object" ? div?.type : null;
    const divStrength = typeof div === "object" ? div?.strength : null;
    if (divType && divType !== "none") {
      lines.push({
        tone: "warn",
        text: `Momentum warning: ${String(divType)}${divStrength !== null && divStrength !== undefined ? ` (strength ${divStrength})` : ""}`,
      });
    }

    // if we have meaningful gaps/candles/sweeps, note counts
    const noteCount = (label: string, count: number, tone: any) => {
      if (count > 0) lines.push({ tone, text: `${label}: ${count} item${count === 1 ? "" : "s"}` });
    };
    noteCount("Gaps", gapsItems.length, "info");
    noteCount("Candles", candlesItems.length, "info");
    noteCount("MA sweeps", sweepsItems.length, "warn");

    return lines.slice(0, 6);
  }, [outlook, price, supportNear, resistanceNear, div, gapsItems.length, candlesItems.length, sweepsItems.length]);

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
            subtitle="Supports / resistances plus compact context (gaps, candles, sweeps, divergence, FVG, order blocks, fib)."
            right={<Pill tone="info" text="Actionable view" />}
          >
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, padding: 12, background: "rgba(0,0,0,0.015)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>Actionable summary</div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>What to do, not just what it is</div>
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
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 2 }}>Quick scan of extra context (kept compact)</div>

                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                  <Section title="Gaps" tone="info" subtitle="Imbalances / fill targets" items={gapsItems} />
                  <Section title="Candles" tone="info" subtitle="Reversal / continuation hints" items={candlesItems} />
                  <Section title="MA sweeps" tone="warn" subtitle="Liquidity / mean reversion" items={sweepsItems} />
                  <Section
                    title="RSI divergence"
                    tone="warn"
                    subtitle="Momentum warning"
                    items={divItems.length ? divItems : div ? [div] : []}
                  />
                  <Section title="FVG" tone="info" subtitle="Fair value gaps" items={fvgItems} />
                  <Section title="Order blocks" tone="info" subtitle="Supply / demand zones" items={obItems} />
                </div>

                <div style={{ marginTop: 16 }}>
                  <Section title="Fibonacci" tone="info" subtitle="Levels / anchors" items={fibItems} />
                </div>
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
