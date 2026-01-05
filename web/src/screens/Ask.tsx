import React, { useMemo, useState } from "react";
import { dailyReport } from "../api";

/**
 * Ask screen – cleaned up TA + Key Levels UI
 * - No more raw JSON dump
 * - Adds actionable summary + scannable key levels
 * - Keeps everything inline (no CSS file needed)
 */

function Card({
  title,
  subtitle,
  right,
  children,
}: any) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 14,
        padding: 14,
        marginTop: 12,
        background: "white",
        boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>{title}</div>
          {subtitle ? (
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 2 }}>{subtitle}</div>
          ) : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Badge({ tone = "neutral", text, title }: { tone?: string; text: string; title?: string }) {
  const { bg, border, dot } = useMemo(() => {
    const base = { bg: "rgba(0,0,0,0.03)", border: "rgba(0,0,0,0.10)", dot: "rgba(0,0,0,0.35)" };
    if (tone === "bull") return { bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.30)", dot: "rgb(34,197,94)" };
    if (tone === "bear") return { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.30)", dot: "rgb(239,68,68)" };
    if (tone === "warn") return { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", dot: "rgb(245,158,11)" };
    if (tone === "info") return { bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.35)", dot: "rgb(96,165,250)" };
    return base;
  }, [tone]);

  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: bg,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, display: "inline-block" }} />
      {text}
    </span>
  );
}

function KV({ label, value, hint }: { label: string; value: any; hint?: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(0,0,0,0.02)",
      }}
      title={hint}
    >
      <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ fontWeight: 900 }}>{value ?? "—"}</div>
    </div>
  );
}

function fmt(n: any, d = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const num = Number(n);
  if (Math.abs(num) >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  return num.toFixed(d);
}

function pickArray(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (Array.isArray(v) && v.length) return v;
  }
  return [];
}

function normalizeLevels(keyLevels: any) {
  if (!keyLevels) return { support: [], resistance: [] };

  // Support/resistance can be named a dozen ways depending on the engine version.
  const support = pickArray(keyLevels, ["support", "supports", "sup", "S", "demand", "buy_zones"]);
  const resistance = pickArray(keyLevels, ["resistance", "resistances", "res", "R", "supply", "sell_zones"]);

  // If it's already a simple shape
  if (support.length || resistance.length) return { support, resistance };

  // If it's a map/object of arrays, try to infer
  const vals = Object.values(keyLevels || {});
  const arrays = vals.filter((v: any) => Array.isArray(v)) as any[];
  if (arrays.length === 1) return { support: arrays[0], resistance: [] };
  if (arrays.length >= 2) return { support: arrays[0], resistance: arrays[1] };

  return { support: [], resistance: [] };
}

function asBullets(x: any) {
  if (!x) return [];
  if (Array.isArray(x)) return x.filter(Boolean).map(String);
  if (typeof x === "string") return [x];
  if (typeof x === "object") {
    // flatten shallow object values
    const out: string[] = [];
    for (const [k, v] of Object.entries(x)) {
      if (v === null || v === undefined) continue;
      if (Array.isArray(v)) {
        v.filter(Boolean).forEach((it) => out.push(`${k}: ${String(it)}`));
      } else {
        out.push(`${k}: ${String(v)}`);
      }
    }
    return out;
  }
  return [String(x)];
}

function buildActionableSummary({
  bias,
  score,
  confidence,
  expectedRange,
  levels,
  divergence,
  gaps,
  sweeps,
  candles,
  fvg,
  orderBlocks,
}: any) {
  const bullets: { tone: string; text: string }[] = [];

  // Bias / confidence
  const biasStr = (bias || "").toString().toLowerCase();
  const tone =
    biasStr.includes("bull") || biasStr.includes("long") || biasStr.includes("up")
      ? "bull"
      : biasStr.includes("bear") || biasStr.includes("short") || biasStr.includes("down")
      ? "bear"
      : "neutral";

  if (bias) {
    const conf = confidence ? ` (conf ${confidence}/5)` : "";
    const sc = score !== undefined && score !== null ? `, score ${score}` : "";
    bullets.push({
      tone,
      text: `Bias: ${String(bias)}${sc}${conf}.`,
    });
  }

  // Expected range
  const low = expectedRange?.low;
  const high = expectedRange?.high;
  if (low !== undefined || high !== undefined) {
    bullets.push({
      tone: "info",
      text: `Next-day range: ${fmt(low)} → ${fmt(high)}.`,
    });
  }

  // Key plan from nearest levels (best-effort without current price)
  const s = (levels?.support || []).map(Number).filter((n: any) => Number.isFinite(n));
  const r = (levels?.resistance || []).map(Number).filter((n: any) => Number.isFinite(n));

  const sTop = s.slice(0, 2).map((n: number) => fmt(n)).filter((x: string) => x !== "—");
  const rTop = r.slice(0, 2).map((n: number) => fmt(n)).filter((x: string) => x !== "—");

  if (sTop.length) bullets.push({ tone: "bull", text: `Support to defend: ${sTop.join(" • ")}.` });
  if (rTop.length) bullets.push({ tone: "bear", text: `Resistance to clear: ${rTop.join(" • ")}.` });

  // Flags (keep tight)
  const div = asBullets(divergence);
  if (div.length) bullets.push({ tone: "warn", text: `Momentum note: ${div[0]}` });

  const g = asBullets(gaps);
  if (g.length) bullets.push({ tone: "info", text: `Gaps: ${g[0]}` });

  const sw = asBullets(sweeps);
  if (sw.length) bullets.push({ tone: "warn", text: `MA sweeps: ${sw[0]}` });

  const c = asBullets(candles);
  if (c.length) bullets.push({ tone: "info", text: `Candles: ${c[0]}` });

  const fv = asBullets(fvg);
  if (fv.length) bullets.push({ tone: "info", text: `FVG: ${fv[0]}` });

  const ob = asBullets(orderBlocks);
  if (ob.length) bullets.push({ tone: "info", text: `Order blocks: ${ob[0]}` });

  return bullets.slice(0, 6);
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

  const tone = useMemo(() => {
    const b = (outlook?.bias || "").toString().toLowerCase();
    if (b.includes("bull") || b.includes("long") || b.includes("up")) return "bull";
    if (b.includes("bear") || b.includes("short") || b.includes("down")) return "bear";
    if (b.includes("watch") || b.includes("caution")) return "warn";
    return "neutral";
  }, [outlook?.bias]);

  const levels = useMemo(() => normalizeLevels(out?.technicals?.key_levels), [out?.technicals?.key_levels]);

  const summary = useMemo(
    () =>
      buildActionableSummary({
        bias: outlook?.bias,
        score: outlook?.score,
        confidence: outlook?.confidence_1_5,
        expectedRange: outlook?.expected_range_next_day,
        levels,
        divergence: out?.momentum?.rsi_divergence,
        gaps: out?.technicals?.gaps,
        sweeps: out?.technicals?.ma_sweeps,
        candles: out?.technicals?.candles,
        fvg: out?.technicals?.fair_value_gaps,
        orderBlocks: out?.technicals?.order_blocks,
      }),
    [outlook, out, levels]
  );

  return (
    <div>
      <Card
        title="Ask the engine"
        subtitle="Run a daily report for a symbol and get a structured plan"
        right={tone !== "neutral" ? <Badge tone={tone} text={tone === "bull" ? "Bullish" : tone === "bear" ? "Bearish" : "Watch"} /> : null}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="TSLA"
            style={{
              width: 90,
              padding: 10,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              fontWeight: 800,
              letterSpacing: 0.3,
            }}
          />
          <button
            onClick={run}
            disabled={loading}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              fontWeight: 900,
              background: loading ? "rgba(0,0,0,0.04)" : "white",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Running..." : "Run"}
          </button>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            marginTop: 8,
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            resize: "vertical",
          }}
        />

        <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 8 }}>
          Examples: “evaluate for wheel — spreads”, “use spreads”, “naked only”
        </div>
      </Card>

      {err && <div style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{err}</div>}

      {outlook && (
        <>
          <Card
            title={`${out.symbol} outlook`}
            subtitle="Bias + confidence + next-day expected range"
            right={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {outlook.bias ? <Badge tone={tone} text={String(outlook.bias)} title="Model bias" /> : null}
                {outlook.confidence_1_5 ? <Badge tone="info" text={`Conf ${outlook.confidence_1_5}/5`} title="Confidence (1–5)" /> : null}
                {outlook.score !== undefined && outlook.score !== null ? <Badge tone="info" text={`Score ${outlook.score}`} title="Score" /> : null}
              </div>
            }
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <KV label="Expected low" value={fmt(outlook.expected_range_next_day?.low)} />
              <KV label="Expected high" value={fmt(outlook.expected_range_next_day?.high)} />
            </div>
          </Card>

          <Card title="Scenarios" subtitle="If/Then conditions with entry + invalidation">
            {outlook.scenarios?.map((s: any, idx: number) => (
              <div
                key={s.name || idx}
                style={{
                  padding: "12px 0",
                  borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.6 }}>{s.name}</div>
                  {s.name?.toLowerCase?.().includes("bull") ? <Badge tone="bull" text="Upside" /> : null}
                  {s.name?.toLowerCase?.().includes("bear") ? <Badge tone="bear" text="Downside" /> : null}
                  {s.name?.toLowerCase?.().includes("base") ? <Badge tone="neutral" text="Base" /> : null}
                </div>
                <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                  <div>
                    <span style={{ fontWeight: 900 }}>If:</span> {s.if}
                  </div>
                  {s.entry_idea ? (
                    <div>
                      <span style={{ fontWeight: 900 }}>Entry:</span> {s.entry_idea}
                    </div>
                  ) : null}
                  {s.plan ? (
                    <div>
                      <span style={{ fontWeight: 900 }}>Plan:</span> {s.plan}
                    </div>
                  ) : null}
                  <div>
                    <span style={{ fontWeight: 900 }}>Invalidation:</span> {s.invalidation}
                  </div>
                </div>
              </div>
            ))}
          </Card>

          <Card title="Options lens" subtitle="Directional defaults + wheel preferences">
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontWeight: 900 }}>Directional default:</div>
                <div>{outlook.options_lens?.directional?.default ?? "—"}</div>
              </div>

              {((outlook.options_lens?.directional?.naked || []) as string[]).length ? (
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Directional (naked)</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {(outlook.options_lens?.directional?.naked || []).map((t: string, i: number) => (
                      <div key={i} style={{ padding: "8px 10px", borderRadius: 12, background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.08)" }}>
                        • {t}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {((outlook.options_lens?.directional?.spreads || []) as string[]).length ? (
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Directional (spreads)</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {(outlook.options_lens?.directional?.spreads || []).map((t: string, i: number) => (
                      <div key={i} style={{ padding: "8px 10px", borderRadius: 12, background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.08)" }}>
                        • {t}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontWeight: 900 }}>Wheel preference:</div>
                <div>{outlook.options_lens?.wheel?.preference ?? "—"}</div>
              </div>

              {((outlook.options_lens?.wheel?.csp_cc || []) as string[]).length ? (
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Wheel (CSP/CC)</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {(outlook.options_lens?.wheel?.csp_cc || []).map((t: string, i: number) => (
                      <div key={i} style={{ padding: "8px 10px", borderRadius: 12, background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.08)" }}>
                        • {t}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {((outlook.options_lens?.wheel?.spreads || []) as string[]).length ? (
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Wheel (spreads)</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {(outlook.options_lens?.wheel?.spreads || []).map((t: string, i: number) => (
                      <div key={i} style={{ padding: "8px 10px", borderRadius: 12, background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.08)" }}>
                        • {t}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card
            title="TA & Key Levels"
            subtitle="Supports / resistances plus flags (gaps, candles, sweeps, divergence)"
            right={<Badge tone="info" text="Actionable view" />}
          >
            <div style={{ display: "grid", gap: 12 }}>
              <div
                style={{
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 14,
                  background: "rgba(0,0,0,0.02)",
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 950 }}>Actionable summary</div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>What to do, not just what it is</div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {summary.length ? (
                    summary.map((b: any, i: number) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            marginTop: 4,
                            background:
                              b.tone === "bull"
                                ? "rgb(34,197,94)"
                                : b.tone === "bear"
                                ? "rgb(239,68,68)"
                                : b.tone === "warn"
                                ? "rgb(245,158,11)"
                                : "rgb(96,165,250)",
                            flex: "0 0 auto",
                          }}
                        />
                        <div style={{ lineHeight: 1.25 }}>{b.text}</div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>No TA summary available for this run.</div>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <div
                  style={{
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "white",
                  }}
                >
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 950 }}>Support</div>
                    <Badge tone="bull" text="Buy zones" />
                  </div>
                  <div style={{ padding: 12, display: "grid", gap: 8 }}>
                    {(levels.support || []).slice(0, 6).map((lv: any, i: number) => (
                      <KV key={i} label={`S${i + 1}`} value={fmt(lv)} />
                    ))}
                    {!(levels.support || []).length ? <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>No support levels returned.</div> : null}
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "white",
                  }}
                >
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 950 }}>Resistance</div>
                    <Badge tone="bear" text="Sell zones" />
                  </div>
                  <div style={{ padding: 12, display: "grid", gap: 8 }}>
                    {(levels.resistance || []).slice(0, 6).map((lv: any, i: number) => (
                      <KV key={i} label={`R${i + 1}`} value={fmt(lv)} />
                    ))}
                    {!(levels.resistance || []).length ? <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>No resistance levels returned.</div> : null}
                  </div>
                </div>
              </div>

              <div
                style={{
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 14,
                  padding: 12,
                  background: "white",
                }}
              >
                <div style={{ fontWeight: 950 }}>TA flags</div>
                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 2 }}>Quick scan of extra context (kept compact)</div>

                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <Badge tone="info" text="Gaps" />
                      <span style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>Imbalances / fill targets</span>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {asBullets(out?.technicals?.gaps).slice(0, 5).map((t: string, i: number) => (
                        <div key={i} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(0,0,0,0.02)" }}>
                          • {t}
                        </div>
                      ))}
                      {!asBullets(out?.technicals?.gaps).length ? <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>None</div> : null}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <Badge tone="info" text="Candles" />
                      <span style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>Reversal / continuation hints</span>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {asBullets(out?.technicals?.candles).slice(0, 5).map((t: string, i: number) => (
                        <div key={i} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(0,0,0,0.02)" }}>
                          • {t}
                        </div>
                      ))}
                      {!asBullets(out?.technicals?.candles).length ? <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>None</div> : null}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <Badge tone="warn" text="MA sweeps" />
                      <span style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>Liquidity / mean reversion</span>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {asBullets(out?.technicals?.ma_sweeps).slice(0, 5).map((t: string, i: number) => (
                        <div key={i} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(0,0,0,0.02)" }}>
                          • {t}
                        </div>
                      ))}
                      {!asBullets(out?.technicals?.ma_sweeps).length ? <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>None</div> : null}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <Badge tone="warn" text="RSI divergence" />
                      <span style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>Momentum warning</span>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {asBullets(out?.momentum?.rsi_divergence).slice(0, 5).map((t: string, i: number) => (
                        <div key={i} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(0,0,0,0.02)" }}>
                          • {t}
                        </div>
                      ))}
                      {!asBullets(out?.momentum?.rsi_divergence).length ? <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>None</div> : null}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <Badge tone="info" text="FVG" />
                      <span style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>Fair value gaps</span>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {asBullets(out?.technicals?.fair_value_gaps).slice(0, 5).map((t: string, i: number) => (
                        <div key={i} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(0,0,0,0.02)" }}>
                          • {t}
                        </div>
                      ))}
                      {!asBullets(out?.technicals?.fair_value_gaps).length ? <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>None</div> : null}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <Badge tone="info" text="Order blocks" />
                      <span style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>Supply / demand zones</span>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {asBullets(out?.technicals?.order_blocks).slice(0, 5).map((t: string, i: number) => (
                        <div key={i} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(0,0,0,0.02)" }}>
                          • {t}
                        </div>
                      ))}
                      {!asBullets(out?.technicals?.order_blocks).length ? <div style={{ color: "rgba(0,0,0,0.55)", fontSize: 13 }}>None</div> : null}
                    </div>
                  </div>
                </div>

                {out?.technicals?.fibonacci ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <Badge tone="info" text="Fibonacci" />
                      <span style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>Levels / anchors</span>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {asBullets(out?.technicals?.fibonacci).slice(0, 8).map((t: string, i: number) => (
                        <div key={i} style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(0,0,0,0.02)" }}>
                          • {t}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <Card title="Recent news (if any)" subtitle="Stored headlines for the symbol (up to 10)">
            {(out.news_context?.notable_items || []).length === 0 ? (
              <div style={{ color: "rgba(0,0,0,0.55)" }}>
                No stored headlines for this symbol in the last 7 days yet (RSS ingest needs time).
              </div>
            ) : (
              (out.news_context.notable_items || []).slice(0, 10).map((n: any, i: number) => (
                <div
                  key={i}
                  style={{
                    padding: "12px 0",
                    borderTop: i === 0 ? "none" : "1px solid rgba(0,0,0,0.06)",
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{n.headline}</div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{n.created_at}</div>
                  <div style={{ fontSize: 12 }}>
                    tags: {(n.tags || []).join(", ")} | score: {n.score}
                  </div>
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                      open
                    </a>
                  ) : null}
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}
