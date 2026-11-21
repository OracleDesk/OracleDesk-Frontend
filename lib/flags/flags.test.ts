import { flags, flag } from './flags';

describe('flags', () => {
  it('returns false for all flags when no env vars are set', () => {
    const f = flags();
    for (const value of Object.values(f)) {
      expect(value).toBe(false);
    }
  });

  it('flag() returns the same value as flags()[name]', () => {
    const f = flags();
    for (const key of Object.keys(f) as (keyof typeof f)[]) {
      expect(flag(key)).toBe(f[key]);
    }
  });
});
