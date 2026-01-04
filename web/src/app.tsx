import React, { useMemo, useState } from "react";
import Ask from "./screens/Ask";
import MyTickers from "./screens/MyTickers";
import Weekly from "./screens/Weekly";

type Tab = "ask" | "tickers" | "weekly";

const TabButton = ({ active, onClick, children }: any) => (
  <button
    onClick={onClick}
    style={{
      flex: 1,
      padding: 12,
      border: "none",
      borderTop: active ? "2px solid black" : "2px solid #ddd",
      background: "white",
      fontWeight: active ? 700 : 500,
    }}
  >
    {children}
  </button>
);

export default function App() {
  const [tab, setTab] = useState<Tab>("ask");

  const Screen = useMemo(() => {
    if (tab === "ask") return <Ask />;
    if (tab === "tickers") return <MyTickers />;
    return <Weekly />;
  }, [tab]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", paddingBottom: 56, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <header style={{ padding: "14px 14px 8px" }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Trader Hub</div>
        <div style={{ fontSize: 12, color: "#666" }}>AI-style briefs + alerts + wheel lens (v1)</div>
      </header>

      <main style={{ padding: 14 }}>{Screen}</main>

      <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "white", display: "flex" }}>
        <TabButton active={tab === "ask"} onClick={() => setTab("ask")}>Ask</TabButton>
        <TabButton active={tab === "tickers"} onClick={() => setTab("tickers")}>My Tickers</TabButton>
        <TabButton active={tab === "weekly"} onClick={() => setTab("weekly")}>Weekly</TabButton>
      </nav>
    </div>
  );
}
