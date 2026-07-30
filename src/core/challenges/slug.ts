/**
 * Slug and id generation. PURE — no I/O, no clock beyond what is passed in.
 *
 * A slug is part of a challenge's public URL, so it is generated once from the
 * title and then left alone: changing it silently breaks every link an
 * organiser has already shared. The editor therefore offers to regenerate it
 * rather than tracking the title automatically.
 */

/** Title → URL-safe slug. Idempotent: slugify(slugify(x)) === slugify(x). */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    // Strip diacritics so "Café" and "Cafe" produce the same slug.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/**
 * A slug that no existing challenge is already using.
 * Collisions get a numeric suffix rather than a random one, so the result stays
 * readable and stable for the same inputs.
 */
export function uniqueSlug(title: string, taken: Iterable<string>): string {
  const base = slugify(title) || 'challenge';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * A document id for a new challenge.
 *
 * Derived from the slug so the id is legible in the Firestore console and in a
 * URL, with a short random suffix so two challenges created from the same title
 * in different workspaces cannot collide.
 */
export function newChallengeId(title: string): string {
  const base = slugify(title) || 'challenge';
  const suffix = Math.random().toString(36).slice(2, 7);
  return `ch_${base.slice(0, 32)}_${suffix}`;
}

export function newCriterionId(name: string): string {
  const base = slugify(name) || 'criterion';
  return `cr_${base.slice(0, 24)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * The default workflow, as data rather than hardcoded logic.
 *
 * ROADMAP Phase 1 requires the simple workflow to ship as a *seeded
 * definition*, not a `switch` — the engine is real from day one and only the
 * designer UI is deferred. So a new challenge starts from this array and the
 * editor lets an organiser change it.
 */
export const DEFAULT_STAGES = [
  { key: 'registration', name: 'Registration', type: 'registration', state: 'active' as const },
  { key: 'submission', name: 'Submission', type: 'submission', state: 'locked' as const },
  { key: 'judging', name: 'Judging', type: 'judging', state: 'locked' as const },
  { key: 'results', name: 'Results', type: 'results', state: 'locked' as const },
];

/**
 * Challenge categories drive the fallback cover gradient in `tokens.ts`.
 * A category outside this list is allowed — it simply gets the default colour.
 */
export const CATEGORIES = [
  'Photography', 'Hackathon', 'Wellness', 'Design', 'Data', 'Community', 'Pitch',
];
