/** Lab identity and delivery assets, independent of the shared Vivacity timeline. */
export type LabOpeningConfig = {
  labId: string;
  labName: string;
  labSubtitle: string;
  /** Prefix for the landscape/portrait and optional lite MP4 encodes. */
  sceneAsset: string;
  landingRoute: string;
  accentColor: string;
  cameraPreset: string;
  version: string;
  homeRootSelector: string;
  homeFocusTarget: string;
};

export const OPENING_TIMELINE = Object.freeze({
  durationSeconds: 7.5,
  handoffStartSeconds: 6.5,
  apertureStartSeconds: 6.98,
  loadGraceMs: 2300,
  decoderStartupDeadlineMs: 5000,
  stalledPlaybackDeadlineMs: 15000,
});

export const ISABELLA_OPENING_CONFIG: Readonly<LabOpeningConfig> = Object.freeze({
  labId: 'isabella',
  labName: 'Isabella Labs',
  labSubtitle: 'By Vivacity',
  sceneAsset: '/vivacity/the-one-isabella',
  landingRoute: '/',
  accentColor: '#c8b69a',
  cameraPreset: 'the-one-isabella',
  version: 'the-one-v1',
  homeRootSelector: '.isabella-home',
  homeFocusTarget: 'isabella-main',
});

const seenThisPage = new Set<string>();

export const openingVisitKey = (config: LabOpeningConfig) =>
  `vivacity:opening:${config.labId}:${config.version}`;

export function shouldShowLabOpening(config: LabOpeningConfig, allowDebugReplay = false): boolean {
  if (window.location.pathname !== config.landingRoute ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const query = new URLSearchParams(window.location.search);
  if (query.get('intro') === 'replay' || (allowDebugReplay && query.has('introDebug'))) return true;
  const key = openingVisitKey(config);
  if (seenThisPage.has(key)) return false;
  try {
    return window.localStorage.getItem(key) !== 'seen';
  } catch {
    // Private browsing/storage policy must never prevent the application opening.
    return true;
  }
}

export function markLabOpeningSeen(config: LabOpeningConfig): void {
  const key = openingVisitKey(config);
  seenThisPage.add(key);
  try { window.localStorage.setItem(key, 'seen'); } catch { /* Storage is optional. */ }
}

export function openingMediaSource(config: LabOpeningConfig, portrait: boolean, lite: boolean): string {
  return `${config.sceneAsset}-${portrait ? 'portrait' : 'landscape'}${lite ? '-lite' : ''}.mp4`;
}
