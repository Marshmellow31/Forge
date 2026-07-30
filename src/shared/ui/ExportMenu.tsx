import { useState } from 'react';
import { Button, Divider, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { Icon } from './Icon';
import { usePermissions } from '@core/auth';
import {
  registrationsToCsv, submissionsToCsv, exportFilename,
  type RegistrationRow, type SubmissionRow, type PiiMode,
} from '@core/export/csv';
import type { FormSchema } from '@shared/types/domain';
import { c } from '@shared/design/tokens';

/**
 * CSV export for a challenge. ROADMAP Phase 2.
 *
 * The PII choice is presented as two separate menu items rather than a toggle,
 * because a toggle's state is invisible at the moment of clicking Export and
 * the failure mode — emailing a spreadsheet of phone numbers to a judge — is
 * not recoverable. Two items make the choice explicit every time.
 *
 * Including PII additionally requires `registration.export`, which is a
 * distinct permission from `registration.read` precisely so that seeing a
 * registrant list and walking away with a copy of it are separately grantable.
 */

/**
 * Triggers a download from a string.
 *
 * Built with a Blob and an object URL rather than a `data:` URI: data URIs are
 * capped at a few megabytes in most browsers and a large challenge's export
 * would silently truncate.
 */
/**
 * Byte-order mark. Written as an escape rather than a literal character so it
 * is visible in a diff — an invisible U+FEFF in source is a reviewing hazard.
 * Excel needs it to open the file as UTF-8; without it every non-ASCII name is
 * mojibake for this file's most common consumer.
 */
const BOM = '\uFEFF';

function download(filename: string, contents: string) {
  const blob = new Blob([BOM, contents], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function ExportMenu({
  challengeSlug,
  registrations,
  submissions,
  schema,
  blind = false,
}: {
  challengeSlug: string;
  registrations: RegistrationRow[];
  submissions: SubmissionRow[];
  schema: FormSchema | undefined;
  blind?: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { can } = usePermissions();

  const today = new Date().toISOString().slice(0, 10);
  const canExportPii = can('registration.export');

  const run = (kind: 'registrations' | 'submissions', mode: PiiMode = 'redact') => {
    const contents = kind === 'registrations'
      ? registrationsToCsv(registrations, schema, mode)
      : submissionsToCsv(submissions, blind);
    download(exportFilename(challengeSlug, kind, today), contents);
    setAnchor(null);
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<Icon name="download" size={20} />}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        Export
      </Button>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => run('registrations', 'redact')}>
          <ListItemText
            primary={`Registrations (${registrations.length})`}
            secondary="Personal details redacted"
          />
        </MenuItem>

        <MenuItem disabled={!canExportPii} onClick={() => run('registrations', 'include')}>
          <ListItemText
            primary="Registrations, with personal details"
            secondary={canExportPii
              ? 'Includes emails and any field marked as personal'
              : 'Needs the registration.export permission'}
          />
        </MenuItem>

        <Divider />

        <MenuItem onClick={() => run('submissions')}>
          <ListItemText
            primary={`Submissions (${submissions.length})`}
            secondary={blind ? 'Anonymized — blind judging is on' : 'Includes participant names'}
          />
        </MenuItem>

        <Divider />
        <Typography sx={{ px: 2, py: 1.25, fontSize: 12, color: c.inkFaint, maxWidth: 280, lineHeight: 1.5 }}>
          Cells starting with <b>=</b>, <b>+</b>, <b>-</b> or <b>@</b> are escaped so a spreadsheet
          cannot execute them as formulas.
        </Typography>
      </Menu>
    </>
  );
}
