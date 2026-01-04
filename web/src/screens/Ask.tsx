import React, { useState } from "react";
import { dailyReport } from "../api";

function Card({ title, children }: any) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, marginTop: 12 }}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 8 }}>{children}</div>
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

  return (
    <div>
      <Card title="Ask the engine">
        <div style={{ display: "flex", gap: 8 }}>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="TSLA" style={{ width: 90, padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
          <button onClick={run} disabled={loading} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd", fontWeight: 700 }}>
            {loading ? "Running..." : "Run"}
          </button>
        </div>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
        <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
          Examples: “evaluate for wheel — spreads”, “use spreads”, “naked only”
        </div>
      </Card>

      {err && <div style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{err}</div>}

      {outlook && (
        <>
          <Card title={`${out.symbol} outlook`}>
            <div><b>Bias:</b> {outlook.bias} &nbsp; <b>Score:</b> {outlook.score} &nbsp; <b>Confidence:</b> {outlook.confidence_1_5}/5</div>
            <div style={{ marginTop: 8 }}>
              <b>Expected range:</b>{" "}
              {outlook.expected_range_next_day?.low?.toFixed?.(2)} → {outlook.expected_range_next_day?.high?.toFixed?.(2)}
            </div>
          </Card>

          <Card title="Scenarios">
            {outlook.scenarios?.map((s: any) => (
              <div key={s.name} style={{ padding: "10px 0", borderTop: "1px solid #eee" }}>
                <div style={{ fontWeight: 800, textTransform: "uppercase" }}>{s.name}</div>
                <div><b>If:</b> {s.if}</div>
                {s.entry_idea && <div><b>Entry:</b> {s.entry_idea}</div>}
                {s.plan && <div><b>Plan:</b> {s.plan}</div>}
                <div><b>Invalidation:</b> {s.invalidation}</div>
              </div>
            ))}
          </Card>

          <Card title="Options lens">
            <div><b>Directional default:</b> {outlook.options_lens?.directional?.default}</div>
            {(outlook.options_lens?.directional?.naked || []).map((t: string, i: number) => <div key={i}>• {t}</div>)}
            {(outlook.options_lens?.directional?.spreads || []).map((t: string, i: number) => <div key={i}>• {t}</div>)}
            <div style={{ marginTop: 8 }}><b>Wheel preference:</b> {outlook.options_lens?.wheel?.preference}</div>
            {(outlook.options_lens?.wheel?.csp_cc || []).map((t: string, i: number) => <div key={i}>• {t}</div>)}
            {(outlook.options_lens?.wheel?.spreads || []).map((t: string, i: number) => <div key={i}>• {t}</div>)}
          </Card>

          <Card title="Key levels + TA flags">
            <div style={{ fontSize: 12, color: "#666" }}>Supports / resistances, plus gaps, candles, sweeps, divergence</div>
            <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 12 }}>
{JSON.stringify({
  levels: out.technicals?.key_levels,
  gaps: out.technicals?.gaps,
  candles: out.technicals?.candles,
  sweeps: out.technicals?.ma_sweeps,
  divergence: out.momentum?.rsi_divergence,
  fvg: out.technicals?.fair_value_gaps,
  order_blocks: out.technicals?.order_blocks,
  fib: out.technicals?.fibonacci
}, null, 2)}
            </pre>
          </Card>

          <Card title="Recent news (if any)">
            {(out.news_context?.notable_items || []).length === 0 ? (
              <div style={{ color: "#666" }}>No stored headlines for this symbol in the last 7 days yet (RSS ingest needs time).</div>
            ) : (
              (out.news_context.notable_items || []).slice(0, 10).map((n: any, i: number) => (
                <div key={i} style={{ padding: "10px 0", borderTop: "1px solid #eee" }}>
                  <div style={{ fontWeight: 700 }}>{n.headline}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>{n.created_at}</div>
                  <div style={{ fontSize: 12 }}>tags: {(n.tags || []).join(", ")} | score: {n.score}</div>
                  {n.url && <a href={n.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>open</a>}
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}
