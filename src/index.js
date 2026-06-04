// ER Wait Oracle — CLI + hourly scheduler.
//
//   node src/index.js init-db   create database + tables (idempotent)
//   node src/index.js ingest    one fetch → ClickHouse (CMS + weather)
//   node src/index.js predict   run the Claude forecast over stored data
//   node src/index.js status    show what's accumulated so far
//   node src/index.js serve     start the hourly cron loop (default)
import cron from 'node-cron';
import { config } from './config.js';
import { initSchema, db, ping } from './db/clickhouse.js';
import { runIngest } from './pipeline/ingest.js';
import { runPrediction } from './analysis/predict.js';

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

async function cmdInitDb() {
  await initSchema();
  await ping();
  log('Schema ready in database:', config.clickhouse.database);
}

async function cmdIngest() {
  await initSchema();
  await runIngest({ log });
}

async function cmdPredict() {
  await initSchema();
  await runPrediction({ log });
}

async function cmdStatus() {
  await initSchema();
  const q = async (sql) => (await (await db().query({ query: sql, format: 'JSONEachRow' })).json());

  const [er] = await q(
    `SELECT count() AS rows, uniq(facility_id) AS hospitals,
            min(observed_at) AS first, max(observed_at) AS last
     FROM er_wait_observations`
  );
  const [wx] = await q(
    `SELECT count() AS rows, min(observed_at) AS first, max(observed_at) AS last
     FROM weather_observations`
  );
  const [pr] = await q(
    `SELECT count() AS rows, max(predicted_at) AS last FROM predictions`
  );

  log('— ER Wait Oracle status —');
  log(`  ER observations : ${er.rows} rows, ${er.hospitals} hospitals (${er.first || 'n/a'} → ${er.last || 'n/a'})`);
  log(`  Weather         : ${wx.rows} rows (${wx.first || 'n/a'} → ${wx.last || 'n/a'})`);
  log(`  Predictions     : ${pr.rows} rows (latest ${pr.last || 'n/a'})`);

  if (pr.rows > 0) {
    const latest = await q(
      `SELECT facility_name, busy_score, busy_level, reasoning
       FROM predictions
       WHERE predicted_at = (SELECT max(predicted_at) FROM predictions)
       ORDER BY busy_score DESC`
    );
    log('  Latest forecast (busiest first):');
    for (const p of latest) {
      log(`    ${String(p.busy_score).padStart(3)} ${p.busy_level.toUpperCase().padEnd(8)} ${p.facility_name}`);
      log(`        ↳ ${p.reasoning}`);
    }
  }
}

async function runCycle() {
  try {
    await runIngest({ log });
    if (config.schedule.predictAfterIngest && config.anthropic.apiKey) {
      await runPrediction({ log });
    }
  } catch (err) {
    log('[cycle] ERROR:', err.message);
  }
}

async function cmdServe() {
  await initSchema();
  await ping();
  log(`Scheduler started. Ingest cron: "${config.schedule.ingestCron}" (${config.location.timezone}).`);
  log('Running an initial cycle now…');
  await runCycle();

  cron.schedule(config.schedule.ingestCron, runCycle, {
    timezone: config.location.timezone,
  });
  log('Waiting for next scheduled run. Ctrl-C to stop.');
}

const commands = {
  'init-db': cmdInitDb,
  ingest: cmdIngest,
  predict: cmdPredict,
  status: cmdStatus,
  serve: cmdServe,
};

const cmd = process.argv[2] || 'serve';
const fn = commands[cmd];
if (!fn) {
  console.error(`Unknown command "${cmd}". Use one of: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

// `serve` is long-lived; the rest are one-shot and should exit cleanly.
fn()
  .then(async () => {
    if (cmd !== 'serve') {
      await db().close().catch(() => {});
      process.exit(0);
    }
  })
  .catch(async (err) => {
    log('FATAL:', err.stack || err.message);
    await db().close().catch(() => {});
    process.exit(1);
  });
