import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '@core/auth';

/**
 * How full the organiser's Google Drive is.
 *
 * Since ADR-026 the organisation underwrites storage for its entrants, and the
 * failure mode that follows is quiet until it is urgent: uploads begin failing
 * mid-competition and the first person to notice is an entrant at a deadline.
 * This exists so the panel can warn a week earlier.
 *
 * Absent configuration is a normal answer, not an error — most organisations
 * have not connected Drive, and a red box on a feature they are not using is
 * noise. `connected: false` is what that looks like.
 */

const quotaSchema = z.discriminatedUnion('connected', [
  z.object({ connected: z.literal(false) }),
  z.object({
    connected: z.literal(true),
    account: z.string().nullable(),
    usageBytes: z.number(),
    /** `null` on an account with no ceiling — some Workspace tiers. */
    limitBytes: z.number().nullable(),
    /** `null` when there is no limit to be a fraction of. */
    fraction: z.number().nullable(),
  }),
]);

export type DriveQuota = z.infer<typeof quotaSchema>;

/** Above this, the panel says something. Below it, silence. */
export const QUOTA_WARN_AT = 0.85;

export function useDriveQuota() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['driveQuota', user?.uid ?? ''],
    enabled: Boolean(user),
    // Quota moves slowly and the endpoint costs a Drive API call; refetching it
    // on every focus would be noise for a number that changes by the megabyte.
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<DriveQuota> => {
      const idToken = await user!.getIdToken();
      const response = await fetch('/api/drive/quota', {
        headers: { authorization: `Bearer ${idToken}` },
      });
      // A 404 means the serverless function is not deployed — true of any
      // `vite dev` session. Indistinguishable from "not connected" as far as
      // the screen is concerned, and not worth an error state.
      if (!response.ok) return { connected: false };
      return quotaSchema.parse(await response.json());
    },
  });
}

/** `1.2 GB`, `840 MB` — a size a person reads rather than parses. */
export function humanBytes(bytes: number): string {
  const GB = 1024 ** 3;
  const MB = 1024 ** 2;
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
