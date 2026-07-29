import {
  GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut as fbSignOut,
  onAuthStateChanged, type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, demoOrgId } from './app';

/**
 * Authentication and first-run provisioning.
 *
 * The demo needs a viewer with *no account* to see admin and judge screens,
 * which the documented rules gate behind org membership. Rather than weaken the
 * rules globally, sign-in provisions a read-only membership in the single demo
 * org. See ADR-016 — this is demo scaffolding and must be removed before the
 * product serves a second real tenant.
 */

export type AuthUser = User;

export const onAuth = (cb: (u: User | null) => void) => onAuthStateChanged(auth(), cb);

export const signInWithGoogle = async () => {
  const cred = await signInWithPopup(auth(), new GoogleAuthProvider());
  await provision(cred.user);
  return cred.user;
};

/** Lets a demo viewer in without an account. */
export const signInAsGuest = async () => {
  const cred = await signInAnonymously(auth());
  await provision(cred.user);
  return cred.user;
};

export const signOut = () => fbSignOut(auth());

/**
 * Creates `users/{uid}` and a `demoViewer` membership on first sign-in.
 *
 * Both writes are idempotent and both are constrained by security rules: a user
 * may only write their own user doc, and may only self-issue a membership in
 * `demoOrgId()` with the `demoViewer` role and no permissions beyond reading.
 */
async function provision(user: User) {
  const userRef = doc(db(), 'users', user.uid);
  const existing = await getDoc(userRef);

  if (!existing.exists()) {
    await setDoc(userRef, {
      email: user.email ?? 'guest@forge.demo',
      displayName: user.displayName ?? 'Demo Guest',
      username: null,
      photoURL: user.photoURL ?? null,
      isPublic: false,
      stats: {
        challengesEntered: 0, challengesWon: 0, submissions: 0, points: 0,
        badges: 0, certificates: 0, currentStreakDays: 0, longestStreakDays: 0,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
      schemaVersion: 1,
    });
  }

  const memberRef = doc(db(), 'organizations', demoOrgId(), 'members', user.uid);
  const member = await getDoc(memberRef);
  if (!member.exists()) {
    await setDoc(memberRef, {
      userId: user.uid,
      email: user.email ?? 'guest@forge.demo',
      displayName: user.displayName ?? 'Demo Guest',
      photoURL: user.photoURL ?? null,
      roleIds: ['demoViewer'],
      resolvedPermissions: [],
      status: 'active',
      joinedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
      schemaVersion: 1,
    });
  }
}
