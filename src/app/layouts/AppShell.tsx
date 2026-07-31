import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box, IconButton, Stack, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Icon } from '@shared/ui/Icon';
import { c, radius, shadow, ease } from '@shared/design/tokens';
import { useCurrentUser, useMyRegistrations, useChallenges } from '@core/firebase/hooks';
import { useAuth } from '@core/auth';
import { NotificationBell } from '@shared/ui/NotificationBell';

/**
 * The single application shell.
 *
 * The design collapses the previous three shells (admin / participant / public)
 * into one: a persistent sidebar on desktop with two nav groups, and a bottom
 * navigation bar plus FAB on mobile. Screens that were "full-screen, no chrome"
 * now live inside this shell too — see docs/DECISIONS.md ADR-015.
 */

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Key into the live badge counts, not a literal number. */
  badge?: 'entries' | 'reviews';
  /** Match nested paths (e.g. /org/challenges/:id) as this item. */
  match?: (path: string) => boolean;
}

/**
 * `badge` is a key resolved against live counts at render time, never a literal.
 * A hardcoded "3" that never moves is worse than no badge: it teaches people
 * the number means nothing.
 */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'For you',
    items: [
      { to: '/home', label: 'Home', icon: 'home' },
      { to: '/discover', label: 'Discover', icon: 'explore', match: (p) => p.startsWith('/discover') || p.startsWith('/c/') },
      { to: '/me/registrations', label: 'My entries', icon: 'assignment', badge: 'entries' },
      { to: '/me/achievements', label: 'Awards', icon: 'military_tech', match: (p) => p.startsWith('/me/achievements') || p.startsWith('/verify/') },
    ],
  },
  {
    title: 'Organizing',
    items: [
      { to: '/org', label: 'Overview', icon: 'space_dashboard', match: (p) => p === '/org' },
      { to: '/org/challenges', label: 'Challenges', icon: 'emoji_events', match: (p) => p.startsWith('/org/challenges') && !p.endsWith('/form') },
      { to: '/org/members', label: 'Members', icon: 'group' },
      { to: '/judge', label: 'Judging', icon: 'gavel', badge: 'reviews', match: (p) => p.startsWith('/judge') },
    ],
  },
];

/**
 * Appended to the Organizing group once the admin panel has been unlocked.
 *
 * Not shown before then, because `/admin` is reached by knowing the URL and the
 * key — advertising it in the sidebar to everyone would make the key the only
 * thing standing between a curious participant and the console, and the key is
 * in the bundle. Once you are through, a link is simply convenient.
 */
const ADMIN_NAV: NavItem = {
  to: '/admin',
  label: 'Admin panel',
  icon: 'shield_person',
  match: (p) => p.startsWith('/admin'),
};

const BOTTOM_NAV: NavItem[] = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/discover', label: 'Discover', icon: 'explore', match: (p) => p.startsWith('/discover') || p.startsWith('/c/') },
  { to: '/me/registrations', label: 'Entries', icon: 'assignment' },
  { to: '/me/achievements', label: 'Awards', icon: 'military_tech' },
];

const SCREEN_TITLES: { test: (p: string) => boolean; title: string }[] = [
  { test: (p) => p === '/home', title: 'Forge' },
  { test: (p) => p.startsWith('/discover'), title: 'Discover' },
  { test: (p) => /^\/c\/[^/]+\/register$/.test(p), title: 'Entry form' },
  { test: (p) => p.startsWith('/c/'), title: 'Challenge' },
  { test: (p) => p.startsWith('/me/registrations'), title: 'My entries' },
  { test: (p) => p.startsWith('/me/achievements'), title: 'Awards' },
  { test: (p) => p.endsWith('/form'), title: 'Form builder' },
  { test: (p) => p.startsWith('/admin'), title: 'Admin panel' },
  { test: (p) => /^\/org\/challenges\/[^/]+$/.test(p), title: 'Control room' },
  { test: (p) => p.startsWith('/org/challenges'), title: 'Challenges' },
  { test: (p) => p.startsWith('/org'), title: 'Organization' },
  { test: (p) => p.startsWith('/judge/score'), title: 'Review' },
  { test: (p) => p.startsWith('/judge'), title: 'Judging' },
];

/** What the sidebar footer says you are currently doing. */
const MODE_LABEL: Record<string, string> = {
  participant: 'Entering challenges',
  organizer: 'Organizing',
  demo: 'Exploring the demo',
};

const isActive = (item: NavItem, path: string) =>
  item.match ? item.match(path) : path === item.to || path.startsWith(`${item.to}/`);

export default function AppShell() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const inOrgContext = pathname.startsWith('/org');
  const primaryLabel = inOrgContext ? 'New challenge' : 'Enter a challenge';
  const primaryTo = inOrgContext ? '/org/challenges/new' : '/discover';
  const screenTitle = SCREEN_TITLES.find((s) => s.test(pathname))?.title ?? 'Forge';
  const { user, signOutNow, mode, adminUnlocked } = useAuth();
  const { data: profile } = useCurrentUser(user?.uid ?? 'u_self');
  const { data: myRegistrations = [] } = useMyRegistrations(user?.uid);
  const { data: challenges = [] } = useChallenges();
  const displayName = user?.displayName ?? profile?.name ?? 'Demo viewer';
  const initials = displayName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  // Real counts, from data already in the cache. A zero renders as no badge
  // rather than a "0", which is noise.
  const badgeCounts: Record<'entries' | 'reviews', number> = {
    entries: myRegistrations.length,
    reviews: challenges.reduce((n, ch) => n + ch.counters.reviewsPending, 0),
  };

  const showFab = !isDesktop && ['/home', '/discover', '/me/registrations'].includes(pathname);

  /**
   * A participant is not shown the organizing group.
   *
   * Not for security — the rules do that — but because every screen in it would
   * refuse them, and a wall of permission-denied messages reads as a broken app
   * rather than as "this is not for you". They can still reach any of it by URL,
   * and switching surface is one click away in the footer.
   *
   * The group stays visible while the mode is unset, so nothing disappears for
   * someone who has not been through onboarding.
   */
  const visibleGroups = NAV_GROUPS.filter(
    (g) => g.title !== 'Organizing' || mode === null || mode === 'organizer',
  ).map((g) =>
    g.title === 'Organizing' && adminUnlocked
      ? { ...g, items: [...g.items, ADMIN_NAV] }
      : g,
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', background: c.surface, color: c.ink }}>
      {isDesktop && (
        <Box
          component="aside"
          sx={{
            width: 280,
            flex: 'none',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflowY: 'auto',
            background: c.surfaceContainer,
            borderRight: `1px solid ${c.outline}`,
            p: '20px 12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: '8px 16px 20px' }} component={Link} to="/home" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Box sx={{ width: 36, height: 36, borderRadius: '12px', background: c.inverse, display: 'grid', placeItems: 'center', color: c.primary, fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>
              F
            </Box>
            <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>Forge</Typography>
          </Stack>

          <Box
            component="button"
            onClick={() => navigate(primaryTo)}
            sx={{
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              m: '0 4px 20px',
              p: '16px 20px',
              border: 'none',
              borderRadius: `${radius.field}px`,
              background: c.primary,
              color: c.onPrimary,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: shadow.raised,
              transition: `background 200ms ${ease}, box-shadow 200ms ${ease}`,
              '&:hover': { background: c.primaryHover, boxShadow: '0 2px 6px rgba(60,50,10,.20)' },
            }}
          >
            <Icon name="add" size={20} />
            <span>{primaryLabel}</span>
          </Box>

          {visibleGroups.map((g) => (
            <Box key={g.title} sx={{ flex: 'none', mb: 1.75 }}>
              <Typography variant="overline" sx={{ display: 'block', p: '0 20px 8px' }}>{g.title}</Typography>
              <Stack spacing={0.5}>
                {g.items.map((n) => {
                  const active = isActive(n, pathname);
                  return (
                    <Box
                      key={n.to}
                      component={NavLink}
                      to={n.to}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        width: '100%',
                        px: 2.5,
                        height: 56,
                        borderRadius: '28px',
                        textDecoration: 'none',
                        fontSize: 14,
                        transition: `background 180ms ${ease}`,
                        background: active ? c.primaryContainer : 'transparent',
                        color: active ? c.onPrimaryContainer : c.inkMuted,
                        fontWeight: active ? 700 : 500,
                        '&:hover': { background: active ? c.primaryContainer : c.surfaceNavHover },
                      }}
                    >
                      <Icon name={n.icon} size={22} fill={active} />
                      <Box component="span" sx={{ flex: 1 }}>{n.label}</Box>
                      {n.badge && badgeCounts[n.badge] > 0 && (
                        <Box component="span" sx={{ fontSize: 11, fontWeight: 700, px: 1, py: 0.25, borderRadius: '10px', background: c.inverse, color: c.primary }}>
                          {badgeCounts[n.badge]}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          ))}

          <Box sx={{ flex: 1, minHeight: 16 }} />
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{ flex: 'none', p: 1.5, borderRadius: `${radius.tile}px`, background: c.surfaceCard, border: `1px solid ${c.outline}` }}
          >
            <Box sx={{ width: 40, height: 40, borderRadius: '50%', background: c.inverse, color: c.primary, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>
              {initials}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>{displayName}</Typography>
              <Typography noWrap sx={{ fontSize: 12, color: c.inkMuted }}>
                {user ? MODE_LABEL[mode ?? 'participant'] : 'Viewing · read-only'}
              </Typography>
            </Box>
            {/* Reading needs no identity; writing does. Signed out, this leads
                to the front door rather than silently minting a guest account —
                choosing a surface is the thing that actually orients someone. */}
            <Tooltip title={user ? 'Sign out' : 'Sign in or switch surface'}>
              {user ? (
                <IconButton size="small" aria-label="Sign out" onClick={() => void signOutNow()}>
                  <Icon name="logout" size={20} />
                </IconButton>
              ) : (
                <IconButton size="small" aria-label="Sign in" component={Link} to="/welcome">
                  <Icon name="login" size={20} />
                </IconButton>
              )}
            </Tooltip>
          </Stack>
        </Box>
      )}

      <Box component="main" sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <Box
          component="header"
          sx={{ position: 'sticky', top: 0, zIndex: 40, background: c.surface, borderBottom: `1px solid ${c.outline}` }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={2}
            sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2.5, md: 5 }, height: 72 }}
          >
            {!isDesktop && (
              <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: '10px', background: c.inverse, display: 'grid', placeItems: 'center', color: c.primary, fontSize: 17, fontWeight: 800 }}>
                  F
                </Box>
                <Typography noWrap sx={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>
                  {screenTitle}
                </Typography>
              </Stack>
            )}
            {isDesktop && (
              <Stack
                direction="row"
                alignItems="center"
                spacing={1.5}
                sx={{
                  flex: 1,
                  maxWidth: 560,
                  height: 52,
                  px: 2.5,
                  borderRadius: '26px',
                  background: c.surfaceField,
                  transition: 'background 200ms',
                  '&:hover': { background: c.surfaceFieldHover },
                }}
              >
                <Icon name="search" size={22} color={c.inkMuted} />
                <Box
                  component="input"
                  placeholder="Search challenges, entries, people"
                  aria-label="Search"
                  sx={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, minWidth: 0 }}
                />
                <Box component="span" sx={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: c.inkFaint, border: '1px solid #D5CDB8', borderRadius: '6px', px: 0.75, py: 0.25 }}>
                  ⌘K
                </Box>
              </Stack>
            )}
            <Box sx={{ flex: isDesktop ? undefined : 'none' }} />
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <NotificationBell />
              <Tooltip title={user ? `Signed in as ${displayName} — sign out` : 'Sign in'}>
                <Box
                  component={user ? 'button' : Link}
                  to={user ? undefined : '/signin'}
                  aria-label={user ? `Signed in as ${displayName}. Sign out` : 'Sign in'}
                  onClick={user ? () => void signOutNow() : undefined}
                  sx={{
                    width: 40, height: 40, ml: 0.5, p: 0, border: 'none', cursor: 'pointer',
                    borderRadius: '50%', background: c.inverse, color: c.primary,
                    display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700,
                    transition: `transform 160ms ${ease}`,
                    '&:hover': { transform: 'scale(1.06)' },
                  }}
                >
                  {user ? initials : <Icon name="login" size={20} />}
                </Box>
              </Tooltip>
            </Stack>
          </Stack>
        </Box>

        <Box sx={{ flex: 1, px: { xs: 2.5, md: 5 }, py: { xs: 3, md: 4 } }}>
          <Box sx={{ maxWidth: 1240, mx: 'auto' }}>
            <Box className="rise" key={pathname}>
              <Outlet />
            </Box>
          </Box>
        </Box>

        {!isDesktop && (
          <>
            <Box sx={{ height: 96 }} />
            <Box
              component="nav"
              sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: c.surfaceContainer, borderTop: `1px solid ${c.outline}` }}
            >
              <Stack direction="row" sx={{ maxWidth: 412, mx: 'auto', p: '12px 8px 20px' }}>
                {BOTTOM_NAV.map((n) => {
                  const active = isActive(n, pathname);
                  return (
                    <Box
                      key={n.to}
                      component={Link}
                      to={n.to}
                      sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, py: 0.5, textDecoration: 'none' }}
                    >
                      <Box
                        sx={{
                          display: 'grid',
                          placeItems: 'center',
                          width: 64,
                          height: 32,
                          borderRadius: '16px',
                          background: active ? c.primaryContainer : 'transparent',
                          transition: `background 200ms ${ease}`,
                        }}
                      >
                        <Icon name={n.icon} size={24} fill={active} color={active ? c.onPrimaryContainer : c.inkMuted} />
                      </Box>
                      <Box component="span" sx={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? c.onPrimaryContainer : c.inkMuted }}>
                        {n.label}
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          </>
        )}

        {showFab && (
          <Box
            component="button"
            onClick={() => navigate(primaryTo)}
            sx={{
              position: 'fixed',
              right: 24,
              bottom: 112,
              zIndex: 45,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              height: 60,
              px: 3,
              border: 'none',
              borderRadius: `${radius.tile}px`,
              background: c.primary,
              color: c.onPrimary,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: shadow.fab,
              transition: `transform 200ms ${ease}, box-shadow 200ms ${ease}`,
              '&:hover': { transform: 'translateY(-2px)', boxShadow: shadow.fabHover },
            }}
          >
            <Icon name="add" size={22} />
            {primaryLabel}
          </Box>
        )}
      </Box>
    </Box>
  );
}
