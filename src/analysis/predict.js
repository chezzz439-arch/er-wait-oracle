// Prediction step: ask Claude which SF ERs will be busiest over the next N hours.
//
// Inputs assembled from ClickHouse:
//   1. Each ER's CMS baseline (volume tier, median throughput times, % left
//      without being seen) — the stable "character" of the department.
//   2. Recent SF weather history we've accumulated (trend, not just a snapshot).
//   3. Current San Francisco local time + day of week.
//
// Output: a structured busy-ness forecast per ER, persisted to `predictions`.
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { db } from '../db/clickhouse.js';
import { config } from '../config.js';
import { ED_MEASURES } from '../sources/cms.js';
import { describeWeatherCode } from '../sources/weather.js';

// ---- Data assembly -------------------------------------------------------

async function latestBaselines() {
  const rs = await db().query({
    query: `
      SELECT facility_id,
             any(facility_name) AS facility_name,
             any(address)       AS address,
             groupArray((measure_id, score_raw, score_num)) AS measures
      FROM (
        SELECT facility_id, facility_name, address, measure_id, score_raw, score_num
        FROM er_wait_observations
        ORDER BY observed_at DESC
        LIMIT 1 BY facility_id, measure_id
      )
      GROUP BY facility_id
      ORDER BY facility_id`,
    format: 'JSONEachRow',
  });
  return rs.json();
}

async function recentWeather(hours = 24) {
  const rs = await db().query({
    query: `
      SELECT observed_at, temperature_f, apparent_temp_f, precipitation_mm,
             weather_code, wind_speed_kmh, humidity_pct, cloud_cover_pct
      FROM weather_observations
      ORDER BY observed_at DESC
      LIMIT {hours:UInt32}`,
    query_params: { hours },
    format: 'JSONEachRow',
  });
  return rs.json();
}

// ---- Prompt construction -------------------------------------------------

function sfTimeContext() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: config.location.timezone,
    weekday: 'long', hour: 'numeric', minute: '2-digit',
    month: 'short', day: 'numeric', year: 'numeric', hour12: true,
  });
  return fmt.format(now);
}

function formatBaselines(rows) {
  return rows
    .map((r) => {
      const m = Object.fromEntries(r.measures.map(([id, raw]) => [id, raw]));
      const parts = Object.keys(ED_MEASURES)
        .filter((id) => m[id] && !/not available/i.test(m[id]))
        .map((id) => `${id}=${m[id]}`);
      return `- ${r.facility_name} [${r.facility_id}]: ${parts.join(', ') || 'no measures reported'}`;
    })
    .join('\n');
}

function formatWeather(rows) {
  if (!rows.length) return '(no weather history yet)';
  return rows
    .map(
      (w) =>
        `- ${w.observed_at} UTC: ${w.temperature_f}°F (feels ${w.apparent_temp_f}°F), ` +
        `${describeWeatherCode(w.weather_code)}, precip ${w.precipitation_mm}mm, ` +
        `wind ${w.wind_speed_kmh}km/h, humidity ${w.humidity_pct}%`
    )
    .join('\n');
}

const SYSTEM_PROMPT = `You are the analytical core of "ER Wait Oracle", forecasting near-term Emergency Department crowding for San Francisco hospitals.

You reason from three signals:
1. CMS baseline measures per hospital (annual public data — each ER's stable character):
   - EDV: emergency department volume tier (1=low, 2=medium, 3=high, 4=very high).
   - OP_18a/b/c/d: median minutes from ED arrival to departure (all / discharged / admitted / decision-to-admit). Higher = slower throughput.
   - OP_22: percent of patients who left before being seen (higher = more overcrowding).
   - OP_23: stroke head-CT timeliness (acuity/trauma indicator).
   A high-volume, high-throughput-time ER is structurally more prone to crowding.
2. Recent SF weather trend — storms, cold snaps, and heat raise ED utilization (falls, respiratory, cardiac, trauma); rain raises traffic-injury volume.
3. Current local day-of-week and time — evenings, nights, weekends, and Monday mornings run heavier; flu-season and weekend effects matter.

Produce a busy_score 0-100 per ER for the requested horizon:
  0-30 low, 31-55 moderate, 56-80 high, 81-100 severe.
Anchor scores to each ER's baseline, then adjust for weather and time. Be specific and calibrated — do not mark everything "high". Reflect genuine uncertainty in the confidence value (0-1).

Call submit_predictions exactly once with one entry per hospital provided.`;

const TOOL = {
  name: 'submit_predictions',
  description: 'Submit the busy-ness forecast for every hospital provided.',
  input_schema: {
    type: 'object',
    properties: {
      predictions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            facility_id: { type: 'string' },
            facility_name: { type: 'string' },
            busy_score: { type: 'integer', minimum: 0, maximum: 100 },
            busy_level: { type: 'string', enum: ['low', 'moderate', 'high', 'severe'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasoning: { type: 'string', description: 'One or two sentences citing the specific signals used.' },
            key_factors: { type: 'array', items: { type: 'string' }, description: '2-4 short driver tags.' },
          },
          required: ['facility_id', 'facility_name', 'busy_score', 'busy_level', 'confidence', 'reasoning', 'key_factors'],
        },
      },
    },
    required: ['predictions'],
  },
};

// ---- Main entry point ----------------------------------------------------

export async function runPrediction({ log = console.log } = {}) {
  if (!config.anthropic.apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set — cannot run prediction.');
  }

  const horizon = config.schedule.predictHorizonHours;
  const [baselines, weather] = await Promise.all([latestBaselines(), recentWeather(24)]);

  if (!baselines.length) {
    log('[predict] No ER baselines in ClickHouse yet — run an ingest first.');
    return { predictions: [] };
  }

  const client = new Anthropic({ apiKey: config.anthropic.apiKey });

  const userContent =
    `Current San Francisco time: ${sfTimeContext()}.\n` +
    `Forecast horizon: next ${horizon} hours.\n\n` +
    `HOSPITAL BASELINES (CMS, annual):\n${formatBaselines(baselines)}\n\n` +
    `RECENT SF WEATHER (most recent first, UTC):\n${formatWeather(weather)}\n\n` +
    `Forecast crowding for each hospital over the next ${horizon} hours.`;

  const message = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        // Static instructions are identical every hour — cache them.
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'submit_predictions' },
    messages: [{ role: 'user', content: userContent }],
  });

  const toolUse = message.content.find((b) => b.type === 'tool_use');
  if (!toolUse) throw new Error('Model did not return a submit_predictions tool call.');
  const predictions = toolUse.input.predictions || [];

  const runId = randomUUID();
  const predictedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const rows = predictions.map((p) => ({
    predicted_at: predictedAt,
    horizon_hours: horizon,
    facility_id: p.facility_id,
    facility_name: p.facility_name,
    busy_score: Math.max(0, Math.min(100, Math.round(p.busy_score))),
    busy_level: p.busy_level,
    confidence: p.confidence,
    reasoning: p.reasoning,
    key_factors: p.key_factors || [],
    model: config.anthropic.model,
    run_id: runId,
  }));

  if (rows.length) {
    await db().insert({ table: 'predictions', values: rows, format: 'JSONEachRow' });
  }

  const usage = message.usage || {};
  log(
    `[predict] ${predictedAt} → ${rows.length} forecasts (${horizon}h horizon, ${config.anthropic.model}). ` +
      `cache_read=${usage.cache_read_input_tokens ?? 0} in=${usage.input_tokens ?? 0} out=${usage.output_tokens ?? 0}`
  );

  // Surface the ranked outlook to the operator log.
  for (const p of [...rows].sort((a, b) => b.busy_score - a.busy_score)) {
    log(`   ${String(p.busy_score).padStart(3)}  ${p.busy_level.toUpperCase().padEnd(8)} ${p.facility_name}`);
  }

  return { runId, predictedAt, predictions: rows };
}
