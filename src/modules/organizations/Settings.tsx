import { useState } from 'react';
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, Stack, TextField, Typography,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { OrgLogo } from '@shared/ui/OrgLogo';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import { PageTitle, Eyebrow, Tag, panelSx, containerSx, Num } from '@shared/ui/primitives';
import { useOrg, useMembers, useChallenges, useRoles } from '@core/firebase/hooks';
import { useSaveRole, useDeleteRole } from '@core/firebase/mutations';
import { useAuth, usePermissions } from '@core/auth';
import { PERMISSIONS, BUILT_IN_ROLE_LIST } from '@core/rbac';
import { c, radius, mono } from '@shared/design/tokens';

interface RoleDraft {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isNew: boolean;
}

/**
 * S-19..22 — Organization settings.
 *
 * The most useful thing this screen can currently do is tell you **exactly what
 * you are allowed to do and why**, which is otherwise invisible: a button that
 * silently is not there is indistinguishable from a bug. So the permission
 * inspector is the centrepiece rather than an afterthought.
 *
 * Editing org profile and branding is not built; the rule (`org.update`) exists
 * and is enforced, so it is a screen away rather than an architecture away.
 */
export default function Settings() {
  const { data: org, isLoading, error } = useOrg();
  const { data: members = [] } = useMembers();
  const { data: challenges = [] } = useChallenges();
  const { permissions, ready, isSignedIn, isMember, can } = usePermissions();
  const { user } = useAuth();
  const { data: allRoles = [] } = useRoles();
  const saveRole = useSaveRole();
  const removeRole = useDeleteRole();
  const [editing, setEditing] = useState<RoleDraft | null>(null);

  // Only the org's own roles; the built-ins are resolved from code, not read.
  const customRoles = allRoles.filter((r) => !r.isSystem);
  const held = [...permissions].sort();

  return (
    <>
      <PageTitle sub="What this organization is, and what you are allowed to do in it.">
        Settings
      </PageTitle>

      <QueryBoundary isLoading={isLoading} error={error}>
        <Box sx={{ ...panelSx, mb: 3 }}>
          <Eyebrow>Organization</Eyebrow>
          <Stack direction="row" alignItems="center" gap={2} sx={{ mt: 2, mb: 3 }}>
            <OrgLogo logoUrl={org?.logoUrl} initials={org?.initials ?? '—'} size={56} radius={18} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>
                {org?.name ?? 'Unknown organization'}
              </Typography>
              <Typography sx={{ fontSize: 13, color: c.inkMuted }}>
                <Box component="span" sx={{ fontFamily: mono }}>/{org?.slug}</Box>
                {' · '}{org?.type}{' · '}{org?.plan} plan
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" gap={3} flexWrap="wrap">
            <Box>
              <Eyebrow>Members</Eyebrow>
              <Typography sx={{ fontSize: 24, fontWeight: 700 }}><Num size={24}>{members.length}</Num></Typography>
            </Box>
            <Box>
              <Eyebrow>Challenges</Eyebrow>
              <Typography sx={{ fontSize: 24, fontWeight: 700 }}><Num size={24}>{challenges.length}</Num></Typography>
            </Box>
          </Stack>
        </Box>

        <Box sx={{ ...panelSx, mb: 3 }}>
          <Eyebrow>Your access</Eyebrow>
          <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.6, mt: 1.5, mb: 2.5 }}>
            A control you cannot use is hidden rather than disabled, which makes a missing
            permission look like a missing feature. This is the ground truth.
          </Typography>

          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 2.5 }}>
            <Tag bg={isSignedIn ? c.success : c.surfaceField} fg={isSignedIn ? c.onSuccess : c.inkMuted}>
              {isSignedIn ? 'Signed in' : 'Not signed in'}
            </Tag>
            <Tag bg={isMember ? c.success : c.surfaceField} fg={isMember ? c.onSuccess : c.inkMuted}>
              {isMember ? 'Member of this organization' : 'Not a member'}
            </Tag>
            <Tag>{`${held.length} of ${PERMISSIONS.length} permissions`}</Tag>
          </Stack>

          {!ready ? (
            <Typography sx={{ fontSize: 13, color: c.inkFaint }}>Resolving…</Typography>
          ) : held.length === 0 ? (
            <Stack direction="row" gap={1.75} sx={{ p: 2.25, borderRadius: `${radius.tile}px`, background: c.errorContainer }}>
              <Icon name="lock" size={22} color={c.errorInk} />
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 600, color: c.onErrorContainer, mb: 0.25 }}>
                  You have no permissions here
                </Typography>
                <Typography sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.6 }}>
                  Everything is read-only. To get access, someone holding <b>member.invite</b> must
                  invite this exact email from <b>Members</b> — or, for the very first admin, the
                  seed must be run with <Box component="code" sx={{ fontFamily: mono }}>OWNER_EMAIL</Box> set.
                  See ADR-020.
                </Typography>
              </Box>
            </Stack>
          ) : (
            <Box sx={{ display: 'grid', gap: 0.75, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              {held.map((p) => (
                <Stack key={p} direction="row" alignItems="center" gap={1}>
                  <Icon name="check_circle" size={16} fill color={c.successInk} />
                  <Box component="code" sx={{ fontFamily: mono, fontSize: 12.5, color: c.inkBody }}>{p}</Box>
                </Stack>
              ))}
            </Box>
          )}
        </Box>

        <Box sx={{ ...panelSx, mb: 3 }}>
          <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
            <Eyebrow>Roles</Eyebrow>
            <Box sx={{ flex: 1 }} />
            {can('role.manage') && (
              <Button
                size="small"
                startIcon={<Icon name="add" size={18} />}
                onClick={() => setEditing({ id: `role_${Date.now().toString(36)}`, name: '', description: '', permissions: [], isNew: true })}
              >
                Custom role
              </Button>
            )}
          </Stack>

          <Stack gap={2} sx={{ mt: 1 }}>
            {[...BUILT_IN_ROLE_LIST, ...customRoles].map((role, i) => {
              const isCustom = !role.isSystem;
              return (
                <Box key={role.id}>
                  {i > 0 && <Divider sx={{ mb: 2 }} />}
                  <Stack direction="row" alignItems="baseline" gap={1.25} sx={{ mb: 0.5 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{role.name}</Typography>
                    <Tag bg={c.surfaceField} fg={c.inkMuted}>{`${role.permissions.length} permissions`}</Tag>
                    {role.isSystem
                      ? <Tag bg={c.surfaceField} fg={c.inkFaint}>built-in</Tag>
                      : <Tag bg={c.success} fg={c.onSuccess}>custom</Tag>}
                    <Box sx={{ flex: 1 }} />
                    {can('role.manage') && (
                      <Button
                        size="small"
                        onClick={() => setEditing({
                          id: isCustom ? role.id : `role_${role.id}_copy`,
                          name: isCustom ? role.name : `${role.name} (copy)`,
                          description: role.description,
                          permissions: [...role.permissions],
                          isNew: !isCustom,
                        })}
                      >
                        {/* Built-ins are the vocabulary everything else is
                            described against, so they are cloned, not edited. */}
                        {isCustom ? 'Edit' : 'Duplicate'}
                      </Button>
                    )}
                  </Stack>
                  <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.6 }}>
                    {role.description}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        </Box>

        <Dialog open={editing !== null} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
          <DialogTitle>{editing?.isNew ? 'New custom role' : 'Edit role'}</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus fullWidth label="Role name" sx={{ mt: 1, mb: 2 }}
              value={editing?.name ?? ''}
              onChange={(e) => setEditing((r) => r && { ...r, name: e.target.value })}
            />
            <TextField
              fullWidth label="What is this role for?" sx={{ mb: 3 }}
              value={editing?.description ?? ''}
              onChange={(e) => setEditing((r) => r && { ...r, description: e.target.value })}
              helperText="Whoever assigns this role reads this. “Organizer” means nothing on its own."
            />

            <Typography sx={{ fontSize: 13, fontWeight: 700, color: c.inkMuted, mb: 1 }}>
              Permissions ({editing?.permissions.length ?? 0} of {PERMISSIONS.length})
            </Typography>
            <Box sx={{ maxHeight: 300, overflowY: 'auto', border: `1px solid ${c.outline}`, borderRadius: `${radius.field}px`, p: 1 }}>
              {PERMISSIONS.map((p) => (
                <FormControlLabel
                  key={p}
                  sx={{ display: 'flex', ml: 0 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={editing?.permissions.includes(p) ?? false}
                      onChange={(e) => setEditing((r) => r && {
                        ...r,
                        permissions: e.target.checked
                          ? [...r.permissions, p]
                          : r.permissions.filter((x) => x !== p),
                      })}
                    />
                  }
                  label={<Box component="code" sx={{ fontFamily: mono, fontSize: 12.5 }}>{p}</Box>}
                />
              ))}
            </Box>

            {saveRole.error && (
              <Typography sx={{ fontSize: 13, color: c.errorBody, mt: 2, lineHeight: 1.5 }}>
                {saveRole.error instanceof Error ? saveRole.error.message : String(saveRole.error)}
              </Typography>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            {editing && !editing.isNew && (
              <Button
                color="error"
                onClick={async () => {
                  await removeRole.mutateAsync({ roleId: editing.id, userId: user?.uid });
                  setEditing(null);
                }}
              >
                Delete
              </Button>
            )}
            <Box sx={{ flex: 1 }} />
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!editing?.name.trim() || saveRole.isPending}
              onClick={async () => {
                if (!editing) return;
                await saveRole.mutateAsync({
                  role: {
                    id: editing.id,
                    name: editing.name.trim(),
                    description: editing.description.trim(),
                    permissions: editing.permissions,
                  },
                  userId: user?.uid,
                });
                setEditing(null);
              }}
            >
              {saveRole.isPending ? 'Saving…' : 'Save role'}
            </Button>
          </DialogActions>
        </Dialog>

        <Stack direction="row" gap={1.75} sx={{ ...containerSx, p: 2.25 }}>
          <Icon name="construction" size={22} color={c.primaryIcon} />
          <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.6 }}>
            Editing the organization profile, branding and custom roles is not built yet
            (ROADMAP S-19..22 and Phase 2). The permissions behind them — <b>org.update</b> and
            <b> role.manage</b> — already exist and are already enforced by the security rules, so
            these are a screen away rather than an architecture away.
          </Typography>
        </Stack>
      </QueryBoundary>
    </>
  );
}
