import { Link } from 'react-router-dom';
import { Box, Button, Stack, Tooltip, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import {
  StatTile, StatusPill, Eyebrow, TableHead, tableRowSx, panelSx, containerSx, Num, EmptyState,
} from '@shared/ui/primitives';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import { c, radius, mono, ease } from '@shared/design/tokens';
import { useAuth, usePermissions } from '@core/auth';
import { unlockRemainingMs } from '@core/auth/adminKey';
import { PERMISSIONS, type Permission } from '@core/rbac';
import { useDriveQuota, humanBytes, QUOTA_WARN_AT } from '@core/storage/useDriveQuota';
import {
  useOrg, useChallenges, useMembers, useAuditLog, useWorkspaces, useInvites,
} from '@core/firebase/hooks';

/**
 * S-70 — The admin panel.
 *
 * A console for the person who runs the place, reached at `/admin` behind the
 * access key (`AdminGate`). It is deliberately *not* a second copy of the
 * organizing screens: those exist, they work, and duplicating them would give
 * the product two challenge editors that drift apart. What was missing was a
 * single place that answers "what state is this organization in, and where do I
 * go next" — so this screen aggregates and links, and owns nothing.
 *
 * It is scoped to one organization, like every other read in the app. There is
 * no cross-tenant view here and there must not be: hard rule 2 puts an `orgId`
 * boundary on every query, and an "all organizations" console is exactly the
 * shape that quietly breaks it. Platform-wide administration, if it is ever
 * wanted, is a server-side surface with its own audit trail — not a client
 * screen behind a bundled key.
 *
 * **Permissions still apply inside.** The key decides who sees this; the
 * membership decides what works. Sections the current account cannot use are
 * shown disabled with the reason rather than hidden, because a missing tile is
 * indistinguishable from a missing feature (the same argument as the permission
 * inspector in Settings).
 */

interface Section {
  to: string;
  icon: string;
  title: string;
  body: string;
  /** The permission that makes this section usable, if any. */
  needs?: Permission;
}

const SECTIONS: Section[] = [
  {
    to: '/admin/participants',
    icon: 'groups',
    title: 'Participants',
    body: 'Every entry in the organization. Search anyone, change their status, check them in, remove them.',
    needs: 'registration.read',
  },
  {
    to: '/org/challenges',
    icon: 'emoji_events',
    title: 'Challenges',
    body: 'Create, edit, publish and delete competitions. Stages, rubrics, timelines and covers.',
    needs: 'challenge.update',
  },
  {
    to: '/org/members',
    icon: 'group',
    title: 'Members and invitations',
    body: 'Invite people, assign roles, suspend accounts. The only way anyone gains permission.',
    needs: 'member.read',
  },
  {
    to: '/org/workspaces',
    icon: 'workspaces',
    title: 'Workspaces',
    body: 'Group challenges by team, department or season.',
    needs: 'workspace.update',
  },
  {
    to: '/org/analytics',
    icon: 'insights',
    title: 'Analytics',
    body: 'Entry to submission conversion, judging progress, entrants by category.',
    needs: 'analytics.read',
  },
  {
    to: '/org/audit',
    icon: 'history',
    title: 'Audit log',
    body: 'Every privileged action, write-once. Who changed what, and when.',
    needs: 'audit.read',
  },
  {
    to: '/org/settings',
    icon: 'settings',
    title: 'Settings and roles',
    body: 'Org profile, custom roles, webhooks, and the inspector that shows exactly which permissions you hold.',
    needs: 'org.read',
  },
  {
    to: '/judge',
    icon: 'gavel',
    title: 'Judging queue',
    body: 'Score entries against the rubric, blind where the challenge asks for it.',
    needs: 'score.read',
  },
  {
    to: '/org/challenges/new',
    icon: 'add_circle',
    title: 'New challenge',
    body: 'Start from a blank competition, or duplicate an existing one as a template.',
    needs: 'challenge.create',
  },
];

/** "3h 20m", or "under a minute". Precision beyond this is noise. */
function formatRemaining(ms: number): string {
  if (ms <= 0) return 'expired';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export default function AdminPanel() {
  const { user, lockAdmin, resendVerificationEmail, notice, busy } = useAuth();
  const { can, ready: permsReady, isMember } = usePermissions();

  const { data: org, isLoading: orgLoading, error: orgError } = useOrg();
  const { data: challenges = [], isLoading, error } = useChallenges();
  const { data: members = [] } = useMembers();
  const { data: invites = [] } = useInvites();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: auditLog = [] } = useAuditLog();
  const { data: quota } = useDriveQuota();

  const totals = challenges.reduce(
    (acc, ch) => ({
      registrations: acc.registrations + ch.counters.registrations,
      submissions: acc.submissions + ch.counters.submissions,
      pending: acc.pending + ch.counters.reviewsPending,
    }),
    { registrations: 0, submissions: 0, pending: 0 },
  );
  const live = challenges.filter((ch) => ch.status === 'running' || ch.status === 'judging');
  const drafts = challenges.filter((ch) => ch.status === 'draft');
  const activeMembers = members.filter((m) => m.status === 'active');
  const pendingInvites = invites.filter((i) => i.status === 'pending');

  const heldPermissions = PERMISSIONS.filter((p) => can(p)).length;
  const remaining = formatRemaining(unlockRemainingMs(user?.uid));
  const unverified = Boolean(user && !user.emailVerified);

  return (
    <>
      <Stack
        direction="row"
        alignItems="flex-end"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Eyebrow>{org?.name ?? '…'} · admin panel</Eyebrow>
          <Typography variant="h2" sx={{ fontSize: 'clamp(30px, 3.8vw, 44px)', mt: 1 }}>
            Control panel
          </Typography>
        </Box>
        <Stack direction="row" gap={1.5} alignItems="center">
          <Tooltip title="Unlocking lasts for this browser tab and ends when you sign out.">
            <Stack
              direction="row"
              alignItems="center"
              gap={1}
              sx={{ px: 2, height: 44, borderRadius: `${radius.pill}px`, background: c.success }}
            >
              <Icon name="lock_open" size={18} color={c.successInk} />
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: c.onSuccess }}>
                Unlocked · {remaining}
              </Typography>
            </Stack>
          </Tooltip>
          <Button
            variant="contained"
            component={Link}
            to="/admin/participants"
            sx={{ height: 44 }}
            startIcon={<Icon name="groups" size={18} />}
          >
            Participants
          </Button>
          <Button
            variant="outlined"
            onClick={lockAdmin}
            sx={{ height: 44 }}
            startIcon={<Icon name="lock" size={18} />}
          >
            Lock
          </Button>
        </Stack>
      </Stack>

      {/* Who you are here, and what that actually gets you. The panel being
          visible says nothing about your permissions, so it must not be allowed
          to imply anything either. */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ sm: 'center' }}
        gap={2}
        sx={{ ...containerSx, p: 2.5, mb: 2.5 }}
      >
        <Box
          sx={{
            width: 44, height: 44, flex: 'none', borderRadius: '50%',
            background: c.inverse, color: c.primary,
            display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700,
          }}
        >
          {(user?.displayName ?? user?.email ?? '?').slice(0, 2).toUpperCase()}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>
            {user?.displayName ?? user?.email ?? 'Signed in'}
          </Typography>
          <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.55 }}>
            {!permsReady
              ? 'Resolving your permissions…'
              : isMember
                ? <>You hold <Num>{heldPermissions}</Num> of <Num>{PERMISSIONS.length}</Num> permissions in this organization. The key opened this panel; these decide what works inside it.</>
                : 'You are not a member of this organization, so most actions below will be refused by the database rules. Ask an owner for an invitation.'}
          </Typography>
        </Box>
        <Button variant="text" size="small" component={Link} to="/org/settings" sx={{ flex: 'none' }}>
          Inspect permissions
        </Button>
      </Stack>

      {/* Verification is not cosmetic: firestore.rules refuses invite redemption
          without it (ADR-020), so an unverified admin cannot be granted a role
          no matter who tries to grant it. Worth saying before they wonder why. */}
      {unverified && (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ sm: 'center' }}
          gap={2}
          sx={{ mb: 2.5, p: 2.5, borderRadius: `${radius.panel}px`, background: c.primaryContainer }}
        >
          <Icon name="mark_email_unread" size={22} color={c.onPrimaryContainer} />
          <Typography sx={{ flex: 1, fontSize: 13.5, color: c.onPrimaryContainer, lineHeight: 1.6 }}>
            <b>Your email is not verified yet.</b> You can sign in, but you cannot accept an
            invitation to an organization until you do — the security rules require it, so no one
            can grant you a role in the meantime.
          </Typography>
          <Button
            variant="contained"
            size="small"
            disabled={busy}
            onClick={() => void resendVerificationEmail()}
            sx={{ flex: 'none' }}
          >
            Resend email
          </Button>
        </Stack>
      )}

      {/* Entrants' photographs land on the organisation's own Drive (ADR-026),
          so running out is a competition-stopping event that arrives without
          warning — the first symptom is an entrant's upload failing at a
          deadline. Silent below the threshold; nobody needs a storage gauge on
          a screen they opened to check registrations. */}
      {quota?.connected && quota.fraction !== null && quota.fraction >= QUOTA_WARN_AT && (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ sm: 'center' }}
          gap={2}
          sx={{ mb: 2.5, p: 2.5, borderRadius: `${radius.panel}px`, background: c.errorContainer }}
        >
          <Icon name="cloud_alert" size={22} color={c.errorInk} />
          <Typography sx={{ flex: 1, fontSize: 13.5, color: c.errorBody, lineHeight: 1.6 }}>
            <b>The Drive holding entries is {Math.round(quota.fraction * 100)}% full</b>
            {' '}({humanBytes(quota.usageBytes)}
            {quota.limitBytes ? ` of ${humanBytes(quota.limitBytes)}` : ''}
            {quota.account ? `, ${quota.account}` : ''}). Uploads start failing when it fills, and
            the person who finds out is an entrant at a deadline. Free some space or connect a
            different account.
          </Typography>
        </Stack>
      )}

      {notice && (
        <Stack direction="row" gap={1.5} role="status" sx={{ mb: 2.5, p: 2, borderRadius: `${radius.tile}px`, background: c.success }}>
          <Icon name="mark_email_read" size={20} color={c.successInk} />
          <Typography sx={{ fontSize: 13, color: c.onSuccess, lineHeight: 1.6 }}>{notice}</Typography>
        </Stack>
      )}

      <QueryBoundary isLoading={isLoading || orgLoading} error={error ?? orgError}>
        <Box
          sx={{
            display: 'grid', gap: 2, mb: 3.5,
            gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',
          }}
        >
          <StatTile label="Live challenges" value={live.length} tone="primary" />
          <StatTile label="Drafts" value={drafts.length} />
          <StatTile label="Members" value={activeMembers.length} />
          <StatTile label="Registrations" value={totals.registrations} />
          <StatTile label="Submissions" value={totals.submissions} />
          <StatTile
            label="Reviews pending"
            value={totals.pending}
            tone={totals.pending > 0 ? 'container' : 'success'}
          />
        </Box>

        <Box
          sx={{
            display: 'grid', gap: 2.5, alignItems: 'start', mb: 3.5,
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1.5fr) minmax(0,1fr)' },
          }}
        >
          {/* Every challenge, with the two numbers that decide whether it needs
              attention, and a way in. The list screen sorts and filters; this is
              the whole roster at a glance, which is what a console is for. */}
          <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, overflow: 'hidden' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, pt: 2.5, pb: 2 }}>
              <Typography variant="h6">All challenges</Typography>
              <Button size="small" variant="text" component={Link} to="/org/challenges">
                Open list
              </Button>
            </Stack>

            {challenges.length === 0 ? (
              <Box sx={{ p: 3, pt: 0 }}>
                <EmptyState
                  icon="emoji_events"
                  title="No challenges yet"
                  body="A challenge is the unit everything else hangs off — entries, judging, results and certificates."
                />
              </Box>
            ) : (
              // This panel sits in a grid column narrower than the columns add
              // up to, so without a scroller the flexible title column collapses
              // to nothing and the headers overlap each other. Fixed 300 + 4
              // gaps × 16 + 48 padding = 412; 560 leaves the title 148px.
              <Box sx={{ overflowX: 'auto' }}>
                <Box sx={{ minWidth: 560 }}>
                <TableHead
                  cols={[
                    { label: 'Challenge' },
                    { label: 'Status', width: 108 },
                    { label: 'Entries', width: 72, align: 'right' },
                    { label: 'Pending', width: 76, align: 'right' },
                    { label: '', width: 44 },
                  ]}
                />
                {challenges.map((ch) => (
                  <Box key={ch.id} sx={tableRowSx}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>{ch.title}</Typography>
                      <Typography noWrap sx={{ fontSize: 12, color: c.inkFaint }}>
                        {ch.category} · {ch.visibility}
                      </Typography>
                    </Box>
                    <Box sx={{ width: 108, flex: 'none' }}>
                      <StatusPill status={ch.status} />
                    </Box>
                    <Box sx={{ width: 72, flex: 'none', textAlign: 'right' }}>
                      <Num>{ch.counters.registrations}</Num>
                    </Box>
                    <Box sx={{ width: 76, flex: 'none', textAlign: 'right' }}>
                      <Num>{ch.counters.reviewsPending}</Num>
                    </Box>
                    <Box sx={{ width: 44, flex: 'none', textAlign: 'right' }}>
                      <Tooltip title={`Open ${ch.title}`}>
                        <Box
                          component={Link}
                          to={`/org/challenges/${ch.id}`}
                          aria-label={`Open ${ch.title}`}
                          sx={{ display: 'inline-grid', placeItems: 'center', width: 32, height: 32, borderRadius: '50%', color: c.inkMuted, '&:hover': { background: c.surfaceField } }}
                        >
                          <Icon name="arrow_forward" size={18} />
                        </Box>
                      </Tooltip>
                    </Box>
                  </Box>
                ))}
                </Box>
              </Box>
            )}
          </Box>

          <Stack gap={2.5}>
            <Box sx={containerSx}>
              <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h6">Access</Typography>
                <Button size="small" variant="text" component={Link} to="/org/members">Manage</Button>
              </Stack>
              <Stack spacing={1.25}>
                {[
                  { label: 'Active members', value: activeMembers.length, icon: 'group' },
                  { label: 'Pending invitations', value: pendingInvites.length, icon: 'mail' },
                  { label: 'Suspended', value: members.filter((m) => m.status === 'suspended').length, icon: 'block' },
                  { label: 'Workspaces', value: workspaces.length, icon: 'workspaces' },
                ].map((row) => (
                  <Stack key={row.label} direction="row" alignItems="center" gap={1.5}>
                    <Icon name={row.icon} size={20} color={c.primaryIcon} />
                    <Typography sx={{ flex: 1, fontSize: 13.5, color: c.inkMuted }}>{row.label}</Typography>
                    <Num size={15}>{row.value}</Num>
                  </Stack>
                ))}
              </Stack>
            </Box>

            <Box sx={panelSx}>
              <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h6">Recent activity</Typography>
                <Button size="small" variant="text" component={Link} to="/org/audit">Full log</Button>
              </Stack>
              {auditLog.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: c.inkFaint }}>
                  Nothing recorded yet. Privileged actions appear here as they happen.
                </Typography>
              ) : (
                <Stack>
                  {auditLog.slice(0, 5).map((a) => (
                    <Stack
                      key={a.id}
                      direction="row"
                      gap={1.5}
                      sx={{ py: 1.25, borderBottom: `1px solid ${c.outline}`, '&:last-of-type': { borderBottom: 'none' } }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13, lineHeight: 1.45 }}>
                          <Box component="strong" sx={{ fontWeight: 600 }}>{a.actor}</Box> {a.action}
                        </Typography>
                        <Typography noWrap sx={{ fontSize: 12, color: c.inkFaint, mt: 0.25 }}>{a.target}</Typography>
                      </Box>
                      <Box sx={{ fontSize: 11, color: c.inkFaint, whiteSpace: 'nowrap', fontFamily: mono }}>{a.at}</Box>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>
          </Stack>
        </Box>

        <Typography variant="h6" sx={{ mb: 2 }}>Everything you can administer</Typography>
        <Box
          sx={{
            display: 'grid', gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', lg: 'repeat(4,1fr)' },
          }}
        >
          {SECTIONS.map((section) => {
            // Unresolved permissions read as "allowed" rather than "denied":
            // greying every tile for the second it takes to resolve makes the
            // panel look broken on every load.
            const allowed = !section.needs || !permsReady || can(section.needs);
            const card = (
              <Box
                sx={{
                  height: '100%', p: 2.5, borderRadius: `${radius.card}px`,
                  background: c.surfaceCard, border: `1px solid ${c.outline}`,
                  opacity: allowed ? 1 : 0.55,
                  transition: `transform 200ms ${ease}, box-shadow 200ms ${ease}`,
                  ...(allowed && {
                    '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 6px 18px rgba(60,50,10,.10)' },
                  }),
                }}
              >
                <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '13px', background: c.primaryContainer, display: 'grid', placeItems: 'center' }}>
                    <Icon name={section.icon} size={21} fill color={c.onPrimaryContainer} />
                  </Box>
                  {!allowed && <Icon name="lock" size={17} color={c.inkFaint} />}
                </Stack>
                <Typography sx={{ fontSize: 15.5, fontWeight: 700, mb: 0.75, letterSpacing: '-.01em' }}>
                  {section.title}
                </Typography>
                <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.55 }}>
                  {allowed
                    ? section.body
                    : `Needs the ${section.needs} permission, which your role does not include.`}
                </Typography>
              </Box>
            );

            // A tile you cannot use is shown, not hidden — but it does not
            // pretend to be a link, because a control that navigates to a
            // refusal is worse than one that explains itself in place.
            return allowed ? (
              <Box
                key={section.to}
                component={Link}
                to={section.to}
                sx={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                {card}
              </Box>
            ) : (
              <Box key={section.to}>{card}</Box>
            );
          })}
        </Box>
      </QueryBoundary>
    </>
  );
}
