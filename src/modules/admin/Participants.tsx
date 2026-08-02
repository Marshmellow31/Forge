import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, Divider,
  MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import {
  StatTile, StatusPill, TableHead, tableRowSx, containerSx, Num, EmptyState, PersonCell,
} from '@shared/ui/primitives';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import { c, radius, mono } from '@shared/design/tokens';
import { useAuth, usePermissions } from '@core/auth';
import {
  PARTICIPANT_STATUSES, STATUS_MEANING, filterRoster, summarizeRoster, entriesForUser,
} from '@core/participants';
import { parseDriveLink, driveImageUrl } from '@core/drive/links';
import { useAllRegistrations, useChallenges, useMembers, useRoles } from '@core/firebase/hooks';
import {
  useSetRegistrationStatus, useRemoveRegistration, useRosterCheckIn,
  useSetMemberAccess, useRemoveMember,
} from '@core/firebase/mutations';
import type { ParticipantEntry, ParticipantStatus, Member } from '@shared/types/domain';

/**
 * S-71 — Participants.
 *
 * Every registration in the organization in one table, and everything an
 * administrator can do to one of them. This is the screen the admin panel was
 * missing: the control room manages *a challenge*, and there was no view that
 * started from the person.
 *
 * ## What "control" means here, precisely
 *
 * Three verbs, and they are not interchangeable:
 *
 * * **Status** keeps the record and changes what it says. `withdrawn` and
 *   `disqualified` are separate because one is their decision and the other is
 *   yours, and six months later that is the only thing anyone remembers to ask.
 * * **Check-in** is deliberately its own control, backed by its own permission
 *   (`registration.checkIn`), so the volunteer on the door can mark people
 *   present without also being able to disqualify them.
 * * **Remove** deletes the row. It is last, it confirms, and it says what it
 *   costs — a status is almost always the right answer instead.
 *
 * ## Permissions
 *
 * The key on the door decided who *sees* this. `registration.manage` decides
 * whether the controls do anything, and `firestore.rules` is what actually
 * refuses — every disabled control here has a server-side twin. Controls the
 * account cannot use are disabled with the reason attached rather than hidden,
 * because a missing button is indistinguishable from a missing feature.
 */

export default function Participants() {
  const { user } = useAuth();
  const { can, ready: permsReady } = usePermissions();

  const { data: challenges = [] } = useChallenges();
  const { data: roster = [], isLoading, error } = useAllRegistrations();
  const { data: members = [] } = useMembers();
  const { data: roles = [] } = useRoles();

  const [search, setSearch] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Set<ParticipantStatus>>(new Set());
  const [open, setOpen] = useState<ParticipantEntry | null>(null);

  const setStatus = useSetRegistrationStatus();
  const remove = useRemoveRegistration();
  const memberAccess = useSetMemberAccess();
  const removeMember = useRemoveMember();

  const filtered = useMemo(
    () => filterRoster(roster, { search, challengeId, statuses }),
    [roster, search, challengeId, statuses],
  );
  const summary = useMemo(() => summarizeRoster(filtered), [filtered]);

  // Unresolved permissions read as allowed, so the table does not spend its
  // first render greyed out on every load.
  const mayManage = !permsReady || can('registration.manage');
  const mayCheckIn = !permsReady || can('registration.checkIn') || can('registration.manage');
  const mayManageMembers = !permsReady || can('member.manage');

  const toggleStatus = (status: ParticipantStatus) =>
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });

  const filtersApplied = search.trim() !== '' || challengeId !== null || statuses.size > 0;

  return (
    <>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontSize: 'clamp(26px, 3.2vw, 38px)' }}>
            Participants
          </Typography>
          <Typography sx={{ fontSize: 14, color: c.inkMuted, mt: 0.5 }}>
            Every entry in this organization, across every challenge.
          </Typography>
        </Box>
        <Button variant="text" component={Link} to="/admin" startIcon={<Icon name="arrow_back" size={18} />}>
          Back to the panel
        </Button>
      </Stack>

      <QueryBoundary isLoading={isLoading} error={error}>
        <Box sx={{ display: 'grid', gap: 2, mb: 3, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <StatTile label="Entries" value={summary.entries} tone="primary" />
          <StatTile label="People" value={summary.people} />
          <StatTile label="Competing" value={summary.byStatus.active} />
          <StatTile label="Checked in" value={summary.checkedIn} />
          <StatTile label="Winners" value={summary.byStatus.winner} tone="success" />
          <StatTile
            label="Removed"
            value={summary.byStatus.withdrawn + summary.byStatus.disqualified}
          />
        </Box>

        {/* Filters. The search box is first and widest because it is what
            someone reaches for when they arrive with a name in their head. */}
        <Stack sx={{ ...containerSx, p: 2.5, mb: 2.5 }} gap={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search a name, email, team or challenge"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <Box sx={{ mr: 1, display: 'flex' }}><Icon name="search" size={20} color={c.inkFaint} /></Box> }}
            />
            <TextField
              select
              size="small"
              label="Challenge"
              value={challengeId ?? ''}
              onChange={(e) => setChallengeId(e.target.value || null)}
              sx={{ minWidth: { md: 260 } }}
            >
              <MenuItem value="">All challenges</MenuItem>
              {challenges.map((ch) => (
                <MenuItem key={ch.id} value={ch.id}>{ch.title}</MenuItem>
              ))}
            </TextField>
          </Stack>

          <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
            {PARTICIPANT_STATUSES.map((status) => (
              <Tooltip key={status} title={STATUS_MEANING[status]}>
                <Chip
                  label={`${status} · ${summarizeRoster(roster).byStatus[status]}`}
                  size="small"
                  onClick={() => toggleStatus(status)}
                  variant={statuses.has(status) ? 'filled' : 'outlined'}
                  color={statuses.has(status) ? 'primary' : 'default'}
                  sx={{ textTransform: 'capitalize' }}
                />
              </Tooltip>
            ))}
            {filtersApplied && (
              <Button
                size="small"
                variant="text"
                onClick={() => { setSearch(''); setChallengeId(null); setStatuses(new Set()); }}
              >
                Clear filters
              </Button>
            )}
          </Stack>
        </Stack>

        {!mayManage && permsReady && (
          <Stack direction="row" gap={1.5} sx={{ mb: 2.5, p: 2, borderRadius: `${radius.tile}px`, background: c.primaryContainer }}>
            <Icon name="lock" size={20} color={c.onPrimaryContainer} />
            <Typography sx={{ fontSize: 13, color: c.onPrimaryContainer, lineHeight: 1.6 }}>
              You can read this roster but not change it — that needs the
              <b> registration.manage</b> permission, which your role does not include. The controls
              below are shown disabled rather than hidden so it is clear what exists.
            </Typography>
          </Stack>
        )}

        <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <EmptyState
                icon="group"
                title={roster.length === 0 ? 'No one has entered yet' : 'Nothing matches those filters'}
                body={roster.length === 0
                  ? 'Registrations appear here the moment someone enters a challenge in this organization.'
                  : 'Clear a filter, or search for something else.'}
              />
            </Box>
          ) : (
            /* `minWidth` must exceed the fixed columns *plus* the gaps and the
               row padding, or the one flexible column (the name — the most
               important cell on the screen) is what collapses to nothing.
               Fixed 664 + 6 gaps × 16 + 48 padding = 808; 1080 leaves the
               participant a real 272px. */
            <Box sx={{ overflowX: 'auto' }}>
              <Box sx={{ minWidth: 1080 }}>
                <TableHead
                  cols={[
                    { label: 'Participant' },
                    { label: 'Challenge', width: 180 },
                    { label: 'Status', width: 132 },
                    { label: 'Stage', width: 110 },
                    { label: 'Entered', width: 108 },
                    { label: 'Present', width: 92 },
                    { label: '', width: 42 },
                  ]}
                />
                {filtered.map((row) => (
                  <RosterRow
                    key={`${row.challengeId}:${row.id}`}
                    row={row}
                    mayManage={mayManage}
                    mayCheckIn={mayCheckIn}
                    busy={setStatus.isPending || remove.isPending}
                    onStatus={(status) => setStatus.mutate({
                      challengeId: row.challengeId,
                      registrationId: row.id,
                      status,
                      userId: user?.uid,
                    })}
                    onOpen={() => setOpen(row)}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>

        <Typography sx={{ fontSize: 12, color: c.inkFaint, mt: 2, lineHeight: 1.6 }}>
          Showing <Num size={12}>{filtered.length}</Num> of <Num size={12}>{roster.length}</Num>{' '}
          entries. Every change here is written to the database and checked against your role there
          — this screen cannot grant itself anything.
        </Typography>
      </QueryBoundary>

      {open && (
        <ParticipantDialog
          entry={open}
          roster={roster}
          members={members}
          roles={roles}
          mayManage={mayManage}
          mayCheckIn={mayCheckIn}
          mayManageMembers={mayManageMembers}
          onClose={() => setOpen(null)}
          onStatus={(entry, status) => setStatus.mutate({
            challengeId: entry.challengeId,
            registrationId: entry.id,
            status,
            userId: user?.uid,
          })}
          onRemove={(entry) => {
            remove.mutate({
              challengeId: entry.challengeId,
              registrationId: entry.id,
              userId: user?.uid,
            });
            setOpen(null);
          }}
          onMemberStatus={(memberId, status, roleIds) => memberAccess.mutate({
            memberId, status, roleIds, roles, userId: user?.uid,
          })}
          onMemberRemove={(memberId) => removeMember.mutate({ memberId, userId: user?.uid })}
          removing={remove.isPending}
        />
      )}
    </>
  );
}

/** One row, with the status control inline — the change made most often. */
function RosterRow({
  row, mayManage, mayCheckIn, busy, onStatus, onOpen,
}: {
  row: ParticipantEntry;
  mayManage: boolean;
  mayCheckIn: boolean;
  busy: boolean;
  onStatus: (status: ParticipantStatus) => void;
  onOpen: () => void;
}) {
  const { user } = useAuth();
  const checkIn = useRosterCheckIn();

  return (
    <Box sx={tableRowSx}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <PersonCell
          name={row.name}
          sub={row.teamName ? `${row.email} · ${row.teamName}` : row.email}
        />
      </Box>
      <Box sx={{ width: 180, flex: 'none', minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 13, color: c.inkMuted }}>{row.challengeTitle}</Typography>
      </Box>
      <Box sx={{ width: 132, flex: 'none' }}>
        <Tooltip title={mayManage ? STATUS_MEANING[row.status] : 'Needs the registration.manage permission.'}>
          <Box component="span">
            <TextField
              select
              size="small"
              value={row.status}
              disabled={!mayManage || busy}
              onChange={(e) => onStatus(e.target.value as ParticipantStatus)}
              SelectProps={{ renderValue: (v) => <StatusPill status={String(v)} /> }}
              sx={{ width: 124, '& .MuiOutlinedInput-input': { py: 0.75 } }}
            >
              {PARTICIPANT_STATUSES.map((status) => (
                <MenuItem key={status} value={status} sx={{ fontSize: 13, textTransform: 'capitalize' }}>
                  {status}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Tooltip>
      </Box>
      <Box sx={{ width: 110, flex: 'none', minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 12.5, color: c.inkFaint, fontFamily: mono }}>
          {row.currentStageKey}
        </Typography>
      </Box>
      <Box sx={{ width: 108, flex: 'none' }}>
        <Typography sx={{ fontSize: 12.5, color: c.inkFaint, fontFamily: mono }}>
          {row.registeredAt}
        </Typography>
      </Box>
      <Box sx={{ width: 92, flex: 'none' }}>
        <Tooltip title={mayCheckIn ? (row.checkedIn ? 'Present — click to undo' : 'Mark present') : 'Needs the registration.checkIn permission.'}>
          <Box component="span">
            <Button
              size="small"
              variant={row.checkedIn ? 'contained' : 'outlined'}
              disabled={!mayCheckIn || checkIn.isPending}
              onClick={() => checkIn.mutate({
                challengeId: row.challengeId,
                registrationId: row.id,
                present: !row.checkedIn,
                userId: user?.uid,
              })}
              sx={{ minWidth: 0, px: 1.25, height: 30 }}
            >
              <Icon name={row.checkedIn ? 'how_to_reg' : 'person_add_alt'} size={17} />
            </Button>
          </Box>
        </Tooltip>
      </Box>
      <Box sx={{ width: 42, flex: 'none', textAlign: 'right' }}>
        <Tooltip title="Open this participant">
          <Box
            component="button"
            onClick={onOpen}
            aria-label={`Open ${row.name}`}
            sx={{
              display: 'inline-grid', placeItems: 'center', width: 32, height: 32,
              borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer',
              color: c.inkMuted, '&:hover': { background: c.surfaceField },
            }}
          >
            <Icon name="more_horiz" size={18} />
          </Box>
        </Tooltip>
      </Box>
    </Box>
  );
}

/**
 * Everything about one person, and the actions that do not belong in a row.
 *
 * Opened from a registration but keyed on the *account*: their other entries,
 * their membership and its roles. An admin who clicks a name is asking about a
 * person, not about the row they happened to click.
 */
function ParticipantDialog({
  entry, roster, members, roles, mayManage, mayCheckIn, mayManageMembers,
  onClose, onStatus, onRemove, onMemberStatus, onMemberRemove, removing,
}: {
  entry: ParticipantEntry;
  roster: ParticipantEntry[];
  members: Member[];
  roles: { id: string; name: string }[];
  mayManage: boolean;
  mayCheckIn: boolean;
  mayManageMembers: boolean;
  onClose: () => void;
  onStatus: (entry: ParticipantEntry, status: ParticipantStatus) => void;
  onRemove: (entry: ParticipantEntry) => void;
  onMemberStatus: (memberId: string, status: 'active' | 'suspended', roleIds: string[]) => void;
  onMemberRemove: (memberId: string) => void;
  removing: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const mine = useMemo(() => entriesForUser(roster, entry.userId), [roster, entry.userId]);
  const membership = members.find((m) => m.id === entry.userId);
  const answers = Object.entries(entry.answers);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography sx={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>
          {entry.name}
        </Typography>
        <Typography sx={{ fontSize: 13, color: c.inkMuted }}>{entry.email}</Typography>
      </DialogTitle>

      <DialogContent>
        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: c.inkFaint, mb: 1.5 }}>
          Entries in this organization
        </Typography>
        <Stack gap={1} sx={{ mb: 3 }}>
          {mine.map((e) => (
            <Stack
              key={`${e.challengeId}:${e.id}`}
              direction="row"
              alignItems="center"
              gap={1.5}
              sx={{ p: 1.5, borderRadius: `${radius.tile}px`, background: c.surfaceContainer }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600 }}>{e.challengeTitle}</Typography>
                <Typography noWrap sx={{ fontSize: 12, color: c.inkFaint }}>
                  entered {e.registeredAt} · stage {e.currentStageKey}
                  {e.checkedIn ? ' · present' : ''}
                </Typography>
              </Box>
              <StatusPill status={e.status} />
            </Stack>
          ))}
        </Stack>

        {answers.length > 0 && (
          <>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: c.inkFaint, mb: 1.5 }}>
              What they answered
            </Typography>
            <Stack gap={0.75} sx={{ mb: 3 }}>
              {answers.map(([key, value]) => (
                <Stack key={key} direction="row" gap={2} sx={{ fontSize: 13 }}>
                  <Box sx={{ width: 150, flex: 'none', color: c.inkFaint, fontFamily: mono, fontSize: 12 }}>
                    {key}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0, wordBreak: 'break-word', color: c.inkMuted }}>
                    <AnswerValue value={value} />
                  </Box>
                </Stack>
              ))}
            </Stack>
          </>
        )}

        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: c.inkFaint, mb: 1.5 }}>
          Membership in this organization
        </Typography>
        {membership ? (
          <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3, p: 2, borderRadius: `${radius.tile}px`, background: c.surfaceContainer }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>
                {membership.roles.map((id) => roles.find((r) => r.id === id)?.name ?? id).join(', ')
                  || 'No role'}
              </Typography>
              <Typography sx={{ fontSize: 12, color: c.inkFaint }}>
                {membership.status === 'active'
                  ? 'Active — this is what decides what they can do.'
                  : `Status: ${membership.status}. A suspended member holds no permissions at all.`}
              </Typography>
            </Box>
            <Tooltip title={mayManageMembers ? '' : 'Needs the member.manage permission.'}>
              <Box component="span">
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!mayManageMembers}
                  onClick={() => onMemberStatus(
                    membership.id,
                    membership.status === 'suspended' ? 'active' : 'suspended',
                    // Roles are preserved across a suspension: `resolvePermissions`
                    // already returns nothing for a suspended member, so stripping
                    // them as well would only make restoring harder.
                    membership.roles,
                  )}
                >
                  {membership.status === 'suspended' ? 'Reinstate' : 'Suspend'}
                </Button>
              </Box>
            </Tooltip>
            <Tooltip title={mayManageMembers ? 'Remove from the organization. Their account and entries remain.' : 'Needs the member.manage permission.'}>
              <Box component="span">
                <Button
                  size="small"
                  variant="text"
                  color="error"
                  disabled={!mayManageMembers}
                  onClick={() => { onMemberRemove(membership.id); onClose(); }}
                >
                  Remove
                </Button>
              </Box>
            </Tooltip>
          </Stack>
        ) : (
          <Typography sx={{ fontSize: 13, color: c.inkMuted, mb: 3, lineHeight: 1.6 }}>
            Not a member of this organization — they entered as a participant, which needs no
            membership. Nothing is wrong; there is simply no role to manage.
          </Typography>
        )}

        <Divider sx={{ mb: 2.5 }} />

        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: c.inkFaint, mb: 1.5 }}>
          This entry · {entry.challengeTitle}
        </Typography>
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 2 }}>
          {PARTICIPANT_STATUSES.map((status) => (
            <Tooltip key={status} title={STATUS_MEANING[status]}>
              <Box component="span">
                <Button
                  size="small"
                  variant={entry.status === status ? 'contained' : 'outlined'}
                  disabled={!mayManage || entry.status === status}
                  onClick={() => onStatus(entry, status)}
                  sx={{ textTransform: 'capitalize' }}
                >
                  {status}
                </Button>
              </Box>
            </Tooltip>
          ))}
        </Stack>

        {/* Deletion is behind a second click and states what it costs. A status
            keeps the record; this does not, and the two are one button apart. */}
        {confirming ? (
          <Stack direction="row" alignItems="center" gap={1.5} sx={{ p: 2, borderRadius: `${radius.tile}px`, background: c.errorContainer }}>
            <Typography sx={{ flex: 1, fontSize: 13, color: c.errorBody, lineHeight: 1.55 }}>
              Delete this entry permanently? Their answers and their place in the competition go
              with it. <b>Disqualified</b> keeps the record and says the same thing.
            </Typography>
            <Button size="small" variant="text" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              size="small"
              variant="contained"
              color="error"
              disabled={removing}
              onClick={() => onRemove(entry)}
            >
              {removing ? <CircularProgress size={16} /> : 'Delete'}
            </Button>
          </Stack>
        ) : (
          <Tooltip title={mayManage ? '' : 'Needs the registration.manage permission.'}>
            <Box component="span">
              <Button
                size="small"
                variant="text"
                color="error"
                disabled={!mayManage}
                onClick={() => setConfirming(true)}
                startIcon={<Icon name="delete" size={18} />}
              >
                Delete this entry
              </Button>
            </Box>
          </Tooltip>
        )}

        {!mayCheckIn && (
          <Typography sx={{ fontSize: 12, color: c.inkFaint, mt: 2 }}>
            Check-in is a separate permission (<b>registration.checkIn</b>), so a volunteer on a
            door can mark people present without being able to change anything else.
          </Typography>
        )}
      </DialogContent>

      <Stack direction="row" justifyContent="flex-end" sx={{ p: 2, pt: 0 }}>
        <Button onClick={onClose}>Close</Button>
      </Stack>
    </Dialog>
  );
}

/**
 * One stored answer, rendered as what it is.
 *
 * Answers are `unknown` by contract — a field type can store anything it
 * defines — so this inspects rather than assumes. The case that earns its keep
 * is the Drive link: on a photography competition the answers *are* the
 * photographs, and an administrator reading a column of
 * `https://drive.google.com/file/d/1a2b…` is being shown the filing cabinet
 * instead of the entry.
 *
 * A thumbnail that fails to load is the useful signal, not a defect to hide: it
 * means the entrant never shared the file, which is the single most common way
 * an entry arrives unjudgeable. `onError` says exactly that in place of the
 * image, rather than leaving a broken icon to interpret.
 */
function AnswerValue({ value }: { value: unknown }) {
  const [broken, setBroken] = useState(false);

  if (value === null || value === undefined || value === '') {
    return <Box component="span" sx={{ color: c.inkFaint }}>—</Box>;
  }
  if (typeof value === 'object') return <>{JSON.stringify(value)}</>;

  const text = String(value);
  const target = parseDriveLink(text);
  const src = target && target.kind === 'file' ? driveImageUrl(target.fileId, 400) : null;

  if (!src) {
    // Still link it if it is a URL at all — an admin should not have to
    // copy-paste out of a table to see what someone submitted.
    return /^https?:\/\//i.test(text) ? (
      <Box component="a" href={text} target="_blank" rel="noreferrer" sx={{ color: c.primaryInk }}>
        {text}
      </Box>
    ) : (
      <>{text}</>
    );
  }

  return (
    <Stack gap={0.75} sx={{ py: 0.5 }}>
      {broken ? (
        <Stack
          direction="row"
          gap={1}
          alignItems="center"
          sx={{ p: 1.25, borderRadius: `${radius.chip}px`, background: c.errorContainer }}
        >
          <Icon name="visibility_off" size={18} color={c.errorInk} />
          <Typography sx={{ fontSize: 12, color: c.errorBody, lineHeight: 1.5 }}>
            Cannot load this photo — the file is most likely not shared. Ask the entrant for
            “Anyone with the link → Viewer”.
          </Typography>
        </Stack>
      ) : (
        <Box
          component="img"
          src={src}
          alt="Submitted photograph"
          loading="lazy"
          onError={() => setBroken(true)}
          sx={{
            display: 'block', maxWidth: 260, width: '100%', borderRadius: `${radius.chip}px`,
            border: `1px solid ${c.outline}`, background: c.surfaceField,
          }}
        />
      )}
      <Box
        component="a"
        href={text}
        target="_blank"
        rel="noreferrer"
        sx={{ fontSize: 11.5, color: c.primaryInk }}
      >
        Open in Drive
      </Box>
    </Stack>
  );
}
