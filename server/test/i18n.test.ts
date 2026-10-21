import { expect, it } from 'vitest';
import { collectKeys } from '../../scripts/i18n-check';
import { VI } from '../../shared/locales/vi';

it('covers every active translation key in Vietnamese without stale keys', () => {
  expect(Object.keys(VI).sort()).toEqual([...collectKeys().keys()].sort());
});
