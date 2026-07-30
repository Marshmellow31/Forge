import { Link, useParams } from 'react-router-dom';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import { Eyebrow, EmptyState, Num, Tag, containerSx, liftSx } from '@shared/ui/primitives';
import {
  useChallengeBySlug, useSubmissions, useVotes, useChallengeSnapshot,
} from '@core/firebase/hooks';
import { useCastVote } from '@core/firebase/mutations';
import { useAuth } from '@core/auth';
import { c, radius, coverFor } from '@shared/design/tokens';

/**
 * S-58 — Community voting. ROADMAP Phase 2.
 *
 * **One vote per account, enforced by the document id**, which is the whole
 * abuse-prevention design: the vote document is keyed by the voter's uid, so a
 * second vote overwrites the first rather than adding to it. There is no count
 * to inflate by voting twice, and ballot-stuffing costs one account per vote —
 * the honest bar for a free product, and stated plainly on screen rather than
 * implied.
 *
 * Changing your mind is allowed and is the same write. A voting system that
 * punishes a misclick trains people not to participate.
 *
 * Entries are shown by their anonymized label when the challenge is blind, for
 * the same reason judges see it: a popularity vote attached to names measures
 * something other than the work.
 */
export default function CommunityVote() {
  const { slug } = useParams();
  const { user, signInGoogle, busy } = useAuth();
  const { data: challenge, isLoading, error } = useChallengeBySlug(slug);
  useChallengeSnapshot(challenge?.id);
  const { data: submissions = [] } = useSubmissions(challenge?.id);
  const { data: votes } = useVotes(challenge?.id, user?.uid);
  const cast = useCastVote(challenge?.id);

  const blind = challenge?.blindJudging ?? false;
  const mine = votes?.mine ?? null;
  const tally = votes?.tally ?? {};

  // Only entries that were actually submitted can be voted on.
  const entries = submissions.filter((s) => s.status !== 'draft');

  if (!challenge) {
    return (
      <QueryBoundary isLoading={isLoading} error={error}>
        <EmptyState icon="how_to_vote" title="Challenge not found" />
      </QueryBoundary>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <IconButton component={Link} to={`/c/${challenge.slug}`} aria-label="Back to challenge">
          <Icon name="arrow_back" size={22} />
        </IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Eyebrow>Community vote</Eyebrow>
          <Typography noWrap sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>
            {challenge.title}
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" gap={1.75} sx={{ ...containerSx, mb: 3, p: 2.25 }}>
        <Icon name="how_to_vote" size={22} color={c.primaryIcon} />
        <Typography sx={{ fontSize: 13.5, color: c.inkMuted, lineHeight: 1.6 }}>
          <b>One vote per account.</b> You can change your mind — voting again simply moves your
          vote. <Num>{votes?.total ?? 0}</Num> {votes?.total === 1 ? 'vote' : 'votes'} cast so far.
        </Typography>
      </Stack>

      {!user && (
        <Stack direction="row" gap={1.75} alignItems="center" sx={{ ...containerSx, mb: 3, p: 2.25 }}>
          <Icon name="login" size={22} color={c.primaryIcon} />
          <Typography sx={{ fontSize: 13.5, color: c.inkMuted, lineHeight: 1.6, flex: 1 }}>
            Sign in to vote. One vote per account is the only thing keeping this honest, and it
            needs an account to count.
          </Typography>
          <Button variant="contained" size="small" disabled={busy} onClick={() => void signInGoogle()}>
            Sign in
          </Button>
        </Stack>
      )}

      <QueryBoundary isLoading={isLoading} error={error}>
        {entries.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="Nothing to vote on yet"
            body="Entries appear here once they are submitted."
          />
        ) : (
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
            {entries.map((s) => {
              const chosen = mine === s.id;
              const count = tally[s.id] ?? 0;
              return (
                <Box
                  key={s.id}
                  sx={{
                    ...liftSx,
                    cursor: 'default',
                    borderRadius: `${radius.card}px`,
                    overflow: 'hidden',
                    background: c.surfaceCard,
                    border: `2px solid ${chosen ? c.accent : c.outline}`,
                  }}
                >
                  <Box sx={{ height: 120, background: coverFor(challenge.category), display: 'grid', placeItems: 'center' }}>
                    <Icon name="image" size={30} color="rgba(36,26,0,.35)" />
                  </Box>

                  <Box sx={{ p: 2.25 }}>
                    <Typography noWrap sx={{ fontSize: 15, fontWeight: 700, mb: 0.5 }}>
                      {String(s.answers.title ?? 'Untitled entry')}
                    </Typography>
                    <Typography sx={{ fontSize: 12.5, color: c.inkFaint, mb: 1.75 }}>
                      {blind ? s.anonymizedLabel : s.participant}
                    </Typography>

                    <Stack direction="row" alignItems="center" gap={1}>
                      <Button
                        fullWidth
                        variant={chosen ? 'contained' : 'outlined'}
                        size="small"
                        disabled={!user || cast.isPending}
                        startIcon={<Icon name={chosen ? 'favorite' : 'favorite_border'} size={18} fill={chosen} />}
                        onClick={() => cast.mutate({ submissionId: s.id, voterId: user?.uid })}
                      >
                        {chosen ? 'Your vote' : 'Vote'}
                      </Button>
                      {count > 0 && <Tag>{count}</Tag>}
                    </Stack>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </QueryBoundary>

      {cast.error && (
        <Box sx={{ mt: 3, p: 2.25, borderRadius: `${radius.tile}px`, background: c.errorContainer }}>
          <Typography sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.5 }}>
            {cast.error instanceof Error ? cast.error.message : String(cast.error)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
