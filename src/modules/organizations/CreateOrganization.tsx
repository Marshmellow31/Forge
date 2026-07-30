import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { OrgLogo } from '@shared/ui/OrgLogo';
import { DriveLinkInput } from '@shared/ui/DriveLinkInput';
import { PageTitle, Eyebrow, panelSx, containerSx } from '@shared/ui/primitives';
import { useCreateOrganization } from '@core/firebase/mutations';
import { useAuth } from '@core/auth';
import { slugify } from '@core/challenges/slug';
import { c, radius, mono } from '@shared/design/tokens';

/**
 * S-12 — Create an organization. ROADMAP 1.2.
 *
 * The last Phase 1 gap, and the one with the most ordering hazard: the org
 * document, the owner membership and the seeded roles have to land in that
 * order, because each is authorized by the one before it. `writeOrganization`
 * carries that logic and the comment explaining why a single batch cannot.
 *
 * Whoever creates an org is its **owner**, with every permission. That is the
 * only place in the product where full control is granted without an invite,
 * and it is safe because the org did not exist a moment ago — there is nothing
 * to escalate into.
 */

const TYPES = [
  { value: 'education', label: 'School, college or university' },
  { value: 'company', label: 'Company' },
  { value: 'community', label: 'Community or club' },
  { value: 'creator', label: 'Creator' },
  { value: 'nonprofit', label: 'Non-profit' },
  { value: 'other', label: 'Something else' },
] as const;

export default function CreateOrganization() {
  const nav = useNavigate();
  const { user, signInGoogle, busy } = useAuth();
  const create = useCreateOrganization();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('education');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  const effectiveSlug = slug || slugify(name);
  const orgId = useMemo(
    () => `org_${effectiveSlug || 'new'}_${Math.random().toString(36).slice(2, 6)}`,
    [effectiveSlug],
  );

  const problems: string[] = [];
  if (name.trim().length < 2) problems.push('An organization needs a name.');
  if (!effectiveSlug) problems.push('The name needs at least one letter or number for the URL.');

  const submit = async () => {
    if (problems.length > 0 || !user) return;
    await create.mutateAsync({
      input: {
        id: orgId,
        name: name.trim(),
        slug: effectiveSlug,
        type,
        description: description.trim(),
        logoUrl: logoUrl.trim(),
      },
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      },
    });
    nav('/org');
  };

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto' }}>
      <PageTitle sub="You will be its owner, with full control.">Create an organization</PageTitle>

      {!user && (
        <Stack direction="row" gap={1.75} sx={{ ...containerSx, mb: 3 }}>
          <Icon name="login" size={22} color={c.primaryIcon} />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 0.5 }}>Sign in first</Typography>
            <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.6, mb: 1.5 }}>
              An organization needs an owner, and that has to be an account rather than a browser
              session.
            </Typography>
            <Button variant="contained" size="small" disabled={busy} onClick={() => void signInGoogle()}>
              Sign in with Google
            </Button>
          </Box>
        </Stack>
      )}

      <Stack gap={2.5} sx={panelSx}>
        <TextField
          label="Organization name"
          fullWidth
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="IIIT Vadodara"
        />

        <TextField
          label="URL"
          fullWidth
          value={effectiveSlug}
          onChange={(e) => setSlug(slugify(e.target.value))}
          helperText={`forge.app/${effectiveSlug || '…'}`}
        />

        <TextField
          select
          label="What kind of organization?"
          fullWidth
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          {TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
        </TextField>

        <TextField
          label="Description"
          fullWidth
          multiline
          minRows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          helperText="Optional. Shown on your public organization page."
        />

        <Box>
          <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 1.5 }}>
            <OrgLogo
              logoUrl={logoUrl}
              initials={(name.split(/\s+/).map((w) => w[0]).join('') || 'F').slice(0, 2).toUpperCase()}
              size={56}
            />
            <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.6 }}>
              <b>Logo</b> — optional. Paste a Google Drive share link or any image URL. Without
              one you get your initials on the brand colour, which is a finished look rather than
              a placeholder.
            </Typography>
          </Stack>
          <DriveLinkInput
            value={logoUrl}
            onChange={setLogoUrl}
            purpose="image"
            allowPlainUrl
            label="Logo link"
          />
        </Box>
      </Stack>

      <Box sx={{ ...containerSx, mt: 3, p: 2.25 }}>
        <Eyebrow>What gets created</Eyebrow>
        <Stack gap={1} sx={{ mt: 1.5 }}>
          {[
            'The organization itself',
            'You, as its owner, with every permission',
            'The seven built-in roles, ready to invite people into',
            'A “General” workspace to put your first challenge in',
          ].map((line) => (
            <Stack key={line} direction="row" alignItems="center" gap={1}>
              <Icon name="check_circle" size={16} fill color={c.successInk} />
              <Typography sx={{ fontSize: 13, color: c.inkMuted }}>{line}</Typography>
            </Stack>
          ))}
        </Stack>
      </Box>

      {problems.length > 0 && name.length > 0 && (
        <Box sx={{ mt: 3, p: 2.25, borderRadius: `${radius.tile}px`, background: c.errorContainer }}>
          {problems.map((p) => (
            <Typography key={p} sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.6 }}>{p}</Typography>
          ))}
        </Box>
      )}

      {create.error && (
        <Box sx={{ mt: 3, p: 2.25, borderRadius: `${radius.tile}px`, background: c.errorContainer }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: c.onErrorContainer, mb: 0.5 }}>
            Could not create the organization
          </Typography>
          <Typography sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.6 }}>
            {create.error instanceof Error ? create.error.message : String(create.error)}
            {' '}Every document is keyed by{' '}
            <Box component="code" sx={{ fontFamily: mono }}>{orgId}</Box>, so trying again resumes
            rather than creating a second organization.
          </Typography>
        </Box>
      )}

      <Stack direction="row" gap={1.5} sx={{ mt: 3, pb: 4 }}>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          sx={{ height: 52, px: 3.5 }}
          disabled={!user || problems.length > 0 || create.isPending}
          onClick={() => void submit()}
        >
          {create.isPending ? 'Creating…' : 'Create organization'}
        </Button>
      </Stack>
    </Box>
  );
}
