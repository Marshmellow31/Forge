/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/**
 * `beforeinstallprompt` is Chromium-only and not in the DOM lib, so it is
 * declared here rather than cast at the call site.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
}
