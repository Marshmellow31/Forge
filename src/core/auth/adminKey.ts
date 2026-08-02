/**
 * The admin panel's access key.
 *
 * ## Read this before trusting it
 *
 * This key is checked **in the browser**, against a value that ships in the
 * JavaScript bundle. Anyone who opens devtools can read it, and anyone who can
 * read it can set the unlock flag by hand. It is therefore a **gate, not a
 * lock**: it keeps the admin surface out of the way of people who have no
 * business in it, and it stops an idle tab on a shared laptop from being one
 * click from the console. It does not make the panel safe against someone who
 * wants in.
 *
 * That is not a compromise this file can fix. AGENT.md hard rule 3 — the
 * client is never the authority — is why it does not have to: *every action*
 * the panel offers is a Firestore write, and Firestore evaluates
 * `firestore.rules` against the caller's stored membership, not against
 * anything in this module. Someone who forces the gate open sees the panel
 * chrome and gets `permission-denied` on everything they try to change. The
 * panel is a shortcut for people who already hold the permissions, and the key
 * decides who is *shown* it.
 *
 * The real lock is the RBAC role on your membership document (SPEC_RBAC §6).
 * If you need the key itself to be authoritative, it has to move behind a
 * Cloud Function that mints a custom claim — which needs Blaze, and is written
 * up as the upgrade path in ADR-024.
 */

import { env } from '@config/env';

/** How long one unlock lasts. Re-entering a key you know is cheap; a console
 *  left open on a shared machine is not. */
export const UNLOCK_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours — one working day.

const STORAGE_KEY = 'forge.admin.unlock';

/** The configured key. Set `VITE_ADMIN_SECRET` to change it per deployment. */
export const adminKey = () => env().VITE_ADMIN_SECRET;

/**
 * Compares in constant time with respect to the *contents* of the two strings.
 *
 * A timing side channel is not a realistic threat against a value that is in
 * the bundle anyway, so this is not what makes the gate work. It is here so
 * that when the check does move server-side (ADR-024), the comparison it moves
 * with is already the right one rather than a `===` someone has to remember to
 * replace.
 *
 * Length still leaks, which is unavoidable without hashing and irrelevant here.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Whether `candidate` is the admin key. Pure — no storage, no side effects.
 *
 * Surrounding whitespace is trimmed because the key is routinely pasted, and
 * refusing a correct key over a trailing space teaches people the gate is
 * flaky rather than that they mistyped.
 */
export function verifyAdminKey(candidate: string): boolean {
  const expected = adminKey();
  if (!expected) return false;
  return constantTimeEqual(candidate.trim(), expected);
}

interface Unlock {
  /** When the unlock expires, in epoch ms. */
  until: number;
  /** Which account unlocked it. An unlock does not survive a change of user. */
  uid: string;
}

function parse(raw: string | null): Unlock | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { until, uid } = value as Partial<Unlock>;
    if (typeof until !== 'number' || typeof uid !== 'string') return null;
    return { until, uid };
  } catch {
    // Someone hand-edited it, or a previous version wrote a different shape.
    // An unparseable unlock is simply not an unlock.
    return null;
  }
}

/**
 * `sessionStorage`, not `localStorage`: an admin session should end with the
 * tab. `mode.ts` persists across visits because a view preference is meant to
 * be sticky; access to a console is the opposite kind of thing.
 */
function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // Private browsing or a blocked storage partition. The gate then holds for
    // the lifetime of the React state only, which is a safe direction to fail.
    return null;
  }
}

/** Records an unlock for `uid`. Call only after `verifyAdminKey` returned true. */
export function recordUnlock(uid: string, now = Date.now()): void {
  const value: Unlock = { until: now + UNLOCK_TTL_MS, uid };
  try {
    store()?.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* the unlock still holds in memory for this render tree */
  }
}

/**
 * True when the current tab holds an unexpired unlock **for this uid**.
 *
 * Binding to the uid is what stops the flag outliving the person who set it:
 * signing out and signing in as someone else on the same machine leaves a
 * stale unlock that would otherwise let the next account straight in.
 */
export function isUnlocked(uid: string | null | undefined, now = Date.now()): boolean {
  if (!uid) return false;
  const unlock = parse(store()?.getItem(STORAGE_KEY) ?? null);
  if (!unlock) return false;
  if (unlock.uid !== uid) return false;
  if (unlock.until <= now) {
    clearUnlock();
    return false;
  }
  return true;
}

export function clearUnlock(): void {
  try {
    store()?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Milliseconds left on the unlock, or 0. Drives the "locks in 3h" hint. */
export function unlockRemainingMs(uid: string | null | undefined, now = Date.now()): number {
  if (!uid) return 0;
  const unlock = parse(store()?.getItem(STORAGE_KEY) ?? null);
  if (!unlock || unlock.uid !== uid) return 0;
  return Math.max(0, unlock.until - now);
}
