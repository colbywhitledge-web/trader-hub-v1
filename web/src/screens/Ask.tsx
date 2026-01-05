
import React, { useState } from "react";
import { dailyReport } from "../api";

function Card({ title, subtitle, children }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14, marginTop: 14 }}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{subtitle}</div>}
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

const renderValue = (v) => {
  if (v == null) return "—";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(renderValue).join(" • ");
  if (typeof v === "object") {
    if (v.type) return `type: ${v.type}`;
    if (v.pattern) return v.pattern;
    return Object.entries(v)
      .filter(([,x]) => typeof x !== "object")
      .map(([k,x]) => `${k}: ${x}`)
      .join(" • ") || "—";
  }
  return "—";
};

export default function Ask() {
  const [symbol, setSymbol] = useState("TSLA");
  const [prompt, setPrompt] = useState("what will TSLA do tomorrow?");
  const [out, setOut] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    setErr("");
    setLoading(true);
    try {
      const res = await dailyReport(symbol.trim().toUpperCase(), prompt);
      setOut(res.payload);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  const tech = out?.technicals || {};

  return (
    <div>
      <Card title="Ask the engine">
        <div style={{ display: "flex", gap: 8 }}>
          <input value={symbol} onChange={e=>setSymbol(e.target.value)} style={{ width: 90 }} />
          <button onClick={run}>{loading ? "Running…" : "Run"}</button>
        </div>
        <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3} style={{ width: "100%", marginTop: 8 }} />
      </Card>

      {err && <div style={{ color: "crimson", marginTop: 12 }}>{err}</div>}

      {out && (
        <>
          <Card title="TA & Key Levels" subtitle="Clean, readable technical context">
            <Card title="Support">
              {(tech.key_levels?.support || []).slice(0,3).map((x,i)=><div key={i}>{renderValue(x)}</div>)}
            </Card>
            <Card title="Resistance">
              {(tech.key_levels?.resistance || []).slice(0,3).map((x,i)=><div key={i}>{renderValue(x)}</div>)}
            </Card>
            <Card title="TA flags">
              {Object.entries(tech).map(([k,v])=>(
                <div key={k}><b>{k}:</b> {renderValue(v)}</div>
              ))}
            </Card>
          </Card>
        </>
      )}
    </div>
  );
}
