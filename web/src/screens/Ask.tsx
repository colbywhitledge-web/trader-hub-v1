import React, { useEffect, useMemo, useRef, useState } from "react";
import { dailyReport } from "../api";

/**
 * Ask.tsx — decision-ready v1
 * - "Today's Alerts" derived from your payload
 * - TradingView free embedded chart for the symbol
 * - Keeps Outlook / Scenarios / Options lens / News
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

function Pill({ tone = "neutral", text }: { tone?: "high" | "med" | "low" | "info" | "neutral"; text: string }) {
  const c =
    tone === "high"
      ? { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.32)", dot: "#ef4444" }
      : tone === "med"
      ? { bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.35)", dot: "#f59e0b" }
      : tone === "low"
      ? { bg: "rgba(34,197,94,0.14)", border: "rgba(34,197,94,0.35)", dot: "#22c55e" }
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

function nnum(v: any): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
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

  // Also parse S1/R1 keys
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

function pctAway(price: number, level: number) {
  return ((level - price) / price) * 100;
}

function toTVSymbol(sym: string) {
  const s = (sym || "").trim().toUpperCase();
  if (!s) return "NASDAQ:TSLA";
  if (s.includes(":")) return s;
  return `NASDAQ:${s}`;
}

/** TradingView free widget */
function TradingViewChart({ symbol }: { symbol: string }) {
  const containerId = useMemo(() => `tv_chart_${symbol.replace(/[^a-zA-Z0-9_]/g, "_")}`, [symbol]);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = "";
    const container = document.createElement("div");
    container.id = containerId;
    host.appendChild(container);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;

    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: toTVSymbol(symbol),
      interval: "D",
      timezone: "Etc/UTC",
      theme: "light",
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      save_image: false,
      calendar: false,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      support_host: "https://www.tradingview.com",
    });

    host.appendChild(script);

    return () => {
      try {
        host.innerHTML = "";
      } catch {}
    };
  }, [symbol, containerId]);

  return (
    <div
      ref={hostRef}
      style={{
        width: "100%",
        height: 520,
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 14,
        overflow: "hidden",
        background: "#fff",
      }}
    />
  );
}

type Alert = {
  severity: "high" | "med" | "low" | "info";
  title: string;
  trigger: string;
  action: string;
  invalidation?: string;
};

function buildAlerts(payload: any): Alert[] {
  const alerts: Alert[] = [];
  if (!payload || typeof payload !== "object") return alerts;

  const outlook = payload.outlook || {};
  const trend = payload.trend || {};
  const tech = payload.technicals || {};
  const momentum = payload.momentum || {};
  const liquidity = payload.liquidity || {};

  const levels = normalizeLevels(tech?.key_levels);

  const rsi = nnum(momentum?.rsi14 ?? momentum?.rsi14_value ?? momentum?.rsi);
  const div = momentum?.rsi_divergence || null;
  const divType = typeof div === "object" ? String(div?.type || "") : "";
  const divStrength = typeof div === "object" ? nnum(div?.strength) : null;

  const atrPct = nnum(liquidity?.atr_pct);
  const atr = nnum(liquidity?.atr14);

  // Try to infer spot from common fields; if missing, we still generate non-proximity alerts.
  const spotCandidates = [
    payload.price,
    payload.last_price,
    payload.quote?.c,
    payload.quote?.last,
    tech.last_close,
    tech.close,
    tech.spot,
    outlook.spot,
    outlook.price,
    outlook.expected_range_next_day?.low != null && outlook.expected_range_next_day?.high != null
      ? (Number(outlook.expected_range_next_day.low) + Number(outlook.expected_range_next_day.high)) / 2
      : null,
  ];
  let spot: number | null = null;
  for (const c of spotCandidates) {
    const n = nnum(c);
    if (n !== null) {
      spot = n;
      break;
    }
  }

  const bias = String(outlook?.bias || "").toLowerCase();
  if (bias) {
    alerts.push({
      severity: bias.includes("bull") ? "low" : bias.includes("bear") ? "high" : "info",
      title: `Bias: ${outlook.bias}`,
      trigger: "Engine outlook",
      action: bias.includes("bull")
        ? "Prioritize longs; avoid shorting strength."
        : bias.includes("bear")
        ? "Prioritize shorts / hedges; avoid chasing upside."
        : "Trade level-to-level; avoid chasing either direction.",
    });
  }

  const regime = String(trend?.state || "").toLowerCase();
  if (regime) {
    alerts.push({
      severity: regime.includes("down") ? "high" : regime.includes("up") ? "low" : "info",
      title: `Regime: ${trend.state}`,
      trigger: "Trend state",
      action: regime.includes("range") ? "Fade extremes; confirm at support/resistance." : "Trade with the regime; confirm on break/hold.",
    });
  }

  if (rsi !== null) {
    if (rsi <= 35) {
      alerts.push({
        severity: "med",
        title: `RSI ${fmt(rsi, 1)} (oversold-ish)`,
        trigger: "RSI <= 35",
        action: "Watch bounce triggers at support; avoid fresh shorts into exhaustion.",
      });
    } else if (rsi >= 65) {
      alerts.push({
        severity: "med",
        title: `RSI ${fmt(rsi, 1)} (overbought-ish)`,
        trigger: "RSI >= 65",
        action: "Avoid chasing; consider trimming longs into strength.",
      });
    } else if (rsi < 45) {
      alerts.push({
        severity: "info",
        title: `RSI ${fmt(rsi, 1)} (weak momentum)`,
        trigger: "RSI < 45",
        action: "Be selective on longs; prefer buys only at support or on reclaim.",
      });
    } else if (rsi > 55) {
      alerts.push({
        severity: "info",
        title: `RSI ${fmt(rsi, 1)} (positive momentum)`,
        trigger: "RSI > 55",
        action: "Prefer longs; look for continuation entries on break/hold.",
      });
    }
  }

  if (divType && divType !== "none") {
    alerts.push({
      severity: (divStrength ?? 0) >= 3 ? "high" : "med",
      title: `RSI divergence: ${divType}`,
      trigger: `Strength ${divStrength ?? "?"}`,
      action: "Momentum warning: tighten stops and demand confirmation at levels.",
    });
  }

  if (atrPct !== null || atr !== null) {
    const pct = atrPct !== null ? atrPct * 100 : null;
    const sev = pct !== null && pct >= 4 ? "high" : pct !== null && pct >= 2.5 ? "med" : "info";
    alerts.push({
      severity: sev,
      title: `Volatility: ATR ${atr !== null ? fmt(atr) : "—"} (${pct !== null ? fmt(pct, 2) + "%" : "—"})`,
      trigger: "ATR-based volatility",
      action: sev === "high" ? "Size down; widen stops; expect fast moves." : "Normal sizing; respect levels.",
    });
  }

  // Level proximity alerts if spot is known + levels exist
  if (spot !== null) {
    const ns = nearestBelow(spot, levels.support);
    const nr = nearestAbove(spot, levels.resistance);

    if (ns !== null) {
      const away = Math.abs(pctAway(spot, ns));
      alerts.push({
        severity: away <= 1.0 ? "high" : "info",
        title: away <= 1.0 ? `Near support: ${fmt(ns)} (${fmt(away, 2)}% away)` : `Closest support: ${fmt(ns)}`,
        trigger: away <= 1.0 ? "Within 1% of support" : "Nearest support below spot",
        action: away <= 1.0
          ? "Hold/reclaim → bounce setup. Break → risk-off / shorts favored."
          : "Best long entries often come on holds/reclaims here.",
        invalidation: away <= 1.0 ? `Clean break below ${fmt(ns)}` : undefined,
      });
    }

    if (nr !== null) {
      const away = Math.abs(pctAway(spot, nr));
      alerts.push({
        severity: away <= 1.0 ? "high" : "info",
        title: away <= 1.0 ? `Near resistance: ${fmt(nr)} (${fmt(away, 2)}% away)` : `Closest resistance: ${fmt(nr)}`,
        trigger: away <= 1.0 ? "Within 1% of resistance" : "Nearest resistance above spot",
        action: away <= 1.0
          ? "Break+hold → breakout setup. Reject → mean reversion / trim longs."
          : "Break/hold above this is a key continuation signal.",
        invalidation: away <= 1.0 ? `Failed hold above ${fmt(nr)}` : undefined,
      });
    }
  }

  // News awareness
  const newsCount = nnum(payload?.news_context?.headline_count_7d) ?? 0;
  alerts.push({
    severity: newsCount === 0 ? "info" : "med",
    title: newsCount === 0 ? "News: quiet (0 stored headlines / 7d)" : `News: ${newsCount} headline(s) / 7d`,
    trigger: "Stored RSS context",
    action: newsCount === 0 ? "Catalyst risk low from stored RSS; price action likely leads." : "Scan headlines; adjust sizing around catalysts.",
  });

  const rank: Record<string, number> = { high: 3, med: 2, low: 1, info: 0, neutral: 0 };
  alerts.sort((a, b) => rank[b.severity] - rank[a.severity]);

  // De-dupe by title and cap
  const seen = new Set<string>();
  const out = [];
  for (const a of alerts) {
    if (seen.has(a.title)) continue;
    seen.add(a.title);
    out.push(a);
    if (out.length >= 7) break;
  }
  return out;
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
  const alerts = useMemo(() => buildAlerts(out), [out]);

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

      {out && (
        <>
          <Card title="TradingView chart" subtitle="Free embedded chart (context). Use Alerts below for decisions." right={<Pill tone="info" text={toTVSymbol(symbol)} />}>
            <TradingViewChart symbol={symbol} />
          </Card>

          <Card title="Today's Alerts" subtitle="High-signal, trader-usable items derived from the report (v1)">
            {alerts.length === 0 ? (
              <div style={{ color: "rgba(0,0,0,0.55)" }}>No alerts generated from this payload.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {alerts.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 14,
                      padding: 12,
                      background:
                        a.severity === "high" ? "rgba(239,68,68,0.04)" : a.severity === "med" ? "rgba(245,158,11,0.05)" : "rgba(0,0,0,0.02)",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900 }}>{a.title}</div>
                      <Pill tone={a.severity} text={a.severity.toUpperCase()} />
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(0,0,0,0.72)" }}>
                      <b>Trigger:</b> {a.trigger}
                    </div>
                    <div style={{ fontSize: 13 }}>
                      <b>Action:</b> {a.action}
                    </div>
                    {a.invalidation ? (
                      <div style={{ fontSize: 13, color: "rgba(0,0,0,0.72)" }}>
                        <b>Invalidation:</b> {a.invalidation}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

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
