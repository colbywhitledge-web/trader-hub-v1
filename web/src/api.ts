const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  (import.meta as any).env?.VITE_WORKER_URL ||
  "https://trader-hub-api.colbywhitledge.workers.dev";

const APP_SECRET = (import.meta as any).env?.VITE_APP_SECRET || "";

function headers() {
  return {
    "content-type": "application/json",
    "x-app-secret": APP_SECRET,
  };
}

export async function dailyReport(symbol: string, prompt: string, asof_date?: string, force?: boolean) {
  const res = await fetch(`${API_BASE}/api/daily-report`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ symbol, prompt, asof_date, force }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSignals(symbol: string, timeframe: string = "D") {
  const res = await fetch(`${API_BASE}/api/signals`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ symbol, timeframe }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getAlerts(limit = 50, symbol?: string, q?: string) {
  const url = new URL(`${API_BASE}/api/alerts`);
  url.searchParams.set("limit", String(limit));
  if (symbol) url.searchParams.set("symbol", symbol);
  if (q) url.searchParams.set("q", q);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function ingestRss() {
  const res = await fetch(`${API_BASE}/api/ingest/rss`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listTrades(limit = 100, symbol?: string) {
  const url = new URL(`${API_BASE}/api/trades`);
  url.searchParams.set("limit", String(limit));
  if (symbol) url.searchParams.set("symbol", symbol);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createTrade(trade: any) {
  const res = await fetch(`${API_BASE}/api/trades`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(trade),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateTrade(id: string, trade: any) {
  const res = await fetch(`${API_BASE}/api/trades/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(trade),
    }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteTrade(id: string) {
  const res = await fetch(`${API_BASE}/api/trades/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: headers(),
    }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getWatchlists() {
  const res = await fetch(`${API_BASE}/api/watchlists`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createWatchlist(name: string) {
  const res = await fetch(`${API_BASE}/api/watchlists`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function addToWatchlist(watchlist_id: string, symbol: string) {
  const res = await fetch(`${API_BASE}/api/watchlists/add`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ watchlist_id, symbol }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function runWatchlist(watchlist_id: string, prompt: string, asof_date?: string) {
  const res = await fetch(`${API_BASE}/api/watchlists/run`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ watchlist_id, prompt, asof_date }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function weeklyPicks(prompt: string, asof_date?: string, force?: boolean) {
  const res = await fetch(`${API_BASE}/api/weekly-picks`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ prompt, asof_date, force }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function latestWeekly(asof_date?: string) {
  const url = new URL(`${API_BASE}/api/weekly-picks/latest`);
  if (asof_date) url.searchParams.set("asof_date", asof_date);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
