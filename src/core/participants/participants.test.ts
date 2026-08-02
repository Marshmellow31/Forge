import { describe, it, expect } from 'vitest';
import {
  filterRoster, summarizeRoster, entriesForUser, PARTICIPANT_STATUSES, STATUS_MEANING,
} from './index';
import type { ParticipantEntry, ParticipantStatus } from '@shared/types/domain';

/**
 * The admin roster's filtering and counting.
 *
 * Pure and I/O-free, so this needs no emulator and no Firebase project — which
 * is the point of keeping the logic out of the screen.
 */

let seq = 0;
function entry(over: Partial<ParticipantEntry> = {}): ParticipantEntry {
  seq += 1;
  return {
    id: `r_${seq}`,
    challengeId: 'ch_1',
    challengeTitle: 'Milky Way',
    userId: `u_${seq}`,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    avatarColor: '#f00',
    status: 'active',
    currentStageKey: 'submission',
    teamName: null,
    registeredAt: '2026-07-01',
    checkedIn: false,
    answers: {},
    ...over,
  };
}

describe('filterRoster', () => {
  it('returns everything when no filter is applied', () => {
    const rows = [entry(), entry(), entry()];
    expect(filterRoster(rows)).toHaveLength(3);
    expect(filterRoster(rows, {})).toHaveLength(3);
  });

  it('matches name, email, team and challenge, case-insensitively', () => {
    const rows = [
      entry({ name: 'Grace Hopper' }),
      entry({ email: 'katherine@nasa.gov' }),
      entry({ teamName: 'Night Owls' }),
      entry({ challengeTitle: 'Best Landscape' }),
      entry({ name: 'Nobody' }),
    ];
    expect(filterRoster(rows, { search: 'GRACE' })).toHaveLength(1);
    expect(filterRoster(rows, { search: 'nasa.gov' })).toHaveLength(1);
    expect(filterRoster(rows, { search: 'night owls' })).toHaveLength(1);
    expect(filterRoster(rows, { search: 'landscape' })).toHaveLength(1);
  });

  it('ignores surrounding whitespace in the search, which a paste brings with it', () => {
    const rows = [entry({ name: 'Grace Hopper' }), entry({ name: 'Ada' })];
    expect(filterRoster(rows, { search: '  grace \n' })).toHaveLength(1);
  });

  it('scopes to one challenge', () => {
    const rows = [entry({ challengeId: 'ch_1' }), entry({ challengeId: 'ch_2' })];
    expect(filterRoster(rows, { challengeId: 'ch_2' })).toHaveLength(1);
    expect(filterRoster(rows, { challengeId: null })).toHaveLength(2);
  });

  it('treats an empty status set as "no filter" rather than "match nothing"', () => {
    // Clearing the last chip must not empty the screen — that reads as a bug.
    const rows = [entry({ status: 'active' }), entry({ status: 'withdrawn' })];
    expect(filterRoster(rows, { statuses: new Set() })).toHaveLength(2);
  });

  it('filters by a set of statuses', () => {
    const rows = [
      entry({ status: 'active' }),
      entry({ status: 'withdrawn' }),
      entry({ status: 'disqualified' }),
    ];
    const out = filterRoster(rows, {
      statuses: new Set<ParticipantStatus>(['withdrawn', 'disqualified']),
    });
    expect(out.map((r) => r.status).sort()).toEqual(['disqualified', 'withdrawn']);
  });

  it('keeps withdrawn and disqualified distinct, which the participant view does not', () => {
    const rows = [entry({ status: 'withdrawn' }), entry({ status: 'disqualified' })];
    expect(filterRoster(rows, { statuses: new Set<ParticipantStatus>(['withdrawn']) }))
      .toHaveLength(1);
  });

  it('filters by check-in either way, and not at all when null', () => {
    const rows = [entry({ checkedIn: true }), entry({ checkedIn: false })];
    expect(filterRoster(rows, { checkedIn: true })).toHaveLength(1);
    expect(filterRoster(rows, { checkedIn: false })).toHaveLength(1);
    expect(filterRoster(rows, { checkedIn: null })).toHaveLength(2);
  });

  it('applies every filter together, not the last one that matched', () => {
    const rows = [
      entry({ name: 'Grace', challengeId: 'ch_1', status: 'active', checkedIn: true }),
      entry({ name: 'Grace', challengeId: 'ch_2', status: 'active', checkedIn: true }),
      entry({ name: 'Grace', challengeId: 'ch_1', status: 'withdrawn', checkedIn: true }),
    ];
    const out = filterRoster(rows, {
      search: 'grace',
      challengeId: 'ch_1',
      statuses: new Set<ParticipantStatus>(['active']),
      checkedIn: true,
    });
    expect(out).toHaveLength(1);
  });
});

describe('summarizeRoster', () => {
  it('counts entries and people separately, because they differ', () => {
    const rows = [
      entry({ userId: 'u_a', challengeId: 'ch_1' }),
      entry({ userId: 'u_a', challengeId: 'ch_2' }),
      entry({ userId: 'u_b', challengeId: 'ch_1' }),
    ];
    const summary = summarizeRoster(rows);
    expect(summary.entries).toBe(3);
    expect(summary.people).toBe(2);
  });

  it('counts check-ins', () => {
    const summary = summarizeRoster([
      entry({ checkedIn: true }), entry({ checkedIn: true }), entry({ checkedIn: false }),
    ]);
    expect(summary.checkedIn).toBe(2);
  });

  it('reports zero for statuses nobody holds rather than omitting them', () => {
    const summary = summarizeRoster([entry({ status: 'active' })]);
    expect(summary.byStatus.active).toBe(1);
    expect(summary.byStatus.disqualified).toBe(0);
    // Every catalog status has a key, so a tile never renders `undefined`.
    for (const status of PARTICIPANT_STATUSES) {
      expect(typeof summary.byStatus[status]).toBe('number');
    }
  });

  it('handles an empty roster', () => {
    const summary = summarizeRoster([]);
    expect(summary).toMatchObject({ entries: 0, people: 0, checkedIn: 0 });
  });
});

describe('entriesForUser', () => {
  it('returns only that account, newest first', () => {
    const rows = [
      entry({ userId: 'u_a', registeredAt: '2026-01-01', challengeTitle: 'Older' }),
      entry({ userId: 'u_b', registeredAt: '2026-06-01' }),
      entry({ userId: 'u_a', registeredAt: '2026-05-01', challengeTitle: 'Newer' }),
    ];
    const out = entriesForUser(rows, 'u_a');
    expect(out).toHaveLength(2);
    expect(out[0].challengeTitle).toBe('Newer');
  });

  it('returns nothing for an unknown account instead of throwing', () => {
    expect(entriesForUser([entry()], 'u_nobody')).toEqual([]);
  });
});

describe('the status catalog', () => {
  it('explains every status it lists', () => {
    for (const status of PARTICIPANT_STATUSES) {
      expect(STATUS_MEANING[status]).toBeTruthy();
    }
  });
});
