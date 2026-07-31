import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, updateProfile,
  signOut as fbSignOut, onAuthStateChanged, type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, demoOrgId } from './app';
import { claimInvite } from '@core/sync';

/**
 * Authentication and first-run provisioning.
 *
 * **Email and password is the only sign-in method.** Google and anonymous
 * sign-in were removed deliberately (ADR-024): one credential shape means one
 * account-recovery story, one place errors are explained, and no dependency on
 * a third-party consent screen or a per-domain OAuth configuration. The cost is
 * that we own password reset and email verification, which is why both live
 * here rather than being left to the caller.
 *
 * The demo needs a viewer with *no account* to see admin and judge screens,
 * which the documented rules gate behind org membership. Rather than weaken the
 * rules globally, sign-in provisions a read-only membership in the single demo
 * org. See ADR-016 — this is demo scaffolding and must be removed before the
 * product serves a second real tenant.
 */

export type AuthUser = User;

export const onAuth = (cb: (u: User | null) => void) => onAuthStateChanged(auth(), cb);

export const signInWithEmail = async (email: string, password: string) => {
  const cred = await signInWithEmailAndPassword(auth(), email, password);
  await provisionQuietly(cred.user);
  return cred.user;
};

/**
 * Creates an account, names it, and sends the verification mail.
 *
 * The verification mail is not decoration. ADR-020 bootstraps every real
 * permission through a redeemable invite, and `firestore.rules` requires
 * `email_verified == true` to redeem one — an account that never verifies can
 * sign in but can never be granted anything. Google sign-in arrived verified;
 * a password account does not, so we have to ask.
 *
 * A failure to send is swallowed: the account exists either way, and refusing
 * to complete sign-up over an undeliverable email would strand someone with
 * credentials they cannot use. `resendVerification` covers the retry.
 */
export const signUpWithEmail = async (
  email: string,
  password: string,
  displayName?: string,
) => {
  const cred = await createUserWithEmailAndPassword(auth(), email, password);
  if (displayName?.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim() });
  }
  try {
    await sendEmailVerification(cred.user);
  } catch {
    /* see the note above — the account is real regardless */
  }
  await provisionQuietly(cred.user);
  return cred.user;
};

export const resendVerification = async () => {
  const current = auth().currentUser;
  if (current && !current.emailVerified) await sendEmailVerification(current);
};

/**
 * Firebase reports success for an unknown address as well as a known one, and
 * that is the correct behaviour: telling an anonymous caller which addresses
 * hold accounts turns the reset form into an account-enumeration oracle. The
 * UI therefore says "if that address has an account" rather than "sent".
 */
export const sendPasswordReset = (email: string) => sendPasswordResetEmail(auth(), email);

export const signOut = () => fbSignOut(auth());

/**
 * Runs `provision` without ever failing the sign-in that triggered it.
 *
 * Provisioning is Firestore work that happens *after* Firebase Auth has already
 * issued a session: by the time it runs, the credential is accepted, the token
 * is minted and `onAuthStateChanged` has fired. So a failure here is not a
 * failed sign-in, and reporting it as one is a lie the UI cannot walk back — the
 * screen shows "Could not reach Cloud Firestore backend" while the user is, in
 * fact, signed in and about to be redirected by the auth listener.
 *
 * That is not hypothetical. `provision` opens with `getDoc(users/{uid})`, and an
 * offline or throttled client rejects that call with `unavailable` — the single
 * most likely error on the flakiest connection, turned into an error message
 * about credentials.
 *
 * The two writes inside already reason this way individually (see their `catch`
 * blocks). This extends the same rule to the reads and to the user document,
 * which were the only steps that could still take the session down with them.
 * Nothing is lost by deferring: `provision` is idempotent and runs again on the
 * next sign-in, so a skipped bootstrap heals rather than sticking.
 */
async function provisionQuietly(user: User): Promise<void> {
  try {
    await provision(user);
  } catch (error) {
    // Worth a console line — a user document that never appears is a real
    // problem for the *next* session, even though it is not one for this one.
    console.warn('Post-sign-in provisioning did not complete; the session is unaffected.', error);
  }
}

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

  // An email account has no photo and often no name until it sets one, so the
  // local part of the address is a better fallback than "Demo Guest" — it is at
  // least something the person recognises as themselves in a member list.
  const fallbackName = user.email?.split('@')[0] ?? 'Member';

  if (!existing.exists()) {
    await setDoc(userRef, {
      email: user.email ?? '',
      displayName: user.displayName ?? fallbackName,
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
  if (member.exists()) return;

  // A pending invite is the only way to arrive with real permissions (ADR-020).
  // The rules verify the invite matches this user's *verified* email and that
  // the roles claimed equal the invite's exactly, so nothing here is trusted.
  try {
    const claimed = await claimInvite(demoOrgId(), {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName ?? fallbackName,
      photoURL: user.photoURL,
    });
    if (claimed) return;
  } catch {
    // No invite, or the rules refused it. Fall through to a plain membership —
    // failing sign-in over a missing invite would be the wrong trade.
  }

  // No invite: a read-only viewer. This is ADR-016 demo scaffolding and is
  // removed with the rest of it before a second real tenant exists.
  //
  // Best-effort, like the invite claim above it. `firestore.rules` admits a new
  // member three ways — an admin adds you, you redeem an invite, or you are the
  // org's `ownerId` — and a self-issued `demoViewer` is none of them, so this
  // write is *denied* on any org the caller has no other claim to. That is the
  // rules being right. What would be wrong is letting the refusal reject the
  // sign-in: the account exists, it is signed in, and it can browse, register
  // and create an organization of its own without this document. Surfacing
  // "PERMISSION_DENIED" on a successful sign-up reports a failure that did not
  // happen.
  try {
    await setDoc(memberRef, {
      userId: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? fallbackName,
      photoURL: user.photoURL ?? null,
      roleIds: ['demoViewer'],
      resolvedPermissions: [],
      directPermissions: [],
      scopedGrants: [],
      status: 'active',
      joinedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
      schemaVersion: 1,
    });
  } catch {
    /* see above — no membership in the demo org, which is not a sign-in failure */
  }
}
