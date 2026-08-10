export type LiveCaptionTranscriptFormat = 'txt' | 'srt' | 'vtt' | 'json';

export interface LiveCaptionTranscriptCue {
  id: number;
  startTimeMs: number;
  endTimeMs: number;
  source: string;
  speaker?: string;
  originalText: string;
  translatedText: string;
}

export interface LiveCaptionTranscriptSnapshot {
  sessionStartedAt: string | null;
  capturedAt: string;
  cueCount: number;
  truncated: boolean;
  droppedCueCount: number;
  cues: LiveCaptionTranscriptCue[];
}

export interface LiveCaptionTranscriptSourceSnapshot extends LiveCaptionTranscriptSnapshot {
  sourceUrl: string;
  sourceTitle: string;
  sourceHost: string;
  message: string;
}

export const renderLiveCaptionTranscript = (
  snapshot: Pick<LiveCaptionTranscriptSnapshot, 'sessionStartedAt' | 'cues'>,
  format: LiveCaptionTranscriptFormat,
  exportedAt: string = new Date().toISOString()
): string => {
  const cues = snapshot.cues;
  if (cues.length === 0) return '';

  if (format === 'json') {
    return JSON.stringify({
      sessionStartedAt: snapshot.sessionStartedAt,
      exportedAt,
      cueCount: cues.length,
      cues
    }, null, 2);
  }

  if (format === 'srt' || format === 'vtt') {
    const cueText = cues.map((cue, index) => [
      format === 'srt' ? String(index + 1) : undefined,
      `${formatTranscriptTime(cue.startTimeMs, format)} --> ${formatTranscriptTime(cue.endTimeMs, format)}`,
      formatSpeakerLine(cue.speaker, cue.originalText),
      cue.translatedText ? formatSpeakerLine(cue.speaker, cue.translatedText) : undefined
    ].filter(Boolean).join('\n')).join('\n\n');

    return format === 'vtt' ? `WEBVTT\n\n${cueText}\n` : `${cueText}\n`;
  }

  const header = [
    'LexiBridge live caption transcript',
    `Started: ${snapshot.sessionStartedAt || 'Unknown'}`,
    `Cues: ${cues.length}`
  ].join('\n');
  const cueText = cues.map(cue => [
    `[${formatTranscriptTime(cue.startTimeMs, 'vtt')}] ${cue.speaker || 'Unknown speaker'} (${cue.source})`,
    `Original: ${cue.originalText}`,
    cue.translatedText ? `Translation: ${cue.translatedText}` : 'Translation: unavailable'
  ].join('\n')).join('\n\n');

  return `${header}\n\n${cueText}\n`;
};

export const createLiveCaptionTranscriptFilename = (
  sourceTitle: string,
  format: LiveCaptionTranscriptFormat
): string => {
  const baseName = (sourceTitle || 'meeting')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'meeting';

  return `${baseName}-lexibridge-live-captions.${format}`;
};

export const getLiveCaptionTranscriptMimeType = (format: LiveCaptionTranscriptFormat): string => {
  if (format === 'json') return 'application/json;charset=utf-8';
  if (format === 'srt') return 'application/x-subrip;charset=utf-8';
  if (format === 'vtt') return 'text/vtt;charset=utf-8';
  return 'text/plain;charset=utf-8';
};

const formatSpeakerLine = (speaker: string | undefined, text: string): string => (
  speaker ? `${speaker}: ${text}` : text
);

const formatTranscriptTime = (timeMs: number, format: 'srt' | 'vtt'): string => {
  const safeTimeMs = Math.max(0, Math.round(timeMs));
  const hours = Math.floor(safeTimeMs / 3600000);
  const minutes = Math.floor((safeTimeMs % 3600000) / 60000);
  const seconds = Math.floor((safeTimeMs % 60000) / 1000);
  const milliseconds = safeTimeMs % 1000;
  const separator = format === 'srt' ? ',' : '.';

  return [hours, minutes, seconds]
    .map(value => String(value).padStart(2, '0'))
    .join(':') + `${separator}${String(milliseconds).padStart(3, '0')}`;
};
