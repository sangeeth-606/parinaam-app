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
