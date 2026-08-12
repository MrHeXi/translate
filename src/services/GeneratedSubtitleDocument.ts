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

export interface GeneratedSubtitleTimelineItem {
  cueIndex: number;
  id: number;
  start: number;
  end: number;
  leftPercent: number;
  widthPercent: number;
  overlapsPrevious: boolean;
  lane: number;
}

export interface GeneratedSubtitleTimelineLayout {
  duration: number;
  laneCount: number;
  items: GeneratedSubtitleTimelineItem[];
}

export const GENERATED_SUBTITLE_MIN_DURATION_SECONDS = 0.05;
export const GENERATED_SUBTITLE_MAX_TIME_SECONDS = 359999.999;

export const GENERATED_SUBTITLE_MAX_TEXT_CODE_POINTS = 4000;

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

export function shiftGeneratedSubtitleCues(
  cues: readonly GeneratedSubtitleCue[],
  offsetSeconds: number
): GeneratedSubtitleCue[] {
  if (!Number.isFinite(offsetSeconds)) return cues.map((cue, index) => normalizeGeneratedSubtitleCue(cue, index));
  const normalized = cues.map((cue, index) => normalizeGeneratedSubtitleCue(cue, index));
  if (normalized.length === 0) return [];
  const earliestStart = normalized.reduce(
    (minimum, cue) => Math.min(minimum, cue.start),
    Number.POSITIVE_INFINITY
  );
  const latestEnd = normalized.reduce(
    (maximum, cue) => Math.max(maximum, cue.end),
    0
  );
  const boundedOffset = Math.max(
    -Math.max(0, earliestStart),
    Math.min(GENERATED_SUBTITLE_MAX_TIME_SECONDS - latestEnd, offsetSeconds)
  );

  return normalized.map(cue => normalizeGeneratedSubtitleCue({
    ...cue,
    start: cue.start + boundedOffset,
    end: cue.end + boundedOffset
  }));
}

export function splitGeneratedSubtitleCue(
  cue: GeneratedSubtitleCue,
  originalTextIndex: number
): [GeneratedSubtitleCue, GeneratedSubtitleCue] | null {
  const normalized = normalizeGeneratedSubtitleCue(cue);
  const originalCodePoints = Array.from(normalized.originalText);
  if (originalCodePoints.length < 2 || !Number.isInteger(originalTextIndex)) return null;
  const splitIndex = Math.max(1, Math.min(originalCodePoints.length - 1, originalTextIndex));
  const splitRatio = splitIndex / originalCodePoints.length;
  const duration = normalized.end - normalized.start;
  if (duration < GENERATED_SUBTITLE_MIN_DURATION_SECONDS * 2) return null;

  const splitTime = Math.min(
    normalized.end - GENERATED_SUBTITLE_MIN_DURATION_SECONDS,
    Math.max(normalized.start + GENERATED_SUBTITLE_MIN_DURATION_SECONDS, normalized.start + duration * splitRatio)
  );
  const translatedCodePoints = Array.from(normalized.translatedText);
  const translatedSplitIndex = translatedCodePoints.length === 0
    ? 0
    : Math.max(1, Math.min(
      translatedCodePoints.length - 1,
      Math.round(translatedCodePoints.length * splitRatio)
    ));
  const first = normalizeGeneratedSubtitleCue({
    ...normalized,
    end: splitTime,
    originalText: originalCodePoints.slice(0, splitIndex).join(''),
    translatedText: translatedCodePoints.slice(0, translatedSplitIndex).join('')
  });
  const second = normalizeGeneratedSubtitleCue({
    ...normalized,
    id: normalized.id + 1,
    start: splitTime,
    originalText: originalCodePoints.slice(splitIndex).join(''),
    translatedText: translatedCodePoints.slice(translatedSplitIndex).join('')
  });
  return [first, second];
}

export function mergeGeneratedSubtitleCues(
  firstCue: GeneratedSubtitleCue,
  secondCue: GeneratedSubtitleCue
): GeneratedSubtitleCue | null {
  const first = normalizeGeneratedSubtitleCue(firstCue);
  const second = normalizeGeneratedSubtitleCue(secondCue);
  const joinText = (left: string, right: string): string => {
    if (!left) return right;
    if (!right) return left;
    return `${left}\n${right}`;
  };
  const originalText = joinText(first.originalText, second.originalText);
  const translatedText = joinText(first.translatedText, second.translatedText);
  if (
    Array.from(originalText).length > GENERATED_SUBTITLE_MAX_TEXT_CODE_POINTS
    || Array.from(translatedText).length > GENERATED_SUBTITLE_MAX_TEXT_CODE_POINTS
  ) return null;
  return normalizeGeneratedSubtitleCue({
    id: first.id,
    start: Math.min(first.start, second.start),
    end: Math.max(first.end, second.end),
    originalText,
    translatedText
  });
}

export function createGeneratedSubtitleTimelineLayout(
  cues: readonly GeneratedSubtitleCue[]
): GeneratedSubtitleTimelineLayout {
  const ordered = cues
    .map((cue, cueIndex) => ({ cue: normalizeGeneratedSubtitleCue(cue, cueIndex), cueIndex }))
    .sort((left, right) => left.cue.start - right.cue.start || left.cue.end - right.cue.end);
  const duration = ordered.reduce((maximum, item) => Math.max(maximum, item.cue.end), 0);
  let latestEnd = 0;
  const laneEnds: number[] = [];
  const items = ordered.map(({ cue, cueIndex }) => {
    const overlapsPrevious = cue.start < latestEnd;
    latestEnd = Math.max(latestEnd, cue.end);
    let lane = laneEnds.findIndex(laneEnd => laneEnd <= cue.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = cue.end;
    return {
      cueIndex,
      id: cue.id,
      start: cue.start,
      end: cue.end,
      leftPercent: duration > 0 ? (cue.start / duration) * 100 : 0,
      widthPercent: duration > 0 ? ((cue.end - cue.start) / duration) * 100 : 100,
      overlapsPrevious,
      lane
    };
  });
  return { duration, laneCount: laneEnds.length, items };
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
