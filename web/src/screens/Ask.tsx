import React, { useMemo, useState } from "react";
import { dailyReport } from "../api";

function Card({ title, children }: any) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, marginTop: 12 }}>
      <div style={{ fontWeight: 900 }}>{title}</div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "good" | "bad" | "warn" | "neutral"; children: any }) {
  const bg =
    tone === "good" ? "#ECFDF3" :
    tone === "bad" ? "#FEF2F2" :
    tone === "warn" ? "#FFFBEB" : "#F3F4F6";

  const bd =
    tone === "good" ? "#A7F3D0" :
    tone === "bad" ? "#FECACA" :
    tone === "warn" ? "#FDE68A" : "#E5E7EB";

  const fg =
    tone === "good" ? "#065F46" :
    tone === "bad" ? "#991B1B" :
    tone === "warn" ? "#92400E" : "#111827";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${bd}`, background: bg, color: fg, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>
      {children}
    </span>
  );
}

function toneFromSignal(s: any): "good" | "bad" | "warn" | "neutral" {
  const sev = String(s?.severity || s?.level || "").toLowerCase();
  if (sev.includes("high") || sev === "3" || sev === "4" || sev === "5") return "warn";
  const dir = String(s?.direction || s?.bias || "").toLowerCase();
  if (dir.includes("bull")) return "good";
  if (dir.includes("bear")) return "bad";
  return "neutral";
}

export default function Ask() {
  const [symbol, setSymbol] = useState("TSLA");
  const [prompt, setPrompt] = useState("what will TSLA do tomorrow?");
  const [loading, setLoading] = useState(false);

  const [out, setOut] = useState<any>(null);
  const [signals, setSignals] = useState<any[] | null>(null);

  const [err, setErr] = useState<string>("");
  const [sigErr, setSigErr] = useState<string>("");

  // Hardcode the Worker base for v1 reliability
  const API_BASE = "https://trader-hub-api.colbywhitledge.workers.dev";

  async function run() {
    setErr("");
    setSigErr("");
    setOut(null);
    setSignals(null);
    setLoading(true);

    try {
      const sym = symbol.trim().toUpperCase();
      const res = await dailyReport(sym, prompt);
      setOut(res.payload);

      // Signals are computed fresh via /api/signals (independent of cache)
      const sigRes = await fetch(`${API_BASE}/api/signals?symbol=${encodeURIComponent(sym)}&timeframe=D`, {
        headers: { "content-type": "application/json" },
      });
      const sigJson = await sigRes.json();
      if (!sigRes.ok || sigJson?.ok === false) throw new Error(sigJson?.error || "signals request failed");
      setSignals(sigJson?.signals || []);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (!out) setErr(msg);
      else setSigErr(msg);
    } finally {
      setLoading(false);
    }
  }

  const outlook = out?.outlook;

  const keyLevels = useMemo(() => {
    const s = out?.technicals?.key_levels?.support || [];
    const r = out?.technicals?.key_levels?.resistance || [];
    return { support: s, resistance: r };
  }, [out]);

  const actionableSummary = useMemo(() => {
    if (!outlook) return null;
    const low = outlook.expected_range_next_day?.low;
    const high = outlook.expected_range_next_day?.high;

    const topSup = keyLevels.support?.[0]?.price ?? null;
    const topRes = keyLevels.resistance?.[0]?.price ?? null;

    const parts: string[] = [];
    parts.push(`Bias: ${outlook.bias} (${outlook.score})`);
    if (typeof low === "number" && typeof high === "number") parts.push(`ATR range: ${low.toFixed(2)}–${high.toFixed(2)}`);
    if (typeof topSup === "number") parts.push(`Nearest support: ${topSup.toFixed(2)}`);
    if (typeof topRes === "number") parts.push(`Nearest resistance: ${topRes.toFixed(2)}`);
    return parts.join(" • ");
  }, [outlook, keyLevels]);

  const topSignals = useMemo(() => {
    const arr = Array.isArray(signals) ? signals : [];
    // Prefer high confidence / severity first if fields exist
    return arr
      .slice()
      .sort((a: any, b: any) => {
        const ac = Number(a?.confidence ?? a?.score ?? 0);
        const bc = Number(b?.confidence ?? b?.score ?? 0);
        return bc - ac;
      })
      .slice(0, 18);
  }, [signals]);

  return (
    <div>
      <Card title="Ask the engine">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="TSLA"
            style={{ width: 120, padding: 10, borderRadius: 12, border: "1px solid #ddd", fontWeight: 900 }}
          />
          <button onClick={run} disabled={loading} style={{ flex: 1, padding: 10, borderRadius: 12, border: "1px solid #ddd", fontWeight: 900 }}>
            {loading ? "Running..." : "Run"}
          </button>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
        />
        <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
          Signals are computed fresh from the chart via <b>/api/signals</b> so caching can’t hide them.
        </div>
      </Card>

      {err && <div style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{err}</div>}

      {outlook && (
        <>
          <Card title={`${out.symbol} outlook`}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Badge tone={outlook.bias === "bullish" ? "good" : outlook.bias === "bearish" ? "bad" : "neutral"}>Bias: {outlook.bias}</Badge>
              <Badge tone={outlook.score >= 25 ? "good" : outlook.score <= -25 ? "bad" : "neutral"}>Score: {outlook.score}</Badge>
              <Badge tone={outlook.confidence_1_5 >= 4 ? "good" : outlook.confidence_1_5 <= 2 ? "warn" : "neutral"}>Confidence: {outlook.confidence_1_5}/5</Badge>
            </div>

            {actionableSummary && (
              <div style={{ marginTop: 10, fontSize: 13, color: "#111", background: "#F9FAFB", border: "1px solid #EEE", borderRadius: 12, padding: 10 }}>
                {actionableSummary}
              </div>
            )}
          </Card>

          <Card title="Signals (actionable)">
            {sigErr && <div style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{sigErr}</div>}

            {!sigErr && signals === null && <div style={{ color: "#666" }}>Run a ticker to compute signals…</div>}

            {!sigErr && Array.isArray(signals) && signals.length === 0 && (
              <div style={{ color: "#666" }}>No signals fired on the current rule-set.</div>
            )}

            {!sigErr && Array.isArray(signals) && signals.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {topSignals.map((s: any, i: number) => (
                  <Badge key={i} tone={toneFromSignal(s)}>
                    {s?.title || s?.name || s?.type || "signal"}
                    {typeof s?.confidence === "number" ? <span style={{ opacity: 0.8 }}>({Math.round(s.confidence)})</span> : null}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
