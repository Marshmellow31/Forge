import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { resolveCoverUrl } from '@core/drive/links';
import { c } from '@shared/design/tokens';

/**
 * An organization's mark: its logo if it has one, otherwise its initials.
 *
 * The fallback is the *design*, not a placeholder — initials on the brand
 * colour is what the shell has always shown, and an organization that never
 * uploads a logo should still look finished rather than broken.
 *
 * Accepts the same values as a challenge cover (a Drive share link or a plain
 * image URL) and resolves them through the same parser, so "paste a Drive link"
 * means one thing everywhere in the product.
 *
 * `contain`, not `cover`: a logo cropped to fill a square is a logo with its
 * edges cut off. Photos crop well; marks do not.
 */
export function OrgLogo({
  logoUrl,
  initials,
  size = 40,
  radius: r,
}: {
  logoUrl?: string | null;
  initials: string;
  size?: number;
  radius?: number;
}) {
  // Ask for roughly 2× for crisp rendering on a retina display.
  const url = resolveCoverUrl(logoUrl, Math.round(size * 2));
  const [failed, setFailed] = useState(false);

  // A changed logo deserves a fresh attempt; otherwise one broken link would
  // permanently poison the slot.
  useEffect(() => setFailed(false), [url]);

  const box = {
    width: size,
    height: size,
    flex: 'none',
    borderRadius: `${r ?? Math.round(size * 0.34)}px`,
    overflow: 'hidden',
  } as const;

  if (url && !failed) {
    return (
      <Box sx={{ ...box, background: c.surfaceCard, border: `1px solid ${c.outline}` }}>
        <Box
          component="img"
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        ...box,
        background: c.inverse,
        color: c.primary,
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.4,
        fontWeight: 800,
      }}
    >
      {initials}
    </Box>
  );
}
