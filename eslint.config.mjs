// Milestone 0 quality gate: one flat config for the whole monorepo.
// typescript-eslint recommended (not strict/type-checked: fast, no project
// references needed) + react-hooks for the UI.
//
// Deliberate softenings, each for a reason:
// - no-explicit-any off: `any` at Prisma/Fastify boundaries is idiomatic and
//   tsc-strict still checks everything around it. Banning it would produce
//   disable-comments, not safety.
// - no-console absent: server scripts and CLIs log to stdout by design.
// - react-refresh/only-export-components off in packages/ui: it is a component
//   *library*, and barrel files re-exporting tokens alongside components is
//   its normal shape.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-dashboard/**',
      '**/build/**',
      '**/.vite/**',
      '**/prisma/migrations/**',
      'apps/desktop/src-tauri/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/site/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
)
