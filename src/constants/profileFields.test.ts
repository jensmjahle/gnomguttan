import { describe, expect, it } from 'vitest';
import { PROFILE_FIELDS, formatFieldValue } from './profileFields';

const field = (key: string) => PROFILE_FIELDS.find((def) => def.key === key)!;

describe('formatFieldValue', () => {
  it('adds units with a Norwegian decimal comma', () => {
    expect(formatFieldValue(field('weight'), '82.5')).toBe('82,5 kg');
    expect(formatFieldValue(field('height'), '170')).toBe('170 cm');
  });

  it('shows option labels and plain text as-is', () => {
    expect(formatFieldValue(field('gender'), 'female')).toBe('Kvinne');
    expect(formatFieldValue(field('work_relationship'), 'Student')).toBe('Student');
    expect(formatFieldValue(field('marital_status'), 'Samboer')).toBe('Samboer');
  });
});
