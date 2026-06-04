// Static metadata for the 10 San Francisco hospitals that appear under the CMS
// Emergency Department condition. CMS provides addresses but not coordinates, and
// this is a fixed, known set, so we hard-code accurate lat/lng (geocoded from the
// street addresses) plus a display short-name and whether the site is an acute ER.
//
// `hasEd: false` marks non-acute facilities (Laguna Honda is a skilled-nursing /
// rehab hospital, not an emergency room) — these are shown on the map but excluded
// from the "best ER" recommendation.

export interface HospitalMeta {
  facilityId: string;
  shortName: string;
  lat: number;
  lng: number;
  hasEd: boolean;
}

export const HOSPITAL_META: Record<string, HospitalMeta> = {
  '050008': { facilityId: '050008', shortName: 'CPMC Davies', lat: 37.7693, lng: -122.4330, hasEd: true },
  '050047': { facilityId: '050047', shortName: 'CPMC Van Ness', lat: 37.7847, lng: -122.4216, hasEd: true },
  '050055': { facilityId: '050055', shortName: 'CPMC Mission Bernal', lat: 37.7484, lng: -122.4208, hasEd: true },
  '050076': { facilityId: '050076', shortName: 'Kaiser SF', lat: 37.7820, lng: -122.4459, hasEd: true },
  '050152': { facilityId: '050152', shortName: 'UCSF St. Francis', lat: 37.7896, lng: -122.4170, hasEd: true },
  '050228': { facilityId: '050228', shortName: 'ZSF General', lat: 37.7559, lng: -122.4047, hasEd: true },
  '050407': { facilityId: '050407', shortName: 'Chinese Hospital', lat: 37.7957, lng: -122.4081, hasEd: true },
  '050454': { facilityId: '050454', shortName: 'UCSF Parnassus', lat: 37.7631, lng: -122.4576, hasEd: true },
  '050457': { facilityId: '050457', shortName: "UCSF St. Mary's", lat: 37.7741, lng: -122.4527, hasEd: true },
  '050668': { facilityId: '050668', shortName: 'Laguna Honda', lat: 37.7522, lng: -122.4569, hasEd: false },
};

// Fallback display names if ClickHouse has no row yet (matches CMS facility names).
export const HOSPITAL_NAMES: Record<string, string> = {
  '050008': 'California Pacific Medical Center — Davies Campus',
  '050047': 'California Pacific Medical Center — Van Ness Campus',
  '050055': 'California Pacific Medical Center — Mission Bernal',
  '050076': 'Kaiser Foundation Hospital — San Francisco',
  '050152': 'UCSF Health Saint Francis Hospital',
  '050228': 'Zuckerberg San Francisco General Hospital & Trauma Center',
  '050407': 'Chinese Hospital',
  '050454': 'UCSF Medical Center',
  '050457': "UCSF Health St. Mary's Hospital",
  '050668': 'Laguna Honda Hospital & Rehabilitation Center',
};

export const HOSPITAL_ADDRESSES: Record<string, string> = {
  '050008': '601 Duboce Avenue',
  '050047': '1101 Van Ness Avenue',
  '050055': '3555 Cesar Chavez Street',
  '050076': '2425 Geary Boulevard',
  '050152': '900 Hyde Street',
  '050228': '1001 Potrero Avenue',
  '050407': '845 Jackson Street',
  '050454': '505 Parnassus Avenue',
  '050457': '450 Stanyan Street',
  '050668': '375 Laguna Honda Boulevard',
};

// SF map center + sensible default zoom for framing all 10 markers.
export const SF_CENTER: [number, number] = [37.7749, -122.4294];
export const SF_DEFAULT_ZOOM = 12.5;

// Turn CMS ALL-CAPS names into readable Title Case, preserving common acronyms.
const ACRONYMS = new Set(['CPMC', 'UCSF', 'ER', 'SF']);
export function prettifyName(raw: string): string {
  if (!raw) return raw;
  return raw
    .toLowerCase()
    .split(/(\s+|-|—|\/)/)
    .map((tok) => {
      const up = tok.toUpperCase();
      if (ACRONYMS.has(up)) return up;
      if (/^[a-z]/.test(tok)) return tok.charAt(0).toUpperCase() + tok.slice(1);
      return tok;
    })
    .join('');
}
