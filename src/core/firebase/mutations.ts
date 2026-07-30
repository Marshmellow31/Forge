import { useMutation, useQueryClient } from '@tanstack/react-query';
import { demoOrgId } from './app';
import { qk } from './keys';
import * as sync from '@core/sync';
import type { Registration, Submission } from '@shared/types/domain';

/**
 * Write hooks. Components use these; they never import `firebase/firestore`
 * (CONVENTIONS.md §5) and never call `core/sync` directly.
 *
 * Each follows the CONVENTIONS.md §4 mutation contract: `onMutate` applies an
 * optimistic update, `onError` rolls it back, `onSettled` invalidates.
 */

export function useSubmitRegistration(challengeId: string | undefined, orgId = demoOrgId()) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (args: Omit<sync.SubmitRegistrationArgs, 'orgId' | 'challengeId'>) =>
      sync.submitRegistration({ ...args, orgId, challengeId: challengeId! }),

    onMutate: async (args) => {
      const key = qk.registrations(orgId, challengeId ?? '');
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Registration[]>(key);

      qc.setQueryData<Registration[]>(key, (old = []) => [
        ...old.filter((r) => r.userId !== args.userId),
        {
          id: args.userId ?? 'pending',
          challengeId: challengeId ?? '',
          userId: args.userId ?? 'pending',
          name: args.displayName,
          email: args.email,
          avatarColor: '#4f46e5',
          status: 'pending',
          currentStageKey: 'registration',
          registeredAt: new Date().toISOString().slice(0, 10),
          checkedIn: false,
          answers: args.answers,
        },
      ]);

      return { previous, key };
    },

    onError: (_err, _args, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.previous);
    },

    onSettled: (_data, _err, _args, ctx) => {
      if (ctx) void qc.invalidateQueries({ queryKey: ctx.key });
      // The snapshot is rebuilt by the seed, so it will not reflect this write.
      // Drop it from the cache rather than let a stale copy overwrite the
      // fresh read on the next mount.
      void qc.invalidateQueries({ queryKey: ['org', orgId, 'challenge', challengeId ?? '', 'snapshot'] });
    },
  });
}

export function useSubmitReview(challengeId: string | undefined, orgId = demoOrgId()) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (args: Omit<sync.SubmitReviewArgs, 'orgId' | 'challengeId'>) =>
      sync.submitReview({ ...args, orgId, challengeId: challengeId! }),

    onMutate: async (args) => {
      const key = qk.submissions(orgId, challengeId ?? '');
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Submission[]>(key);

      // Reflect one more review landing on this submission. The score itself
      // is aggregated server-side from the ledger, so it is deliberately left
      // alone here — guessing it would be worse than showing it a moment late.
      qc.setQueryData<Submission[]>(key, (old = []) =>
        old.map((s) =>
          s.id === args.submissionId
            ? { ...s, reviewsDone: Math.min(s.reviewsDone + 1, s.reviewsTotal) }
            : s,
        ),
      );

      return { previous, key };
    },

    onError: (_err, _args, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.previous);
    },

    onSettled: (_data, _err, _args, ctx) => {
      if (ctx) void qc.invalidateQueries({ queryKey: ctx.key });
      void qc.invalidateQueries({ queryKey: ['org', orgId, 'challenge', challengeId ?? '', 'snapshot'] });
    },
  });
}

export function usePublishSchema(orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ schema, userId }: { schema: Parameters<typeof sync.publishSchema>[1]; userId: string | undefined }) =>
      sync.publishSchema(orgId, schema, userId),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.formSchemas(orgId) }),
  });
}

/* ================================================================== *
 * Challenge lifecycle                                                 *
 * ================================================================== */

export function useSaveChallenge(orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, userId, isNew }: {
      input: Omit<Parameters<typeof sync.saveChallenge>[0], 'orgId'>;
      userId: string | undefined;
      isNew: boolean;
    }) => sync.saveChallenge({ ...input, orgId }, userId, isNew),

    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: qk.challenges(orgId) });
      void qc.invalidateQueries({ queryKey: qk.challenge(orgId, vars.input.id) });
      void qc.invalidateQueries({ queryKey: qk.challengeBySlug(orgId, vars.input.slug) });
    },
  });
}

export function useDeleteChallenge(orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ challengeId, userId }: { challengeId: string; userId: string | undefined }) =>
      sync.removeChallenge(orgId, challengeId, userId),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.challenges(orgId) }),
  });
}

export function useSaveRubric(challengeId: string | undefined, orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ criteria, removedIds, userId }: {
      criteria: Parameters<typeof sync.saveRubric>[2];
      removedIds: string[];
      userId: string | undefined;
    }) => sync.saveRubric(orgId, challengeId!, criteria, removedIds, userId),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.rubric(orgId, challengeId ?? '') }),
  });
}

/* ================================================================== *
 * Submissions                                                         *
 * ================================================================== */

export function useSubmitEntry(challengeId: string | undefined, orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Omit<sync.SubmitEntryArgs, 'orgId' | 'challengeId'>) =>
      sync.submitEntry({ ...args, orgId, challengeId: challengeId! }),
    onSettled: (_data, _err, args) => {
      void qc.invalidateQueries({ queryKey: qk.submissions(orgId, challengeId ?? '') });
      void qc.invalidateQueries({ queryKey: qk.challenge(orgId, challengeId ?? '') });
      if (args.userId) {
        void qc.invalidateQueries({ queryKey: qk.notifications(orgId, args.userId) });
        void qc.invalidateQueries({ queryKey: qk.myRegistrations(orgId, args.userId) });
      }
    },
  });
}

/* ================================================================== *
 * Webhooks (configuration half — delivery needs Blaze)                *
 * ================================================================== */

export function useSaveWebhook(orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ hook, userId }: {
      hook: { id: string; url: string; event: string; active: boolean };
      userId: string | undefined;
    }) => sync.saveWebhook(orgId, hook, userId),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.webhooks(orgId) }),
  });
}

export function useDeleteWebhook(orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ webhookId, userId }: { webhookId: string; userId: string | undefined }) =>
      sync.removeWebhook(orgId, webhookId, userId),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.webhooks(orgId) }),
  });
}

/* ================================================================== *
 * Custom roles, check-in and voting                                   *
 * ================================================================== */

export function useSaveRole(orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, userId }: {
      role: { id: string; name: string; description: string; permissions: string[] };
      userId: string | undefined;
    }) => sync.saveRole(orgId, role, userId),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.roles(orgId) });
      // A changed role changes what its holders may do, so every resolved
      // permission set is now suspect.
      void qc.invalidateQueries({ queryKey: qk.members(orgId) });
    },
  });
}

export function useDeleteRole(orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, userId }: { roleId: string; userId: string | undefined }) =>
      sync.removeRole(orgId, roleId, userId),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.roles(orgId) }),
  });
}

export function useCheckIn(challengeId: string | undefined, orgId = demoOrgId()) {
  const qc = useQueryClient();
  const key = qk.registrations(orgId, challengeId ?? '');

  return useMutation({
    mutationFn: ({ registrationId, present, userId }: {
      registrationId: string; present: boolean; userId: string | undefined;
    }) => sync.checkIn(orgId, challengeId!, registrationId, present, userId),

    // Optimistic, because this is used at a door with a queue behind it and a
    // round trip per person is the difference between a working desk and a
    // bottleneck.
    onMutate: async ({ registrationId, present }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Registration[]>(key);
      qc.setQueryData<Registration[]>(key, (old = []) =>
        old.map((r) => (r.id === registrationId ? { ...r, checkedIn: present } : r)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

export function useCastVote(challengeId: string | undefined, orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, voterId }: { submissionId: string; voterId: string | undefined }) =>
      sync.castVote(orgId, challengeId!, submissionId, voterId),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.votes(orgId, challengeId ?? '') }),
  });
}

/* ================================================================== *
 * Organizations                                                       *
 * ================================================================== */

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, user }: {
      input: Parameters<typeof sync.createOrganization>[0];
      user: Parameters<typeof sync.createOrganization>[1];
    }) => sync.createOrganization(input, user),
    // A new org changes which memberships exist, so permissions must re-resolve.
    onSettled: () => void qc.invalidateQueries(),
  });
}

/* ================================================================== *
 * Workspaces                                                          *
 * ================================================================== */

export function useSaveWorkspace(orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workspace, userId, isNew }: {
      workspace: { id: string; name: string; description: string };
      userId: string | undefined;
      isNew: boolean;
    }) => sync.saveWorkspace(orgId, workspace, userId, isNew),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.workspaces(orgId) }),
  });
}

export function useDeleteWorkspace(orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, challengeCount, userId }: {
      workspaceId: string; challengeCount: number; userId: string | undefined;
    }) => sync.removeWorkspace(orgId, workspaceId, challengeCount, userId),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.workspaces(orgId) }),
  });
}

/* ================================================================== *
 * Result publishing                                                   *
 * ================================================================== */

export function usePublishResults(challengeId: string | undefined, orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, userId }: {
      input: Omit<Parameters<typeof sync.publishResults>[0], 'orgId' | 'challengeId'>;
      userId: string | undefined;
    }) => sync.publishResults({ ...input, orgId, challengeId: challengeId! }, userId),

    onSettled: () => {
      // Publishing moves the challenge, the leaderboard and the certificates,
      // so nothing cached about this challenge is still trustworthy.
      void qc.invalidateQueries({ queryKey: qk.challenge(orgId, challengeId ?? '') });
      void qc.invalidateQueries({ queryKey: qk.challenges(orgId) });
      void qc.invalidateQueries({ queryKey: qk.leaderboard(orgId, challengeId ?? '') });
      void qc.invalidateQueries({ queryKey: qk.registrations(orgId, challengeId ?? '') });
      void qc.invalidateQueries({ queryKey: qk.certificates() });
      void qc.invalidateQueries({ queryKey: qk.auditLog(orgId) });
    },
  });
}

/* ================================================================== *
 * Membership                                                          *
 * ================================================================== */

export function useInviteMember(orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, roleId, userId }: { email: string; roleId: string; userId: string | undefined }) =>
      sync.inviteMember(orgId, email, roleId, userId),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.invites(orgId) }),
  });
}

export function useRevokeInvite(orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, userId }: { email: string; userId: string | undefined }) =>
      sync.revokeInvite(orgId, email, userId),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.invites(orgId) }),
  });
}

/* ================================================================== *
 * Notifications                                                       *
 * ================================================================== */

export function useMarkNotificationRead(userId: string | undefined, orgId = demoOrgId()) {
  const qc = useQueryClient();
  const key = qk.notifications(orgId, userId ?? '');

  return useMutation({
    mutationFn: (id: string) => sync.readNotification(orgId, userId!, id),

    // Marking as read must feel instantaneous — the round trip is irrelevant to
    // the user and a spinner on a bell icon would be absurd.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Array<{ id: string; read: boolean }>>(key);
      qc.setQueryData<Array<{ id: string; read: boolean }>>(key, (old = []) =>
        old.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

export function useMarkAllNotificationsRead(userId: string | undefined, orgId = demoOrgId()) {
  const qc = useQueryClient();
  const key = qk.notifications(orgId, userId ?? '');

  return useMutation({
    mutationFn: (ids: string[]) => sync.readAllNotifications(orgId, userId!, ids),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Array<{ id: string; read: boolean }>>(key);
      qc.setQueryData<Array<{ id: string; read: boolean }>>(key, (old = []) =>
        old.map((n) => ({ ...n, read: true })),
      );
      return { previous };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}
