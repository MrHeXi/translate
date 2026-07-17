import {
  MediaTranscriptionService,
  MediaTranscriptionUpload
} from '../MediaTranscriptionService';

const encodeBase64 = (bytes: number[]): string => {
  return btoa(String.fromCharCode(...bytes));
};

const createUpload = (bytes: number[] = [1, 2, 3, 4]): MediaTranscriptionUpload => {
  const upload = new MediaTranscriptionUpload({
    providerId: 'openai',
    fileName: 'sample.webm',
    mimeType: 'audio/webm',
    totalBytes: bytes.length,
    language: 'zh-CN',
    prompt: 'Product names: LexiBridge'
  });
  upload.appendBase64Chunk(0, encodeBase64(bytes));
  return upload;
};

describe('MediaTranscriptionService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalFetch) global.fetch = originalFetch;
    else delete (global as any).fetch;
  });

  it('accepts ordered chunks, enforces the declared size, and clears buffered media', () => {
    const upload = new MediaTranscriptionUpload({
      providerId: 'groq',
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
      fileName: 'payload.exe',
      mimeType: 'application/octet-stream',
      totalBytes: 4
    })).toThrow('supported audio or video file');
    expect(() => new MediaTranscriptionUpload({
      providerId: 'openai',
      fileName: 'payload.flac',
      mimeType: 'audio/flac',
      totalBytes: 4
    })).toThrow('supported audio or video file');
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
      ]
    });
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

    await expect(service.transcribe(createUpload(), {
      apiKey: 'secret',
      endpoint: 'http://remote.example.com/v1/chat/completions'
    })).rejects.toThrow('must use HTTPS');
    await expect(service.transcribe(createUpload(), {
      endpoint: 'https://api.openai.com/v1/chat/completions'
    })).rejects.toThrow('API key is not configured');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
