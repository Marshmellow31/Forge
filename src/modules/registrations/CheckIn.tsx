import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Box, Button, IconButton, Stack, TextField, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import {
  Eyebrow, EmptyState, PersonCell, ProgressBar, StatTile, Tag, containerSx, tableRowSx,
} from '@shared/ui/primitives';
import { useChallenge, useRegistrations, useChallengeSnapshot } from '@core/firebase/hooks';
import { useCheckIn } from '@core/firebase/mutations';
import { useAuth, usePermissions } from '@core/auth';
import { c, radius } from '@shared/design/tokens';

/**
 * S-45 — Check-in. ROADMAP Phase 2 "QR check-in, volunteer flow".
 *
 * Designed for someone standing at a door with a queue behind them, which
 * drives every decision here:
 *
 *   • **Search is the primary control**, not a scanner. A QR scan resolves to a
 *     registration id, which is exactly what typing a name resolves to — so the
 *     scanner is an accelerator for the same flow, and the flow works without a
 *     camera, a permission prompt, or a printed badge.
 *   • **Check-in is optimistic.** A round trip per person is the difference
 *     between a working desk and a bottleneck.
 *   • **Undo is one tap**, because the common error is checking in the wrong
 *     Priya, and it needs fixing in front of the queue rather than afterwards.
 *   • It works **offline**: the Firestore SDK queues the writes and replays them
 *     in order on reconnect. Venue wifi is the normal case, not the edge case.
 */
export default function CheckIn() {
  const { cid } = useParams();
  const { user } = useAuth();
  const { can, ready } = usePermissions();
  const { data: challenge } = useChallenge(cid);
  useChallengeSnapshot(cid);
  const { data: registrations = [], isLoading, error } = useRegistrations(cid);
  const mark = useCheckIn(cid);

  const [q, setQ] = useState('');

  const present = registrations.filter((r) => r.checkedIn).length;
  const pct = registrations.length ? Math.round((present / registrations.length) * 100) : 0;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matches = needle
      ? registrations.filter((r) =>
          `${r.name} ${r.email} ${r.id}`.toLowerCase().includes(needle))
      : registrations;
    // Not-yet-arrived first: the list exists to find people who are waiting.
    return [...matches].sort((a, b) => Number(a.checkedIn) - Number(b.checkedIn));
  }, [registrations, q]);

  const allowed = can('registration.checkIn') || can('registration.manage');

  if (ready && !allowed) {
    return (
      <>
        <Eyebrow>Check-in</Eyebrow>
        <EmptyState
          icon="lock"
          title="You cannot check people in"
          body="This needs the registration.checkIn permission — a Volunteer role has it."
        />
      </>
    );
  }

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <IconButton component={Link} to={`/org/challenges/${cid}`} aria-label="Back">
          <Icon name="arrow_back" size={22} />
        </IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Eyebrow>Check-in</Eyebrow>
          <Typography noWrap sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>
            {challenge?.title ?? '…'}
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr 1fr', mb: 3 }}>
        <StatTile label="Checked in" value={present} icon="how_to_reg" tone="success" />
        <StatTile label="Expected" value={registrations.length} icon="group" />
        <StatTile label="Still to arrive" value={registrations.length - present} icon="pending" />
      </Box>

      <Box sx={{ mb: 3 }}>
        <ProgressBar value={pct} label="Arrivals" right={`${present} / ${registrations.length}`} />
      </Box>

      <TextField
        fullWidth
        autoFocus
        placeholder="Search a name, email, or scan a badge"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        sx={{ mb: 1.5 }}
        InputProps={{
          startAdornment: (
            <Box sx={{ display: 'flex', mr: 1, color: c.inkFaint }}>
              <Icon name="qr_code_scanner" size={22} />
            </Box>
          ),
          endAdornment: q ? (
            <Button size="small" onClick={() => setQ('')} sx={{ minWidth: 0, color: c.inkFaint }}>
              <Icon name="close" size={18} />
            </Button>
          ) : undefined,
        }}
      />

      <Stack direction="row" gap={1.5} sx={{ ...containerSx, p: 2, mb: 3 }}>
        <Icon name="wifi_off" size={20} color={c.primaryIcon} />
        <Typography sx={{ fontSize: 12.5, color: c.inkMuted, lineHeight: 1.6 }}>
          Works offline. Check-ins are queued on this device and replay in order when the
          connection returns — venue wifi is the normal case, not the edge case. A QR badge simply
          fills the box above, so the desk keeps working without a camera.
        </Typography>
      </Stack>

      <QueryBoundary isLoading={isLoading} error={error}>
        {rows.length === 0 ? (
          <EmptyState
            icon="person_search"
            title={q ? 'Nobody matches that' : 'No registrations yet'}
            body={q ? 'Check the spelling, or search by email instead.' : undefined}
          />
        ) : (
          <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, overflow: 'hidden' }}>
            {rows.map((r) => (
              <Stack key={r.id} direction="row" alignItems="center" gap={2} sx={tableRowSx}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <PersonCell name={r.name} sub={r.email} />
                </Box>
                {r.checkedIn ? (
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Tag bg={c.success} fg={c.onSuccess}>Here</Tag>
                    <Button
                      size="small"
                      sx={{ color: c.inkFaint }}
                      onClick={() => mark.mutate({ registrationId: r.id, present: false, userId: user?.uid })}
                    >
                      Undo
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<Icon name="how_to_reg" size={18} />}
                    onClick={() => mark.mutate({ registrationId: r.id, present: true, userId: user?.uid })}
                  >
                    Check in
                  </Button>
                )}
              </Stack>
            ))}
          </Box>
        )}
      </QueryBoundary>

      {mark.error && (
        <Box sx={{ mt: 2, p: 2, borderRadius: `${radius.field}px`, background: c.errorContainer }}>
          <Typography sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.5 }}>
            {mark.error instanceof Error ? mark.error.message : String(mark.error)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
