// ClickHouse client + schema management.
//
// Schema overview (all timestamped, append-only, partitioned by month):
//
//   er_wait_observations  — long-format CMS Emergency Department measures, one
//                           row per (fetch time, facility, measure). CMS data is
//                           an ANNUAL aggregate, so the same measure values repeat
//                           across fetches; the timestamp records when WE observed
//                           them and lets us detect when CMS refreshes its dataset.
//
//   weather_observations  — one row per fetch of SF current weather (the genuinely
//                           time-varying signal that builds real history).
//
//   predictions           — Claude's busy-ness forecast for each ER, one row per
//                           (prediction time, facility), with score + reasoning.
//
import { createClient } from '@clickhouse/client';
import { config } from '../config.js';

let _client;

// A client bound to the configured database (used after init).
export function db() {
  if (!_client) {
    _client = createClient({
      url: config.clickhouse.url,
      username: config.clickhouse.username,
      password: config.clickhouse.password,
      database: config.clickhouse.database,
      clickhouse_settings: {
        // Tolerate occasional duplicate inserts on retries gracefully.
        async_insert: 0,
      },
    });
  }
  return _client;
}

// A client NOT bound to a database, used to create the database itself.
function rootClient() {
  return createClient({
    url: config.clickhouse.url,
    username: config.clickhouse.username,
    password: config.clickhouse.password,
  });
}

const DDL = (database) => [
  `CREATE DATABASE IF NOT EXISTS ${database}`,

  `CREATE TABLE IF NOT EXISTS ${database}.er_wait_observations (
      observed_at   DateTime DEFAULT now(),
      facility_id   String,
      facility_name String,
      address       String,
      city          String,
      state         String,
      zip_code      String,
      county        String,
      condition     String,
      measure_id    String,
      measure_name  String,
      score_raw     String,
      score_num     Nullable(Float64),
      sample        Nullable(Float64),
      footnote      String,
      period_start  Nullable(Date),
      period_end    Nullable(Date)
   )
   ENGINE = MergeTree
   PARTITION BY toYYYYMM(observed_at)
   ORDER BY (facility_id, measure_id, observed_at)`,

  `CREATE TABLE IF NOT EXISTS ${database}.weather_observations (
      observed_at        DateTime DEFAULT now(),
      forecast_time      Nullable(DateTime),
      latitude           Float64,
      longitude          Float64,
      temperature_f      Nullable(Float64),
      apparent_temp_f    Nullable(Float64),
      precipitation_mm   Nullable(Float64),
      rain_mm            Nullable(Float64),
      weather_code       Nullable(Int32),
      cloud_cover_pct    Nullable(Float64),
      wind_speed_kmh     Nullable(Float64),
      wind_gust_kmh      Nullable(Float64),
      humidity_pct       Nullable(Float64),
      is_day             Nullable(UInt8)
   )
   ENGINE = MergeTree
   PARTITION BY toYYYYMM(observed_at)
   ORDER BY observed_at`,

  `CREATE TABLE IF NOT EXISTS ${database}.predictions (
      predicted_at    DateTime DEFAULT now(),
      horizon_hours   UInt8,
      facility_id     String,
      facility_name   String,
      busy_score      UInt8,
      busy_level      String,
      confidence      Float32,
      reasoning       String,
      key_factors     Array(String),
      model           String,
      run_id          String
   )
   ENGINE = MergeTree
   PARTITION BY toYYYYMM(predicted_at)
   ORDER BY (predicted_at, facility_id)`,
];

// Create database + all tables. Idempotent.
export async function initSchema() {
  const root = rootClient();
  try {
    for (const stmt of DDL(config.clickhouse.database)) {
      await root.command({ query: stmt });
    }
  } finally {
    await root.close();
  }
}

export async function ping() {
  const result = await db().ping();
  if (!result.success) throw result.error;
  return true;
}
