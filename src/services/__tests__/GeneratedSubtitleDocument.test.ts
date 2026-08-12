import {
  GENERATED_SUBTITLE_MAX_TIME_SECONDS,
  GENERATED_SUBTITLE_MAX_TEXT_CODE_POINTS,
  GENERATED_SUBTITLE_MIN_DURATION_SECONDS,
  GeneratedSubtitleCue,
  createGeneratedSubtitleTimelineLayout,
  normalizeGeneratedSubtitleCue,
  mergeGeneratedSubtitleCues,
  serializeGeneratedSubtitles,
  shiftGeneratedSubtitleCues,
  splitGeneratedSubtitleCue,
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

  describe('local timeline editing', () => {
    it('shifts all cues together while clamping the entire timeline to valid bounds', () => {
      const shifted = shiftGeneratedSubtitleCues([
        cue({ id: 4, start: 2, end: 3 }),
        cue({ id: 5, start: 5, end: 6 })
      ], -10);

      expect(shifted.map(item => [item.start, item.end])).toEqual([[0, 1], [3, 4]]);
      expect(shiftGeneratedSubtitleCues([cue({ start: 1, end: 2 })], 1.5)[0]).toEqual(
        expect.objectContaining({ start: 2.5, end: 3.5 })
      );
    });

    it('splits a cue at a Unicode-safe text position and distributes translation timing', () => {
      const result = splitGeneratedSubtitleCue(cue({ start: 2, end: 12, originalText: 'Hello world', translatedText: '你好世界' }), 5);

      expect(result).not.toBeNull();
      expect(result?.[0]).toEqual(expect.objectContaining({
        start: 2,
        originalText: 'Hello',
        translatedText: '你好'
      }));
      expect(result?.[0].end).toBeCloseTo(2 + (10 * 5 / 11), 12);
      expect(result?.[1]).toEqual(expect.objectContaining({
        end: 12,
        originalText: ' world',
        translatedText: '世界'
      }));
      expect(result?.[1].start).toBeCloseTo(2 + (10 * 5 / 11), 12);
      expect(splitGeneratedSubtitleCue(cue({ originalText: 'x' }), 1)).toBeNull();
    });

    it('merges adjacent cues without losing either text field', () => {
      expect(mergeGeneratedSubtitleCues(
        cue({ id: 7, start: 3, end: 4, originalText: 'first', translatedText: '一' }),
        cue({ id: 8, start: 4.2, end: 6, originalText: 'second', translatedText: '二' })
      )).toEqual({
        id: 7,
        start: 3,
        end: 6,
        originalText: 'first\nsecond',
        translatedText: '一\n二'
      });

      expect(mergeGeneratedSubtitleCues(
        cue({ originalText: 'x'.repeat(GENERATED_SUBTITLE_MAX_TEXT_CODE_POINTS) }),
        cue({ originalText: 'cannot-fit' })
      )).toBeNull();
    });

    it('creates deterministic proportional timeline items and marks overlaps', () => {
      const layout = createGeneratedSubtitleTimelineLayout([
        cue({ id: 3, start: 4, end: 8, originalText: 'third' }),
        cue({ id: 1, start: 0, end: 3, originalText: 'first' }),
        cue({ id: 2, start: 2, end: 5, originalText: 'second' })
      ]);

      expect(layout.duration).toBe(8);
      expect(layout.laneCount).toBe(2);
      expect(layout.items.map(item => item.id)).toEqual([1, 2, 3]);
      expect(layout.items).toEqual([
        expect.objectContaining({ cueIndex: 1, leftPercent: 0, widthPercent: 37.5, overlapsPrevious: false, lane: 0 }),
        expect.objectContaining({ cueIndex: 2, leftPercent: 25, widthPercent: 37.5, overlapsPrevious: true, lane: 1 }),
        expect.objectContaining({ cueIndex: 0, leftPercent: 50, widthPercent: 50, overlapsPrevious: true, lane: 0 })
      ]);
      expect(createGeneratedSubtitleTimelineLayout([])).toEqual({ duration: 0, laneCount: 0, items: [] });

      const tripleOverlap = createGeneratedSubtitleTimelineLayout([
        cue({ id: 1, start: 0, end: 4 }),
        cue({ id: 2, start: 1, end: 3 }),
        cue({ id: 3, start: 2, end: 5 })
      ]);
      expect(tripleOverlap.laneCount).toBe(3);
      expect(tripleOverlap.items.map(item => item.lane)).toEqual([0, 1, 2]);
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
