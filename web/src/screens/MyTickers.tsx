import React, { useEffect, useMemo, useState } from "react";
import { addToWatchlist, createWatchlist, getWatchlists, runWatchlist } from "../api";

function Card({ title, children }: any) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, marginTop: 12 }}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

export default function MyTickers() {
  const [data, setData] = useState<any>(null);
  const [selected, setSelected] = useState<string>("");
  const [newListName, setNewListName] = useState("My Watchlist");
  const [newSymbol, setNewSymbol] = useState("TSLA");
  const [prompt, setPrompt] = useState("daily outlook");
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<any>(null);
  const [err, setErr] = useState("");

  async function refresh() {
    setErr("");
    setLoading(true);
    try {
      const res = await getWatchlists();
      setData(res);
      if (!selected && res.watchlists?.[0]?.id) setSelected(res.watchlists[0].id);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const items = useMemo(() => {
    if (!data?.items || !selected) return [];
    return data.items.filter((x: any) => x.watchlist_id === selected).map((x: any) => x.symbol);
  }, [data, selected]);

  async function makeList() {
    setLoading(true);
    try {
      await createWatchlist(newListName);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function addSymbol() {
    if (!selected) return;
    setLoading(true);
    try {
      await addToWatchlist(selected, newSymbol.trim().toUpperCase());
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function run() {
    if (!selected) return;
    setLoading(true);
    setErr("");
    try {
      const res = await runWatchlist(selected, prompt);
      setRuns(res);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Card title="Watchlists">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(data?.watchlists || []).map((w: any) => (
            <button
              key={w.id}
              onClick={() => setSelected(w.id)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                fontWeight: selected === w.id ? 800 : 600,
                background: selected === w.id ? "#f5f5f5" : "white",
              }}
            >
              {w.name}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input value={newListName} onChange={(e) => setNewListName(e.target.value)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
          <button onClick={makeList} disabled={loading} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", fontWeight: 700 }}>
            Create
          </button>
        </div>
      </Card>

      <Card title="Tickers in selected list">
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} style={{ width: 110, padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
          <button onClick={addSymbol} disabled={loading || !selected} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd", fontWeight: 700 }}>
            Add
          </button>
        </div>
        <div style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
          {items.length ? items.join(", ") : "No tickers yet."}
        </div>
      </Card>

      <Card title="Run daily briefs on my list">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
        <button onClick={run} disabled={loading || !selected} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 10, border: "1px solid #ddd", fontWeight: 800 }}>
          {loading ? "Running..." : "Run"}
        </button>
        <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
          Tip: “evaluate for wheel — spreads” or “use spreads” or “naked only”
        </div>
      </Card>

      {err && <div style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{err}</div>}

      {runs?.results && (
        <Card title="Results">
          {(runs.results || []).map((r: any) => (
            <div key={r.symbol} style={{ padding: "10px 0", borderTop: "1px solid #eee" }}>
              <div style={{ fontWeight: 900 }}>{r.symbol} <span style={{ fontSize: 12, color: "#666" }}>{r.cached ? "(cached)" : ""}</span></div>
              <div style={{ fontSize: 12 }}>
                bias: <b>{r.payload?.outlook?.bias}</b> | score: {r.payload?.outlook?.score} | conf: {r.payload?.outlook?.confidence_1_5}/5
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
