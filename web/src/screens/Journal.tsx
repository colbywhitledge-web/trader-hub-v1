import React, { useEffect, useMemo, useState } from "react";
import { createTrade, deleteTrade, listTrades, updateTrade } from "../api";

function Card({ title, subtitle, children }: any) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 16, padding: 14, background: "white", marginTop: 12 }}>
      <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
      {subtitle ? <div style={{ marginTop: 2, fontSize: 12, color: "#666" }}>{subtitle}</div> : null}
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

export default function Journal() {
  const [symbol, setSymbol] = useState("TSLA");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [strategy, setStrategy] = useState("wheel");
  const [timeframe, setTimeframe] = useState("D");
  const [thesis, setThesis] = useState("");
  const [entry, setEntry] = useState<string>("");
  const [stop, setStop] = useState<string>("");
  const [target, setTarget] = useState<string>("");
  const [outcome, setOutcome] = useState("open");
  const [notes, setNotes] = useState("");

  const [filterSymbol, setFilterSymbol] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setErr("");
    try {
      const res = await listTrades(200, filterSymbol.trim().toUpperCase() || undefined);
      setRows(Array.isArray(res) ? res : (res?.trades || res?.results || []));
    } catch (e: any) {
      setErr(String(e?.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    return [...(rows || [])].sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [rows]);

  function resetForm() {
    setEditingId(null);
    setSymbol("TSLA");
    setDirection("long");
    setStrategy("wheel");
    setTimeframe("D");
    setThesis("");
    setEntry("");
    setStop("");
    setTarget("");
    setOutcome("open");
    setNotes("");
  }

  async function save() {
    setLoading(true);
    setErr("");
    try {
      const payload = {
        symbol: symbol.trim().toUpperCase(),
        direction,
        strategy,
        timeframe,
        thesis,
        entry: entry ? Number(entry) : null,
        stop: stop ? Number(stop) : null,
        target: target ? Number(target) : null,
        outcome,
        notes,
      };
      if (!payload.symbol) throw new Error("Symbol required");

      if (editingId) await updateTrade(editingId, payload);
      else await createTrade(payload);

      resetForm();
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function startEdit(t: any) {
    setEditingId(t.id);
    setSymbol(t.symbol || "");
    setDirection((t.direction || "long") as any);
    setStrategy(t.strategy || "");
    setTimeframe(t.timeframe || "");
    setThesis(t.thesis || "");
    setEntry(t.entry != null ? String(t.entry) : "");
    setStop(t.stop != null ? String(t.stop) : "");
    setTarget(t.target != null ? String(t.target) : "");
    setOutcome(t.outcome || "open");
    setNotes(t.notes || "");
  }

  async function remove(id: string) {
    if (!confirm("Delete this trade?")) return;
    setLoading(true);
    setErr("");
    try {
      await deleteTrade(id);
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Card title="Trade journal" subtitle="Fast CRUD to D1 (requires APP_SECRET for writes)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol" style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", fontWeight: 900 }} />

          <select value={direction} onChange={(e) => setDirection(e.target.value as any)} style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", fontWeight: 900 }}>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>

          <input value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Strategy (wheel, swing, scalp...)" style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }} />

          <input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="Timeframe (D, W, 60m...)" style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }} />
        </div>

        <textarea value={thesis} onChange={(e) => setThesis(e.target.value)} rows={3} placeholder="Thesis" style={{ marginTop: 10, width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd" }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 10 }}>
          <input value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="Entry" style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }} />
          <input value={stop} onChange={(e) => setStop(e.target.value)} placeholder="Stop" style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }} />
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target" style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }} />
          <input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Outcome (open, win, loss...)" style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }} />
        </div>

        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notes" style={{ marginTop: 10, width: "100%", padding: 12, borderRadius: 12, border: "1px solid #ddd" }} />

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={save} disabled={loading} style={{ padding: 12, borderRadius: 12, border: "1px solid #111", background: "#111", color: "white", fontWeight: 950 }}>
            {loading ? "Saving…" : editingId ? "Update trade" : "Add trade"}
          </button>
          <button onClick={resetForm} disabled={loading} style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", background: "white", fontWeight: 900 }}>
            Clear
          </button>
        </div>

        {err ? <div style={{ marginTop: 10, color: "crimson", whiteSpace: "pre-wrap" }}>{err}</div> : null}
      </Card>

      <Card title="Recent trades" subtitle="Newest first">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input value={filterSymbol} onChange={(e) => setFilterSymbol(e.target.value)} placeholder="Filter by symbol" style={{ width: 200, padding: 12, borderRadius: 12, border: "1px solid #ddd" }} />
          <button onClick={refresh} disabled={loading} style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", fontWeight: 900, background: "white" }}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {sorted.length === 0 ? (
          <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>No trades yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            {sorted.map((t: any) => (
              <div key={t.id} style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 950 }}>
                    {t.symbol} • {String(t.direction || "").toUpperCase()} • {t.strategy || "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>{String(t.created_at || "").slice(0, 19).replace("T", " ")}</div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                  TF: {t.timeframe || "—"} • entry: {t.entry ?? "—"} • stop: {t.stop ?? "—"} • target: {t.target ?? "—"} • outcome: <b>{t.outcome || "open"}</b>
                </div>
                {t.thesis ? <div style={{ marginTop: 8, fontSize: 13 }}>{t.thesis}</div> : null}
                {t.notes ? <div style={{ marginTop: 8, fontSize: 13, color: "#444" }}>{t.notes}</div> : null}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button onClick={() => startEdit(t)} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 900, background: "white" }}>
                    Edit
                  </button>
                  <button onClick={() => remove(t.id)} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 900, background: "white" }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
