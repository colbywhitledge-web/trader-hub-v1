import { useEffect, useMemo, useState } from "react";

type Signal = {
  id?: string;
  title: string;
  category?: string;
  severity?: "high" | "med" | "low";
  direction?: "bullish" | "bearish" | "neutral";
  meta?: any;
};

type DailyPayload = any;

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  (import.meta as any).env?.VITE_WORKER_URL ||
  "https://trader-hub-api.colbywhitledge.workers.dev";

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function inferDirection(s: Signal): "bullish" | "bearish" | "neutral" {
  const t = (s.title || "").toLowerCase();
  const d = (s.direction || "").toLowerCase();
  if (d === "bullish" || d === "bearish" || d === "neutral") return d as any;
  if (t.includes("bull")) return "bullish";
  if (t.includes("bear")) return "bearish";
  return "neutral";
}

function badgeClass(dir: "bullish" | "bearish" | "neutral") {
  switch (dir) {
    case "bullish":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "bearish":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
}

function severityChip(sev?: Signal["severity"]) {
  if (sev === "high") return "High";
  if (sev === "med") return "Med";
  if (sev === "low") return "Low";
  return "";
}

async function postJSON<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${txt ? ` — ${txt}` : ""}`);
  }
  return (await res.json()) as T;
}

function TradingViewChart({ symbol }: { symbol: string }) {
  // Simple TradingView embed (free). This is an iframe, no API key.
  // Note: embedding respects TradingView's terms; this uses their official widget.
  const tvSymbol = useMemo(() => {
    // if user types TSLA, default to NASDAQ:TSLA
    const s = (symbol || "").trim();
    if (!s) return "NASDAQ:TSLA";
    if (s.includes(":")) return s;
    return `NASDAQ:${s.toUpperCase()}`;
  }, [symbol]);

  const src = useMemo(() => {
    const cfg = {
      symbol: tvSymbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "light",
      style: "1",
      locale: "en",
      toolbar_bg: "#f1f3f6",
      enable_publishing: false,
      hide_top_toolbar: false,
      save_image: false,
      container_id: "tv_container",
    };
    const encoded = encodeURIComponent(JSON.stringify(cfg));
    return `https://s.tradingview.com/widgetembed/?frameElementId=traderhub_tv&symbol=${encodeURIComponent(
      tvSymbol
    )}&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=f1f3f6&studies=%5B%5D&theme=light&style=1&timezone=Etc%2FUTC&withdateranges=1&hidevolume=0&locale=en#${encoded}`;
  }, [tvSymbol]);

  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">TradingView chart</div>
          <div className="text-xs text-slate-500">Free embedded chart (context). Signals below are computed from OHLCV.</div>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
          {tvSymbol}
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border">
        <iframe
          id="traderhub_tv"
          title="TradingView"
          src={src}
          className="h-[520px] w-full"
          allowFullScreen
        />
      </div>
    </div>
  );
}

export default function Ask() {
  const [symbol, setSymbol] = useState("TSLA");
  const [prompt, setPrompt] = useState("what will TSLA do tomorrow?");
  const [payload, setPayload] = useState<DailyPayload | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [sigErr, setSigErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [signalsView, setSignalsView] = useState<"highmed" | "high" | "all">("highmed");
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
    setSigErr(null);

    try {
      const sym = (symbol || "").trim().toUpperCase();
      if (!sym) throw new Error("Enter a ticker (e.g., TSLA)");

      // 1) Daily report (force fresh so prompt changes are reflected)
      const daily = await postJSON<any>("/api/daily-report", {
        symbol: sym,
        timeframe: "tomorrow",
        prompt,
        force: true,
      });
      setPayload(daily?.payload ?? daily);

      // 2) Signals computed from chart data (fresh, uncached)
      const sig = await postJSON<any>("/api/signals", {
        symbol: sym,
        timeframe: "D",
      });
      setSignals(sig?.signals ?? []);
    } catch (e: any) {
      setError(String(e?.message || e));
      setSignals([]);
      setSigErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // initial load
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const outlook = payload?.outlook;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <div className="text-3xl font-extrabold">Trader Hub</div>
        <div className="text-sm text-slate-600">AI-style briefs + alerts + wheel lens (v1)</div>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-xl font-bold">Ask the engine</div>
        <div className="text-sm text-slate-600">Run a daily report for a symbol and get decision-ready signals</div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="h-12 rounded-xl border px-4 text-lg font-semibold"
            placeholder="TSLA"
          />
          <button
            onClick={run}
            disabled={loading}
            className="h-12 rounded-xl bg-black px-6 text-base font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Running…" : "Run"}
          </button>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="mt-3 h-24 w-full rounded-xl border p-4 text-sm"
          placeholder='Examples: "evaluate for wheel — spreads", "use spreads", "naked only"'
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="text-xs text-slate-500">Signals view:</div>
          <button
            onClick={() => setSignalsView("highmed")}
            className={clsx(
              "rounded-full px-3 py-1 text-xs font-semibold ring-1",
              signalsView === "highmed" ? "bg-black text-white ring-black" : "bg-white text-slate-700 ring-slate-200"
            )}
          >
            High + Med
          </button>
          <button
            onClick={() => setSignalsView("high")}
            className={clsx(
              "rounded-full px-3 py-1 text-xs font-semibold ring-1",
              signalsView === "high" ? "bg-black text-white ring-black" : "bg-white text-slate-700 ring-slate-200"
            )}
          >
            High only
          </button>
          <button
            onClick={() => setSignalsView("all")}
            className={clsx(
              "rounded-full px-3 py-1 text-xs font-semibold ring-1",
              signalsView === "all" ? "bg-black text-white ring-black" : "bg-white text-slate-700 ring-slate-200"
            )}
          >
            All
          </button>
          <button
            onClick={() => setShowDebug((v) => !v)}
            className={clsx(
              "ml-auto rounded-full px-3 py-1 text-xs font-semibold ring-1",
              showDebug ? "bg-slate-100 text-slate-900 ring-slate-300" : "bg-white text-slate-700 ring-slate-200"
            )}
          >
            Show debug
          </button>
        </div>

        {error ? <div className="mt-3 text-sm font-semibold text-rose-600">{error}</div> : null}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6">
        <TradingViewChart symbol={symbol} />

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-lg font-bold">Signals</div>
          <div className="text-sm text-slate-600">Actionable tags (bullish/bearish/neutral) with confidence</div>

          {sigErr ? <div className="mt-3 text-sm text-rose-600">{sigErr}</div> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {filteredSignals.length === 0 ? (
              <div className="text-sm text-slate-500">No signals returned for this symbol/timeframe.</div>
            ) : (
              filteredSignals.map((s, i) => {
                const dir = inferDirection(s);
                return (
                  <div
                    key={s.id ?? `${s.title}-${i}`}
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1",
                      badgeClass(dir)
                    )}
                    title={s.category ? `${s.category}${s.severity ? ` • ${s.severity}` : ""}` : ""}
                  >
                    {severityChip(s.severity) ? (
                      <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold ring-1 ring-black/10">
                        {severityChip(s.severity)}
                      </span>
                    ) : null}
                    <span>{s.title}</span>
                  </div>
                );
              })
            )}
          </div>

          {showDebug ? (
            <pre className="mt-4 max-h-72 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200">
              {JSON.stringify({ payload, signals }, null, 2)}
            </pre>
          ) : null}
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-lg font-bold">{payload?.symbol ? `${payload.symbol} outlook` : "Outlook"}</div>

          {outlook ? (
            <div className="mt-3">
              <div className="flex flex-wrap gap-2">
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">Bias: {outlook.bias}</div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">Score: {outlook.score}</div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                  Confidence: {outlook.confidence_1_5}/5
                </div>
              </div>

              {outlook.expected_range_next_day ? (
                <div className="mt-3 rounded-xl border p-3 text-sm text-slate-700">
                  ATR range: {outlook.expected_range_next_day.low?.toFixed?.(2)} – {outlook.expected_range_next_day.high?.toFixed?.(2)}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-500">Run a ticker to see outlook.</div>
          )}
        </div>
      </div>
    </div>
  );
}
