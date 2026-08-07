export interface GeneratedSubtitleCue {
  id: number;
  start: number;
  end: number;
  originalText: string;
  translatedText: string;
}

export interface GeneratedSubtitleCuePatch {
  id?: number;
  start?: number;
  end?: number;
  originalText?: string;
  translatedText?: string;
}

export const GENERATED_SUBTITLE_MIN_DURATION_SECONDS = 0.05;
export const GENERATED_SUBTITLE_MAX_TIME_SECONDS = 359999.999;

const GENERATED_SUBTITLE_MAX_TEXT_CODE_POINTS = 4000;

function fallbackCueId(index?: number): number {
  return typeof index === 'number' && Number.isSafeInteger(index) && index >= 0
    ? index + 1
    : 1;
}

function normalizeCueId(id: number, index?: number): number {
  return Number.isSafeInteger(id) && id > 0 ? id : fallbackCueId(index);
}

function normalizeText(text: string): string {
  const codePoints = Array.from(typeof text === 'string' ? text : '');
  return codePoints.length <= GENERATED_SUBTITLE_MAX_TEXT_CODE_POINTS
    ? codePoints.join('')
    : codePoints.slice(0, GENERATED_SUBTITLE_MAX_TEXT_CODE_POINTS).join('');
}

export function normalizeGeneratedSubtitleCue(
  cue: GeneratedSubtitleCue,
  index?: number
): GeneratedSubtitleCue {
  const maximumStart = GENERATED_SUBTITLE_MAX_TIME_SECONDS
    - GENERATED_SUBTITLE_MIN_DURATION_SECONDS;
  const start = Number.isFinite(cue.start)
    ? Math.min(maximumStart, Math.max(0, cue.start))
    : 0;
  const minimumEnd = start + GENERATED_SUBTITLE_MIN_DURATION_SECONDS;
  const end = Number.isFinite(cue.end)
    ? Math.min(GENERATED_SUBTITLE_MAX_TIME_SECONDS, Math.max(cue.end, minimumEnd))
    : minimumEnd;

  return {
    id: normalizeCueId(cue.id, index),
    start,
    end,
    originalText: normalizeText(cue.originalText),
    translatedText: normalizeText(cue.translatedText)
  };
}

export function updateGeneratedSubtitleCue(
  cue: GeneratedSubtitleCue,
  patch: GeneratedSubtitleCuePatch
): GeneratedSubtitleCue {
  const current = normalizeGeneratedSubtitleCue(cue);
  const id = patch.id === undefined || !Number.isFinite(patch.id) ? current.id : patch.id;
  const start = patch.start === undefined || !Number.isFinite(patch.start)
    ? current.start
    : patch.start;
  const end = patch.end === undefined || !Number.isFinite(patch.end)
    ? current.end
    : patch.end;

  return normalizeGeneratedSubtitleCue({
    id: Number.isSafeInteger(id) && id > 0 ? id : current.id,
    start,
    end,
    originalText: patch.originalText === undefined ? current.originalText : patch.originalText,
    translatedText: patch.translatedText === undefined ? current.translatedText : patch.translatedText
  });
}

function formatTimestamp(secondsValue: number, separator: ',' | '.'): string {
  const boundedSeconds = Number.isFinite(secondsValue)
    ? Math.min(GENERATED_SUBTITLE_MAX_TIME_SECONDS, Math.max(0, secondsValue))
    : 0;
  const totalMilliseconds = Math.round(boundedSeconds * 1000);
  const milliseconds = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const pad = (value: number, length: number): string => String(value).padStart(length, '0');

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}${separator}${pad(milliseconds, 3)}`;
}

function serializeCueText(cue: GeneratedSubtitleCue): string[] {
  return cue.translatedText.length > 0
    ? [cue.originalText, cue.translatedText]
    : [cue.originalText];
}

export function serializeGeneratedSubtitles(
  cues: readonly GeneratedSubtitleCue[],
  format: 'srt' | 'vtt'
): string {
  const normalizedCues = cues.map((cue, index) => normalizeGeneratedSubtitleCue(cue, index));

  if (format === 'srt') {
    return normalizedCues.map((cue, index) => [
      String(index + 1),
      `${formatTimestamp(cue.start, ',')} --> ${formatTimestamp(cue.end, ',')}`,
      ...serializeCueText(cue)
    ].join('\n')).join('\n\n');
  }

  const body = normalizedCues.map(cue => [
    `${formatTimestamp(cue.start, '.')} --> ${formatTimestamp(cue.end, '.')}`,
    ...serializeCueText(cue)
  ].join('\n')).join('\n\n');

  return `WEBVTT\n\n${body}`;
}
