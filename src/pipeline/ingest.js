// One ingestion run: fetch CMS ER measures + SF weather, write both to ClickHouse.
import { db } from '../db/clickhouse.js';
import { config } from '../config.js';
import { fetchErMeasures } from '../sources/cms.js';
import { fetchWeather } from '../sources/weather.js';

export async function runIngest({ log = console.log } = {}) {
  const startedAt = new Date();
  // Single observed_at for the whole batch so CMS + weather line up exactly.
  const observedAt = startedAt.toISOString().slice(0, 19).replace('T', ' ');

  // Fetch both sources concurrently — they're independent.
  const [measures, weather] = await Promise.all([
    fetchErMeasures(config.location.city),
    fetchWeather(),
  ]);

  const erRows = measures.map((m) => ({ observed_at: observedAt, ...m }));
  const weatherRow = { observed_at: observedAt, ...weather };

  await Promise.all([
    erRows.length
      ? db().insert({
          table: 'er_wait_observations',
          values: erRows,
          format: 'JSONEachRow',
        })
      : Promise.resolve(),
    db().insert({
      table: 'weather_observations',
      values: [weatherRow],
      format: 'JSONEachRow',
    }),
  ]);

  const hospitals = new Set(erRows.map((r) => r.facility_id)).size;
  log(
    `[ingest] ${observedAt} → ${erRows.length} ER measures across ${hospitals} hospitals; ` +
      `weather ${weather.temperature_f}°F, precip ${weather.precipitation_mm}mm`
  );

  return { observedAt, erRows: erRows.length, hospitals, weather };
}
