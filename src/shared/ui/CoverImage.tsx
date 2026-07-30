import { useEffect, useState, type ReactNode } from 'react';
import { Box } from '@mui/material';
import { resolveCoverUrl } from '@core/drive/links';
import { coverFor, ease } from '@shared/design/tokens';

/**
 * A challenge cover, from whatever the organiser gave us.
 *
 * `cover` may be a Google Drive share link, a plain image URL, a legacy
 * category name, or empty. All four resolve here so no screen has to know the
 * difference, and adding a fifth source later changes only `resolveCoverUrl`.
 *
 * **The failure path is the point.** A Drive link breaks whenever someone
 * un-shares a file or empties their trash, and it breaks silently — the image
 * simply never loads. A broken `<img>` renders as a torn-icon box that looks
 * like an application bug. So a load error falls back to the category gradient,
 * which is the same thing an organiser who set no cover at all sees: still
 * branded, still legible, never obviously broken.
 */
export function CoverImage({
  cover,
  category,
  height,
  width = 1600,
  radius: r,
  children,
  alt = '',
}: {
  cover: string | null | undefined;
  category: string;
  height: number | Record<string, number>;
  /** Requested render width, so a card does not download a hero-sized image. */
  width?: number;
  radius?: number;
  children?: ReactNode;
  alt?: string;
}) {
  const url = resolveCoverUrl(cover, width);
  const [failed, setFailed] = useState(false);

  // A new cover deserves a fresh attempt; without this, one broken link would
  // permanently poison the slot for every challenge rendered into it.
  useEffect(() => setFailed(false), [url]);

  const gradient = coverFor(category);
  const showImage = url !== null && !failed;

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        height,
        background: gradient,
        borderRadius: r ? `${r}px` : undefined,
      }}
    >
      {showImage && (
        <Box
          component="img"
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            transition: `opacity 300ms ${ease}`,
          }}
        />
      )}
      {children && <Box sx={{ position: 'relative', height: '100%' }}>{children}</Box>}
    </Box>
  );
}
