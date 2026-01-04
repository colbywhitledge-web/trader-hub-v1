-- Watchlists
CREATE TABLE IF NOT EXISTS watchlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  watchlist_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  PRIMARY KEY (watchlist_id, symbol),
  FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE
);

-- Cached ticker reports (daily outlooks, etc.)
CREATE TABLE IF NOT EXISTS ticker_reports (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  asof_date TEXT NOT NULL,         -- YYYY-MM-DD
  report_type TEXT NOT NULL,       -- daily_outlook / etc.
  preferences_json TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ticker_reports_symbol_date
  ON ticker_reports(symbol, asof_date);

-- Cached weekly reports
CREATE TABLE IF NOT EXISTS weekly_reports (
  id TEXT PRIMARY KEY,
  asof_date TEXT NOT NULL,         -- YYYY-MM-DD
  preferences_json TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_asof_date
  ON weekly_reports(asof_date);
