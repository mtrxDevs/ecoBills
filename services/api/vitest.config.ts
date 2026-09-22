import { defineConfig } from 'vitest/config'

// Milestone 0 gate: integration tests hit live Postgres over the network
// (Supabase pooler), where a single request can take seconds. The default 5s
// ceiling turns latency into false failures — and worse, timed-out tests keep
// running in the background while afterAll deletes their fixtures, producing
// phantom FK violations. 60s is a ceiling, not a target.
export default defineConfig({
  test: {
    testTimeout: 60000,
    hookTimeout: 60000,
  },
})
