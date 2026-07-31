import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Button, CircularProgress, IconButton, InputAdornment, Stack, TextField, Typography,
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
 * S-02 — Sign in, create an account, or recover one.
 *
 * One screen for all three because they are the same decision seen from
 * different angles: someone arrives with an email address and finds out which
 * of the three they need only after typing it. Three separate screens make the
 * common correction — "I do not have an account after all" — cost a navigation
 * and a retyped address.
 *
 * Email and password is the only method (ADR-024). There is no provider button
 * and no guest handshake: browsing needs no account at all, so the honest
 * alternative to signing in is *not signing in*, offered as a link out.
 *
 * Where you land afterwards, in priority order:
 *   1. `?next=` — set by whatever sent you here, so a deep link survives.
 *   2. `location.state.from` — set by the admin gate and other redirects.
 *   3. The home for your chosen surface, or `/welcome` if you have not chosen.
 */

type Tab = 'signin' | 'signup';

const PANEL_MAX = 460;

export default function SignIn() {
  const nav = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const {
    user, ready, busy, error, notice, clearMessages,
    signInEmail, signUpEmail, resetPassword, mode,
  } = useAuth();

  const [tab, setTab] = useState<Tab>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  /** Errors are shown only after a submit attempt — complaining about an empty
   *  field someone has not finished typing is nagging, not help. */
  const [touched, setTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const from = (location.state as { from?: string } | null)?.from;
  const next = params.get('next') ?? from ?? null;

  const destination = useMemo(
    () => next ?? (mode ? HOME_FOR[mode as AppMode] : '/welcome'),
    [next, mode],
  );

  // Already signed in — including arriving back on this URL later — means there
  // is nothing to do here. `replace` so Back does not bounce off this screen.
  useEffect(() => {
    if (ready && user) nav(destination, { replace: true });
  }, [ready, user, destination, nav]);

  const switchTab = (to: Tab) => {
    setTab(to);
    setTouched(false);
    setFieldErrors({});
    clearMessages();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);

    const input = tab === 'signin'
      ? { email, password }
      : { email, password, displayName: displayName.trim() || undefined };
    const errors = tab === 'signin' ? validateSignIn(input) : validateSignUp(input);
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    // Firebase lowercases what it stores, and `firestore.rules` looks invites up
    // by the lowercased claim — so the address that goes over the wire has to be
    // lowercased too, or an invite to Ada@x.com is unredeemable by ada@x.com.
    const normalized = email.trim().toLowerCase();
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
              borderRadius: `${radius.hero}px`, background: c.primaryContainer, p: '48px 44px',
            }}
          >
            <Blobs variant="hero" />
            <Box sx={{ position: 'relative' }}>
              <Typography sx={{ fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.12, mb: 2 }}>
                {tab === 'signin' ? 'Welcome back.' : 'One account, both sides.'}
              </Typography>
              <Typography sx={{ fontSize: 16, color: c.inkMuted, lineHeight: 1.65, mb: 3 }}>
                The same account enters a challenge on Monday and runs one on Tuesday. Nothing here
                is locked to a role — what you can do comes from your permissions, not from how you
                signed up.
              </Typography>
              <Stack spacing={1.5}>
                {[
                  { icon: 'mail', text: 'Email and password. No third-party account required.' },
                  { icon: 'verified_user', text: 'Verify your address to accept invitations to an organization.' },
                  { icon: 'visibility', text: 'Browsing challenges needs no account at all.' },
                ].map((row) => (
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
            <Stack
              direction="row"
              sx={{ p: 0.5, mb: 3, borderRadius: `${radius.pill}px`, background: c.surfaceField }}
              role="tablist"
            >
              {([['signin', 'Sign in'], ['signup', 'Create account']] as const).map(([key, label]) => (
                <Box
                  key={key}
                  component="button"
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => switchTab(key)}
                  sx={{
                    flex: 1, height: 44, border: 'none', cursor: 'pointer',
                    borderRadius: `${radius.pill}px`, font: 'inherit', fontSize: 14,
                    fontWeight: tab === key ? 700 : 500,
                    background: tab === key ? c.surfaceCard : 'transparent',
                    color: tab === key ? c.ink : c.inkMuted,
                    boxShadow: tab === key ? '0 1px 2px rgba(60,50,10,.16)' : 'none',
                    transition: `background 180ms ${ease}, color 180ms ${ease}`,
                  }}
                >
                  {label}
                </Box>
              ))}
            </Stack>

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

            <Stack gap={2.25}>
              {tab === 'signup' && (
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
                {tab === 'signup' && password.length > 0 && (
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
                {tab === 'signup' && (
                  <Typography sx={{ fontSize: 12, color: c.inkFaint, mt: 1, px: 0.5, lineHeight: 1.5 }}>
                    At least {MIN_PASSWORD_LENGTH} characters. Length beats punctuation — a short
                    phrase you will remember is stronger than one word with symbols in it.
                  </Typography>
                )}
              </Box>

              <Button
                type="submit"
                variant="contained"
                disabled={busy}
                sx={{ height: 52, mt: 0.5 }}
                startIcon={busy ? undefined : <Icon name={tab === 'signin' ? 'login' : 'person_add'} size={20} />}
              >
                {busy
                  ? <CircularProgress size={20} sx={{ color: c.onPrimary }} />
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
              <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.6 }}>
                {tab === 'signin' ? (
                  <>
                    No account yet?{' '}
                    <Box
                      component="button"
                      type="button"
                      onClick={() => switchTab('signup')}
                      sx={{ border: 'none', background: 'none', p: 0, font: 'inherit', color: c.primaryInk, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Create one
                    </Box>
                    {' '}— or{' '}
                    <Box component={Link} to="/discover" sx={{ color: c.primaryInk, fontWeight: 700 }}>
                      browse challenges
                    </Box>
                    {' '}without one.
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <Box
                      component="button"
                      type="button"
                      onClick={() => switchTab('signin')}
                      sx={{ border: 'none', background: 'none', p: 0, font: 'inherit', color: c.primaryInk, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Sign in
                    </Box>
                    . We will email you a link to verify your address — you need it to accept an
                    invitation to an organization.
                  </>
                )}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
