import { z } from 'zod';

/**
 * What counts as a usable email and password, decided in one place.
 *
 * Pure and I/O-free, so the same rules can be asserted in a unit test and run
 * in the form. Hard rule 9 wants Zod at every boundary and a credential typed
 * into a browser is a boundary — the value reaches Firebase Auth, which will
 * reject a malformed one anyway, just far later and in worse language.
 *
 * The point of validating here is not security. Nothing client-side is. It is
 * that "Password should be at least 6 characters" *before* a network round trip
 * beats `auth/weak-password` after one.
 */

/**
 * Eight, not Firebase's six.
 *
 * Six is the platform floor, not a recommendation, and this is the credential
 * that reaches an admin panel. No character-class rule is layered on top:
 * composition rules push people towards `Passw0rd!` and away from length, which
 * is the property that actually resists guessing.
 */
export const MIN_PASSWORD_LENGTH = 8;

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .email('That does not look like an email address.')
  // Firebase lowercases the address it stores; matching here keeps the invite
  // lookup in firestore.rules (which lowercases the token claim) consistent.
  .transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(1, 'Enter a password.')
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  // Firebase Auth's own ceiling; a longer value fails server-side with a code
  // that reads like a bug rather than a limit.
  .max(4096, 'That password is too long.');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .max(80, 'Keep the name under 80 characters.')
    .optional(),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/** Field-keyed messages, or `null` when the input parses. */
export type FieldErrors = Partial<Record<'email' | 'password' | 'displayName', string>>;

function collect(result: z.SafeParseReturnType<unknown, unknown>): FieldErrors {
  const errors: FieldErrors = {};
  if (result.success) return errors;
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof FieldErrors | undefined;
    // First message per field. A stack of three complaints about one input is
    // noise; the first one is the one that has to be fixed first anyway.
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function validateSignIn(input: unknown): FieldErrors {
  return collect(signInSchema.safeParse(input));
}

export function validateSignUp(input: unknown): FieldErrors {
  return collect(signUpSchema.safeParse(input));
}

export const hasErrors = (errors: FieldErrors) => Object.keys(errors).length > 0;

/**
 * A coarse strength read, for the meter next to the field.
 *
 * Advisory only — `passwordSchema` decides what is accepted. This exists
 * because a bare "8 characters minimum" trains people to type exactly eight.
 */
export type PasswordStrength = 'weak' | 'fair' | 'strong';

export function passwordStrength(password: string): PasswordStrength {
  if (password.length < MIN_PASSWORD_LENGTH) return 'weak';
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  // Length carries more weight than variety, because it is what actually costs
  // an attacker time.
  if (password.length >= 16 || (password.length >= 12 && variety >= 3)) return 'strong';
  if (password.length >= 10 || variety >= 2) return 'fair';
  return 'weak';
}
