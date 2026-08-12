import {
  AUDIO_WAVEFORM_LIMITS,
  SUPPORTED_AUDIO_FRAME_RATES,
  audioFrameIndexToTime,
  clampAudioTime,
  createAudioWaveformEnvelope,
  getAudioFrameRateRatio,
  snapAudioTimeToFrame
} from '../AudioWaveformService';

describe('AudioWaveformService', () => {
  describe('createAudioWaveformEnvelope', () => {
    it('creates bounded deterministic min/max/RMS buckets with exact sample boundaries', () => {
      const channel = new Float32Array([-2, -0.5, 0.5, 2]);
      const input = {
        channels: [channel],
        sampleRate: 4,
        sampleCount: 4,
        durationSeconds: 1
      };

      const first = createAudioWaveformEnvelope(input, { bucketCount: 2 });
      const second = createAudioWaveformEnvelope(input, { bucketCount: 2 });

      expect(second).toEqual(first);
      expect(first.status).toBe('ok');
      if (first.status !== 'ok') throw new Error(first.message);
      expect(first.envelope).toMatchObject({
        channelCount: 1,
        sampleRate: 4,
        sampleCount: 4,
        durationSeconds: 1,
        bucketCount: 2
      });
      expect(first.envelope.buckets).toEqual([
        {
          index: 0,
          startSample: 0,
          endSample: 2,
          startSeconds: 0,
          endSeconds: 0.5,
          min: -1,
          max: -0.5,
          rms: Math.sqrt(1.25 / 2)
        },
        {
          index: 1,
          startSample: 2,
          endSample: 4,
          startSeconds: 0.5,
          endSeconds: 1,
          min: 0.5,
          max: 1,
          rms: Math.sqrt(1.25 / 2)
        }
      ]);
      expect(first.envelope.buckets.every(bucket => (
        bucket.min >= -1
        && bucket.max <= 1
        && bucket.rms >= 0
        && bucket.rms <= 1
      ))).toBe(true);
      expect(Array.from(channel)).toEqual([-2, -0.5, 0.5, 2]);
    });

    it('aggregates all stereo samples in each bucket without averaging away peaks', () => {
      const result = createAudioWaveformEnvelope({
        channels: [
          new Float32Array([-1, 0.5, 0.25, 0]),
          new Float32Array([1, -0.5, -0.25, 0.75])
        ],
        sampleRate: 4
      }, { bucketCount: 2 });

      expect(result.status).toBe('ok');
      if (result.status !== 'ok') throw new Error(result.message);
      expect(result.envelope.channelCount).toBe(2);
      expect(result.envelope.buckets[0]).toEqual(expect.objectContaining({ min: -1, max: 1 }));
      expect(result.envelope.buckets[0].rms).toBeCloseTo(Math.sqrt(2.5 / 4), 12);
      expect(result.envelope.buckets[1]).toEqual(expect.objectContaining({ min: -0.25, max: 0.75 }));
      expect(result.envelope.buckets[1].rms).toBeCloseTo(Math.sqrt(0.6875 / 4), 12);
    });

    it('never creates empty buckets when the requested resolution exceeds the sample count', () => {
      const result = createAudioWaveformEnvelope({
        channels: [new Float32Array([0.1, 0.2, 0.3])],
        sampleRate: 3
      }, { bucketCount: 100 });

      expect(result.status).toBe('ok');
      if (result.status !== 'ok') throw new Error(result.message);
      expect(result.envelope.bucketCount).toBe(3);
      expect(result.envelope.buckets.map(bucket => [bucket.startSample, bucket.endSample]))
        .toEqual([[0, 1], [1, 2], [2, 3]]);
    });

    it.each([
      {
        name: 'a missing channel list',
        input: { channels: null, sampleRate: 48_000 },
        options: {},
        reason: 'invalid-channels'
      },
      {
        name: 'no channels',
        input: { channels: [], sampleRate: 48_000 },
        options: {},
        reason: 'empty-input'
      },
      {
        name: 'a sparse channel list',
        input: { channels: new Array(1), sampleRate: 48_000 },
        options: {},
        reason: 'invalid-channels'
      },
      {
        name: 'an empty channel',
        input: { channels: [new Float32Array()], sampleRate: 48_000 },
        options: {},
        reason: 'empty-input'
      },
      {
        name: 'too many channels',
        input: {
          channels: Array.from(
            { length: AUDIO_WAVEFORM_LIMITS.maxChannels + 1 },
            () => new Float32Array([0])
          ),
          sampleRate: 48_000
        },
        options: {},
        reason: 'too-many-channels'
      },
      {
        name: 'different channel lengths',
        input: {
          channels: [new Float32Array([0]), new Float32Array([0, 1])],
          sampleRate: 48_000
        },
        options: {},
        reason: 'channel-length-mismatch'
      },
      {
        name: 'a non-finite sample rate',
        input: { channels: [new Float32Array([0])], sampleRate: Number.NaN },
        options: {},
        reason: 'invalid-sample-rate'
      },
      {
        name: 'a fractional sample rate',
        input: { channels: [new Float32Array([0])], sampleRate: 44_100.5 },
        options: {},
        reason: 'invalid-sample-rate'
      },
      {
        name: 'an oversized sample count before channel traversal',
        input: {
          channels: [new Float32Array([0])],
          sampleRate: 48_000,
          sampleCount: AUDIO_WAVEFORM_LIMITS.maxFramesPerChannel + 1
        },
        options: {},
        reason: 'too-many-samples'
      },
      {
        name: 'sample metadata that disagrees with the channels',
        input: {
          channels: [new Float32Array([0, 0])],
          sampleRate: 2,
          sampleCount: 1
        },
        options: {},
        reason: 'sample-count-mismatch'
      },
      {
        name: 'duration metadata that differs by more than half a sample',
        input: {
          channels: [new Float32Array([0, 0])],
          sampleRate: 2,
          durationSeconds: 2
        },
        options: {},
        reason: 'duration-mismatch'
      },
      {
        name: 'an invalid bucket count',
        input: { channels: [new Float32Array([0])], sampleRate: 1 },
        options: { bucketCount: 0 },
        reason: 'invalid-bucket-count'
      },
      {
        name: 'too many buckets',
        input: { channels: [new Float32Array([0])], sampleRate: 1 },
        options: { bucketCount: AUDIO_WAVEFORM_LIMITS.maxBucketCount + 1 },
        reason: 'too-many-buckets'
      },
      {
        name: 'NaN audio',
        input: { channels: [new Float32Array([0, Number.NaN])], sampleRate: 2 },
        options: {},
        reason: 'non-finite-sample'
      },
      {
        name: 'infinite audio',
        input: { channels: [new Float32Array([0, Number.POSITIVE_INFINITY])], sampleRate: 2 },
        options: {},
        reason: 'non-finite-sample'
      }
    ])('fails closed for $name', ({ input, options, reason }) => {
      const result = createAudioWaveformEnvelope(input as never, options);

      expect(result).toEqual(expect.objectContaining({ status: 'rejected', reason }));
      expect(result).not.toHaveProperty('envelope');
    });
  });

  describe('timeline utilities', () => {
    it('clamps finite timeline positions and rejects invalid bounds', () => {
      expect(clampAudioTime(-2, 10)).toBe(0);
      expect(clampAudioTime(4.25, 10)).toBe(4.25);
      expect(clampAudioTime(20, 10)).toBe(10);
      expect(clampAudioTime(Number.NaN, 10)).toBeNull();
      expect(clampAudioTime(1, Number.POSITIVE_INFINITY)).toBeNull();
      expect(clampAudioTime(1, 0)).toBeNull();
      expect(clampAudioTime(1, AUDIO_WAVEFORM_LIMITS.maxDurationSeconds + 1)).toBeNull();
    });

    it('maps every supported rate to an exact integer ratio', () => {
      expect(SUPPORTED_AUDIO_FRAME_RATES).toEqual([23.976, 24, 25, 29.97, 30, 50, 59.94, 60]);
      expect(getAudioFrameRateRatio(23.976)).toEqual({
        frameRate: 23.976,
        numerator: 24_000,
        denominator: 1_001
      });
      expect(getAudioFrameRateRatio(29.97)).toEqual({
        frameRate: 29.97,
        numerator: 30_000,
        denominator: 1_001
      });
      expect(getAudioFrameRateRatio(59.94)).toEqual({
        frameRate: 59.94,
        numerator: 60_000,
        denominator: 1_001
      });
      for (const frameRate of SUPPORTED_AUDIO_FRAME_RATES) {
        expect(getAudioFrameRateRatio(frameRate)).not.toBeNull();
      }
    });

    it('supports nearest, floor, and ceil snapping from an integer frame index', () => {
      expect(snapAudioTimeToFrame(10.019, 25, 'nearest')).toEqual(expect.objectContaining({
        frameIndex: 250,
        timeSeconds: 10
      }));
      expect(snapAudioTimeToFrame(10.039, 25, 'floor')).toEqual(expect.objectContaining({
        frameIndex: 250,
        timeSeconds: 10
      }));
      expect(snapAudioTimeToFrame(10.001, 25, 'ceil')).toEqual(expect.objectContaining({
        frameIndex: 251,
        timeSeconds: 10.04
      }));
    });

    it('does not accumulate drift for long NTSC timelines', () => {
      const frameIndex = 1_000_000;
      const position = audioFrameIndexToTime(frameIndex, 29.97);

      expect(position).not.toBeNull();
      expect(position?.timeSeconds).toBe(frameIndex * 1_001 / 30_000);
      for (const mode of ['nearest', 'floor', 'ceil'] as const) {
        expect(snapAudioTimeToFrame(position?.timeSeconds ?? -1, 29.97, mode))
          .toEqual(position);
      }
      expect(audioFrameIndexToTime(24_000, 23.976)?.timeSeconds).toBe(1_001);
      expect(audioFrameIndexToTime(60_000, 59.94)?.timeSeconds).toBe(1_001);
    });

    it('round-trips a distant frame at every supported rate', () => {
      for (const frameRate of SUPPORTED_AUDIO_FRAME_RATES) {
        const position = audioFrameIndexToTime(500_000, frameRate);
        expect(position).not.toBeNull();
        expect(snapAudioTimeToFrame(position?.timeSeconds ?? -1, frameRate)).toEqual(position);
      }
    });

    it('fails closed for unsupported rates, invalid times, modes, and frame indexes', () => {
      expect(getAudioFrameRateRatio(27)).toBeNull();
      expect(getAudioFrameRateRatio(Number.NaN)).toBeNull();
      expect(snapAudioTimeToFrame(-1, 24)).toBeNull();
      expect(snapAudioTimeToFrame(Number.POSITIVE_INFINITY, 24)).toBeNull();
      expect(snapAudioTimeToFrame(1, 27)).toBeNull();
      expect(snapAudioTimeToFrame(1, 24, 'invalid' as never)).toBeNull();
      expect(audioFrameIndexToTime(-1, 24)).toBeNull();
      expect(audioFrameIndexToTime(1.5, 24)).toBeNull();
      expect(audioFrameIndexToTime(Number.MAX_SAFE_INTEGER, 24)).toBeNull();
    });
  });
});
