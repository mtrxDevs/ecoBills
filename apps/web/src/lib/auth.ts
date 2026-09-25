import { createAuthClient, type VanillaBetterAuthClient } from '@neondatabase/auth'

// The same public Auth URL is used by Vite web builds and the Tauri desktop
// shell. Auth state stays with Managed Neon Auth; the API only receives JWTs.
export const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL) as VanillaBetterAuthClient
