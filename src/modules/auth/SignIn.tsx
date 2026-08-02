import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Button, CircularProgress, Divider, IconButton, InputAdornment, Stack, TextField, Typography,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { Blobs } from '@shared/ui/primitives';
import { useAuth } from '@core/auth';
import {
  validateSignIn, validateSignUp, hasErrors, passwordStrength, MIN_PASSWORD_LENGTH,
  type FieldErrors,
} from '@core/auth/credentials';
import { HOME_FOR, type AppMode } from '@core/auth/mode';
import { c, radius, ease } from '@shared/design/tokens';

/**
 * S-02 — Sign in, create an account, or open the admin door.
 *
 * ## Two audiences, one screen
 *
 * A **member** — participant or organizer — signs in with Google or with an
 * email address, or looks around as a guest without an account at all. An
 * **admin** signs in with an email address *and* the access key, and gets no
 * other option: no Google (the key has to be typed by someone who knows it, and
 * one tap is the wrong ceremony for that), no sign-up (the admin door is not
 * where accounts are created), no guest (an anonymous session has no name to
 * record against the actions the console takes).
 *
 * The split is presentational. It decides which controls are offered, not what
 * anyone may do — that stays with the membership and `firestore.rules`. Someone
 * who signs in through the member door and knows the key can still unlock
 * `/admin` at the gate; this screen just saves them the second step.
 *
 * ## Where you land afterwards, in priority order
 *   1. `?next=` — set by whatever sent you here, so a deep link survives.
 *   2. `location.state.from` — set by the admin gate and other redirects.
 *   3. `/admin` through the admin door; otherwise the home for your chosen
 *      surface, or `/welcome` if you have not chosen one.
 */

type Door = 'member' | 'admin';
type Tab = 'signin' | 'signup';

const PANEL_MAX = 460;

/** The pitch on the left, which is different for each door. */
const BLURB: Record<Door, { title: (tab: Tab) => string; body: string; points: { icon: string; text: string }[] }> = {
  member: {
    title: (tab) => (tab === 'signin' ? 'Welcome back.' : 'One account, both sides.'),
    body: 'The same account enters a challenge on Monday and runs one on Tuesday. Nothing here is locked to a role — what you can do comes from your permissions, not from how you signed up.',
    points: [
      { icon: 'g_translate', text: 'Continue with Google, or use an email address and password.' },
      { icon: 'verified_user', text: 'Verify your address to accept invitations to an organization.' },
      { icon: 'visibility', text: 'Browsing challenges needs no account at all.' },
    ],
  },
  admin: {
    title: () => 'Admin access.',
    body: 'The console for whoever runs the place: every participant, every entry, every role. It needs an account it can name in the audit trail, and the access key.',
    points: [
      { icon: 'key', text: 'Email, password and the access key — all three, in one step.' },
      { icon: 'shield_person', text: 'The key reveals the console. Your role decides what works inside it.' },
      { icon: 'timer', text: 'An unlock lasts for this browser tab and ends when you sign out.' },
    ],
  },
};

export default function SignIn() {
  const nav = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const {
    user, ready, busy, error, notice, clearMessages,
    signInEmail, signUpEmail, signInGoogle, signInGuest, signInAdmin, resetPassword, mode,
  } = useAuth();

  const [door, setDoor] = useState<Door>(params.get('door') === 'admin' ? 'admin' : 'member');
  const [tab, setTab] = useState<Tab>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showKey, setShowKey] = useState(false);
  /** Errors are shown only after a submit attempt — complaining about an empty
   *  field someone has not finished typing is nagging, not help. */
  const [touched, setTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const from = (location.state as { from?: string } | null)?.from;
  const next = params.get('next') ?? from ?? null;

  const destination = useMemo(() => {
    if (door === 'admin') return next ?? '/admin';
    return next ?? (mode ? HOME_FOR[mode as AppMode] : '/welcome');
  }, [door, next, mode]);

  // Already signed in — including arriving back on this URL later — means there
  // is nothing to do here. `replace` so Back does not bounce off this screen.
  useEffect(() => {
    if (ready && user) nav(destination, { replace: true });
  }, [ready, user, destination, nav]);

  const reset = () => {
    setTouched(false);
    setFieldErrors({});
    clearMessages();
  };

  const switchDoor = (to: Door) => {
    setDoor(to);
    // The admin door has no sign-up, so leaving the tab on it would render a
    // form with a name field and no way to submit it.
    setTab('signin');
    setAdminKeyInput('');
    reset();
  };

  const switchTab = (to: Tab) => {
    setTab(to);
    reset();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);

    // Firebase lowercases what it stores, and `firestore.rules` looks invites up
    // by the lowercased claim — so the address that goes over the wire has to be
    // lowercased too, or an invite to Ada@x.com is unredeemable by ada@x.com.
    const normalized = email.trim().toLowerCase();

    if (door === 'admin') {
      const errors = validateSignIn({ email, password });
      setFieldErrors(errors);
      if (hasErrors(errors)) return;
      // `signInAdmin` checks the key before it touches the network and reports a
      // wrong one itself, so there is nothing to validate for it here.
      if (await signInAdmin(normalized, password, adminKeyInput)) setPassword('');
      return;
    }

    const input = tab === 'signin'
      ? { email, password }
      : { email, password, displayName: displayName.trim() || undefined };
    const errors = tab === 'signin' ? validateSignIn(input) : validateSignUp(input);
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    const ok = tab === 'signin'
      ? await signInEmail(normalized, password)
      : await signUpEmail(normalized, password, displayName);

    // The `useEffect` above handles the redirect once auth state lands, so
    // there is nothing to do on success but let it.
    if (ok) setPassword('');
  };

  const forgot = async () => {
    setTouched(true);
    const errors = validateSignIn({ email, password: 'unused-placeholder' });
    if (errors.email) {
      setFieldErrors({ email: errors.email });
      return;
    }
    setFieldErrors({});
    await resetPassword(email.trim().toLowerCase());
  };

  const strength = passwordStrength(password);
  const strengthTone = strength === 'strong' ? c.successInk : strength === 'fair' ? c.primaryIcon : c.inkFaint;

  const field = (key: keyof FieldErrors) => ({
    error: touched && Boolean(fieldErrors[key]),
    helperText: touched ? fieldErrors[key] : undefined,
  });

  const blurb = BLURB[door];
  const isAdmin = door === 'admin';

  return (
    <Box
      sx={{
        minHeight: '100vh', background: c.surface, color: c.ink,
        px: { xs: 2.5, md: 5 }, py: { xs: 4, md: 6 },
      }}
    >
      <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
        <Stack
          direction="row"
          alignItems="center"
          gap={1.5}
          component={Link}
          to="/"
          sx={{ mb: { xs: 4, md: 5 }, textDecoration: 'none', color: 'inherit', width: 'fit-content' }}
        >
          <Box
            sx={{
              width: 40, height: 40, borderRadius: '13px', background: c.inverse,
              color: c.primary, display: 'grid', placeItems: 'center',
              fontSize: 21, fontWeight: 800, letterSpacing: '-.02em',
            }}
          >
            F
          </Box>
          <Typography sx={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>Forge</Typography>
        </Stack>

        <Box
          sx={{
            display: 'grid', gap: { xs: 3, md: 5 }, alignItems: 'start',
            gridTemplateColumns: { xs: '1fr', md: `minmax(0, 1fr) ${PANEL_MAX}px` },
          }}
        >
          {/* Left: why an account exists at all. Hidden on mobile, where the
              form is the whole point of the screen and anything above it is
              something to scroll past. */}
          <Box
            sx={{
              display: { xs: 'none', md: 'block' }, position: 'relative', overflow: 'hidden',
              borderRadius: `${radius.hero}px`, p: '48px 44px',
              background: isAdmin ? c.surfaceContainer : c.primaryContainer,
              border: isAdmin ? `1px solid ${c.outline}` : 'none',
            }}
          >
            <Blobs variant="hero" />
            <Box sx={{ position: 'relative' }}>
              <Typography sx={{ fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.12, mb: 2 }}>
                {blurb.title(tab)}
              </Typography>
              <Typography sx={{ fontSize: 16, color: c.inkMuted, lineHeight: 1.65, mb: 3 }}>
                {blurb.body}
              </Typography>
              <Stack spacing={1.5}>
                {blurb.points.map((row) => (
                  <Stack key={row.icon} direction="row" gap={1.5} alignItems="flex-start">
                    <Icon name={row.icon} size={20} color={c.primaryIcon} />
                    <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.6 }}>
                      {row.text}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Box>

          {/* Right: the form. */}
          <Box
            component="form"
            onSubmit={(e) => void submit(e)}
            noValidate
            sx={{
              width: '100%', maxWidth: { xs: PANEL_MAX, md: 'none' }, mx: 'auto',
              p: { xs: 3, md: 3.5 }, borderRadius: `${radius.panel}px`,
              background: c.surfaceCard, border: `1px solid ${c.outline}`,
            }}
          >
            {/* Which door. Above the sign-in/create split because it changes
                what that split even offers. */}
            <Segmented
              options={[['member', 'Member'], ['admin', 'Admin']] as const}
              value={door}
              onChange={switchDoor}
              sx={{ mb: 2 }}
            />

            {!isAdmin && (
              <Segmented
                options={[['signin', 'Sign in'], ['signup', 'Create account']] as const}
                value={tab}
                onChange={switchTab}
                sx={{ mb: 3 }}
              />
            )}

            {isAdmin && (
              <Stack
                direction="row"
                gap={1.5}
                sx={{ mb: 3, p: 2, borderRadius: `${radius.tile}px`, background: c.surfaceContainer }}
              >
                <Icon name="info" size={20} color={c.primaryIcon} />
                <Typography sx={{ fontSize: 12.5, color: c.inkMuted, lineHeight: 1.6 }}>
                  <b>The key reveals the console; it does not hold the permissions.</b> What you can
                  actually change is decided by your role in the organization and enforced by the
                  database rules.
                </Typography>
              </Stack>
            )}

            {error && (
              <Stack
                direction="row"
                gap={1.5}
                role="alert"
                sx={{ mb: 2.5, p: 2, borderRadius: `${radius.tile}px`, background: c.errorContainer }}
              >
                <Icon name="error" size={20} color={c.errorInk} />
                <Typography sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.6 }}>{error}</Typography>
              </Stack>
            )}

            {notice && (
              <Stack
                direction="row"
                gap={1.5}
                role="status"
                sx={{ mb: 2.5, p: 2, borderRadius: `${radius.tile}px`, background: c.success }}
              >
                <Icon name="mark_email_read" size={20} color={c.successInk} />
                <Typography sx={{ fontSize: 13, color: c.onSuccess, lineHeight: 1.6 }}>{notice}</Typography>
              </Stack>
            )}

            {/* Google first, and only on the member door: for someone who has a
                Google account it is the whole flow, and burying it under a form
                they do not need to fill in is the wrong order. */}
            {!isAdmin && (
              <>
                <Button
                  type="button"
                  variant="outlined"
                  fullWidth
                  disabled={busy}
                  onClick={() => void signInGoogle()}
                  startIcon={<GoogleMark />}
                  sx={{ height: 52, mb: 2.5 }}
                >
                  Continue with Google
                </Button>
                <Divider sx={{ mb: 2.5, fontSize: 12, color: c.inkFaint }}>
                  or use an email address
                </Divider>
              </>
            )}

            <Stack gap={2.25}>
              {!isAdmin && tab === 'signup' && (
                <TextField
                  label="Your name"
                  value={displayName}
                  onChange={(e) => { setDisplayName(e.target.value); clearMessages(); }}
                  autoComplete="name"
                  placeholder="How you appear on entries and member lists"
                  {...field('displayName')}
                />
              )}

              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearMessages(); }}
                autoComplete="email"
                autoFocus
                required
                {...field('email')}
              />

              <Box>
                <TextField
                  fullWidth
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearMessages(); }}
                  autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                  required
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          edge="end"
                        >
                          <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={20} />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  {...field('password')}
                />

                {/* Advisory, and only while creating an account: on sign-in the
                    password is whatever it already is, and rating it then is
                    both useless and slightly insulting. */}
                {!isAdmin && tab === 'signup' && password.length > 0 && (
                  <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1, px: 0.5 }}>
                    <Stack direction="row" gap={0.5} sx={{ flex: 1 }}>
                      {[0, 1, 2].map((i) => (
                        <Box
                          key={i}
                          sx={{
                            height: 4, flex: 1, borderRadius: 2,
                            background: i <= ['weak', 'fair', 'strong'].indexOf(strength)
                              ? strengthTone
                              : c.track,
                            transition: `background 200ms ${ease}`,
                          }}
                        />
                      ))}
                    </Stack>
                    <Typography sx={{ fontSize: 11.5, color: strengthTone, fontWeight: 600, textTransform: 'capitalize' }}>
                      {strength}
                    </Typography>
                  </Stack>
                )}
                {!isAdmin && tab === 'signup' && (
                  <Typography sx={{ fontSize: 12, color: c.inkFaint, mt: 1, px: 0.5, lineHeight: 1.5 }}>
                    At least {MIN_PASSWORD_LENGTH} characters. Length beats punctuation — a short
                    phrase you will remember is stronger than one word with symbols in it.
                  </Typography>
                )}
              </Box>

              {isAdmin && (
                <TextField
                  label="Access key"
                  type={showKey ? 'text' : 'password'}
                  value={adminKeyInput}
                  onChange={(e) => { setAdminKeyInput(e.target.value); clearMessages(); }}
                  autoComplete="off"
                  required
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          onClick={() => setShowKey((v) => !v)}
                          aria-label={showKey ? 'Hide key' : 'Show key'}
                          edge="end"
                        >
                          <Icon name={showKey ? 'visibility_off' : 'visibility'} size={20} />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              )}

              <Button
                type="submit"
                variant="contained"
                disabled={busy || (isAdmin && adminKeyInput.trim().length === 0)}
                sx={{ height: 52, mt: 0.5 }}
                startIcon={busy ? undefined : (
                  <Icon name={isAdmin ? 'shield_person' : tab === 'signin' ? 'login' : 'person_add'} size={20} />
                )}
              >
                {busy
                  ? <CircularProgress size={20} sx={{ color: c.onPrimary }} />
                  : isAdmin
                    ? 'Sign in to admin panel'
                    : (tab === 'signin' ? 'Sign in' : 'Create account')}
              </Button>

              {tab === 'signin' && (
                <Button
                  type="button"
                  variant="text"
                  size="small"
                  disabled={busy}
                  onClick={() => void forgot()}
                  sx={{ alignSelf: 'center' }}
                >
                  Forgot your password?
                </Button>
              )}
            </Stack>

            <Box sx={{ mt: 3, pt: 2.5, borderTop: `1px solid ${c.outline}` }}>
              {isAdmin ? (
                <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.6 }}>
                  Not an administrator?{' '}
                  <TextButton onClick={() => switchDoor('member')}>Sign in as a member</TextButton>
                  . The admin door does not create accounts — an admin signs in with an account
                  that already exists.
                </Typography>
              ) : tab === 'signin' ? (
                <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.6 }}>
                  No account yet?{' '}
                  <TextButton onClick={() => switchTab('signup')}>Create one</TextButton>
                  {' '}— or{' '}
                  <Box component={Link} to="/discover" sx={{ color: c.primaryInk, fontWeight: 700 }}>
                    browse challenges
                  </Box>
                  {' '}without one.
                </Typography>
              ) : (
                <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.6 }}>
                  Already have an account?{' '}
                  <TextButton onClick={() => switchTab('signin')}>Sign in</TextButton>
                  . We will email you a link to verify your address — you need it to accept an
                  invitation to an organization.
                </Typography>
              )}

              {/* Guest is last, small, and labelled as temporary, because it is:
                  an anonymous session cannot be recovered, cannot be granted a
                  role and cannot own an organization. Offering it with the same
                  weight as a real account would be selling it as one. */}
              {!isAdmin && (
                <Stack alignItems="center" sx={{ mt: 2 }}>
                  <Button
                    type="button"
                    variant="text"
                    size="small"
                    disabled={busy}
                    onClick={() => void signInGuest()}
                    startIcon={<Icon name="person_outline" size={18} />}
                  >
                    Continue as a guest
                  </Button>
                  <Typography sx={{ fontSize: 11.5, color: c.inkFaint, textAlign: 'center', lineHeight: 1.5, mt: 0.5 }}>
                    Temporary, while the product is being set up. A guest session cannot be
                    recovered and cannot be granted a role.
                  </Typography>
                </Stack>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/** The pill-shaped two-way switch this screen uses twice. */
function Segmented<T extends string>({
  options, value, onChange, sx,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (next: T) => void;
  sx?: object;
}) {
  return (
    <Stack
      direction="row"
      role="tablist"
      sx={{ p: 0.5, borderRadius: `${radius.pill}px`, background: c.surfaceField, ...sx }}
    >
      {options.map(([key, label]) => (
        <Box
          key={key}
          component="button"
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          sx={{
            flex: 1, height: 44, border: 'none', cursor: 'pointer',
            borderRadius: `${radius.pill}px`, font: 'inherit', fontSize: 14,
            fontWeight: value === key ? 700 : 500,
            background: value === key ? c.surfaceCard : 'transparent',
            color: value === key ? c.ink : c.inkMuted,
            boxShadow: value === key ? '0 1px 2px rgba(60,50,10,.16)' : 'none',
            transition: `background 180ms ${ease}, color 180ms ${ease}`,
          }}
        >
          {label}
        </Box>
      ))}
    </Stack>
  );
}

/** A link that is really a button, for switching tabs from inside a sentence. */
function TextButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{ border: 'none', background: 'none', p: 0, font: 'inherit', color: c.primaryInk, fontWeight: 700, cursor: 'pointer' }}
    >
      {children}
    </Box>
  );
}

/**
 * Google's mark, inline.
 *
 * Drawn rather than fetched because the artifact CSP and the offline shell both
 * refuse a remote image, and a sign-in button whose icon is missing on a bad
 * connection looks broken at exactly the wrong moment.
 */
function GoogleMark() {
  return (
    <Box component="svg" viewBox="0 0 48 48" sx={{ width: 18, height: 18 }} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Box>
  );
}
