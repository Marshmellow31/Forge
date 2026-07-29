import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack,
  TextField, Typography,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import { PageTitle, EmptyState, Num, liftSx, containerSx } from '@shared/ui/primitives';
import { useWorkspaces, useChallenges } from '@core/firebase/hooks';
import { useSaveWorkspace, useDeleteWorkspace } from '@core/firebase/mutations';
import { useAuth, usePermissions } from '@core/auth';
import { slugify } from '@core/challenges/slug';
import { c, radius } from '@shared/design/tokens';

/**
 * S-14 — Workspaces.
 *
 * A workspace groups challenges by the team that runs them, which is what makes
 * one Forge deployment usable by a whole institution rather than by one club.
 *
 * Read-only for now: creating one is a transactional write that also needs to
 * seed permissions and re-point challenges, and doing that half-way would leave
 * orphaned challenges. Listed in STATUS as ROADMAP 1.4.
 */
export default function Workspaces() {
  const { data: workspaces = [], isLoading, error } = useWorkspaces();
  const { data: challenges = [] } = useChallenges();
  const { user } = useAuth();
  const { can } = usePermissions();
  const save = useSaveWorkspace();
  const remove = useDeleteWorkspace();

  const [editing, setEditing] = useState<{ id: string; name: string; description: string; isNew: boolean } | null>(null);

  const countFor = (id: string) => challenges.filter((ch) => ch.workspaceId === id).length;
  const canManage = can('workspace.create') || can('workspace.update');

  const commit = async () => {
    if (!editing?.name.trim()) return;
    await save.mutateAsync({
      workspace: {
        id: editing.id,
        name: editing.name.trim(),
        description: editing.description.trim(),
      },
      userId: user?.uid,
      isNew: editing.isNew,
    });
    setEditing(null);
  };

  return (
    <>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <PageTitle sub="Challenges grouped by the team that runs them.">Workspaces</PageTitle>
        {canManage && (
          <Button
            variant="contained"
            sx={{ height: 52, mb: 2 }}
            startIcon={<Icon name="create_new_folder" size={20} />}
            onClick={() => setEditing({
              id: `ws_${slugify('new workspace')}_${Math.random().toString(36).slice(2, 6)}`,
              name: '', description: '', isNew: true,
            })}
          >
            New workspace
          </Button>
        )}
      </Stack>

      <QueryBoundary isLoading={isLoading} error={error}>
        {workspaces.length === 0 ? (
          <EmptyState
            icon="folder"
            title="No workspaces yet"
            body="Workspaces are seeded with the organization for now."
          />
        ) : (
          <>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, mb: 3 }}>
              {workspaces.map((w) => {
                const count = countFor(w.id);
                return (
                  <Box
                    key={w.id}
                    component={Link}
                    to="/org/challenges"
                    sx={{
                      ...liftSx,
                      display: 'block', textDecoration: 'none', color: 'inherit',
                      p: 2.75, borderRadius: `${radius.card}px`,
                      background: c.surfaceCard, border: `1px solid ${c.outline}`,
                    }}
                  >
                    <Box
                      sx={{
                        width: 44, height: 44, borderRadius: '14px', mb: 2,
                        background: c.primaryContainer, color: c.primaryIcon,
                        display: 'grid', placeItems: 'center',
                      }}
                    >
                      <Icon name="folder" size={24} fill />
                    </Box>
                    <Typography sx={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', mb: 0.5 }}>
                      {w.name}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: c.inkMuted }}>
                      <Num>{count}</Num> {count === 1 ? 'challenge' : 'challenges'}
                    </Typography>

                    {canManage && (
                      <Stack direction="row" gap={0.5} sx={{ mt: 1.5 }}>
                        <Button
                          size="small"
                          onClick={(e) => {
                            e.preventDefault();
                            setEditing({ id: w.id, name: w.name, description: '', isNew: false });
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          disabled={remove.isPending}
                          onClick={(e) => {
                            e.preventDefault();
                            remove.mutate({ workspaceId: w.id, challengeCount: count, userId: user?.uid });
                          }}
                        >
                          Delete
                        </Button>
                      </Stack>
                    )}
                  </Box>
                );
              })}
            </Box>

            {remove.error && (
              <Stack direction="row" gap={1.75} sx={{ ...containerSx, mb: 3, background: c.errorContainer }}>
                <Icon name="error" size={22} color={c.errorInk} />
                <Typography sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.6 }}>
                  {remove.error instanceof Error ? remove.error.message : String(remove.error)}
                </Typography>
              </Stack>
            )}

            <Stack direction="row" gap={1.75} sx={{ ...containerSx, p: 2.25 }}>
              <Icon name="info" size={22} color={c.primaryIcon} />
              <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.6 }}>
                A workspace cannot be deleted while it still holds challenges. Firestore has no
                referential integrity, so deleting one would leave its challenges pointing at
                nothing and quietly vanishing from every workspace-filtered view.
              </Typography>
            </Stack>
          </>
        )}
      </QueryBoundary>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} fullWidth maxWidth="xs">
        <DialogTitle>{editing?.isNew ? 'New workspace' : 'Rename workspace'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Name"
            value={editing?.name ?? ''}
            onChange={(e) => setEditing((w) => w && { ...w, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && void commit()}
            placeholder="Photography Club"
            sx={{ mt: 1 }}
          />
          {save.error && (
            <Typography sx={{ fontSize: 13, color: c.errorBody, mt: 2, lineHeight: 1.5 }}>
              {save.error instanceof Error ? save.error.message : String(save.error)}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!editing?.name.trim() || save.isPending}
            onClick={() => void commit()}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
