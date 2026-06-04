// Centralized configuration, loaded from environment with sensible defaults.
// Node 20.6+ auto-loads .env when started with `--env-file`; we also defensively
// parse a local .env so `node src/index.js` works without extra flags.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Lightweight .env loader (avoids an extra dependency). Real env vars win.
try {
  const envPath = join(__dirname, '..', '.env');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // No .env file — rely on real environment variables.
}

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined ? d : /^(1|true|yes)$/i.test(v));

export const config = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  },
  clickhouse: {
    url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    database: process.env.CLICKHOUSE_DATABASE || 'er_oracle',
  },
  location: {
    // San Francisco city center.
    latitude: num(process.env.SF_LATITUDE, 37.7749),
    longitude: num(process.env.SF_LONGITUDE, -122.4194),
    city: 'SAN FRANCISCO',
    timezone: 'America/Los_Angeles',
  },
  schedule: {
    ingestCron: process.env.INGEST_CRON || '0 * * * *',
    predictAfterIngest: bool(process.env.PREDICT_AFTER_INGEST, true),
    predictHorizonHours: num(process.env.PREDICT_HORIZON_HOURS, 4),
  },
};
