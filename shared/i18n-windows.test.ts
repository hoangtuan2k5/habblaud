import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('fixes the Windows edition to Vietnamese despite an English browser and saved preference', async () => {
  vi.resetModules();
  vi.stubGlobal('__HABBLAUD_VI_ONLY__', true);
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { languages: ['en-US'] });
  vi.stubGlobal('localStorage', { getItem: () => 'en' });
  const { getLocale, VI_ONLY, tr } = await import('./i18n');
  expect(VI_ONLY).toBe(true);
  expect(getLocale()).toBe('vi');
  expect(tr('Configurações')).toBe('Cài đặt');
});
