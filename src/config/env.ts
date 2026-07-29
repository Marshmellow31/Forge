import { z } from 'zod';

/**
 * Environment contract. Phase 0 deliverable 0.4.
 *
 * The app refuses to boot on a missing key rather than failing later with an
 * opaque Firebase error. Every value here is a *public* Firebase web config
 * value — these are safe to ship in a client bundle and are not secrets.
 * Real secrets (service account keys, OAuth client secrets) never appear in
 * `import.meta.env` and never enter this repo.
 */
const EnvSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1, 'Firebase API key is required'),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  VITE_FIREBASE_APP_ID: z.string().min(1),

  /** The organization the public demo reads from. See ADR-016. */
  VITE_DEMO_ORG_ID: z.string().min(1).default('org_demo'),

  /** Point the SDK at a local emulator suite instead of production. */
  VITE_USE_EMULATOR: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Thrown at module load if the environment is incomplete, so a misconfigured
 * deploy fails loudly on first paint instead of silently rendering empty lists.
 */
export class EnvError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      `Missing or invalid environment variables: ${missing.join(', ')}.\n` +
        'Copy .env.example to .env.local and fill in your Firebase web config, ' +
        'or set these in the Vercel project settings.',
    );
    this.name = 'EnvError';
  }
}

let cached: Env | null = null;

/**
 * Parsed lazily and memoized.
 *
 * Deliberately NOT evaluated at module scope: a module-scope throw happens
 * while the import graph is still evaluating, so no `try/catch` around the
 * render call can catch it and the page goes blank. Callers reach for `env()`
 * at use time, and `main.tsx` calls `validateEnv()` inside its own try/catch so
 * a misconfigured deploy renders the reason.
 */
export function env(): Env {
  if (!cached) {
    const result = EnvSchema.safeParse(import.meta.env);
    if (!result.success) {
      throw new EnvError(result.error.issues.map((i) => i.path.join('.')));
    }
    cached = result.data;
  }
  return cached;
}

/** Throws `EnvError` if the environment is incomplete. Call this before render. */
export const validateEnv = (): void => void env();
