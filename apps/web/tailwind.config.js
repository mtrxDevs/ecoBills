import preset from '@ecobills/config/tailwind.preset.js'

/**
 * Motion, colour, radius, blur and elevation tokens all arrive through the
 * preset. Do not re-declare any of them here — a local override would diverge
 * from `packages/config/tokens.css`, which is the same scale the CSS custom
 * properties and the Framer Motion token module use.
 *
 * `theme.extend` is intentionally empty.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    // The shared component set lives in a workspace package whose classes must
    // survive purging, or every @ecobills/ui component renders unstyled.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  presets: [preset],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
}
