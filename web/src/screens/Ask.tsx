import React, { useEffect, useMemo, useRef, useState } from "react";
import { dailyReport } from "../api";

/**
 * Ask.tsx — Signals UI (v1)
 * - Consumes payload.signals (from backend signals engine)
 * - Groups by category, color-codes severity
 * - Includes TradingView free embedded chart
 * - Keeps Outlook / Scenarios / Options lens / News
 */

type Severity = "high" | "med" | "low" | "info";
type Signal = {
  id?: string;
  category?: "candles" | "momentum" | "structure" | "liquidity" | "trend" | string;
  type?: string;
  timeframe?: string;
  severity?: Severity | string;
  title?: string;
  trigger?: string;
  action?: string;
  invalidation?: string;
  levels?: number[];
  meta?: Record<string, any>;
};

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

function Pill({
  tone = "neutral",
  text,
}: {
  tone?: "high" | "med" | "low" | "info" | "neutral" | "chip";
  text: string;
}) {
  const c =
    tone === "high"
      ? { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.32)", dot: "#ef4444" }
      : tone === "med"
      ? { bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.35)", dot: "#f59e0b" }
      : tone === "low"
      ? { bg: "rgba(34,197,94,0.14)", border: "rgba(34,197,94,0.35)", dot: "#22c55e" }
      : tone === "info"
      ? { bg: "rgba(96,165,250,0.14)", border: "rgba(96,165,250,0.35)", dot: "#60a5fa" }
      : tone === "chip"
      ? { bg: "rgba(0,0,0,0.05)", border: "rgba(0,0,0,0.10)", dot: "rgba(0,0,0,0.35)" }
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

function ButtonChip({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.12)"}`,
        background: active ? "rgba(0,0,0,0.06)" : "#fff",
        fontWeight: 900,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function fmt(n: any, digits = 2) {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  if (Math.abs(num) >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: digits });
  return num.toFixed(digits);
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

function severityTone(s: any): Severity {
  const v = String(s || "").toLowerCase();
  if (v === "high") return "high";
  if (v === "med" || v === "medium") return "med";
  if (v === "low") return "low";
  return "info";
}

function categoryLabel(cat: string) {
  const c = (cat || "").toLowerCase();
  if (c === "candles") return "Candles";
  if (c === "momentum") return "Momentum";
  if (c === "structure") return "Structure";
  if (c === "liquidity") return "Liquidity";
  if (c === "trend") return "Trend";
  return cat || "Other";
}

function sortSignals(sig: Signal[]) {
  const rank: Record<string, number> = { high: 4, med: 3, low: 2, info: 1 };
  return [...sig].sort((a, b) => (rank[severityTone(b.severity)] ?? 0) - (rank[severityTone(a.severity)] ?? 0));
}

function groupByCategory(sig: Signal[]) {
  const groups: Record<string, Signal[]> = {};
  for (const s of sig) {
    const key = String(s.category || "other");
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  // stable order preference
  const order = ["liquidity", "structure", "trend", "momentum", "candles", "other"];
  const keys = Object.keys(groups).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return keys.map((k) => ({ key: k, items: sortSignals(groups[k]) }));
}

function SignalRow({ s, showMeta }: { s: Signal; showMeta: boolean }) {
  const tone = severityTone(s.severity);
  const bg =
    tone === "high"
      ? "rgba(239,68,68,0.04)"
      : tone === "med"
      ? "rgba(245,158,11,0.05)"
      : tone === "low"
      ? "rgba(34,197,94,0.05)"
      : "rgba(0,0,0,0.02)";

  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 14,
        padding: 12,
        background: bg,
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 900, lineHeight: 1.15 }}>{s.title || s.type || "Signal"}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {s.timeframe ? <Pill tone="chip" text={String(s.timeframe)} /> : null}
          <Pill tone={tone} text={tone.toUpperCase()} />
        </div>
      </div>

      {s.trigger ? (
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.75)" }}>
          <b>Trigger:</b> {s.trigger}
        </div>
      ) : null}

      {s.action ? (
        <div style={{ fontSize: 13 }}>
          <b>Action:</b> {s.action}
        </div>
      ) : null}

      {s.invalidation ? (
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.75)" }}>
          <b>Invalidation:</b> {s.invalidation}
        </div>
      ) : null}

      {Array.isArray(s.levels) && s.levels.length ? (
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.75)" }}>
          <b>Levels:</b> {s.levels.slice(0, 6).map((x) => fmt(x)).join(", ")}
        </div>
      ) : null}

      {showMeta && s.meta ? (
        <pre style={{ margin: 0, padding: 10, borderRadius: 12, background: "rgba(0,0,0,0.04)", fontSize: 12, overflowX: "auto" }}>
          {JSON.stringify(s.meta, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export default function Ask() {
  const [symbol, setSymbol] = useState("TSLA");
  const [prompt, setPrompt] = useState("what will TSLA do tomorrow?");
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState<string>("");

  const [severityFilter, setSeverityFilter] = useState<"all" | "high" | "high_med">("high_med");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [showMeta, setShowMeta] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  async function run() {
    setErr("");
    setLoading(true);
    try {
      const res = await dailyReport(symbol.trim().toUpperCase(), prompt);
      setOut(res.payload);
      setCollapsed({}); // reset collapse state per run
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const outlook = out?.outlook;
  const rawSignals: Signal[] = Array.isArray(out?.signals) ? out.signals : [];

  const filteredSignals = useMemo(() => {
    let sig = rawSignals;

    if (severityFilter !== "all") {
      sig = sig.filter((s) => {
        const t = severityTone(s.severity);
        if (severityFilter === "high") return t === "high";
        return t === "high" || t === "med";
      });
    }

    if (catFilter !== "all") {
      sig = sig.filter((s) => String(s.category || "other") === catFilter);
    }

    return sortSignals(sig);
  }, [rawSignals, severityFilter, catFilter]);

  const grouped = useMemo(() => groupByCategory(filteredSignals), [filteredSignals]);

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of rawSignals) {
      const k = String(s.category || "other");
      counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }, [rawSignals]);

  const categories = useMemo(() => {
    const keys = Object.keys(catCounts);
    const order = ["liquidity", "structure", "trend", "momentum", "candles", "other"];
    keys.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return keys;
  }, [catCounts]);

  return (
    <div>
      <Card title="Ask the engine" subtitle="Run a daily report for a symbol and get decision-ready signals">
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

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginRight: 6, fontWeight: 900 }}>Signals view:</span>
          <ButtonChip active={severityFilter === "high_med"} onClick={() => setSeverityFilter("high_med")}>
            High + Med
          </ButtonChip>
          <ButtonChip active={severityFilter === "high"} onClick={() => setSeverityFilter("high")}>
            High only
          </ButtonChip>
          <ButtonChip active={severityFilter === "all"} onClick={() => setSeverityFilter("all")}>
            All
          </ButtonChip>

          <span style={{ width: 1, height: 18, background: "rgba(0,0,0,0.10)", margin: "0 6px" }} />

          <ButtonChip active={showMeta} onClick={() => setShowMeta((v) => !v)}>
            {showMeta ? "Hide debug" : "Show debug"}
          </ButtonChip>
        </div>

        <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 8 }}>
          Tip: type an exchange like <b>NYSE:SPY</b> if needed. Chart is context; signals are the plan.
        </div>
      </Card>

      {err && <div style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{err}</div>}

      {out && (
        <>
          <Card title="TradingView chart" subtitle="Free embedded chart (context). Use Signals below for decisions." right={<Pill tone="info" text={toTVSymbol(symbol)} />}>
            <TradingViewChart symbol={symbol} />
          </Card>

          <Card
            title="Signals"
            subtitle={
              rawSignals.length
                ? `Showing ${filteredSignals.length} of ${rawSignals.length} signal(s) — grouped by category`
                : "No signals in payload yet. Deploy backend changes and rerun."
            }
            right={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <ButtonChip active={catFilter === "all"} onClick={() => setCatFilter("all")}>
                  All ({rawSignals.length || 0})
                </ButtonChip>
                {categories.map((k) => (
                  <ButtonChip key={k} active={catFilter === k} onClick={() => setCatFilter(k)}>
                    {categoryLabel(k)} ({catCounts[k] || 0})
                  </ButtonChip>
                ))}
              </div>
            }
          >
            {rawSignals.length === 0 ? (
              <div style={{ color: "rgba(0,0,0,0.60)" }}>
                If you just deployed, hard refresh and rerun. You should see <b>payload.signals</b> in Network → daily-report response.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {grouped.map((g) => {
                  const isCollapsed = !!collapsed[g.key];
                  return (
                    <div key={g.key} style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, overflow: "hidden" }}>
                      <button
                        onClick={() => setCollapsed((p) => ({ ...p, [g.key]: !p[g.key] }))}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: 12,
                          border: "none",
                          background: "rgba(0,0,0,0.02)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ fontWeight: 900 }}>{categoryLabel(g.key)}</div>
                          <Pill tone="chip" text={`${g.items.length} item(s)`} />
                        </div>
                        <div style={{ fontWeight: 900, color: "rgba(0,0,0,0.55)" }}>{isCollapsed ? "Show" : "Hide"}</div>
                      </button>

                      {!isCollapsed ? (
                        <div style={{ padding: 12, display: "grid", gap: 10 }}>
                          {g.items.map((s, i) => (
                            <SignalRow key={s.id || `${g.key}_${i}`} s={s} showMeta={showMeta} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
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
                {s.entry_idea ? (
                  <div>
                    <b>Entry:</b> {s.entry_idea}
                  </div>
                ) : null}
                {s.plan ? (
                  <div>
                    <b>Plan:</b> {s.plan}
                  </div>
                ) : null}
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
              <div style={{ color: "rgba(0,0,0,0.55)" }}>No stored headlines for this symbol in the last 7 days yet (RSS ingest needs time).</div>
            ) : (
              (out.news_context.notable_items || []).slice(0, 10).map((n: any, i: number) => (
                <div key={i} style={{ padding: "10px 0", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                  <div style={{ fontWeight: 800 }}>{n.headline}</div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{n.created_at}</div>
                  <div style={{ fontSize: 12 }}>tags: {(n.tags || []).join(", ")} | score: {n.score}</div>
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                      open
                    </a>
                  ) : null}
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}
