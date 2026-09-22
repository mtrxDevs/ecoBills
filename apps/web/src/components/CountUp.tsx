/**
 * CountUp — re-exported from the shared component set.
 *
 * The v0.1.1 implementation that lived here was broken:
 *   - it subscribed with `rounded.on('change', ...)` and then called
 *     `setDisplay(value)` — the *target* — so the interpolated frame was
 *     thrown away and the spring did nothing visible;
 *   - the resulting `display` state was never read (`void display`);
 *   - it used hardcoded `{ stiffness: 120, damping: 20 }` instead of a token;
 *   - it was not reduced-motion aware.
 *
 * The corrected implementation now lives in `@ecobills/ui` alongside the rest
 * of the fluid component set, so there is exactly one version of it. This file
 * stays as the stable import path for existing screens.
 */
export { CountUp } from '@ecobills/ui'
export type { CountUpProps } from '@ecobills/ui'
