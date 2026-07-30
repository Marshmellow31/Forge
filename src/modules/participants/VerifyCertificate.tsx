import { useParams, Link } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import { EmptyState, Eyebrow, Tag, panelSx, Blobs } from '@shared/ui/primitives';
import { useCertificates } from '@core/firebase/hooks';
import { c, radius, mono } from '@shared/design/tokens';

/**
 * S-07 — Public certificate verification.
 *
 * The only screen whose entire purpose is to be reached by a stranger holding a
 * link, so two things follow:
 *
 * 1. **It must work signed out.** `certificates` is a root-level collection
 *    (DATA_MODEL §3) precisely so a verification URL resolves without org
 *    context, and the rules make it world-readable and client-unwritable.
 * 2. **"Not found" must be as clear as "valid".** Someone checking a claimed
 *    award needs a straight answer, and an ambiguous empty state would let a
 *    forged certificate pass as merely a broken link.
 */
export default function VerifyCertificate() {
  const { certId } = useParams();
  const { data: certificates = [], isLoading, error } = useCertificates();
  const certificate = certificates.find((c2) => c2.id === certId);

  return (
    <Box sx={{ maxWidth: 620, mx: 'auto' }}>
      <Eyebrow>Certificate verification</Eyebrow>

      <QueryBoundary isLoading={isLoading} error={error}>
        {!certificate ? (
          <Box sx={{ mt: 2 }}>
            <EmptyState
              icon="gpp_bad"
              title="No certificate with that code"
              body="Nothing on Forge matches this verification code. It may be mistyped, revoked, or was never issued."
              action={<Button component={Link} to="/" variant="contained">Go to Forge</Button>}
            />
            <Typography sx={{ fontSize: 12, color: c.inkFaint, textAlign: 'center', mt: 2 }}>
              Checked code <Box component="span" sx={{ fontFamily: mono }}>{certId}</Box>
            </Typography>
          </Box>
        ) : (
          <>
            <Box
              sx={{
                position: 'relative', overflow: 'hidden', mt: 2, mb: 3,
                borderRadius: `${radius.hero}px`, background: c.success,
                p: { xs: '32px 24px', md: '40px 36px' }, textAlign: 'center',
              }}
            >
              <Blobs variant="detail" />
              <Box sx={{ position: 'relative' }}>
                <Icon name="verified" size={48} fill color={c.successInk} />
                <Typography sx={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em', mt: 1.5, color: c.onSuccess }}>
                  This certificate is genuine
                </Typography>
                <Typography sx={{ fontSize: 14, color: c.onSuccess, mt: 1, opacity: 0.85 }}>
                  Issued by Forge and not revoked.
                </Typography>
              </Box>
            </Box>

            <Box sx={panelSx}>
              <Eyebrow>Awarded to</Eyebrow>
              <Typography sx={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', mb: 2.5 }}>
                {certificate.award}
              </Typography>

              <Stack gap={2}>
                {([
                  ['Challenge', certificate.challenge],
                  ['Organization', certificate.org],
                  ['Placed', certificate.rank ? `#${certificate.rank}` : '—'],
                  ['Issued', certificate.issuedAt],
                ] as const).map(([label, value]) => (
                  <Stack key={label} direction="row" justifyContent="space-between" alignItems="baseline" gap={2}>
                    <Typography sx={{ fontSize: 13, color: c.inkFaint }}>{label}</Typography>
                    <Typography sx={{ fontSize: 14, fontWeight: 600, textAlign: 'right' }}>{value}</Typography>
                  </Stack>
                ))}
              </Stack>

              <Box sx={{ mt: 3, pt: 2.5, borderTop: `1px solid ${c.outlineSoft}` }}>
                <Stack direction="row" alignItems="center" gap={1}>
                  <Tag bg={c.surfaceField} fg={c.inkMuted}>Verification code</Tag>
                  <Box component="code" sx={{ fontFamily: mono, fontSize: 12.5, color: c.inkMuted }}>
                    {certificate.id}
                  </Box>
                </Stack>
              </Box>
            </Box>

            <Typography sx={{ fontSize: 12, color: c.inkFaint, lineHeight: 1.6, mt: 2.5, textAlign: 'center' }}>
              Certificates are written by Forge and are read-only to every client, including the
              organization that issued them. Revoking one changes what this page says.
            </Typography>
          </>
        )}
      </QueryBoundary>
    </Box>
  );
}
