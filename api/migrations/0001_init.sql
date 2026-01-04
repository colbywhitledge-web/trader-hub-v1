CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  symbol TEXT,
  headline TEXT NOT NULL,
  summary TEXT,
  source TEXT,
  url TEXT NOT NULL,
  tags TEXT,
  score INTEGER DEFAULT 0,
  alert_type TEXT DEFAULT 'rss'
);

CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  strategy TEXT,
  timeframe TEXT,
  thesis TEXT,
  entry REAL,
  stop REAL,
  target REAL,
  outcome TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);

CREATE TABLE IF NOT EXISTS trade_alert_links (
  trade_id TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  PRIMARY KEY (trade_id, alert_id),
  FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
  FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
);
