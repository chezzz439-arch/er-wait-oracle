// One-time generator for the national ER directory used by the dashboard.
//
// CMS publishes hospital addresses but NO coordinates, so we:
//   1. Pull every emergency-capable hospital from CMS "Hospital General
//      Information" (xubh-q36u, emergency_services = Yes).
//   2. Join each hospital's ED busyness baseline (EDV volume tier, OP_18b median
//      throughput, OP_22 left-without-being-seen) from "Timely & Effective Care"
//      (yv7e-xc69, _condition = Emergency Department).
//   3. Geocode each hospital to a lat/lng using Census ZIP-code (ZCTA) centroids
//      — approximate (ZIP-level) but complete, offline, and deterministic.
//
// Output: web/lib/hospitals-national.json  (committed; refreshed by re-running
//   `node src/build-national-directory.js` when CMS updates).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'web', 'lib', 'hospitals-national.json');
const log = (...a) => console.log('[build-directory]', ...a);

const HGI = 'https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0';
const TEC = 'https://data.cms.gov/provider-data/api/1/datastore/query/yv7e-xc69/0';
const GAZ_URL =
  'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_zcta_national.zip';

const EDV_ORDINAL = { low: 1, medium: 2, high: 3, 'very high': 4 };
const num = (v) => {
  if (v == null) return null;
  const n = Number(String(v).replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
};
const titleCase = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Ucsf|Cpmc|Va|Llc|Inc)\b/gi, (m) => m.toUpperCase());

// Paginate a CMS datastore query with optional equality conditions.
async function fetchAll(base, conditions = [], keep = (r) => r) {
  const limit = 500;
  let offset = 0;
  const out = [];
  for (;;) {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    conditions.forEach((c, i) => {
      p.append(`conditions[${i}][property]`, c.property);
      p.append(`conditions[${i}][value]`, c.value);
      p.append(`conditions[${i}][operator]`, c.operator || '=');
    });
    const res = await fetch(`${base}?${p.toString()}`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`CMS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const rows = j.results || [];
    for (const r of rows) out.push(keep(r));
    if (rows.length < limit) break;
    offset += limit;
    if (offset > 80000) break; // safety
    if (offset % 5000 === 0) log(`  …${out.length} rows`);
  }
  return out;
}

// ZIP (ZCTA) → {lat,lng} centroids from the Census gazetteer.
function loadZipCentroids() {
  const zip = '/tmp/eo_gaz.zip';
  const txt = '/tmp/eo_gaz/2023_Gaz_zcta_national.txt';
  if (!existsSync(txt)) {
    log('downloading Census ZCTA gazetteer…');
    execSync(`curl -sL "${GAZ_URL}" -o ${zip} && unzip -o ${zip} -d /tmp/eo_gaz`, { stdio: 'ignore' });
  }
  const data = readFileSync(txt, 'utf8');
  const lines = data.split('\n');
  const header = lines[0].split('\t').map((s) => s.trim());
  const zi = header.indexOf('GEOID');
  const lati = header.indexOf('INTPTLAT');
  const lngi = header.indexOf('INTPTLONG');
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length <= lngi) continue;
    const z = cols[zi]?.trim();
    const lat = Number(cols[lati]);
    const lng = Number(cols[lngi]);
    if (z && Number.isFinite(lat) && Number.isFinite(lng)) map.set(z.padStart(5, '0'), { lat, lng });
  }
  log(`loaded ${map.size} ZIP centroids`);
  return map;
}

async function main() {
  const zipCentroids = loadZipCentroids();

  log('fetching national ER hospitals (emergency_services = Yes)…');
  const hospitals = await fetchAll(
    HGI,
    [{ property: 'emergency_services', value: 'Yes' }],
    (r) => ({
      facility_id: r.facility_id,
      facility_name: r.facility_name,
      address: r.address,
      city: r.citytown,
      state: r.state,
      zip_code: r.zip_code,
      county: r.countyparish,
      type: r.hospital_type,
      rating: num(r.hospital_overall_rating),
    })
  );
  log(`  ${hospitals.length} ER hospitals`);

  log('fetching national ED measures for baselines…');
  const baseline = new Map();
  await fetchAll(TEC, [{ property: '_condition', value: 'Emergency Department' }], (r) => {
    const id = r.facility_id;
    if (!id) return null;
    if (!baseline.has(id)) baseline.set(id, {});
    const b = baseline.get(id);
    if (r.measure_id === 'EDV') {
      const raw = String(r.score || '').trim().toLowerCase();
      if (EDV_ORDINAL[raw]) {
        b.edv = raw;
        b.edvOrdinal = EDV_ORDINAL[raw];
      }
    } else if (r.measure_id === 'OP_18b') {
      b.op18b = num(r.score);
    } else if (r.measure_id === 'OP_22') {
      b.op22 = num(r.score);
    }
    return null;
  });
  log(`  baselines for ${baseline.size} facilities`);

  let geocoded = 0;
  const out = [];
  for (const h of hospitals) {
    const zip5 = String(h.zip_code || '').slice(0, 5).padStart(5, '0');
    const c = zipCentroids.get(zip5);
    if (!c) continue; // no centroid → can't place on map; skip (rare)
    geocoded++;
    const b = baseline.get(h.facility_id) || {};
    out.push({
      id: h.facility_id,
      name: titleCase(h.facility_name),
      address: titleCase(h.address),
      city: titleCase(h.city),
      state: h.state,
      zip: zip5,
      lat: Number(c.lat.toFixed(4)),
      lng: Number(c.lng.toFixed(4)),
      edv: b.edv ?? null,
      edvOrdinal: b.edvOrdinal ?? null,
      op18b: b.op18b ?? null,
      op22: b.op22 ?? null,
      rating: h.rating ?? null,
    });
  }

  out.sort((a, b) => (a.state + a.name).localeCompare(b.state + b.name));
  writeFileSync(OUT, JSON.stringify(out));
  const withBaseline = out.filter((h) => h.op18b != null || h.edv != null).length;
  log(`wrote ${out.length} hospitals (${geocoded} geocoded) → ${OUT}`);
  log(`  ${withBaseline} have a CMS ED baseline; file ${(JSON.stringify(out).length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => {
  console.error('[build-directory] FATAL', e);
  process.exit(1);
});
