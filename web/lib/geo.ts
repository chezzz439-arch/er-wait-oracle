// Tiny geo helpers — haversine distance + a Google Maps directions URL builder.
// Pure and dependency-free so both client components and the API route can use them.

export interface LatLng {
  lat: number;
  lng: number;
}

const R_MILES = 3958.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

// Great-circle distance between two points, in miles.
export function haversineMiles(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Human label: "0.4 mi", "2.7 mi". Walking/driving time isn't implied — just distance.
export function formatMiles(mi: number): string {
  if (mi < 0.1) return '<0.1 mi';
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

// Google Maps directions deep-link. Uses the user's location as origin when known,
// otherwise Google defaults origin to the device's current location.
export function mapsDirectionsUrl(dest: LatLng & { label?: string }, origin?: LatLng | null): string {
  const params = new URLSearchParams({ api: '1' });
  params.set('destination', `${dest.lat},${dest.lng}`);
  if (origin) params.set('origin', `${origin.lat},${origin.lng}`);
  params.set('travelmode', 'driving');
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// Apple Maps directions deep-link (opens Maps.app on Apple devices, the web
// viewer elsewhere). dirflg=d → driving; saddr omitted → "current location".
export function appleMapsDirectionsUrl(dest: LatLng & { label?: string }, origin?: LatLng | null): string {
  const params = new URLSearchParams();
  params.set('daddr', `${dest.lat},${dest.lng}`);
  if (dest.label) params.set('q', dest.label);
  if (origin) params.set('saddr', `${origin.lat},${origin.lng}`);
  params.set('dirflg', 'd');
  return `https://maps.apple.com/?${params.toString()}`;
}
