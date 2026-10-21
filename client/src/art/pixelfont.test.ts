import { expect, it } from 'vitest';
import { pixelText, pixelTextWidth } from './pixelfont';

it('renders Vietnamese letters, stacked tones and decomposed Unicode consistently', () => {
  const paint = (text: string) => {
    const pixels: number[][] = [];
    const ctx = { fillStyle: '', fillRect: (...p: number[]) => pixels.push(p) } as unknown as CanvasRenderingContext2D;
    pixelText(ctx, text, 0, 10, '#fff');
    return pixels;
  };
  for (const [letter, base] of [['đ', 'd'], ['ă', 'a'], ['ơ', 'o'], ['ư', 'u'], ['ạ', 'a'], ['ả', 'a'], ['ấ', 'a'], ['ễ', 'e']]) {
    expect(paint(letter).length).toBeGreaterThan(paint(base).length);
    expect(paint(letter.normalize('NFD'))).toEqual(paint(letter));
  }
  expect(pixelTextWidth('Tiếng Việt'.normalize('NFD'))).toBe(pixelTextWidth('Tiếng Việt'));
});
