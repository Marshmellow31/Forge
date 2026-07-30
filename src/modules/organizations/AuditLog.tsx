import { useMemo, useState } from 'react';
import { Box, Stack, TextField, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import { PageTitle, EmptyState, TableHead, tableRowSx, containerSx } from '@shared/ui/primitives';
import { useAuditLog } from '@core/firebase/hooks';
import { usePermissions } from '@core/auth';
import { c, radius, mono } from '@shared/design/tokens';

/**
 * S-23 — Audit log.
 *
 * Write-once by rule: `allow create: if isMember(orgId)` with update and delete
 * both `false`. An audit trail an admin can edit is not an audit trail, and that
 * property is enforced in `firestore.rules`, not here.
 */

/** Icon per action verb, derived rather than switched on the full action string. */
function iconFor(action: string): string {
  const verb = action.split('.').pop() ?? '';
  if (/create|add|invite/.test(verb)) return 'add_circle';
  if (/delete|remove|revoke/.test(verb)) return 'cancel';
  if (/publish|announce/.test(verb)) return 'campaign';
  if (/update|edit/.test(verb)) return 'edit';
  if (/score|review/.test(verb)) return 'gavel';
  return 'history';
}

export default function AuditLog() {
  const { can, ready } = usePermissions();
  const { data: entries = [], isLoading, error } = useAuditLog();
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) =>
      `${e.actor} ${e.action} ${e.target}`.toLowerCase().includes(needle),
    );
  }, [entries, q]);

  if (ready && !can('audit.read')) {
    return (
      <>
        <PageTitle>Audit log</PageTitle>
        <EmptyState
          icon="lock"
          title="You cannot read the audit log"
          body="This needs the audit.read permission. Ask an owner or admin."
        />
      </>
    );
  }

  return (
    <>
      <PageTitle sub="Every consequential action, recorded once and never editable.">
        Audit log
      </PageTitle>

      <Stack direction="row" gap={1.5} sx={{ ...containerSx, mb: 3, p: 2.25 }}>
        <Icon name="lock" size={22} color={c.primaryIcon} />
        <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.6 }}>
          Entries are <b>write-once</b>. The security rules permit creating an entry and refuse
          every update and delete, including from an owner — an audit trail an admin can edit is
          not an audit trail.
        </Typography>
      </Stack>

      <TextField
        fullWidth
        size="small"
        placeholder="Filter by person, action or target"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        sx={{ mb: 3 }}
        InputProps={{ startAdornment: <Box sx={{ display: 'flex', mr: 1, color: c.inkFaint }}><Icon name="search" size={20} /></Box> }}
      />

      <QueryBoundary isLoading={isLoading} error={error}>
        {rows.length === 0 ? (
          <EmptyState
            icon="history"
            title={q ? 'Nothing matches that filter' : 'No activity recorded yet'}
            body={q ? undefined : 'Actions appear here as people use the organization.'}
          />
        ) : (
          <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, overflow: 'hidden' }}>
            <TableHead
              cols={[{ label: 'Action' }, { label: 'Target', width: 220 }, { label: 'When', width: 150 }]}
            />
            {rows.map((e) => (
              <Stack key={e.id} direction="row" alignItems="center" gap={2} sx={tableRowSx}>
                <Icon name={iconFor(e.action)} size={20} color={c.inkFaint} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>
                    {e.actor}
                  </Typography>
                  <Box component="span" sx={{ fontFamily: mono, fontSize: 12, color: c.inkFaint }}>
                    {e.action}
                  </Box>
                </Box>
                <Typography noWrap sx={{ width: 220, flex: 'none', fontSize: 13, color: c.inkMuted }}>
                  {e.target}
                </Typography>
                <Typography sx={{ width: 150, flex: 'none', fontSize: 12, color: c.inkFaint }}>
                  {e.at}
                </Typography>
              </Stack>
            ))}
          </Box>
        )}
      </QueryBoundary>
    </>
  );
}
