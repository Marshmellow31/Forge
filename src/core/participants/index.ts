import type { ParticipantEntry, ParticipantStatus } from '@shared/types/domain';

/**
 * Roster filtering and counting, as pure functions.
 *
 * The admin console's list is the one screen where "why is this person not
 * showing up" is a question with real consequences, so the logic that decides
 * it lives here — no React, no Firebase, unit-testable in isolation, the same
 * contract hard rule 8 puts on the four engines.
 */

/** Every status a registration can hold, in the order a console should list them. */
export const PARTICIPANT_STATUSES = [
  'pending', 'active', 'winner', 'eliminated', 'withdrawn', 'disqualified',
] as const satisfies readonly ParticipantStatus[];

/**
 * What each status means, in the words the person setting it needs.
 *
 * `withdrawn` and `disqualified` are both "no longer competing" and they are
 * kept apart on purpose: one is the participant's decision and the other is
 * yours, and a roster that cannot tell them apart cannot answer the only
 * question anyone ever asks about a removed entry.
 */
export const STATUS_MEANING: Record<ParticipantStatus, string> = {
  pending: 'Registered, not yet accepted into the competition.',
  active: 'Competing now.',
  winner: 'Placed. Set by publishing results, or by hand here.',
  eliminated: 'Did not advance past a stage.',
  withdrawn: 'Left of their own accord.',
  disqualified: 'Removed by an organizer, on the record.',
};

export interface RosterFilter {
  /** Matched against name, email and team, case-insensitively. */
  search?: string;
  /** A single challenge, or `null` for all of them. */
  challengeId?: string | null;
  /** An empty set means "every status" rather than "no statuses". */
  statuses?: ReadonlySet<ParticipantStatus>;
  /** `null` for "either". */
  checkedIn?: boolean | null;
}

/** Case- and whitespace-insensitive containment, the way a person means it. */
const matches = (haystack: string | null, needle: string) =>
  (haystack ?? '').toLowerCase().includes(needle);

export function filterRoster(
  entries: readonly ParticipantEntry[],
  filter: RosterFilter = {},
): ParticipantEntry[] {
  const search = (filter.search ?? '').trim().toLowerCase();
  const { challengeId = null, statuses, checkedIn = null } = filter;

  return entries.filter((e) => {
    if (challengeId && e.challengeId !== challengeId) return false;
    // An empty set reads as "no filter applied", not "match nothing" — the
    // opposite reading empties the screen the moment someone clears the last
    // chip, which looks like a bug rather than a filter.
    if (statuses && statuses.size > 0 && !statuses.has(e.status)) return false;
    if (checkedIn !== null && e.checkedIn !== checkedIn) return false;
    if (!search) return true;
    return matches(e.name, search)
      || matches(e.email, search)
      || matches(e.teamName, search)
      || matches(e.challengeTitle, search);
  });
}

export interface RosterSummary {
  /** Rows — one per registration, so someone in two challenges counts twice. */
  entries: number;
  /** Distinct accounts, which is the number a person means by "participants". */
  people: number;
  checkedIn: number;
  byStatus: Record<ParticipantStatus, number>;
}

/**
 * The counts above the table.
 *
 * `entries` and `people` are both reported because they answer different
 * questions and are routinely different numbers: 40 entries across 3 challenges
 * may be 22 people. Showing only one of them guarantees somebody quotes the
 * wrong one in a report.
 */
export function summarizeRoster(entries: readonly ParticipantEntry[]): RosterSummary {
  const byStatus = Object.fromEntries(
    PARTICIPANT_STATUSES.map((s) => [s, 0]),
  ) as Record<ParticipantStatus, number>;

  const people = new Set<string>();
  let checkedIn = 0;

  for (const e of entries) {
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    people.add(e.userId);
    if (e.checkedIn) checkedIn += 1;
  }

  return { entries: entries.length, people: people.size, checkedIn, byStatus };
}

/**
 * Every registration held by one account, newest first.
 *
 * The console's detail view is per *person*, not per row: an admin who opens
 * someone wants their whole history in this organization, not the one entry
 * that happened to be clicked.
 */
export function entriesForUser(
  entries: readonly ParticipantEntry[],
  userId: string,
): ParticipantEntry[] {
  return entries
    .filter((e) => e.userId === userId)
    .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
}
