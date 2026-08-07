import {
  GENERATED_SUBTITLE_MAX_TIME_SECONDS,
  GENERATED_SUBTITLE_MIN_DURATION_SECONDS,
  GeneratedSubtitleCue,
  normalizeGeneratedSubtitleCue,
  serializeGeneratedSubtitles,
  updateGeneratedSubtitleCue
} from '../GeneratedSubtitleDocument';

function cue(overrides: Partial<GeneratedSubtitleCue> = {}): GeneratedSubtitleCue {
  return {
    id: 1,
    start: 0,
    end: 1,
    originalText: 'Hello',
    translatedText: '你好',
    ...overrides
  };
}

describe('GeneratedSubtitleDocument', () => {
  describe('normalizeGeneratedSubtitleCue', () => {
    it('enforces non-negative starts and the exact minimum duration', () => {
      const normalized = normalizeGeneratedSubtitleCue(cue({ start: -4, end: 0.01 }));

      expect(normalized.start).toBe(0);
      expect(normalized.end).toBe(GENERATED_SUBTITLE_MIN_DURATION_SECONDS);

      const shifted = normalizeGeneratedSubtitleCue(cue({ start: 2, end: 2 }));
      expect(shifted.end).toBe(2 + GENERATED_SUBTITLE_MIN_DURATION_SECONDS);
    });

    it('uses safe values for non-finite numbers and an index-based ID fallback', () => {
      const normalized = normalizeGeneratedSubtitleCue(cue({
        id: Number.NaN,
        start: Number.POSITIVE_INFINITY,
        end: Number.NEGATIVE_INFINITY
      }), 4);

      expect(normalized).toEqual({
        id: 5,
        start: 0,
        end: GENERATED_SUBTITLE_MIN_DURATION_SECONDS,
        originalText: 'Hello',
        translatedText: '你好'
      });
      expect(normalizeGeneratedSubtitleCue(cue({ id: -3 })).id).toBe(1);
      expect(normalizeGeneratedSubtitleCue(cue({ id: 1.5 }), 2).id).toBe(3);

      const bounded = normalizeGeneratedSubtitleCue(cue({ start: 1e308, end: 1e308 }));
      expect(bounded).toEqual(expect.objectContaining({
        start: GENERATED_SUBTITLE_MAX_TIME_SECONDS - GENERATED_SUBTITLE_MIN_DURATION_SECONDS,
        end: GENERATED_SUBTITLE_MAX_TIME_SECONDS
      }));
      const serialized = serializeGeneratedSubtitles([bounded], 'srt');
      expect(serialized).toContain('99:59:59,949 --> 99:59:59,999');
      expect(serialized).not.toMatch(/Infinity|NaN/);
    });

    it('truncates text at 4000 Unicode code points without splitting surrogate pairs', () => {
      const originalText = `${'😀'.repeat(3999)}AB`;
      const translatedText = `${'文'.repeat(4000)}尾`;
      const normalized = normalizeGeneratedSubtitleCue(cue({ originalText, translatedText }));

      expect(Array.from(normalized.originalText)).toHaveLength(4000);
      expect(normalized.originalText.endsWith('A')).toBe(true);
      expect(normalized.originalText.endsWith('\ud83d')).toBe(false);
      expect(Array.from(normalized.translatedText)).toHaveLength(4000);
      expect(normalized.translatedText.endsWith('文')).toBe(true);
    });
  });

  describe('updateGeneratedSubtitleCue', () => {
    it('applies edits and revalidates timing against the edited start', () => {
      const updated = updateGeneratedSubtitleCue(cue(), {
        start: 3,
        end: 2,
        originalText: 'Edited original',
        translatedText: 'Edited translation'
      });

      expect(updated).toEqual({
        id: 1,
        start: 3,
        end: 3 + GENERATED_SUBTITLE_MIN_DURATION_SECONDS,
        originalText: 'Edited original',
        translatedText: 'Edited translation'
      });
    });

    it('falls back to original numeric values for non-finite patches', () => {
      const original = cue({ id: 8, start: 1.25, end: 2.5 });

      expect(updateGeneratedSubtitleCue(original, {
        id: Number.NaN,
        start: Number.POSITIVE_INFINITY,
        end: Number.NaN
      })).toEqual(original);
    });
  });

  describe('serializeGeneratedSubtitles', () => {
    it('serializes edited cues as exact bilingual SRT in array order', () => {
      const first = updateGeneratedSubtitleCue(cue({ id: 9 }), {
        start: 3661.0044,
        end: 3662.9996,
        originalText: 'First edited',
        translatedText: '第一条'
      });
      const second = cue({ id: 2, start: 0.0495, end: 0.1004, originalText: 'Second', translatedText: '第二条' });

      expect(serializeGeneratedSubtitles([first, second], 'srt')).toBe(
        '1\n01:01:01,004 --> 01:01:03,000\nFirst edited\n第一条\n\n' +
        '2\n00:00:00,050 --> 00:00:00,100\nSecond\n第二条'
      );
    });

    it('serializes exact VTT and omits a translation line when it is empty', () => {
      expect(serializeGeneratedSubtitles([
        cue({ start: 0, end: 1.2345, originalText: 'Only original', translatedText: '' }),
        cue({ start: 61.001, end: 62.002, originalText: 'Bilingual', translatedText: '双语' })
      ], 'vtt')).toBe(
        'WEBVTT\n\n' +
        '00:00:00.000 --> 00:00:01.235\nOnly original\n\n' +
        '00:01:01.001 --> 00:01:02.002\nBilingual\n双语'
      );
      expect(serializeGeneratedSubtitles([], 'vtt')).toBe('WEBVTT\n\n');
    });

    it('is deterministic and does not mutate or reorder its input', () => {
      const cues = [
        cue({ id: 20, start: 5, end: 6, originalText: 'Later' }),
        cue({ id: 10, start: 1, end: 2, originalText: 'Earlier' })
      ];
      const snapshot = JSON.parse(JSON.stringify(cues));

      const first = serializeGeneratedSubtitles(cues, 'srt');
      const second = serializeGeneratedSubtitles(cues, 'srt');

      expect(second).toBe(first);
      expect(cues).toEqual(snapshot);
      expect(first.indexOf('Later')).toBeLessThan(first.indexOf('Earlier'));
    });
  });
});
