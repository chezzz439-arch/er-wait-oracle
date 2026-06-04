// Fetches San Francisco hospital Emergency Department measures from the CMS
// Provider Data Catalog — "Timely and Effective Care - Hospital" (dataset yv7e-xc69).
//
// NOTE on data freshness: these are ANNUAL, publicly reported measures (e.g. the
// median time patients spent in the ED before being discharged). They are NOT a
// live wait-time feed — CMS does not publish one. We treat them as each ER's
// stable "baseline character" and refresh on our cadence so we capture the moment
// CMS updates the underlying dataset.

const DATASET_ID = 'yv7e-xc69';
const BASE = `https://data.cms.gov/provider-data/api/1/datastore/query/${DATASET_ID}/0`;

// Map the measure_id values CMS uses for the ED into human context. Only these
// are kept; everything else under the Emergency Department condition is ignored.
export const ED_MEASURES = {
  EDV: 'Emergency department volume (categorical: low → very high)',
  OP_18a: 'Median ED arrival → departure, all patients (minutes)',
  OP_18b: 'Median ED arrival → departure, discharged patients (minutes)',
  OP_18c: 'Median ED arrival → departure, admitted patients (minutes)',
  OP_18d: 'Median decision-to-admit → departure (minutes)',
  OP_22: 'Patients who left the ED before being seen (%)',
  OP_23: 'Stroke patients receiving head CT within 45 min (%)',
};

// EDV is reported as a category; map to an ordinal so the model and queries can
// reason about it numerically while we keep the raw string too.
const EDV_ORDINAL = { 'low': 1, 'medium': 2, 'high': 3, 'very high': 4 };

function parseScore(measureId, raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '' || /^not available$/i.test(s)) return null;
  if (measureId === 'EDV') return EDV_ORDINAL[s.toLowerCase()] ?? null;
  const n = Number(s.replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

// CMS dates arrive as MM/DD/YYYY; ClickHouse Date wants YYYY-MM-DD.
function toIsoDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

async function fetchPage({ city, limit, offset }) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  params.append('conditions[0][property]', 'citytown');
  params.append('conditions[0][value]', city);
  params.append('conditions[0][operator]', '=');
  params.append('conditions[1][property]', '_condition');
  params.append('conditions[1][value]', 'Emergency Department');
  params.append('conditions[1][operator]', '=');

  const res = await fetch(`${BASE}?${params.toString()}`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`CMS API ${res.status}: ${await res.text()}`);
  return res.json();
}

// Returns normalized observation rows ready for ClickHouse insertion.
export async function fetchErMeasures(city = 'SAN FRANCISCO') {
  const limit = 100;
  let offset = 0;
  const raw = [];

  // Paginate until we've pulled everything matching the conditions.
  for (;;) {
    const page = await fetchPage({ city, limit, offset });
    const rows = page.results || [];
    raw.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
    if (offset > 5000) break; // hard safety stop
  }

  return raw
    .filter((r) => ED_MEASURES[r.measure_id])
    .map((r) => ({
      facility_id: r.facility_id || '',
      facility_name: r.facility_name || '',
      address: r.address || '',
      city: r.citytown || '',
      state: r.state || '',
      zip_code: r.zip_code || '',
      county: r.countyparish || '',
      condition: r._condition || 'Emergency Department',
      measure_id: r.measure_id,
      measure_name: r.measure_name || ED_MEASURES[r.measure_id],
      score_raw: r.score == null ? '' : String(r.score),
      score_num: parseScore(r.measure_id, r.score),
      sample: parseScore('_', r.sample),
      footnote: r.footnote || '',
      period_start: toIsoDate(r.start_date),
      period_end: toIsoDate(r.end_date),
    }));
}
