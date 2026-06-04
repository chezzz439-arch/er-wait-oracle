# ER Wait Oracle

Predicts which **San Francisco emergency rooms will be busiest over the next 4 hours**
by fusing three public signals and reasoning over them with the Anthropic SDK.

```
 CMS Provider Data ─┐
 (ER baselines)     │
                    ├─►  ClickHouse  ──►  Claude (forced tool-use)  ──►  busy-ness forecast
 Open-Meteo ────────┘   (timestamped,      per-ER 0–100 score
 (live SF weather)       hourly history)    + reasoning + drivers
```

## How it actually works (and an honest caveat)

There is **no public real-time ER wait-time feed** for US hospitals. So the Oracle
combines what *is* public:

| Signal | Source | Role | Cadence |
|---|---|---|---|
| ER "character" — volume tier, median throughput minutes, % left-without-being-seen | CMS *Timely & Effective Care – Hospital* (dataset `yv7e-xc69`) | Stable baseline per ER | Annual (CMS refresh) |
| SF weather — temp, precip, wind, humidity, conditions | [Open-Meteo](https://open-meteo.com) (free, no key) | The time-varying driver | Live, hourly |
| Local time / day-of-week | system clock | Diurnal + weekend effects | Each run |

Every hour the pipeline snapshots all three to ClickHouse (timestamped, append-only),
building genuine history. Claude then anchors each ER to its CMS baseline and adjusts
for the current weather trend and time to produce a calibrated `busy_score`.

The CMS rows repeat between their annual refreshes — that's expected. We timestamp
every fetch so the dataset's *real* history is the accumulating weather + forecast log.

## Quick start

```bash
# 1. Local ClickHouse (or point CLICKHOUSE_URL at your own)
docker compose up -d

# 2. Configure
cp .env.example .env
#   set ANTHROPIC_API_KEY=...  (everything else has working defaults)

# 3. Install + initialize
npm install
npm run init-db

# 4. One manual cycle to prove it end-to-end
npm run ingest     # CMS + weather → ClickHouse
npm run predict    # Claude forecast → predictions table
npm run status     # see what's stored + latest ranked outlook

# 5. Run hourly, forever
npm start          # node src/index.js serve
```

## Commands

| Command | What it does |
|---|---|
| `npm run init-db` | Create database + tables (idempotent) |
| `npm run ingest` | One fetch of CMS + weather into ClickHouse |
| `npm run predict` | Run the Claude forecast over stored data |
| `npm run status` | Counts, time range, and the latest ranked forecast |
| `npm start` | Hourly cron: ingest → predict, runs an initial cycle immediately |

## ClickHouse schema

All tables are `MergeTree`, partitioned by month, append-only.

- **`er_wait_observations`** — long format, one row per `(observed_at, facility, measure)`.
- **`weather_observations`** — one row per fetch of SF current conditions.
- **`predictions`** — one row per `(predicted_at, facility)`: `busy_score`, `busy_level`,
  `confidence`, `reasoning`, `key_factors`, model, and a `run_id` grouping each forecast.

## Configuration (`.env`)

`ANTHROPIC_API_KEY` is the only required value. Notable optionals: `ANTHROPIC_MODEL`
(default `claude-sonnet-4-6`), `INGEST_CRON` (default `0 * * * *`),
`PREDICT_HORIZON_HOURS` (default `4`), `CLICKHOUSE_URL`, `SF_LATITUDE`/`SF_LONGITUDE`.

## Implementation notes

- **Structured output** via a forced `submit_predictions` tool — no brittle JSON parsing.
- **Prompt caching** on the static system instructions (they're identical every hour),
  so steady-state runs read most input tokens from cache. The `[predict]` log line prints
  `cache_read`/`in`/`out` token counts so you can watch the cache working.
- **Concurrent fetches** — CMS and weather are pulled in parallel; CMS is paginated.
- Node 20+, ESM. Dependencies: `@anthropic-ai/sdk`, `@clickhouse/client`, `node-cron`.
