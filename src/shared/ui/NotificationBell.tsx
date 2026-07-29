import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Box, Button, Divider, Popover, Stack, Typography } from '@mui/material';
import { Icon } from './Icon';
import { useAuth } from '@core/auth';
import { useNotifications } from '@core/firebase/hooks';
import { useMarkNotificationRead, useMarkAllNotificationsRead } from '@core/firebase/mutations';
import { c, radius, ease } from '@shared/design/tokens';

/**
 * The in-app notification centre.
 *
 * Delivery is a Firestore read, not a push. That is a deliberate product
 * position as well as a Spark-plan constraint: the inbox is the source of truth
 * and a push notification, when one exists, is only an echo of it. Nothing is
 * ever *only* delivered as a push, so nothing is lost when a browser blocks
 * them or a phone is off.
 *
 * A signed-out visitor has no inbox — there is no identity to address — so the
 * bell explains that rather than showing a permanently empty list.
 */

const TYPE_ICON: Record<string, string> = {
  'registration.confirmed': 'how_to_reg',
  'submission.received': 'inbox',
  'deadline.approaching': 'schedule',
  'results.published': 'emoji_events',
  'review.assigned': 'gavel',
  announcement: 'campaign',
};

export function NotificationBell() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: notifications = [], isLoading } = useNotifications(user?.uid);
  const markRead = useMarkNotificationRead(user?.uid);
  const markAll = useMarkAllNotificationsRead(user?.uid);

  const unread = notifications.filter((n) => !n.read);

  const open = (n: (typeof notifications)[number]) => {
    if (!n.read) markRead.mutate(n.id);
    setAnchor(null);
    if (n.link) nav(n.link);
  };

  return (
    <>
      <Box
        component="button"
        aria-label={unread.length > 0 ? `Notifications, ${unread.length} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          position: 'relative', width: 48, height: 48, border: 'none', borderRadius: '50%',
          background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center',
          color: c.inkMuted, transition: `background 180ms ${ease}`,
          '&:hover': { background: c.surfaceField },
        }}
      >
        <Icon name="notifications" size={22} fill={unread.length > 0} />
        {/* The dot appears only when something is genuinely unread. A permanent
            badge trains people to ignore it. */}
        {unread.length > 0 && (
          <Box
            sx={{
              position: 'absolute', top: 8, right: 8, minWidth: 18, height: 18, px: 0.5,
              borderRadius: '9px', background: c.error, color: '#fff',
              fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center',
              border: `2px solid ${c.surface}`,
            }}
          >
            {unread.length > 9 ? '9+' : unread.length}
          </Box>
        )}
      </Box>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: 380, maxWidth: 'calc(100vw - 32px)', maxHeight: 480,
              borderRadius: `${radius.tile}px`, overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            },
          },
        }}
      >
        <Stack direction="row" alignItems="center" sx={{ px: 2.5, py: 2, flex: 'none' }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, flex: 1 }}>Notifications</Typography>
          {unread.length > 0 && (
            <Button size="small" onClick={() => markAll.mutate(unread.map((n) => n.id))}>
              Mark all read
            </Button>
          )}
        </Stack>
        <Divider />

        <Box sx={{ overflowY: 'auto', flex: 1 }}>
          {!user ? (
            <Stack alignItems="center" gap={1.5} sx={{ p: 4, textAlign: 'center' }}>
              <Icon name="notifications_off" size={32} color={c.inkFaint} />
              <Typography sx={{ fontSize: 14, color: c.inkMuted, maxWidth: '34ch', lineHeight: 1.6 }}>
                Sign in to get notified when your entry is received, a deadline is close, or results
                are published.
              </Typography>
              {/* Routes to the front door rather than minting an anonymous
                  account: the project may not have Anonymous enabled, and
                  choosing a surface is what actually orients someone. */}
              <Button
                variant="contained"
                size="small"
                component={Link}
                to="/welcome"
                onClick={() => setAnchor(null)}
              >
                Sign in
              </Button>
            </Stack>
          ) : isLoading ? (
            <Typography sx={{ p: 4, textAlign: 'center', fontSize: 14, color: c.inkFaint }}>
              Loading…
            </Typography>
          ) : notifications.length === 0 ? (
            <Stack alignItems="center" gap={1.25} sx={{ p: 4, textAlign: 'center' }}>
              <Icon name="check_circle" size={32} color={c.successInk} />
              <Typography sx={{ fontSize: 14, color: c.inkMuted }}>
                Nothing yet. We will tell you when something happens.
              </Typography>
            </Stack>
          ) : (
            notifications.map((n) => (
              <Box
                key={n.id}
                component="button"
                onClick={() => open(n)}
                sx={{
                  display: 'flex', gap: 1.5, width: '100%', textAlign: 'left',
                  px: 2.5, py: 2, border: 'none', cursor: 'pointer',
                  borderBottom: `1px solid ${c.outlineSoft}`,
                  background: n.read ? 'transparent' : c.primaryContainer,
                  transition: `background 160ms ${ease}`,
                  '&:hover': { background: n.read ? c.surfaceRowHover : c.primary },
                }}
              >
                <Icon name={TYPE_ICON[n.type] ?? 'notifications'} size={20} color={c.primaryIcon} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: n.read ? 500 : 700, mb: 0.25 }}>
                    {n.title}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.5 }}>
                    {n.body}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: c.inkFaint, mt: 0.5 }}>{n.at}</Typography>
                </Box>
              </Box>
            ))
          )}
        </Box>
      </Popover>
    </>
  );
}
