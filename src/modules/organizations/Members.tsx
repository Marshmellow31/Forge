import { useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem,
  Stack, TextField, Typography,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import {
  PageTitle, EmptyState, StatusPill, TableHead, tableRowSx, PersonCell, Tag, containerSx,
} from '@shared/ui/primitives';
import { useMembers, useInvites } from '@core/firebase/hooks';
import { useInviteMember, useRevokeInvite } from '@core/firebase/mutations';
import { useAuth, usePermissions } from '@core/auth';
import { BUILT_IN_ROLE_LIST } from '@core/rbac';
import { c, radius } from '@shared/design/tokens';

/**
 * S-16 — Members and invitations.
 *
 * This screen is how anyone gets permission to do anything (ADR-020). An
 * invite is written here; the invitee redeems it on their first sign-in and the
 * security rules refuse anything that does not match it exactly.
 *
 * The role descriptions are shown rather than hidden behind a tooltip on
 * purpose: "Organizer" means nothing to someone deciding who should be able to
 * delete a challenge, and a wrong choice here is a real security decision.
 */
export default function Members() {
  const { user } = useAuth();
  const { can, ready } = usePermissions();
  const { data: members = [], isLoading, error } = useMembers();
  const { data: invites = [] } = useInvites();
  const invite = useInviteMember();
  const revoke = useRevokeInvite();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('organizer');

  const pending = invites.filter((i) => i.status === 'pending');
  const canInvite = can('member.invite');
  const emailLooksValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const alreadyInvited = pending.some((i) => i.email === email.trim().toLowerCase());
  const alreadyMember = members.some((m) => m.email.toLowerCase() === email.trim().toLowerCase());

  const send = async () => {
    await invite.mutateAsync({ email: email.trim(), roleId, userId: user?.uid });
    setEmail('');
    setOpen(false);
  };

  return (
    <>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mb: 3 }}>
        <PageTitle sub="Who can see and run challenges in this organization.">Members</PageTitle>
        {canInvite && (
          <Button
            variant="contained"
            sx={{ height: 52, mb: 2 }}
            startIcon={<Icon name="person_add" size={20} />}
            onClick={() => setOpen(true)}
          >
            Invite someone
          </Button>
        )}
      </Stack>

      {!canInvite && ready && (
        <Stack direction="row" gap={1.5} sx={{ ...containerSx, mb: 3 }}>
          <Icon name="info" size={22} color={c.primaryIcon} />
          <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.6 }}>
            You can see who is here, but inviting people needs the <b>member.invite</b> permission.
          </Typography>
        </Stack>
      )}

      {pending.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontSize: 17, fontWeight: 700, mb: 1.5 }}>
            Pending invitations
          </Typography>
          <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, overflow: 'hidden' }}>
            {pending.map((i) => (
              <Stack key={i.id} direction="row" alignItems="center" gap={2} sx={tableRowSx}>
                <Icon name="mail" size={20} color={c.inkFaint} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 15, fontWeight: 600 }}>{i.email}</Typography>
                  <Typography sx={{ fontSize: 12, color: c.inkFaint }}>
                    Joins as {i.roleIds.join(', ')} when they sign in
                  </Typography>
                </Box>
                {can('member.manage') && (
                  <Button
                    size="small"
                    color="error"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate({ email: i.email, userId: user?.uid })}
                  >
                    Revoke
                  </Button>
                )}
              </Stack>
            ))}
          </Box>
        </Box>
      )}

      <QueryBoundary isLoading={isLoading} error={error}>
        {members.length === 0 ? (
          <EmptyState icon="group" title="No members yet" body="Invite someone to get started." />
        ) : (
          <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, overflow: 'hidden' }}>
            <TableHead
              cols={[{ label: 'Person' }, { label: 'Roles', width: 220 }, { label: 'Status', width: 110 }]}
            />
            {members.map((m) => (
              <Stack key={m.id} direction="row" alignItems="center" gap={2} sx={tableRowSx}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <PersonCell name={m.name} sub={m.email} />
                </Box>
                <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ width: 220, flex: 'none' }}>
                  {m.roles.map((r) => <Tag key={r}>{r}</Tag>)}
                </Stack>
                <Box sx={{ width: 110, flex: 'none' }}>
                  <StatusPill status={m.status} />
                </Box>
              </Stack>
            ))}
          </Box>
        )}
      </QueryBoundary>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Invite someone</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.6, mb: 3 }}>
            They join with exactly the role you pick here, the first time they sign in with this
            email address. Nothing is emailed — send them the link yourself.
          </Typography>

          <TextField
            autoFocus
            fullWidth
            label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={email.length > 0 && (!emailLooksValid || alreadyInvited || alreadyMember)}
            helperText={
              alreadyMember ? 'That person is already a member.'
                : alreadyInvited ? 'There is already a pending invite for that address.'
                : email.length > 0 && !emailLooksValid ? 'That does not look like an email address.'
                : 'Must match the Google account they sign in with.'
            }
            sx={{ mb: 3 }}
          />

          <TextField
            select
            fullWidth
            label="Role"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {BUILT_IN_ROLE_LIST.map((role) => (
              <MenuItem key={role.id} value={role.id}>
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{role.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: c.inkMuted, whiteSpace: 'normal' }}>
                    {role.description}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </TextField>

          {invite.error && (
            <Box sx={{ mt: 2.5, p: 2, borderRadius: `${radius.field}px`, background: c.errorContainer }}>
              <Typography sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.5 }}>
                {invite.error instanceof Error ? invite.error.message : String(invite.error)}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!emailLooksValid || alreadyInvited || alreadyMember || invite.isPending}
            onClick={() => void send()}
          >
            {invite.isPending ? 'Inviting…' : 'Send invite'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
