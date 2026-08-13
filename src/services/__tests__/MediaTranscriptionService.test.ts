import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import {
  MEDIA_TRANSCRIPTION_MAX_BYTES,
  MEDIA_TRANSCRIPTION_MAX_SEGMENTS,
  MEDIA_TRANSCRIPTION_MAX_SSE_EVENTS,
  MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH,
  MEDIA_TRANSCRIPTION_MODELS,
  MEDIA_TRANSCRIPTION_PARTIAL_PREVIEW_LENGTH,
  MEDIA_TRANSCRIPTION_PROVIDERS,
  MediaTranscriptionService,
  MediaTranscriptionUpload,
  getMediaTranscriptionModels
} from '../MediaTranscriptionService';

const encodeBase64 = (bytes: number[]): string => {
  return btoa(String.fromCharCode(...bytes));
};

Object.defineProperty(globalThis, 'TextDecoder', {
  configurable: true,
  value: NodeTextDecoder
});

const createUpload = (
  bytes: number[] = [1, 2, 3, 4],
  overrides: Partial<ConstructorParameters<typeof MediaTranscriptionUpload>[0]> = {}
): MediaTranscriptionUpload => {
  const upload = new MediaTranscriptionUpload({
    providerId: 'openai',
    transcriptionModel: 'whisper-1',
    fileName: 'sample.webm',
    mimeType: 'audio/webm',
    totalBytes: bytes.length,
    language: 'zh-CN',
    prompt: 'Product names: LexiBridge',
    ...overrides
  });
  upload.appendBase64Chunk(0, encodeBase64(bytes));
  return upload;
};

const createStreamingResponse = (content: string, chunkSizes: number[]): Response => {
  const encoded = new NodeTextEncoder().encode(content);
  const chunks: Uint8Array[] = [];
  let offset = 0;
  for (const size of chunkSizes) {
    if (offset >= encoded.length) break;
    chunks.push(encoded.slice(offset, offset + size));
    offset += size;
  }
  if (offset < encoded.length) chunks.push(encoded.slice(offset));
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: jest.fn(async () => index < chunks.length
          ? { done: false, value: chunks[index++] }
          : { done: true, value: undefined }),
        cancel: jest.fn().mockResolvedValue(undefined),
        releaseLock: jest.fn()
      })
    }
  } as unknown as Response;
};

describe('MediaTranscriptionService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalFetch) global.fetch = originalFetch;
    else delete (global as any).fetch;
  });

  it('declares bounded timed-segment and cancellation capabilities for every provider', () => {
    expect(MEDIA_TRANSCRIPTION_PROVIDERS).toHaveLength(3);
    MEDIA_TRANSCRIPTION_PROVIDERS.forEach(provider => {
      expect(provider).toEqual(expect.objectContaining({
        maxBytes: MEDIA_TRANSCRIPTION_MAX_BYTES,
        supportsTimedSegments: true,
        supportsCancellation: true,
        progressMode: 'indeterminate'
      }));
      expect(provider.defaultModel).toBeTruthy();
      expect(provider.supportedMimeTypes).toContain('audio/webm');
      expect(provider.supportedMimeTypes).toContain('video/mp4');
    });
    expect(MEDIA_TRANSCRIPTION_MODELS.map(model => [model.providerId, model.id])).toEqual([
      ['openai', 'whisper-1'],
      ['openai', 'gpt-4o-transcribe'],
      ['openai', 'gpt-4o-mini-transcribe'],
      ['groq', 'whisper-large-v3-turbo'],
      ['groq', 'whisper-large-v3'],
      ['deepgram', 'nova-3'],
      ['deepgram', 'nova-2']
    ]);
    expect(getMediaTranscriptionModels('openai').map(model => model.id)).toEqual([
      'whisper-1',
      'gpt-4o-transcribe',
      'gpt-4o-mini-transcribe'
    ]);
    expect(getMediaTranscriptionModels('deepgram').map(model => model.id)).toEqual([
      'nova-3',
      'nova-2'
    ]);
  });

  it('does not request media while the module, service, or upload is initialized', () => {
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;

    jest.isolateModules(() => {
      const isolated = require('../MediaTranscriptionService') as typeof import('../MediaTranscriptionService');
      const upload = new isolated.MediaTranscriptionUpload({
        providerId: 'deepgram',
        transcriptionModel: 'nova-3',
        fileName: 'quiet.wav',
        mimeType: 'audio/wav',
        totalBytes: 2
      });
      upload.appendBase64Chunk(0, encodeBase64([1, 2]));
      upload.createBlob();
      new isolated.MediaTranscriptionService();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts ordered chunks, enforces the declared size, and clears buffered media', () => {
    const upload = new MediaTranscriptionUpload({
      providerId: 'groq',
      transcriptionModel: 'whisper-large-v3-turbo',
      fileName: 'clip.mp3',
      mimeType: 'audio/mpeg',
      totalBytes: 4
    });

    expect(upload.appendBase64Chunk(0, encodeBase64([1, 2]))).toEqual({
      receivedBytes: 2,
      totalBytes: 4
    });
    expect(() => upload.appendBase64Chunk(2, encodeBase64([3, 4]))).toThrow('Expected media chunk 1');
    expect(upload.appendBase64Chunk(1, encodeBase64([3, 4]))).toEqual({
      receivedBytes: 4,
      totalBytes: 4
    });
    expect(upload.createBlob()).toEqual(expect.objectContaining({ size: 4, type: 'audio/mpeg' }));

    upload.clear();
    expect(() => upload.createBlob()).toThrow('no longer active');
    expect(() => new MediaTranscriptionUpload({
      providerId: 'openai',
      transcriptionModel: 'whisper-1',
      fileName: 'payload.exe',
      mimeType: 'application/octet-stream',
      totalBytes: 4
    })).toThrow('supported audio or video file');
    expect(() => new MediaTranscriptionUpload({
      providerId: 'openai',
      transcriptionModel: 'whisper-1',
      fileName: 'payload.flac',
      mimeType: 'audio/flac',
      totalBytes: 4
    })).not.toThrow();
    expect(() => new MediaTranscriptionUpload({
      providerId: 'groq',
      transcriptionModel: 'whisper-1',
      fileName: 'clip.webm',
      mimeType: 'audio/webm',
      totalBytes: 4
    })).toThrow('model supported by the selected provider');
    expect(() => new MediaTranscriptionUpload({
      providerId: 'openai',
      transcriptionModel: 'whisper-large-v3' as any,
      fileName: 'clip.webm',
      mimeType: 'audio/webm',
      totalBytes: 4
    })).toThrow('model supported by the selected provider');
  });

  it('uploads media directly to the configured provider and normalizes timestamped segments', async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'Hello world',
        language: 'en',
        duration: 2.5,
        segments: [
          { start: 0, end: 1.1, text: ' Hello ' },
          { start: 1.1, end: 2.5, text: 'world' }
        ]
      })
    }));
    (global as any).fetch = fetchMock;

    const service = new MediaTranscriptionService();
    const result = await service.transcribe(createUpload(), {
      apiKey: 'local-provider-secret',
      endpoint: 'https://gateway.example.com/v1/chat/completions',
      model: 'chat-model'
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.example.com/v1/audio/transcriptions');
    expect(url).not.toContain('local-provider-secret');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer local-provider-secret');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('timestamp_granularities[]')).toBe('segment');
    expect(form.get('language')).toBe('zh');
    expect(form.get('prompt')).toBe('Product names: LexiBridge');
    expect(form.get('file')).toEqual(expect.objectContaining({ size: 4, type: 'audio/webm' }));
    expect(result).toEqual({
      text: 'Hello world',
      language: 'en',
      duration: 2.5,
      segments: [
        { id: 1, start: 0, end: 1.1, text: 'Hello' },
        { id: 2, start: 1.1, end: 2.5, text: 'world' }
      ],
      timingMode: 'provider-segments'
    });
  });

  it('keeps Groq Whisper transcription non-streaming with timed segment fields', async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'Groq result',
        duration: 1,
        segments: [{ start: 0, end: 1, text: 'Groq result' }]
      })
    }));
    (global as any).fetch = fetchMock;

    await new MediaTranscriptionService().transcribe(createUpload([1, 2], {
      providerId: 'groq',
      transcriptionModel: 'whisper-large-v3'
    }), {
      apiKey: 'groq-secret',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'unrelated-chat-model'
    });

    const form = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('timestamp_granularities[]')).toBe('segment');
    expect(form.get('stream')).toBeNull();
  });

  it('posts a raw media Blob to Deepgram v1/listen and normalizes utterances', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        metadata: { duration: 3.4 },
        results: {
          channels: [{
            detected_language: 'en-US',
            alternatives: [{
              transcript: 'Hello Deepgram.',
              words: [
                { start: 0.1, end: 0.5, word: 'hello', punctuated_word: 'Hello' },
                { start: 0.6, end: 1.2, word: 'deepgram', punctuated_word: 'Deepgram.' }
              ]
            }]
          }],
          utterances: [
            { start: 0.1, end: 1.2, transcript: ' Hello Deepgram. ' },
            {
              start: 2,
              end: 3.4,
              transcript: '',
              words: [
                { start: 2, end: 2.4, word: 'second', punctuated_word: 'Second' },
                { start: 2.5, end: 3.4, word: 'line', punctuated_word: 'line.' }
              ]
            }
          ]
        }
      })
    }));
    (global as any).fetch = fetchMock;
    const controller = new AbortController();

    const result = await new MediaTranscriptionService().transcribe(createUpload([1, 2, 3], {
      providerId: 'deepgram',
      transcriptionModel: 'nova-3',
      fileName: 'voice.wav',
      mimeType: 'audio/wav',
      language: 'auto'
    }), {
      apiKey: 'deepgram-secret',
      endpoint: 'https://speech.example.com/v1/listen?discard=me#fragment'
    }, controller.signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [rawUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(rawUrl);
    expect(`${url.origin}${url.pathname}`).toBe('https://speech.example.com/v1/listen');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      model: 'nova-3',
      smart_format: 'true',
      utterances: 'true',
      detect_language: 'true'
    });
    expect((init.headers as Record<string, string>)).toEqual({
      Authorization: 'Token deepgram-secret',
      'Content-Type': 'audio/wav'
    });
    expect(init.body).toBeInstanceOf(Blob);
    expect(init.body).not.toBeInstanceOf(FormData);
    expect(init.body).toEqual(expect.objectContaining({ size: 3, type: 'audio/wav' }));
    expect(init.signal).toBe(controller.signal);
    expect(result).toEqual({
      text: 'Hello Deepgram. Second line.',
      language: 'en-US',
      duration: 3.4,
      segments: [
        { id: 1, start: 0.1, end: 1.2, text: 'Hello Deepgram.' },
        { id: 2, start: 2, end: 3.4, text: 'Second line.' }
      ],
      timingMode: 'provider-segments'
    });
  });

  it('falls back to bounded Deepgram words when utterances are absent', async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        metadata: { duration: 1.1 },
        results: {
          channels: [{
            alternatives: [{
              transcript: 'Ni hao',
              words: [
                { start: 0, end: 0.4, word: 'ni', punctuated_word: 'Ni' },
                { start: 0.5, end: 1.1, word: 'hao' }
              ]
            }]
          }]
        }
      })
    }));

    const result = await new MediaTranscriptionService().transcribe(createUpload([1], {
      providerId: 'deepgram',
      transcriptionModel: 'nova-2',
      language: 'zh-CN'
    }), { apiKey: 'secret' });

    const url = new URL((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(url.searchParams.get('model')).toBe('nova-2');
    expect(url.searchParams.get('language')).toBe('zh-CN');
    expect(url.searchParams.has('detect_language')).toBe(false);
    expect(result).toEqual({
      text: 'Ni hao',
      language: 'zh',
      duration: 1.1,
      segments: [
        { id: 1, start: 0, end: 0.4, text: 'Ni' },
        { id: 2, start: 0.5, end: 1.1, text: 'hao' }
      ],
      timingMode: 'provider-segments'
    });
  });

  it('parses OpenAI SSE across byte boundaries and reports bounded accumulated partial text', async () => {
    const stream = [
      'event: transcript.text.delta\r\n',
      'data: {"type":"transcript.text.delta","delta":"Hello "}\r\n\r\n',
      'event: response.created\n',
      'data: {"type":"response.created","id":"ignored"}\n\n',
      'data: {"type":"transcript.text.delta","delta":"\\u4e16\\u754c"}\n\n',
      'event: transcript.text.done\r\n',
      'data: {"type":"transcript.text.done","text":"Hello \\u4e16\\u754c"}\r\n\r\n',
      'data: [DONE]\r\n\r\n'
    ].join('');
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      createStreamingResponse(stream, [1, 2, 5, 3, 1, 11, 4])
    ));
    (global as any).fetch = fetchMock;
    const partials: string[] = [];

    const result = await new MediaTranscriptionService().transcribe(createUpload([1, 2, 3], {
      transcriptionModel: 'gpt-4o-mini-transcribe',
      fallbackDurationSeconds: 12
    }), {
      apiKey: 'openai-secret',
      endpoint: 'https://api.openai.com/v1/responses',
      model: 'must-not-be-used'
    }, undefined, partial => partials.push(partial));

    const form = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(form.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(form.get('stream')).toBe('true');
    expect(form.get('response_format')).toBe('json');
    expect(form.get('timestamp_granularities[]')).toBeNull();
    expect(partials).toEqual(['Hello ', 'Hello \u4e16\u754c']);
    expect(result).toEqual({
      text: 'Hello \u4e16\u754c',
      language: 'zh',
      duration: 12,
      segments: [{ id: 1, start: 0, end: 12, text: 'Hello \u4e16\u754c' }],
      timingMode: 'fallback'
    });
  });

  it.each([
    {
      name: 'missing done',
      stream: 'data: {"type":"transcript.text.delta","delta":"partial"}\n\n',
      error: 'ended before completion'
    },
    {
      name: 'invalid JSON',
      stream: 'event: transcript.text.delta\ndata: {broken}\n\n',
      error: 'invalid JSON'
    },
    {
      name: 'empty completion',
      stream: 'data: {"type":"transcript.text.done","text":""}\n\n',
      error: 'no transcript text'
    }
  ])('rejects a $name SSE response', async ({ stream, error }) => {
    (global as any).fetch = jest.fn(async () => createStreamingResponse(stream, [2, 1, 7]));
    await expect(new MediaTranscriptionService().transcribe(createUpload([1], {
      transcriptionModel: 'gpt-4o-mini-transcribe'
    }), { apiKey: 'secret' })).rejects.toThrow(error);
  });

  it('stops partial callbacks immediately when the stream is canceled', async () => {
    const stream = [
      'data: {"type":"transcript.text.delta","delta":"first"}\n\n',
      'data: {"type":"transcript.text.delta","delta":"late"}\n\n',
      'data: {"type":"transcript.text.done","text":"first late"}\n\n'
    ].join('');
    (global as any).fetch = jest.fn(async () => createStreamingResponse(stream, [58]));
    const controller = new AbortController();
    const partials: string[] = [];

    await expect(new MediaTranscriptionService().transcribe(createUpload([1], {
      transcriptionModel: 'gpt-4o-mini-transcribe'
    }), { apiKey: 'secret' }, controller.signal, partial => {
      partials.push(partial);
      controller.abort();
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(partials).toEqual(['first']);
  });

  it('reports provider HTTP failures before attempting to parse an SSE body', async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Rate limit reached.' } })
    }));
    await expect(new MediaTranscriptionService().transcribe(createUpload([1], {
      transcriptionModel: 'gpt-4o-mini-transcribe'
    }), { apiKey: 'secret' })).rejects.toThrow('Rate limit reached.');
  });

  it('preserves Deepgram cancellation before and during the explicit request', async () => {
    const fetchMock = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      })
    ));
    (global as any).fetch = fetchMock;
    const service = new MediaTranscriptionService();
    const canceled = new AbortController();
    canceled.abort();

    await expect(service.transcribe(createUpload([1], {
      providerId: 'deepgram',
      transcriptionModel: 'nova-3'
    }), { apiKey: 'secret' }, canceled.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();

    const active = new AbortController();
    const request = service.transcribe(createUpload([1], {
      providerId: 'deepgram',
      transcriptionModel: 'nova-3'
    }), { apiKey: 'secret' }, active.signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    active.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('surfaces bounded Deepgram HTTP and JSON errors', async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ err_msg: 'Unsupported language.' })
    }));
    const service = new MediaTranscriptionService();
    await expect(service.transcribe(createUpload([1], {
      providerId: 'deepgram',
      transcriptionModel: 'nova-3'
    }), { apiKey: 'secret' })).rejects.toThrow('Unsupported language.');

    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new Error('broken'); }
    }));
    await expect(service.transcribe(createUpload([1], {
      providerId: 'deepgram',
      transcriptionModel: 'nova-3'
    }), { apiKey: 'secret' })).rejects.toThrow('returned invalid JSON');
  });

  it.each([
    {
      name: 'empty channels',
      data: { results: { channels: [] } },
      error: 'channel result'
    },
    {
      name: 'missing alternatives',
      data: { results: { channels: [{}] } },
      error: 'malformed channel'
    },
    {
      name: 'empty alternatives',
      data: { results: { channels: [{ alternatives: [] }] } },
      error: 'alternatives result'
    },
    {
      name: 'empty transcript',
      data: {
        results: {
          channels: [{ alternatives: [{ transcript: '', words: [] }] }],
          utterances: [{ start: 0, end: 1, transcript: '' }]
        }
      },
      error: 'malformed transcript segment'
    },
    {
      name: 'reversed timestamps',
      data: {
        results: {
          channels: [{ alternatives: [{ transcript: 'bad', words: [] }] }],
          utterances: [{ start: 2, end: 1, transcript: 'bad' }]
        }
      },
      error: 'malformed transcript segment'
    },
    {
      name: 'non-finite timestamps',
      data: {
        results: {
          channels: [{ alternatives: [{ transcript: 'bad', words: [] }] }],
          utterances: [{ start: 0, end: Number.POSITIVE_INFINITY, transcript: 'bad' }]
        }
      },
      error: 'malformed transcript segment'
    },
    {
      name: 'too many utterances',
      data: {
        results: {
          channels: [{ alternatives: [{ transcript: 'large', words: [] }] }],
          utterances: Array.from({ length: MEDIA_TRANSCRIPTION_MAX_SEGMENTS + 1 }, (_, index) => ({
            start: index,
            end: index + 0.5,
            transcript: 'word'
          }))
        }
      },
      error: 'too many transcript segments'
    }
  ])('rejects Deepgram $name results', async ({ data, error }) => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => data
    }));
    await expect(new MediaTranscriptionService().transcribe(createUpload([1], {
      providerId: 'deepgram',
      transcriptionModel: 'nova-3'
    }), { apiKey: 'secret' })).rejects.toThrow(error);
  });

  it('rejects streaming text above the transcript limit before emitting completion', async () => {
    const stream = `data: ${JSON.stringify({
      type: 'transcript.text.delta',
      delta: 'x'.repeat(MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH + 1)
    })}\n\n`;
    (global as any).fetch = jest.fn(async () => createStreamingResponse(stream, [4096]));

    await expect(new MediaTranscriptionService().transcribe(createUpload([1], {
      transcriptionModel: 'gpt-4o-transcribe'
    }), { apiKey: 'secret' })).rejects.toThrow('transcript text limit');
  });

  it('bounds SSE event processing and partial transcript payloads', async () => {
    const oversizedDelta = 'x'.repeat(MEDIA_TRANSCRIPTION_PARTIAL_PREVIEW_LENGTH + 128);
    const boundedStream = [
      `data: ${JSON.stringify({ type: 'transcript.text.delta', delta: oversizedDelta })}\n\n`,
      `data: ${JSON.stringify({ type: 'transcript.text.done', text: oversizedDelta })}\n\n`
    ].join('');
    (global as any).fetch = jest.fn(async () => createStreamingResponse(boundedStream, [1024]));
    const partials: string[] = [];

    await new MediaTranscriptionService().transcribe(createUpload([1], {
      transcriptionModel: 'gpt-4o-transcribe'
    }), { apiKey: 'secret' }, undefined, partial => partials.push(partial));
    expect(partials).toHaveLength(1);
    expect(Array.from(partials[0]).length).toBe(MEDIA_TRANSCRIPTION_PARTIAL_PREVIEW_LENGTH);

    const eventFlood = 'event: keepalive\ndata: {}\n\n'
      .repeat(MEDIA_TRANSCRIPTION_MAX_SSE_EVENTS + 1);
    (global as any).fetch = jest.fn(async () => createStreamingResponse(eventFlood, [64 * 1024]));
    await expect(new MediaTranscriptionService().transcribe(createUpload([1], {
      transcriptionModel: 'gpt-4o-mini-transcribe'
    }), { apiKey: 'secret' })).rejects.toThrow('event count limit');
  });

  it('supports text-only transcription responses and rejects unsafe endpoints before upload', async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ text: 'Single transcript', duration: 8 })
    }));
    (global as any).fetch = fetchMock;
    const service = new MediaTranscriptionService();

    const result = await service.transcribe(createUpload(), {
      apiKey: 'secret',
      endpoint: 'https://api.openai.com/v1/responses'
    });
    expect(result.segments).toEqual([
      { id: 1, start: 0, end: 8, text: 'Single transcript' }
    ]);
    expect(result.timingMode).toBe('fallback');

    await expect(service.transcribe(createUpload(), {
      apiKey: 'secret',
      endpoint: 'http://remote.example.com/v1/chat/completions'
    })).rejects.toThrow('must use HTTPS');
    await expect(service.transcribe(createUpload([1], {
      providerId: 'deepgram',
      transcriptionModel: 'nova-3'
    }), {
      apiKey: 'secret',
      endpoint: 'https://user:password@api.deepgram.com/v1/listen'
    })).rejects.toThrow('must not contain URL credentials');
    await expect(service.transcribe(createUpload([1], {
      providerId: 'deepgram',
      transcriptionModel: 'nova-3'
    }), {
      apiKey: 'secret',
      endpoint: 'https://api.deepgram.com/v1/projects'
    })).rejects.toThrow('must end in /v1/listen');
    await expect(service.transcribe(createUpload([1], {
      providerId: 'deepgram',
      transcriptionModel: 'nova-3'
    }), {
      apiKey: 'secret',
      endpoint: 'http://api.deepgram.com/v1/listen'
    })).rejects.toThrow('must use HTTPS');
    await expect(service.transcribe(createUpload(), {
      endpoint: 'https://api.openai.com/v1/chat/completions'
    })).rejects.toThrow('API key is not configured');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
