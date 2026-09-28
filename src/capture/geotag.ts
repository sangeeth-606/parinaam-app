/**
 * v2 — one-shot geotag acquisition for the seal moment.
 *
 * Honesty law (brief §5/§7): the record may carry coordinates ONLY when the device
 * actually provided them. Permission denied, no fix, timeout, or a non-Expo runtime
 * all honestly yield null — the record then renders "GPS: NOT AVAILABLE", never a
 * placeholder. The `mocked` flag (developer mock-location) is surfaced, not
 * suppressed — per brief §6.
 *
 * The seal must never block on the network or on a hung GPS: a hard timeout applies.
 * Dependency-injectable so the mapping is testable without a device.
 */

export interface SealGeoTag {
  lat: number;
  lon: number;
  accuracyM?: number;
  mocked: boolean;
}

export interface GeoTagDeps {
  /** resolve(true) when the officer granted foreground permission. */
  ensurePermission: () => Promise<boolean>;
  /** resolve with device coords, or null when no fix arrived in time. */
  readPosition: () => Promise<{
    lat: number;
    lon: number;
    accuracy?: number;
    mocked?: boolean;
  } | null>;
}

/**
 * v4 phase 4 — the achieved quality of a fix, never an assumed one (rule 10 in spirit).
 *
 * A handheld GNSS fix is only usable as a *position* when the receiver reports a tight
 * accuracy circle. Beyond `GPS_POOR_ACCURACY_M` the coordinates are a region hint and must
 * never be presented as where a seizure happened. A fix with no reported accuracy is
 * MARGINAL rather than GOOD — absence of a measurement is not evidence of quality.
 */
export type GeoQuality = 'GOOD' | 'MARGINAL' | 'POOR' | 'MOCKED' | 'NONE';

export const GPS_GOOD_ACCURACY_M = 10;
export const GPS_POOR_ACCURACY_M = 100;

export function gradeGeo(geo: SealGeoTag | null): GeoQuality {
  if (!geo) return 'NONE';
  if (geo.mocked) return 'MOCKED';
  const a = geo.accuracyM;
  if (a == null || !Number.isFinite(a)) return 'MARGINAL';
  if (a <= GPS_GOOD_ACCURACY_M) return 'GOOD';
  if (a <= GPS_POOR_ACCURACY_M) return 'MARGINAL';
  return 'POOR';
}

/** One-line honest description of a fix, for UI. Never claims more than was measured. */
export function describeGeo(geo: SealGeoTag | null): string {
  switch (gradeGeo(geo)) {
    case 'GOOD':
      return `Fix ${geo!.lat.toFixed(6)}, ${geo!.lon.toFixed(6)} · ±${Math.round(geo!.accuracyM ?? 0)} m`;
    case 'MARGINAL':
      return `Approximate fix ${geo!.lat.toFixed(6)}, ${geo!.lon.toFixed(6)} · accuracy marginal`;
    case 'POOR':
      return `Region-level fix only · accuracy beyond ${GPS_POOR_ACCURACY_M} m`;
    case 'MOCKED':
      return 'Mock-provider coordinates — not a real GNSS fix';
    default:
      return 'No GNSS fix — record seals without coordinates';
  }
}

export async function geoTagFromPosition(
  pos: Awaited<ReturnType<GeoTagDeps['readPosition']>>
): Promise<SealGeoTag | null> {
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return null;
  return {
    lat: pos.lat,
    lon: pos.lon,
    ...(Number.isFinite(pos.accuracy ?? NaN) ? { accuracyM: pos.accuracy } : {}),
    mocked: pos.mocked === true,
  };
}

/** Expo runtime deps; every native call is behind try/catch — offline/aircraft mode safe. */
async function expoDeps(): Promise<GeoTagDeps> {
  const Location = await import('expo-location');
  return {
    ensurePermission: async () => {
      try {
        const cur = await Location.getForegroundPermissionsAsync();
        if (cur.granted) return true;
        const req = await Location.requestForegroundPermissionsAsync();
        return req.granted;
      } catch {
        return false;
      }
    },
    readPosition: async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        return {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
          mocked: (pos.coords as { mocked?: boolean | null }).mocked ?? undefined,
        };
      } catch {
        return null;
      }
    },
  };
}

/**
 * Best-effort geotag for sealing. Returns null (honest absence) on: denied
 * permission, no/failed fix, or timeout (default 5s — the seal never waits longer).
 */
export async function acquireGeoTag(
  deps?: GeoTagDeps,
  timeoutMs = 5000
): Promise<SealGeoTag | null> {
  try {
    const d = deps ?? (await expoDeps());
    const withTimeout = <T>(p: Promise<T>, fallback: T): Promise<T> =>
      new Promise((resolve) => {
        const t = setTimeout(() => resolve(fallback), timeoutMs);
        p.then((v) => {
          clearTimeout(t);
          resolve(v);
        }).catch(() => {
          clearTimeout(t);
          resolve(fallback);
        });
      });
    const ok = await withTimeout(d.ensurePermission(), false);
    if (!ok) return null;
    const pos = await withTimeout(d.readPosition(), null);
    return await geoTagFromPosition(pos);
  } catch {
    // expo-location unresolvable (node tests, web preview) — honest absence.
    return null;
  }
}
