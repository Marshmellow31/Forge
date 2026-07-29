import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug, newChallengeId, newCriterionId, DEFAULT_STAGES } from './slug';

describe('slugify', () => {
  it.each([
    ['Monsoon Photo Challenge', 'monsoon-photo-challenge'],
    ['  Trimmed  ', 'trimmed'],
    ['Already-slugged', 'already-slugged'],
    ['Symbols!@#$%^&*()', 'symbols'],
    ['Multiple   spaces', 'multiple-spaces'],
    ['Café Crawl', 'cafe-crawl'],
    ['2026 Hack Week', '2026-hack-week'],
    ['--leading and trailing--', 'leading-and-trailing'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('is idempotent', () => {
    const once = slugify('Monsoon Photo Challenge!');
    expect(slugify(once)).toBe(once);
  });

  it('returns empty for input with nothing slug-worthy', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('')).toBe('');
  });

  it('caps length without leaving a trailing hyphen', () => {
    const slug = slugify('a'.repeat(40) + ' ' + 'b'.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('returns the plain slug when it is free', () => {
    expect(uniqueSlug('Monsoon Photo', [])).toBe('monsoon-photo');
  });

  it('suffixes readably on a collision rather than randomising', () => {
    expect(uniqueSlug('Monsoon Photo', ['monsoon-photo'])).toBe('monsoon-photo-2');
    expect(uniqueSlug('Monsoon Photo', ['monsoon-photo', 'monsoon-photo-2'])).toBe('monsoon-photo-3');
  });

  it('falls back to a usable slug when the title has no letters', () => {
    expect(uniqueSlug('###', [])).toBe('challenge');
  });

  it('is deterministic for the same inputs', () => {
    const taken = ['monsoon-photo'];
    expect(uniqueSlug('Monsoon Photo', taken)).toBe(uniqueSlug('Monsoon Photo', taken));
  });
});

describe('id generation', () => {
  it('produces a legible, prefixed challenge id', () => {
    const id = newChallengeId('Monsoon Photo Challenge');
    expect(id).toMatch(/^ch_monsoon-photo-challenge_[a-z0-9]{5}$/);
  });

  it('does not collide across calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newChallengeId('Same Title')));
    expect(ids.size).toBeGreaterThan(190);
  });

  it('produces a prefixed criterion id', () => {
    expect(newCriterionId('Technical merit')).toMatch(/^cr_technical-merit_[a-z0-9]{4}$/);
  });

  it('never produces an empty id segment for a symbol-only name', () => {
    expect(newChallengeId('###')).toMatch(/^ch_challenge_/);
    expect(newCriterionId('###')).toMatch(/^cr_criterion_/);
  });
});

describe('DEFAULT_STAGES', () => {
  it('ships the simple workflow as data, not as hardcoded logic', () => {
    expect(DEFAULT_STAGES.map((s) => s.key)).toEqual(['registration', 'submission', 'judging', 'results']);
  });

  it('starts with exactly one active stage and locks the rest', () => {
    expect(DEFAULT_STAGES.filter((s) => s.state === 'active')).toHaveLength(1);
    expect(DEFAULT_STAGES[0].state).toBe('active');
    expect(DEFAULT_STAGES.slice(1).every((s) => s.state === 'locked')).toBe(true);
  });

  it('has unique stage keys, since answers and submissions are keyed by them', () => {
    expect(new Set(DEFAULT_STAGES.map((s) => s.key)).size).toBe(DEFAULT_STAGES.length);
  });
});
