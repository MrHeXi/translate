export const AUDIO_WAVEFORM_LIMITS = Object.freeze({
  maxChannels: 8,
  maxFramesPerChannel: 20_000_000,
  maxTotalSamples: 40_000_000,
  maxBucketCount: 20_000,
  maxSampleRate: 384_000,
  maxDurationSeconds: 86_400
});

export const DEFAULT_AUDIO_WAVEFORM_BUCKET_COUNT = 1_000;

export const SUPPORTED_AUDIO_FRAME_RATES = Object.freeze([
  23.976,
  24,
  25,
  29.97,
  30,
  50,
  59.94,
  60
] as const);

export type SupportedAudioFrameRate = typeof SUPPORTED_AUDIO_FRAME_RATES[number];
export type AudioFrameSnapMode = 'nearest' | 'floor' | 'ceil';

export interface AudioWaveformInput {
  readonly channels: readonly Float32Array[];
  readonly sampleRate: number;
  readonly sampleCount?: number;
  readonly durationSeconds?: number;
}

export interface AudioWaveformOptions {
  readonly bucketCount?: number;
}

export interface AudioWaveformBucket {
  readonly index: number;
  readonly startSample: number;
  readonly endSample: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly min: number;
  readonly max: number;
  readonly rms: number;
}

export interface AudioWaveformEnvelope {
  readonly channelCount: number;
  readonly sampleRate: number;
  readonly sampleCount: number;
  readonly durationSeconds: number;
  readonly bucketCount: number;
  readonly buckets: readonly AudioWaveformBucket[];
}

export type AudioWaveformRejectionReason =
  | 'invalid-channels'
  | 'empty-input'
  | 'too-many-channels'
  | 'channel-length-mismatch'
  | 'invalid-sample-rate'
  | 'invalid-sample-count'
  | 'sample-count-mismatch'
  | 'too-many-samples'
  | 'invalid-duration'
  | 'duration-mismatch'
  | 'invalid-bucket-count'
  | 'too-many-buckets'
  | 'non-finite-sample';

export type AudioWaveformResult =
  | {
      readonly status: 'ok';
      readonly envelope: AudioWaveformEnvelope;
    }
  | {
      readonly status: 'rejected';
      readonly reason: AudioWaveformRejectionReason;
      readonly message: string;
    };

export interface AudioFrameRateRatio {
  readonly frameRate: SupportedAudioFrameRate;
  readonly numerator: number;
  readonly denominator: number;
}

export interface AudioFramePosition extends AudioFrameRateRatio {
  readonly frameIndex: number;
  readonly timeSeconds: number;
}

const AUDIO_FRAME_RATE_RATIOS: Readonly<Record<string, AudioFrameRateRatio>> = Object.freeze({
  '23.976': Object.freeze({ frameRate: 23.976, numerator: 24_000, denominator: 1_001 }),
  '24': Object.freeze({ frameRate: 24, numerator: 24, denominator: 1 }),
  '25': Object.freeze({ frameRate: 25, numerator: 25, denominator: 1 }),
  '29.97': Object.freeze({ frameRate: 29.97, numerator: 30_000, denominator: 1_001 }),
  '30': Object.freeze({ frameRate: 30, numerator: 30, denominator: 1 }),
  '50': Object.freeze({ frameRate: 50, numerator: 50, denominator: 1 }),
  '59.94': Object.freeze({ frameRate: 59.94, numerator: 60_000, denominator: 1_001 }),
  '60': Object.freeze({ frameRate: 60, numerator: 60, denominator: 1 })
});

const REJECTION_MESSAGES: Readonly<Record<AudioWaveformRejectionReason, string>> = Object.freeze({
  'invalid-channels': 'channels must be an array containing only Float32Array values',
  'empty-input': 'at least one non-empty audio channel is required',
  'too-many-channels': `channel count exceeds ${AUDIO_WAVEFORM_LIMITS.maxChannels}`,
  'channel-length-mismatch': 'all audio channels must contain the same number of samples',
  'invalid-sample-rate': `sampleRate must be an integer between 1 and ${AUDIO_WAVEFORM_LIMITS.maxSampleRate}`,
  'invalid-sample-count': 'sampleCount must be a positive safe integer',
  'sample-count-mismatch': 'sampleCount must match the audio channel length',
  'too-many-samples': 'audio input exceeds the configured sample limits',
  'invalid-duration': `durationSeconds must be greater than 0 and no more than ${AUDIO_WAVEFORM_LIMITS.maxDurationSeconds}`,
  'duration-mismatch': 'durationSeconds does not match sampleCount and sampleRate',
  'invalid-bucket-count': 'bucketCount must be a positive safe integer',
  'too-many-buckets': `bucketCount exceeds ${AUDIO_WAVEFORM_LIMITS.maxBucketCount}`,
  'non-finite-sample': 'audio channels must not contain NaN or Infinity'
});

function reject(reason: AudioWaveformRejectionReason): AudioWaveformResult {
  return { status: 'rejected', reason, message: REJECTION_MESSAGES[reason] };
}

function clampSample(sample: number): number {
  return Math.max(-1, Math.min(1, sample));
}

function isValidDuration(durationSeconds: number): boolean {
  return Number.isFinite(durationSeconds)
    && durationSeconds > 0
    && durationSeconds <= AUDIO_WAVEFORM_LIMITS.maxDurationSeconds;
}

export function createAudioWaveformEnvelope(
  input: AudioWaveformInput,
  options: AudioWaveformOptions = {}
): AudioWaveformResult {
  if (!input || !Array.isArray(input.channels)) {
    return reject('invalid-channels');
  }
  if (input.channels.length === 0) return reject('empty-input');
  if (input.channels.length > AUDIO_WAVEFORM_LIMITS.maxChannels) {
    return reject('too-many-channels');
  }
  for (let channelIndex = 0; channelIndex < input.channels.length; channelIndex += 1) {
    if (!(input.channels[channelIndex] instanceof Float32Array)) {
      return reject('invalid-channels');
    }
  }
  if (!Number.isSafeInteger(input.sampleRate)
    || input.sampleRate < 1
    || input.sampleRate > AUDIO_WAVEFORM_LIMITS.maxSampleRate) {
    return reject('invalid-sample-rate');
  }

  const channelSampleCount = input.channels[0].length;
  if (channelSampleCount === 0) return reject('empty-input');
  if (input.channels.some(channel => channel.length !== channelSampleCount)) {
    return reject('channel-length-mismatch');
  }

  if (input.sampleCount !== undefined
    && (!Number.isSafeInteger(input.sampleCount) || input.sampleCount <= 0)) {
    return reject('invalid-sample-count');
  }
  const sampleCount = input.sampleCount ?? channelSampleCount;
  if (sampleCount > AUDIO_WAVEFORM_LIMITS.maxFramesPerChannel) {
    return reject('too-many-samples');
  }
  if (sampleCount !== channelSampleCount) return reject('sample-count-mismatch');
  if (sampleCount > Math.floor(AUDIO_WAVEFORM_LIMITS.maxTotalSamples / input.channels.length)) {
    return reject('too-many-samples');
  }

  const durationSeconds = sampleCount / input.sampleRate;
  if (!isValidDuration(durationSeconds)) return reject('invalid-duration');
  if (input.durationSeconds !== undefined) {
    if (!isValidDuration(input.durationSeconds)) return reject('invalid-duration');
    const durationErrorInSamples = Math.abs(input.durationSeconds * input.sampleRate - sampleCount);
    if (durationErrorInSamples > 0.5) return reject('duration-mismatch');
  }

  const requestedBucketCount = options.bucketCount ?? DEFAULT_AUDIO_WAVEFORM_BUCKET_COUNT;
  if (!Number.isSafeInteger(requestedBucketCount) || requestedBucketCount <= 0) {
    return reject('invalid-bucket-count');
  }
  if (requestedBucketCount > AUDIO_WAVEFORM_LIMITS.maxBucketCount) {
    return reject('too-many-buckets');
  }

  for (const channel of input.channels) {
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      if (!Number.isFinite(channel[sampleIndex])) return reject('non-finite-sample');
    }
  }

  const bucketCount = Math.min(requestedBucketCount, sampleCount);
  const buckets: AudioWaveformBucket[] = [];
  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const startSample = Math.floor(bucketIndex * sampleCount / bucketCount);
    const endSample = Math.floor((bucketIndex + 1) * sampleCount / bucketCount);
    let minimum = 1;
    let maximum = -1;
    let sumOfSquares = 0;
    let aggregatedSampleCount = 0;

    for (let sampleIndex = startSample; sampleIndex < endSample; sampleIndex += 1) {
      for (const channel of input.channels) {
        const sample = clampSample(channel[sampleIndex]);
        minimum = Math.min(minimum, sample);
        maximum = Math.max(maximum, sample);
        sumOfSquares += sample * sample;
        aggregatedSampleCount += 1;
      }
    }

    buckets.push({
      index: bucketIndex,
      startSample,
      endSample,
      startSeconds: startSample / input.sampleRate,
      endSeconds: endSample / input.sampleRate,
      min: minimum,
      max: maximum,
      rms: Math.min(1, Math.sqrt(sumOfSquares / aggregatedSampleCount))
    });
  }

  return {
    status: 'ok',
    envelope: {
      channelCount: input.channels.length,
      sampleRate: input.sampleRate,
      sampleCount,
      durationSeconds,
      bucketCount,
      buckets
    }
  };
}

export function clampAudioTime(timeSeconds: number, durationSeconds: number): number | null {
  if (!Number.isFinite(timeSeconds) || !isValidDuration(durationSeconds)) return null;
  return Math.max(0, Math.min(durationSeconds, timeSeconds));
}

export function getAudioFrameRateRatio(frameRate: number): AudioFrameRateRatio | null {
  if (!Number.isFinite(frameRate)) return null;
  return AUDIO_FRAME_RATE_RATIOS[String(frameRate)] ?? null;
}

export function audioFrameIndexToTime(
  frameIndex: number,
  frameRate: number
): AudioFramePosition | null {
  const ratio = getAudioFrameRateRatio(frameRate);
  if (!ratio || !Number.isSafeInteger(frameIndex) || frameIndex < 0) return null;
  const maximumFrameIndex = Math.floor(
    AUDIO_WAVEFORM_LIMITS.maxDurationSeconds * ratio.numerator / ratio.denominator
  );
  if (frameIndex > maximumFrameIndex) return null;

  return {
    ...ratio,
    frameIndex,
    timeSeconds: frameIndex * ratio.denominator / ratio.numerator
  };
}

export function snapAudioTimeToFrame(
  timeSeconds: number,
  frameRate: number,
  mode: AudioFrameSnapMode = 'nearest'
): AudioFramePosition | null {
  const ratio = getAudioFrameRateRatio(frameRate);
  if (!ratio
    || !Number.isFinite(timeSeconds)
    || timeSeconds < 0
    || timeSeconds > AUDIO_WAVEFORM_LIMITS.maxDurationSeconds
    || (mode !== 'nearest' && mode !== 'floor' && mode !== 'ceil')) {
    return null;
  }

  const rawFrameIndex = timeSeconds * ratio.numerator / ratio.denominator;
  const nearestInteger = Math.round(rawFrameIndex);
  const frameIndexTolerance = Number.EPSILON * Math.max(1, Math.abs(rawFrameIndex)) * 8;
  const fractionalFrameIndex = Math.abs(rawFrameIndex - nearestInteger) <= frameIndexTolerance
    ? nearestInteger
    : rawFrameIndex;
  const frameIndex = mode === 'floor'
    ? Math.floor(fractionalFrameIndex)
    : mode === 'ceil'
      ? Math.ceil(fractionalFrameIndex)
      : Math.round(fractionalFrameIndex);
  return audioFrameIndexToTime(frameIndex, frameRate);
}
