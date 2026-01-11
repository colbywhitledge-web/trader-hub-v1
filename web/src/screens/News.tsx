import React, { useEffect, useMemo, useState } from "react";
import { getAlerts, ingestRss } from "../api";

function Card({ title, subtitle, children }: any) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 16, padding: 14, background: "white", marginTop: 12 }}>
      <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
      {subtitle ? <div style={{ marginTop: 2, fontSize: 12, color: "#666" }}>{subtitle}</div> : null}
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

export default function News() {
  const [symbol, setSymbol] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [err, setErr] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [minScore, setMinScore] = useState<0 | 20 | 40>(20);

  async function refresh() {
    setLoading(true);
    setErr("");
    try {
      const res = await getAlerts(limit, symbol.trim().toUpperCase() || undefined, q.trim() || undefined);
      setRows(Array.isArray(res) ? res : (res?.results || []));
    } catch (e: any) {
      setErr(String(e?.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function ingest() {
    setIngesting(true);
    setErr("");
    try {
      await ingestRss();
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setIngesting(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return (rows || []).filter((r: any) => (Number(r.score) || 0) >= minScore);
  }, [rows, minScore]);

  return (
    <div>
      <Card title="News & alerts" subtitle="RSS ingest → stored in D1 → displayed here">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Symbol (optional)"
            style={{ width: 180, padding: 12, borderRadius: 12, border: "1px solid #ddd", fontWeight: 800 }}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search headline/summary"
            style={{ flex: 1, minWidth: 220, padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
          />
          <button
            onClick={refresh}
            disabled={loading}
            style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", fontWeight: 900, background: "white" }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            onClick={ingest}
            disabled={ingesting}
            style={{ padding: 12, borderRadius: 12, border: "1px solid #111", background: "#111", color: "white", fontWeight: 900 }}
          >
            {ingesting ? "Ingesting…" : "Ingest RSS now"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Minimum score:</div>
          {([
            [0, "All"],
            [20, "Important"],
            [40, "Breaking-ish"],
          ] as const).map(([s, label]) => (
            <button
              key={s}
              onClick={() => setMinScore(s)}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #ddd",
                fontWeight: 900,
                background: minScore === s ? "#111" : "white",
                color: minScore === s ? "white" : "#111",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {err ? <div style={{ marginTop: 10, color: "crimson", whiteSpace: "pre-wrap" }}>{err}</div> : null}
      </Card>

      <Card title={`Feed (${filtered.length})`} subtitle="Newest first">
        {filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: "#666" }}>
            No items yet. Click “Ingest RSS now” (requires correct APP_SECRET), or widen filters.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((r: any) => (
              <a
                key={r.id}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  border: "1px solid #eee",
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 950 }}>{r.headline}</div>
                  <div style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>{String(r.created_at || "").slice(0, 19).replace("T", " ")}</div>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
                  {r.symbol ? <b>{r.symbol}</b> : null}{r.symbol ? " • " : null}
                  score: <b>{r.score ?? 0}</b>{r.source ? ` • ${r.source}` : ""}
                </div>
                {r.summary ? <div style={{ marginTop: 8, fontSize: 13, color: "#111" }}>{r.summary}</div> : null}
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
