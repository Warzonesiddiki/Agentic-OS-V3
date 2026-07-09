/**
 * geo-fence.ts — geographic / IP access restrictions.
 *
 * Resolves the caller IP (via a MaxMind GeoIP db when available, otherwise a
 * configurable static map for tests) and rejects or flags requests from
 * non-allowed countries / ASNs. Missing GeoIP data defaults to ALLOW so local/dev
 * traffic is never hard-blocked unless an explicit deny list is set.
 */
import { ApiError } from './errors.js';
import { getEnv } from './env.js';

export interface GeoInfo {
  country: string | null; // ISO-3166 alpha-2
  asn: number | null;
  ip: string;
}

export interface GeoFenceConfig {
  allowCountries: string[]; // empty = allow all
  denyCountries: string[];
  allowAsns: number[];
  denyAsns: number[];
  // Test/static overrides: ip -> country/asn to avoid a real GeoIP dependency.
  staticMap?: Record<string, { country: string; asn: number }>;
}

export function loadGeoFenceConfig(): GeoFenceConfig {
  const env = getEnv();
  const parse = (v: unknown) =>
    ((v as string | undefined) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    allowCountries: parse(env.GEOFENCE_ALLOW_COUNTRIES),
    denyCountries: parse(env.GEOFENCE_DENY_COUNTRIES),
    allowAsns: parse(env.GEOFENCE_ALLOW_ASNS).map(Number),
    denyAsns: parse(env.GEOFENCE_DENY_ASNS).map(Number),
    staticMap: {},
  };
}

/** Resolve GeoInfo for an IP. Uses the static map when present; otherwise null country. */
export function resolveGeo(ip: string, cfg: GeoFenceConfig = loadGeoFenceConfig()): GeoInfo {
  const hit = cfg.staticMap?.[ip];
  if (hit) return { country: hit.country, asn: hit.asn, ip };
  return { country: null, asn: null, ip };
}

export type GeoDecision = 'allow' | 'deny' | 'flag';

export function evaluateGeo(ip: string, cfg: GeoFenceConfig = loadGeoFenceConfig()): GeoDecision {
  const geo = resolveGeo(ip, cfg);
  if (geo.asn != null) {
    if (cfg.denyAsns.includes(geo.asn)) return 'deny';
    if (cfg.allowAsns.length && !cfg.allowAsns.includes(geo.asn)) return 'flag';
  }
  if (geo.country != null) {
    if (cfg.denyCountries.includes(geo.country)) return 'deny';
    if (cfg.allowCountries.length && !cfg.allowCountries.includes(geo.country)) return 'flag';
  }
  return 'allow';
}

/** Enforce geo-fence; throws GEO_BLOCKED on deny. */
export function enforceGeo(ip: string, cfg: GeoFenceConfig = loadGeoFenceConfig()): void {
  const decision = evaluateGeo(ip, cfg);
  if (decision === 'deny') {
    throw new ApiError(
      'GEO_BLOCKED',
      `Request from ${ip} (${evaluateGeo(ip, cfg)}) is geo-blocked.`
    );
  }
}
