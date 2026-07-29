import { useEffect, useState } from 'react';
import { Box, Button, Snackbar, Stack, Typography } from '@mui/material';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon } from './Icon';
import { c, radius, shadow } from '@shared/design/tokens';

/**
 * The two things an installable app owes its user, and nothing more.
 *
 * 1. **A new version is ready.** Offered, never forced. Reloading under
 *    someone mid-way through a submission form would lose their work, so the
 *    choice is theirs and the old version keeps running until they take it.
 * 2. **This can be installed.** Offered once, and only when the browser says it
 *    is genuinely installable — `beforeinstallprompt` does not fire otherwise,
 *    so there is no way to nag someone who has already installed it.
 *
 * Dismissal is remembered in `localStorage`. Asking again next visit is how an
 * install prompt becomes the thing people reflexively close.
 */

const DISMISSED_KEY = 'forge.installPrompt.dismissed';

export function PwaPrompts() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      // A failed registration means no offline support. That is a degraded
      // experience, not a broken one, so it must never surface as an error.
      console.warn('Service worker registration failed; continuing without offline support.', error);
    },
  });

  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) === '1') return;

    const onPrompt = (e: BeforeInstallPromptEvent) => {
      // Chrome shows its own mini-infobar unless the event is intercepted.
      e.preventDefault();
      setInstallEvent(e);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      localStorage.setItem(DISMISSED_KEY, '1');
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismissInstall = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setInstallEvent(null);
  };

  return (
    <>
      <Snackbar
        open={needRefresh}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: { xs: 12, md: 3 } }}
      >
        <Stack
          direction="row"
          alignItems="center"
          gap={1.5}
          sx={{
            px: 2.5, py: 1.75, borderRadius: `${radius.field}px`,
            background: c.inverseSurface, color: c.onInverseSurface, boxShadow: shadow.snack,
          }}
        >
          <Icon name="rocket_launch" size={20} />
          <Typography sx={{ fontSize: 14 }}>A new version of Forge is ready.</Typography>
          <Button
            size="small"
            sx={{ color: c.primary, fontWeight: 700 }}
            onClick={() => void updateServiceWorker(true)}
          >
            Reload
          </Button>
          <Button size="small" sx={{ color: c.onInverseSurface }} onClick={() => setNeedRefresh(false)}>
            Later
          </Button>
        </Stack>
      </Snackbar>

      {installEvent && (
        <Box
          sx={{
            position: 'fixed', zIndex: 1300,
            left: 16, right: 16, bottom: { xs: 112, md: 24 },
            mx: 'auto', maxWidth: 420,
            p: 2.25, borderRadius: `${radius.tile}px`,
            background: c.surfaceCard, border: `1px solid ${c.outline}`, boxShadow: shadow.card,
          }}
          role="dialog"
          aria-label="Install Forge"
        >
          <Stack direction="row" gap={1.75} alignItems="flex-start">
            <Box
              sx={{
                width: 40, height: 40, flex: 'none', borderRadius: '12px',
                background: c.inverse, color: c.primary,
                display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800,
              }}
            >
              F
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 0.25 }}>Install Forge</Typography>
              <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.5, mb: 1.5 }}>
                Add it to your home screen for full-screen access and faster launches.
              </Typography>
              <Stack direction="row" gap={1}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={async () => {
                    await installEvent.prompt();
                    await installEvent.userChoice;
                    // The event can only be used once, whatever the outcome.
                    dismissInstall();
                  }}
                >
                  Install
                </Button>
                <Button size="small" onClick={dismissInstall}>Not now</Button>
              </Stack>
            </Box>
          </Stack>
        </Box>
      )}
    </>
  );
}
