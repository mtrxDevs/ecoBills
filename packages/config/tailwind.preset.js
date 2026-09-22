/**
 * ecoBills shared Tailwind preset — spec §7 design system.
 *
 * This is the ONLY place Tailwind values are declared. `apps/web/tailwind.config.js`
 * consumes it via `presets` and must not redefine any of these keys.
 *
 * Two kinds of value live here:
 *
 *   1. Literal hex/px — for the fixed brand palette that is also quoted in the
 *      spec (canvas, ink, accent, brand greens, warn, danger).
 *   2. `var(--…)` references — for everything themable. The variable itself is
 *      defined in `packages/config/tokens.css`, which is the single source of
 *      truth for light/dark; Tailwind just exposes it as a utility class.
 *
 * Consequence of (2): the `var()`-backed colours do NOT support Tailwind's
 * opacity modifier (`bg-surface/50`) — use the dedicated `-tint` tokens instead.
 *
 * Motion: durations and easings are mirrored from
 * `packages/ui/src/motion-tokens.ts`. If you change one, change the other.
 */

/** Motion durations, ms. Mirrors `--dur-*` in tokens.css. */
const duration = {
  /** Overrides Tailwind's built-in 150ms default so `.transition-colors`
   *  (and friends) cannot fall back to a value that is not a token. */
  DEFAULT: '200ms',
  instant: '90ms',
  fast: '150ms',
  base: '200ms',
  slow: '300ms',
  page: '240ms',
}

/** Motion easings. Mirrors `--ease-*` in tokens.css. */
const easing = {
  /** Overrides Tailwind's built-in cubic-bezier(0.4,0,0.2,1) default. */
  DEFAULT: 'cubic-bezier(0.2, 0, 0, 1)',
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  entrance: 'cubic-bezier(0.16, 1, 0.3, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
}

export default {
  theme: {
    extend: {
      colors: {
        /* ---- legacy keys from v0.1.1 — kept so nothing that referenced them
                silently changes meaning ---- */
        canvas: { DEFAULT: 'var(--color-canvas)', light: '#FAFAF8', dark: '#101210' },
        ink: {
          DEFAULT: 'var(--color-ink)',
          /** helper text, secondary labels — 6.15:1 on surface */
          muted: 'var(--color-ink-muted)',
          /** tertiary text, placeholders — 5.71:1 on surface */
          subtle: 'var(--color-ink-subtle)',
          light: '#14171C',
          dark: '#ECEFEF',
        },

        /* ---- surfaces / elevation ---- */
        surface: {
          DEFAULT: 'var(--color-surface)',
          1: 'var(--color-surface)',
          2: 'var(--color-surface-2)',
          3: 'var(--color-surface-3)',
        },

        /* ---- borders ---- */
        line: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
          /** >=3:1 on every light surface — WCAG 1.4.11 non-text UI */
          input: 'var(--color-border-input)',
        },

        /* ---- accent: the ecoBills green. Tints, borders, rings, charts. ---- */
        accent: {
          DEFAULT: '#17A673',
          /** accent used AS text — 6.26:1 light / 11.2:1 dark */
          text: 'var(--color-accent-text)',
          tint: 'var(--color-accent-tint)',
          /** mtrx.labs bright accent */
          bright: '#85E46B',
        },

        /* ---- brand: the real mtrx.labs logo green family ---- */
        brand: {
          DEFAULT: '#17A673',
          dim: '#12855c',
          /** real logo green */
          logo: '#1E8906',
          hover: '#45AE2D',
          active: '#126203',
          bright: '#85E46B',
        },

        /* ---- action: the primary button fill. AA-verified with its own ink. -- */
        action: {
          DEFAULT: 'var(--color-action)',
          hover: 'var(--color-action-hover)',
          active: 'var(--color-action-active)',
          ink: 'var(--color-ink-on-action)',
        },

        /* ---- focus ---- */
        focus: { DEFAULT: 'var(--color-focus-ring)' },

        /* ---- feedback ---- */
        warn: {
          DEFAULT: '#F59E0B',
          text: 'var(--color-warn-text)',
          tint: 'var(--color-warn-tint)',
        },
        danger: {
          DEFAULT: '#DC2626',
          text: 'var(--color-danger-text)',
          tint: 'var(--color-danger-tint)',
          ink: '#FFFFFF',
        },
        success: { DEFAULT: '#1E8906', text: 'var(--color-success-text)' },
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Satoshi', 'Inter', 'system-ui', 'sans-serif'],
      },

      /* ---- motion ---- */
      transitionDuration: duration,
      transitionTimingFunction: easing,

      /* ---- radius: semantic aliases over the numeric scale ---- */
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        sheet: 'var(--radius-sheet)',
        chip: 'var(--radius-chip)',
      },

      /* ---- blur ---- */
      backdropBlur: { glass: 'var(--blur-glass)' },
      blur: {
        xs: 'var(--blur-xs)',
        sm: 'var(--blur-sm)',
        md: 'var(--blur-md)',
        lg: 'var(--blur-lg)',
      },

      /* ---- elevation ---- */
      boxShadow: {
        'elev-1': 'var(--elev-1)',
        'elev-2': 'var(--elev-2)',
        'elev-3': 'var(--elev-3)',
      },
    },
  },
}
