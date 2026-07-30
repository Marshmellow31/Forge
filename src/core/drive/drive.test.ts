import { describe, it, expect } from 'vitest';
import {
  parseDriveLink, isDriveLink, driveImageUrl, drivePreviewUrl, driveOpenUrl,
  analyzeDriveLink, driveFileRef, resolveCoverUrl,
} from './links';

const ID = '1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv';

describe('parseDriveLink', () => {
  it.each([
    ['share sheet', `https://drive.google.com/file/d/${ID}/view?usp=sharing`, 'file'],
    ['view, no query', `https://drive.google.com/file/d/${ID}/view`, 'file'],
    ['open?id', `https://drive.google.com/open?id=${ID}`, 'file'],
    ['uc export', `https://drive.google.com/uc?export=view&id=${ID}`, 'file'],
    ['uc, id first', `https://drive.google.com/uc?id=${ID}&export=download`, 'file'],
    ['thumbnail', `https://drive.google.com/thumbnail?id=${ID}&sz=w1000`, 'file'],
    ['short /d/', `https://drive.google.com/d/${ID}`, 'file'],
    ['multi-account path', `https://drive.google.com/drive/u/0/folders/${ID}`, 'folder'],
    ['folder', `https://drive.google.com/drive/folders/${ID}`, 'folder'],
    ['doc', `https://docs.google.com/document/d/${ID}/edit`, 'document'],
    ['sheet', `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`, 'spreadsheet'],
    ['slides', `https://docs.google.com/presentation/d/${ID}/edit`, 'presentation'],
    ['form', `https://docs.google.com/forms/d/e/${ID}/viewform`, 'form'],
    ['no protocol', `drive.google.com/file/d/${ID}/view`, 'file'],
    ['surrounding whitespace', `  https://drive.google.com/file/d/${ID}/view  `, 'file'],
  ])('parses a %s link', (_name, url, kind) => {
    const target = parseDriveLink(url);
    expect(target).not.toBeNull();
    expect(target!.fileId).toBe(ID);
    expect(target!.kind).toBe(kind);
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['a normal website', 'https://example.com/photo.jpg'],
    ['dropbox', 'https://www.dropbox.com/s/abc123/photo.jpg'],
    ['a bare id', ID],
    ['a lookalike host', 'https://drive.google.com.evil.test/file/d/abc/view'],
    ['prose', 'here is my drive link, one second'],
  ])('returns null for %s', (_name, url) => {
    expect(parseDriveLink(url)).toBeNull();
  });

  it('does not mistake a path fragment for a file id', () => {
    expect(parseDriveLink('https://drive.google.com/file/d/edit')).toBeNull();
  });

  it('isDriveLink agrees with parseDriveLink', () => {
    expect(isDriveLink(`https://drive.google.com/file/d/${ID}/view`)).toBe(true);
    expect(isDriveLink('https://example.com')).toBe(false);
  });
});

describe('URL builders', () => {
  it('builds a thumbnail URL, not the rate-limited uc endpoint', () => {
    const url = driveImageUrl(ID, 800);
    expect(url).toBe(`https://drive.google.com/thumbnail?id=${ID}&sz=w800`);
    expect(url).not.toContain('uc?export');
  });

  it('defaults to a width large enough for a hero cover', () => {
    expect(driveImageUrl(ID)).toContain('sz=w1600');
  });

  it('rounds a fractional width rather than emitting a broken parameter', () => {
    expect(driveImageUrl(ID, 799.6)).toContain('sz=w800');
  });

  it('builds a preview URL per kind', () => {
    expect(drivePreviewUrl({ fileId: ID, kind: 'file' })).toContain('/file/d/');
    expect(drivePreviewUrl({ fileId: ID, kind: 'document' })).toContain('/document/d/');
    expect(drivePreviewUrl({ fileId: ID, kind: 'folder' })).toContain('embeddedfolderview');
    expect(drivePreviewUrl({ fileId: ID, kind: 'spreadsheet' })).toContain('/spreadsheets/d/');
  });

  it('round-trips: an open URL parses back to the same target', () => {
    for (const kind of ['file', 'document', 'spreadsheet', 'presentation', 'folder'] as const) {
      const parsed = parseDriveLink(driveOpenUrl({ fileId: ID, kind }));
      expect(parsed, `${kind} did not round-trip`).toEqual({ fileId: ID, kind });
    }
  });
});

describe('analyzeDriveLink', () => {
  it('accepts a plain shared file as a cover image', () => {
    const result = analyzeDriveLink(`https://drive.google.com/file/d/${ID}/view?usp=sharing`, 'image');
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('rejects a non-Drive link', () => {
    const result = analyzeDriveLink('https://example.com/x.png', 'image');
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('notADriveLink');
  });

  it('rejects a folder used as a cover image', () => {
    const result = analyzeDriveLink(`https://drive.google.com/drive/folders/${ID}`, 'image');
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('isFolder');
  });

  it('allows a folder as a submission attachment', () => {
    expect(analyzeDriveLink(`https://drive.google.com/drive/folders/${ID}`, 'attachment').ok).toBe(true);
  });

  it('warns that a Google Doc will not render as a cover', () => {
    const result = analyzeDriveLink(`https://docs.google.com/document/d/${ID}/edit`, 'image');
    expect(result.warnings).toContain('notAnImage');
  });

  it('warns about a link copied from a signed-in Drive session', () => {
    const result = analyzeDriveLink(`https://drive.google.com/file/d/${ID}/view?usp=drive_web`, 'image');
    expect(result.warnings).toContain('restrictedLinkShape');
    // A warning must never block: the organiser may know it is shared.
    expect(result.ok).toBe(true);
  });

  it('warns on a /u/0/ multi-account link', () => {
    expect(analyzeDriveLink(`https://drive.google.com/drive/u/0/folders/${ID}`).warnings)
      .toContain('restrictedLinkShape');
  });
});

describe('driveFileRef', () => {
  it('stores a reference, never bytes', () => {
    const ref = driveFileRef({ fileId: ID, kind: 'file' }, { name: 'entry.png', uploadedBy: 'u1' });
    expect(ref.provider).toBe('googleDrive');
    expect(ref.fileId).toBe(ID);
    expect(ref.name).toBe('entry.png');
    expect(ref.uploadedBy).toBe('u1');
    expect(ref.url).toContain(ID);
  });

  it('reports an honest zero size rather than a confident guess', () => {
    expect(driveFileRef({ fileId: ID, kind: 'file' }, { name: 'a', uploadedBy: 'u' }).sizeBytes).toBe(0);
  });

  it('maps Google-native kinds to their real mime types', () => {
    expect(driveFileRef({ fileId: ID, kind: 'document' }, { name: 'd', uploadedBy: 'u' }).mimeType)
      .toBe('application/vnd.google-apps.document');
  });

  it('prefers a caller-supplied mime type when one is known', () => {
    expect(driveFileRef({ fileId: ID, kind: 'file' }, { name: 'a.png', uploadedBy: 'u', mimeType: 'image/png' }).mimeType)
      .toBe('image/png');
  });
});

describe('resolveCoverUrl', () => {
  it('turns a Drive link into a renderable image URL', () => {
    expect(resolveCoverUrl(`https://drive.google.com/file/d/${ID}/view`))
      .toBe(`https://drive.google.com/thumbnail?id=${ID}&sz=w1600`);
  });

  it('passes a plain https image URL through untouched', () => {
    expect(resolveCoverUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
  });

  it('returns null for empty, so the caller falls back to the category gradient', () => {
    expect(resolveCoverUrl('')).toBeNull();
    expect(resolveCoverUrl(null)).toBeNull();
    expect(resolveCoverUrl(undefined)).toBeNull();
    expect(resolveCoverUrl('   ')).toBeNull();
  });

  it('returns null for a legacy category name rather than rendering a broken image', () => {
    // Existing seeded challenges store 'Photography' in `cover`.
    expect(resolveCoverUrl('Photography')).toBeNull();
  });

  it('honours the requested width', () => {
    expect(resolveCoverUrl(`https://drive.google.com/file/d/${ID}/view`, 400)).toContain('sz=w400');
  });
});
