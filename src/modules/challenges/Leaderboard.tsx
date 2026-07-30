import { Link, useParams } from 'react-router-dom';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import {
  Eyebrow, EmptyState, TableHead, tableRowSx, Num, PersonCell, Tag, containerSx,
} from '@shared/ui/primitives';
import { useChallengeBySlug, useLeaderboard, useChallengeSnapshot } from '@core/firebase/hooks';
import { useAuth } from '@core/auth';
import { c, radius } from '@shared/design/tokens';
import type { Challenge } from '@shared/types/domain';

/**
 * S-59 — Participant leaderboard.
 *
 * The interesting decision here is what to do when the leaderboard is *not*
 * visible. `leaderboardMode` is a real product control — a live leaderboard
 * during judging biases judges and demoralises entrants — so most of this
 * screen is about explaining an absence well rather than rendering a table.
 *
 * A hidden leaderboard says so, and says when it will appear. Silence would
 * read as breakage.
 */

/** Why the board is not shown, in the entrant's terms. */
function visibilityOf(challenge: Challenge): { visible: boolean; title: string; body: string } {
  switch (challenge.leaderboardMode) {
    case 'hidden':
      return {
        visible: false,
        title: 'No leaderboard for this challenge',
        body: 'The organisers chose not to rank entries publicly. Your result will still be shared with you directly.',
      };
    case 'afterClose':
      return {
        visible: challenge.status === 'completed',
        title: 'Rankings appear when results are published',
        body: `Judging is still under way. Results are due ${challenge.timeline.resultsAt}.`,
      };
    default:
      return { visible: true, title: '', body: '' };
  }
}

const MEDAL = ['#E5CB63', '#C7C7C7', '#D0A06B'];

export default function Leaderboard() {
  const { slug } = useParams();
  const { user } = useAuth();
  const { data: challenge, isLoading, error } = useChallengeBySlug(slug);
  // One pre-joined read instead of four; see core/firebase/snapshot.ts.
  useChallengeSnapshot(challenge?.id);
  const { data: entries = [], isLoading: loadingBoard } = useLeaderboard(challenge?.id);

  if (!challenge) {
    return (
      <QueryBoundary isLoading={isLoading} error={error}>
        <EmptyState icon="emoji_events" title="Challenge not found" />
      </QueryBoundary>
    );
  }

  const { visible, title, body } = visibilityOf(challenge);
  const provisional = entries.some((e) => e.isProvisional);

  return (
    <Box sx={{ maxWidth: 860, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <IconButton component={Link} to={`/c/${challenge.slug}`} aria-label="Back to challenge">
          <Icon name="arrow_back" size={22} />
        </IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Eyebrow>Leaderboard</Eyebrow>
          <Typography noWrap sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>
            {challenge.title}
          </Typography>
        </Box>
      </Stack>

      {!visible ? (
        <EmptyState
          icon="visibility_off"
          title={title}
          body={body}
          action={
            <Button component={Link} to={`/c/${challenge.slug}`} variant="contained">
              Back to the challenge
            </Button>
          }
        />
      ) : (
        <QueryBoundary isLoading={loadingBoard} error={null}>
          {entries.length === 0 ? (
            <EmptyState
              icon="leaderboard"
              title="No ranked entries yet"
              body="Scores appear here as judges complete their reviews."
            />
          ) : (
            <>
              {provisional && (
                <Stack direction="row" gap={1.5} sx={{ ...containerSx, mb: 3, p: 2.25 }}>
                  <Icon name="info" size={22} color={c.primaryIcon} />
                  <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.6 }}>
                    Some rows are <b>provisional</b> — not every judge has reviewed them yet. A
                    missing review is never counted as a zero, so these positions can still move.
                  </Typography>
                </Stack>
              )}

              <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, overflow: 'hidden' }}>
                <TableHead
                  cols={[
                    { label: 'Rank', width: 72 },
                    { label: 'Entrant' },
                    { label: 'Score', width: 110, align: 'right' },
                  ]}
                />
                {entries.map((entry) => {
                  const isMe = entry.registrationId === user?.uid;
                  return (
                    <Stack
                      key={entry.registrationId}
                      direction="row"
                      alignItems="center"
                      gap={2}
                      sx={{
                        ...tableRowSx,
                        // Finding yourself in a long list is the single most
                        // common thing an entrant does here.
                        background: isMe ? c.primaryContainer : undefined,
                      }}
                    >
                      <Box sx={{ width: 72, flex: 'none' }}>
                        {entry.rank <= 3 ? (
                          <Box
                            sx={{
                              width: 30, height: 30, borderRadius: '50%',
                              display: 'grid', placeItems: 'center',
                              background: MEDAL[entry.rank - 1], color: c.onPrimary,
                              fontSize: 13, fontWeight: 800,
                            }}
                          >
                            {entry.rank}
                          </Box>
                        ) : (
                          <Num size={15}>{entry.rank}</Num>
                        )}
                      </Box>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <PersonCell name={entry.name} sub={isMe ? 'You' : undefined} />
                      </Box>

                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="flex-end"
                        gap={0.75}
                        sx={{ width: 110, flex: 'none' }}
                      >
                        <Num size={15}>{entry.score.toFixed(1)}</Num>
                        {entry.isProvisional && (
                          <Tag bg={c.primary} fg={c.onPrimary}>
                            {`${entry.reviewsDone}/${entry.reviewsTotal}`}
                          </Tag>
                        )}
                      </Stack>
                    </Stack>
                  );
                })}
              </Box>
            </>
          )}
        </QueryBoundary>
      )}
    </Box>
  );
}
