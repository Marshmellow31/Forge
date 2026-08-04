import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Button, CircularProgress, Divider, IconButton, InputAdornment, Stack, TextField, Typography,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { useAuth } from '@core/auth';
import {
  hasErrors, MIN_PASSWORD_LENGTH, passwordStrength, validateSignIn, validateSignUp,
  type FieldErrors,
} from '@core/auth/credentials';
import { HOME_FOR, type AppMode } from '@core/auth/mode';
import { c, ease, radius, shadow } from '@shared/design/tokens';

type Tab = 'signin' | 'signup';

/** A compact customer account screen. Organization roles are resolved after sign-in. */
export default function SignIn() {
  const nav = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const {
    user, ready, busy, error, notice, clearMessages,
    signInEmail, signUpEmail, signInGoogle, resetPassword, mode,
  } = useAuth();

  const [tab, setTab] = useState<Tab>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const from = (location.state as { from?: string } | null)?.from;
  const next = params.get('next') ?? from ?? null;
  const destination = useMemo(
    () => next ?? (mode ? HOME_FOR[mode as AppMode] : '/welcome'),
    [mode, next],
  );

  useEffect(() => {
    if (ready && user) nav(destination, { replace: true });
  }, [destination, nav, ready, user]);

  const resetMessages = () => {
    setTouched(false);
    setFieldErrors({});
    clearMessages();
  };

  const switchTab = (nextTab: Tab) => {
    setTab(nextTab);
    resetMessages();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    const normalized = email.trim().toLowerCase();
    const input = tab === 'signin'
      ? { email: normalized, password }
      : { email: normalized, password, displayName: displayName.trim() || undefined };
    const errors = tab === 'signin' ? validateSignIn(input) : validateSignUp(input);
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    const ok = tab === 'signin'
      ? await signInEmail(normalized, password)
      : await signUpEmail(normalized, password, displayName.trim() || undefined);
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
    <Box sx={{ minHeight: '100vh', px: { xs: 2, sm: 3 }, py: { xs: 2, md: 3.5 }, background: c.surface, color: c.ink }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%', maxWidth: 1040, mx: 'auto', mb: { xs: 3, md: 4 } }}>
        <Brand />
        <Button component={Link} to="/" variant="text" startIcon={<Icon name="arrow_back" size={18} />}>Back to competitions</Button>
      </Stack>

      <Box sx={{ width: '100%', maxWidth: 440, mx: 'auto' }}>
        <Box component="form" onSubmit={(event) => void submit(event)} noValidate sx={{ p: { xs: 3, sm: 4 }, borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, boxShadow: shadow.raised }}>
          <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: c.primaryInk, mb: 1.25 }}>{tab === 'signin' ? 'Welcome back' : 'New to Forge'}</Typography>
          <Typography component="h1" sx={{ fontSize: { xs: 29, sm: 33 }, fontWeight: 760, lineHeight: 1.1, letterSpacing: '-.04em', mb: 1 }}>
            {tab === 'signin' ? 'Sign in to your account' : 'Create your account'}
          </Typography>
          <Typography sx={{ fontSize: 13.5, lineHeight: 1.6, color: c.inkMuted, mb: 3 }}>
            One account for competitions and organization invitations. Admin access is assigned separately.
          </Typography>

          <Segmented value={tab} onChange={switchTab} />
          {error && <Message tone="error" icon="error" text={error} />}
          {notice && <Message tone="success" icon="mark_email_read" text={notice} />}

          <Button type="button" variant="outlined" fullWidth disabled={busy} onClick={() => void signInGoogle()} startIcon={<GoogleMark />} sx={{ height: 50, mt: 2.5 }}>Continue with Google</Button>
          <Divider sx={{ my: 2.25, fontSize: 11.5, color: c.inkFaint }}>or use email</Divider>

          <Stack gap={2}>
            {tab === 'signup' && <TextField label="Your name" value={displayName} onChange={(event) => { setDisplayName(event.target.value); clearMessages(); }} autoComplete="name" placeholder="How people will see you" {...field('displayName')} />}
            <TextField label="Email address" type="email" value={email} onChange={(event) => { setEmail(event.target.value); clearMessages(); }} autoComplete="email" autoFocus required {...field('email')} />
            <Box>
              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => { setPassword(event.target.value); clearMessages(); }}
                autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                required
                InputProps={{ endAdornment: <InputAdornment position="end"><IconButton size="small" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} edge="end"><Icon name={showPassword ? 'visibility_off' : 'visibility'} size={20} /></IconButton></InputAdornment> }}
                {...field('password')}
              />
              {tab === 'signup' && password.length > 0 && <StrengthMeter strength={strength} tone={strengthTone} />}
              {tab === 'signup' && <Typography sx={{ mt: 1, px: 0.5, fontSize: 11.5, color: c.inkFaint }}>At least {MIN_PASSWORD_LENGTH} characters.</Typography>}
            </Box>
          </Stack>

          <Button type="submit" variant="contained" fullWidth disabled={busy} sx={{ height: 52, mt: 2.75 }} startIcon={busy ? undefined : <Icon name={tab === 'signin' ? 'login' : 'person_add'} size={20} />}>
            {busy ? <CircularProgress size={20} sx={{ color: c.onPrimary }} /> : tab === 'signin' ? 'Sign in' : 'Create account'}
          </Button>

          {tab === 'signin' ? (
            <Button type="button" variant="text" size="small" disabled={busy} onClick={() => void forgot()} sx={{ display: 'flex', mx: 'auto', mt: 1 }}>Forgot your password?</Button>
          ) : (
            <Typography sx={{ mt: 1.5, fontSize: 11.5, lineHeight: 1.5, textAlign: 'center', color: c.inkFaint }}>Verify your email before accepting organization invitations.</Typography>
          )}

          <Typography sx={{ mt: 2.5, pt: 2.25, borderTop: `1px solid ${c.outline}`, fontSize: 13, color: c.inkMuted, textAlign: 'center' }}>
            {tab === 'signin' ? 'Need an account? ' : 'Already registered? '}
            <InlineButton onClick={() => switchTab(tab === 'signin' ? 'signup' : 'signin')}>{tab === 'signin' ? 'Create one' : 'Sign in'}</InlineButton>
          </Typography>
        </Box>

        <Stack direction="row" alignItems="center" justifyContent="center" gap={1} sx={{ mt: 2.25 }}>
          <Icon name="lock" size={16} color={c.inkFaint} />
          <Typography sx={{ fontSize: 11.5, color: c.inkFaint }}>Your role cannot be chosen or changed from this screen.</Typography>
        </Stack>
      </Box>
    </Box>
  );
}

function Brand() {
  return (
    <Stack component={Link} to="/" direction="row" alignItems="center" gap={1.1} sx={{ color: 'inherit', textDecoration: 'none' }}>
      <Box sx={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: '12px', background: c.inverse, color: c.primary, fontSize: 20, fontWeight: 800 }}>F</Box>
      <Typography sx={{ fontSize: 22, fontWeight: 750, letterSpacing: '-.03em' }}>Forge</Typography>
    </Stack>
  );
}

function Segmented({ value, onChange }: { value: Tab; onChange: (next: Tab) => void }) {
  return (
    <Stack direction="row" role="tablist" sx={{ p: 0.5, borderRadius: `${radius.pill}px`, background: c.surfaceField }}>
      {([['signin', 'Sign in'], ['signup', 'Create account']] as const).map(([key, label]) => (
        <Box key={key} component="button" type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)} sx={{ flex: 1, height: 40, border: 'none', cursor: 'pointer', borderRadius: `${radius.pill}px`, font: 'inherit', fontSize: 13.5, fontWeight: value === key ? 750 : 500, background: value === key ? c.surfaceCard : 'transparent', color: value === key ? c.ink : c.inkMuted, boxShadow: value === key ? shadow.raised : 'none', transition: `all 180ms ${ease}` }}>{label}</Box>
      ))}
    </Stack>
  );
}

function Message({ tone, icon, text }: { tone: 'error' | 'success'; icon: string; text: string }) {
  const success = tone === 'success';
  return <Stack direction="row" gap={1.25} role={success ? 'status' : 'alert'} sx={{ mt: 2.5, p: 1.5, borderRadius: `${radius.tile}px`, background: success ? c.success : c.errorContainer }}><Icon name={icon} size={18} color={success ? c.successInk : c.errorInk} /><Typography sx={{ fontSize: 12.5, lineHeight: 1.5, color: success ? c.onSuccess : c.errorBody }}>{text}</Typography></Stack>;
}

function StrengthMeter({ strength, tone }: { strength: ReturnType<typeof passwordStrength>; tone: string }) {
  const levels = ['weak', 'fair', 'strong'];
  return <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1, px: 0.5 }}><Stack direction="row" gap={0.5} sx={{ flex: 1 }}>{levels.map((level, index) => <Box key={level} sx={{ height: 4, flex: 1, borderRadius: 2, background: index <= levels.indexOf(strength) ? tone : c.track, transition: `background 200ms ${ease}` }} />)}</Stack><Typography sx={{ fontSize: 11, color: tone, fontWeight: 700, textTransform: 'capitalize' }}>{strength}</Typography></Stack>;
}

function InlineButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <Box component="button" type="button" onClick={onClick} sx={{ p: 0, border: 'none', background: 'none', color: c.primaryInk, font: 'inherit', fontWeight: 750, cursor: 'pointer' }}>{children}</Box>;
}

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
