import { expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectKeys } from '../../scripts/i18n-check';
import { VI } from '../../shared/locales/vi';

it('covers every active translation key in Vietnamese without stale keys', () => {
  expect(Object.keys(VI).sort()).toEqual([...collectKeys().keys()].sort());
}, 20_000);

it('collects multiline keys with JavaScript newline normalization on Windows', () => {
  const root = mkdtempSync(join(tmpdir(), 'habblaud-i18n-'));
  try {
    for (const dir of ['client/src', 'shared', 'server', 'scripts']) mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, 'scripts/help.ts'), 'tr(`first\r\nsecond\rthird`);');
    expect([...collectKeys(root).keys()]).toEqual(['first\nsecond\nthird']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
