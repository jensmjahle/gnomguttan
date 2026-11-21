import { describe, expect, it } from 'vitest';
import { CATEGORY_TYPES, visibleTypesParam, type FeedCategory } from './feedFilterStore';

const allOn = Object.fromEntries(Object.keys(CATEGORY_TYPES).map((category) => [category, true])) as Record<FeedCategory, boolean>;

describe('visibleTypesParam (sent to GET /feed?types=)', () => {
  it('lists every visible type, sorted, so the value is stable', () => {
    const param = visibleTypesParam(allOn).split(',');
    expect(param).toEqual([...param].sort());
    expect(param).toContain('statusrapport_created');
    expect(param).toContain('github_pr_merged');
  });

  it('drops the types of a disabled category', () => {
    const param = visibleTypesParam({ ...allOn, github_prs: false }).split(',');
    expect(param.some((type) => type.startsWith('github_pr_'))).toBe(false);
    expect(param).toContain('github_issue_opened');
  });

  it('is empty when everything is filtered away', () => {
    const allOff = Object.fromEntries(Object.keys(allOn).map((category) => [category, false])) as Record<FeedCategory, boolean>;
    expect(visibleTypesParam(allOff)).toBe('');
  });
});
