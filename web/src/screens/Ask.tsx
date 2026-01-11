import React, { useEffect, useMemo, useState } from "react";
import { dailyReport, getSignals } from "../api";

type Signal = {
  id?: string;
  title: string;
  category?: string;
  severity?: "high" | "med" | "low" | "info";
  direction?: "bullish" | "bearish" | "neutral";
  meta?: any;
};

type DailyPayload = any;

function inferDirection(s: Signal): "bullish" | "bearish" | "neutral" {
  const t = String(s.title || "").toLowerCase();
  const d = String(s.direction || "").toLowerCase();
  if (d === "bullish" || d === "bearish" || d === "neutral") return d as any;
  if (t.includes("bull")) return "bullish";
  if (t.includes("bear")) return "bearish";
  return "neutral";
}

function dirStyles(dir: "bullish" | "bearish" | "neutral") {
  if (dir === "bullish") return { bg: "#ECFDF5", fg: "#047857", ring: "#A7F3D0" };
  if (dir === "bearish") return { bg: "#FFF1F2", fg: "#BE123C", ring: "#FECDD3" };
  return { bg: "#F8FAFC", fg: "#334155", ring: "#E2E8F0" };
}

function Card({ title, subtitle, children }: any) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 16, padding: 14, background: "white" }}>
      <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
      {subtitle ? <div style={{ marginTop: 2, fontSize: 12, color: "#666" }}>{subtitle}</div> : null}
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function TradingViewChart({ symbol }: { symbol: string }) {
  const tvSymbol = useMemo(() => {
    const s = (symbol || "").trim();
    if (!s) return "NASDAQ:TSLA";
    if (s.includes(":")) return s;
    return `NASDAQ:${s.toUpperCase()}`;
  }, [symbol]);

  const src = useMemo(() => {
    // Official TradingView widget embed. No API key.
    return `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tvSymbol)}&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=f1f3f6&theme=light&style=1&timezone=Etc%2FUTC&withdateranges=1&hidevolume=0&locale=en`;
  }, [tvSymbol]);

  return (
    <Card
      title="Chart"
      subtitle="Embedded TradingView chart for context. Signals + TA are computed from OHLCV in the Worker."
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "#666" }}>Symbol</div>
        <div style={{ fontSize: 12, fontWeight: 800, background: "#f5f5f5", padding: "6px 10px", borderRadius: 999 }}>
          {tvSymbol}
        </div>
      </div>
      <div style={{ marginTop: 12, borderRadius: 12, overflow: "hidden", border: "1px solid #eee" }}>
        <iframe title="TradingView" src={src} style={{ width: "100%", height: 520, border: 0 }} allowFullScreen />
      </div>
    </Card>
  );
}

export default function Ask() {
  const [symbol, setSymbol] = useState("TSLA");
  const [prompt, setPrompt] = useState("what will TSLA do tomorrow?");
  const [payload, setPayload] = useState<DailyPayload | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalsView, setSignalsView] = useState<"highmed" | "high" | "all">("highmed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const filteredSignals = useMemo(() => {
    const list = Array.isArray(signals) ? signals : [];
    if (signalsView === "all") return list;
    if (signalsView === "high") return list.filter((s) => s.severity === "high");
    return list.filter((s) => s.severity === "high" || s.severity === "med");
  }, [signals, signalsView]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const sym = (symbol || "").trim().toUpperCase();
      if (!sym) throw new Error("Enter a ticker (e.g., TSLA)");

      // Daily report: prompt-driven, includes computed TA + key levels + scenarios.
      const daily = await dailyReport(sym, prompt, undefined, true);
      const p = daily?.payload ?? daily;
      setPayload(p);

      // Signals: prefer report-attached signals; fallback to /signals endpoint.
      const sigFromReport = Array.isArray(p?.signals) ? p.signals : null;
      if (sigFromReport && sigFromReport.length) {
        setSignals(sigFromReport);
      } else {
        const sig = await getSignals(sym, "D");
        setSignals(sig?.signals ?? []);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
      setPayload(null);
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const outlook = payload?.outlook;
  const t = payload?.technicals;
  const trend = payload?.trend;
  const momentum = payload?.momentum;
  const liquidity = payload?.liquidity;

  return (
    <div>
      <Card title="Ask" subtitle="Prompt-driven daily report + computed TA + signals">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            style={{ width: 140, padding: 12, borderRadius: 12, border: "1px solid #ddd", fontWeight: 800 }}
            placeholder="TSLA"
          />
          <button
            onClick={run}
            disabled={loading}
            style={{ flex: 1, minWidth: 160, padding: 12, borderRadius: 12, border: "1px solid #111", background: "#111", color: "white", fontWeight: 900 }}
          >
            {loading ? "Running…" : "Run"}
          </button>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          style={{ marginTop: 10, width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
          placeholder='Examples: “evaluate for wheel — spreads”, “use spreads”, “naked only”'
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Signals view:</div>
          {([
            ["highmed", "High + Med"],
            ["high", "High only"],
            ["all", "All"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSignalsView(k)}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #ddd",
                fontWeight: 800,
                background: signalsView === k ? "#111" : "white",
                color: signalsView === k ? "white" : "#111",
              }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setShowDebug((v) => !v)}
            style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 999, border: "1px solid #ddd", fontWeight: 800, background: showDebug ? "#f5f5f5" : "white" }}
          >
            {showDebug ? "Hide debug" : "Show debug"}
          </button>
        </div>

        {error ? <div style={{ marginTop: 10, color: "crimson", whiteSpace: "pre-wrap" }}>{error}</div> : null}
      </Card>

      <div style={{ marginTop: 12 }}>
        <TradingViewChart symbol={symbol} />
      </div>

      <div style={{ marginTop: 12 }}>
        <Card title="Signals" subtitle="Bullish / Bearish / Neutral tags with severity">
          {filteredSignals.length === 0 ? (
            <div style={{ fontSize: 13, color: "#666" }}>No signals returned for this symbol/timeframe.</div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {filteredSignals.map((s, i) => {
                const dir = inferDirection(s);
                const st = dirStyles(dir);
                return (
                  <div
                    key={s.id ?? `${s.title}-${i}`}
                    title={s.category ? `${s.category}${s.severity ? ` • ${s.severity}` : ""}` : ""}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: `1px solid ${st.ring}`,
                      background: st.bg,
                      color: st.fg,
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {s.severity ? (
                      <span style={{ padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.8)", border: "1px solid rgba(0,0,0,0.08)", fontSize: 10 }}>
                        {String(s.severity).toUpperCase()}
                      </span>
                    ) : null}
                    <span>{s.title}</span>
                  </div>
                );
              })}
            </div>
          )}

          {showDebug ? (
            <pre style={{ marginTop: 12, maxHeight: 280, overflow: "auto", background: "#f6f7f9", border: "1px solid #eee", padding: 12, borderRadius: 12, fontSize: 12 }}>
              {JSON.stringify({ payload, signals }, null, 2)}
            </pre>
          ) : null}
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <Card title={payload?.symbol ? `${payload.symbol} TA summary` : "TA summary"} subtitle="RSI, trend, key levels, ATR range">
          {!payload ? (
            <div style={{ fontSize: 13, color: "#666" }}>Run a ticker to see TA.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900 }}>Trend</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  state: <b>{trend?.state ?? "—"}</b>
                  <br />
                  SMA20 / 50 / 200: {trend?.sma20?.toFixed?.(2) ?? "—"} / {trend?.sma50?.toFixed?.(2) ?? "—"} / {trend?.sma200?.toFixed?.(2) ?? "—"}
                </div>
              </div>

              <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900 }}>Momentum</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  RSI14: <b>{momentum?.rsi14?.toFixed?.(1) ?? "—"}</b>
                  <br />
                  divergence: {momentum?.rsi_divergence?.type ?? "none"}
                </div>
              </div>

              <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900 }}>Liquidity</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  grade: <b>{liquidity?.grade ?? "—"}</b>
                  <br />
                  ATR14: {liquidity?.atr14?.toFixed?.(2) ?? "—"} ({(Number(liquidity?.atr_pct) * 100).toFixed?.(2) ?? "—"}%)
                </div>
              </div>

              <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900 }}>Key levels</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  support: {t?.key_levels?.support?.slice?.(-1)?.[0]?.price?.toFixed?.(2) ?? "—"}
                  <br />
                  resistance: {t?.key_levels?.resistance?.slice?.(-1)?.[0]?.price?.toFixed?.(2) ?? "—"}
                </div>
              </div>
            </div>
          )}

          {outlook ? (
            <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ padding: "6px 10px", borderRadius: 999, background: "#f5f5f5", fontWeight: 900, fontSize: 12 }}>Bias: {outlook.bias}</div>
                <div style={{ padding: "6px 10px", borderRadius: 999, background: "#f5f5f5", fontWeight: 900, fontSize: 12 }}>Score: {outlook.score}</div>
                <div style={{ padding: "6px 10px", borderRadius: 999, background: "#f5f5f5", fontWeight: 900, fontSize: 12 }}>Conf: {outlook.confidence_1_5}/5</div>
              </div>

              {outlook.expected_range_next_day ? (
                <div style={{ marginTop: 10, border: "1px solid #eee", borderRadius: 12, padding: 12, fontSize: 13 }}>
                  ATR range: {outlook.expected_range_next_day.low?.toFixed?.(2)} – {outlook.expected_range_next_day.high?.toFixed?.(2)}
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
