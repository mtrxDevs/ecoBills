/**
 * Site-wide constants. The owner fills TODO(owner) values at deploy time —
 * nothing here is guessed (no fake emails, prices, or download URLs).
 */
export const SITE = {
  /** Live app, e.g. https://ecoXXXX.onrender.com */
  appUrl: (import.meta as any).env?.VITE_APP_URL || '#', // TODO(owner): set VITE_APP_URL at build time
  releasesUrl: 'https://github.com/mtrxDevs/ecoBills/releases',
  repoUrl: 'https://github.com/mtrxDevs/ecoBills',
  contactEmail: 'hello@mtrx.dev', // TODO(owner): real onboarding inbox
}
