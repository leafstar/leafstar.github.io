CREATE TABLE IF NOT EXISTS visitor_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT,
  region TEXT,
  country TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  UNIQUE(city, region, country, lat, lon)
);

CREATE INDEX IF NOT EXISTS idx_visitor_locations_last_seen
ON visitor_locations(last_seen DESC);
