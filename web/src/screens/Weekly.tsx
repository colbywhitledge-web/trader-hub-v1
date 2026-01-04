import React, { useState } from "react";
import { latestWeekly, weeklyPicks } from "../api";

function Card({ title, children }: any) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, marginTop: 12 }}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

export default function Weekly() {
  const [prompt, setPrompt] = useState("what are my best plays for this week?");
  const [out, setOut] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function generate() {
    setLoading(true);
    setErr("");
    try {
      const res = await weeklyPicks(prompt);
      setOut(res.payload);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadLatest() {
    setLoading(true);
    setErr("");
    try {
      const res = await latestWeekly();
      setOut(res.payload);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Card title="Weekly briefing">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={generate} disabled={loading} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd", fontWeight: 800 }}>
            {loading ? "Working..." : "Generate"}
          </button>
          <button onClick={loadLatest} disabled={loading} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd", fontWeight: 800 }}>
            Load latest
          </button>
        </div>
      </Card>

      {err && <div style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{err}</div>}

      {out?.picks && (
        <Card title={`Picks (${out.picks.length}) — as of ${out.asof_date}`}>
          {(out.picks || []).map((p: any) => (
            <div key={p.symbol} style={{ padding: "10px 0", borderTop: "1px solid #eee" }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{p.symbol}</div>
              <div style={{ fontSize: 12 }}>
                score: <b>{p.score}</b> | bias: <b>{p.bias}</b> | conf: {p.confidence}/5 | trend: {p.trend}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                tags: {(p.top_tags || []).join(", ")}
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                range: {p.expected_range?.low?.toFixed?.(2)} → {p.expected_range?.high?.toFixed?.(2)}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
