import { TranslationProviderRuntimeConfig } from './TranslationProviderRegistry';

export type MediaTranscriptionProviderId = 'openai' | 'groq';
export type MediaTranscriptionModelId =
  | 'whisper-1'
  | 'gpt-4o-transcribe'
  | 'gpt-4o-mini-transcribe'
  | 'whisper-large-v3-turbo'
  | 'whisper-large-v3';

export interface MediaTranscriptionModelDefinition {
  id: MediaTranscriptionModelId;
  providerId: MediaTranscriptionProviderId;
  label: string;
  responseMode: 'timed-json' | 'text-sse';
  supportsTimedSegments: boolean;
}

export interface MediaTranscriptionProviderDefinition {
  id: MediaTranscriptionProviderId;
  label: string;
  defaultEndpoint: string;
  defaultModel: string;
  maxBytes: number;
  supportedMimeTypes: readonly string[];
  supportsTimedSegments: true;
  supportsCancellation: true;
  progressMode: 'indeterminate';
}

export interface MediaTranscriptionMetadata {
  providerId: MediaTranscriptionProviderId;
  transcriptionModel: MediaTranscriptionModelId;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  language?: string;
  prompt?: string;
  fallbackDurationSeconds?: number;
}

export interface MediaTranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface MediaTranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments: MediaTranscriptionSegment[];
  timingMode: 'provider-segments' | 'fallback';
}

export const MEDIA_TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;
export const MEDIA_TRANSCRIPTION_CHUNK_BYTES = 256 * 1024;
export const MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH = 200000;
export const MEDIA_TRANSCRIPTION_MAX_SSE_EVENTS = 50_000;
export const MEDIA_TRANSCRIPTION_PARTIAL_PREVIEW_LENGTH = 4_000;

const MEDIA_TRANSCRIPTION_MAX_SSE_EVENT_LENGTH = MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH + 8192;
const MEDIA_TRANSCRIPTION_INITIAL_PARTIAL_EMISSIONS = 16;
const MEDIA_TRANSCRIPTION_PARTIAL_EMIT_INTERVAL = 64;
const MEDIA_TRANSCRIPTION_DEFAULT_FALLBACK_DURATION_SECONDS = 5;
const MEDIA_TRANSCRIPTION_MAX_FALLBACK_DURATION_SECONDS = 24 * 60 * 60;

const MEDIA_TRANSCRIPTION_EXTENSION_PATTERN = /\.(flac|mp3|mp4|mpeg|mpga|m4a|ogg|wav|webm)$/i;
const MEDIA_TRANSCRIPTION_MIME_TYPES = new Set([
  'audio/flac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
  'audio/vnd.wave',
  'video/mp4',
  'video/webm'
]);
export const MEDIA_TRANSCRIPTION_SUPPORTED_MIME_TYPES = Object.freeze(
  Array.from(MEDIA_TRANSCRIPTION_MIME_TYPES)
);

export const isSupportedMediaTranscriptionFile = (fileName: string, mimeType: string): boolean => {
  const normalizedMimeType = mimeType.trim().toLowerCase().split(';')[0] || '';
  return MEDIA_TRANSCRIPTION_EXTENSION_PATTERN.test(fileName.trim())
    || MEDIA_TRANSCRIPTION_MIME_TYPES.has(normalizedMimeType);
};

export const MEDIA_TRANSCRIPTION_PROVIDERS: MediaTranscriptionProviderDefinition[] = [
  {
    id: 'openai',
    label: 'OpenAI transcription',
    defaultEndpoint: 'https://api.openai.com/v1/audio/transcriptions',
    defaultModel: 'whisper-1',
    maxBytes: MEDIA_TRANSCRIPTION_MAX_BYTES,
    supportedMimeTypes: MEDIA_TRANSCRIPTION_SUPPORTED_MIME_TYPES,
    supportsTimedSegments: true,
    supportsCancellation: true,
    progressMode: 'indeterminate'
  },
  {
    id: 'groq',
    label: 'Groq transcription',
    defaultEndpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    defaultModel: 'whisper-large-v3-turbo',
    maxBytes: MEDIA_TRANSCRIPTION_MAX_BYTES,
    supportedMimeTypes: MEDIA_TRANSCRIPTION_SUPPORTED_MIME_TYPES,
    supportsTimedSegments: true,
    supportsCancellation: true,
    progressMode: 'indeterminate'
  }
];

export const MEDIA_TRANSCRIPTION_MODELS: readonly MediaTranscriptionModelDefinition[] = Object.freeze([
  {
    id: 'whisper-1',
    providerId: 'openai',
    label: 'Whisper 1 (timed captions)',
    responseMode: 'timed-json',
    supportsTimedSegments: true
  },
  {
    id: 'gpt-4o-transcribe',
    providerId: 'openai',
    label: 'GPT-4o Transcribe (streaming text)',
    responseMode: 'text-sse',
    supportsTimedSegments: false
  },
  {
    id: 'gpt-4o-mini-transcribe',
    providerId: 'openai',
    label: 'GPT-4o mini Transcribe (streaming text)',
    responseMode: 'text-sse',
    supportsTimedSegments: false
  },
  {
    id: 'whisper-large-v3-turbo',
    providerId: 'groq',
    label: 'Whisper Large V3 Turbo',
    responseMode: 'timed-json',
    supportsTimedSegments: true
  },
  {
    id: 'whisper-large-v3',
    providerId: 'groq',
    label: 'Whisper Large V3',
    responseMode: 'timed-json',
    supportsTimedSegments: true
  }
]);

export const getMediaTranscriptionProvider = (
  providerId: unknown
): MediaTranscriptionProviderDefinition | undefined => (
  MEDIA_TRANSCRIPTION_PROVIDERS.find(provider => provider.id === providerId)
);

export const getMediaTranscriptionModels = (
  providerId: unknown
): readonly MediaTranscriptionModelDefinition[] => (
  MEDIA_TRANSCRIPTION_MODELS.filter(model => model.providerId === providerId)
);

export const getMediaTranscriptionModel = (
  providerId: unknown,
  modelId: unknown
): MediaTranscriptionModelDefinition | undefined => (
  MEDIA_TRANSCRIPTION_MODELS.find(model => model.providerId === providerId && model.id === modelId)
);

export class MediaTranscriptionUpload {
  private readonly chunks: Uint8Array[] = [];
  private receivedBytes = 0;
  private nextChunkIndex = 0;
  private cleared = false;

  constructor(readonly metadata: MediaTranscriptionMetadata) {
    this.validateMetadata(metadata);
  }

  appendBase64Chunk(index: number, encodedChunk: string): { receivedBytes: number; totalBytes: number } {
    if (this.cleared) throw new Error('The media upload is no longer active.');
    if (!Number.isInteger(index) || index !== this.nextChunkIndex) {
      throw new Error(`Expected media chunk ${this.nextChunkIndex}.`);
    }
    if (typeof encodedChunk !== 'string' || !encodedChunk) {
      throw new Error('The media chunk is empty.');
    }

    const bytes = this.decodeBase64(encodedChunk);
    if (bytes.byteLength === 0 || bytes.byteLength > MEDIA_TRANSCRIPTION_CHUNK_BYTES) {
      throw new Error('The media chunk size is invalid.');
    }
    if (this.receivedBytes + bytes.byteLength > this.metadata.totalBytes) {
      throw new Error('The media upload exceeds its declared size.');
    }

    this.chunks.push(bytes);
    this.receivedBytes += bytes.byteLength;
    this.nextChunkIndex++;
    return { receivedBytes: this.receivedBytes, totalBytes: this.metadata.totalBytes };
  }

  createBlob(): Blob {
    if (this.cleared) throw new Error('The media upload is no longer active.');
    if (this.receivedBytes !== this.metadata.totalBytes) {
      throw new Error('The media upload is incomplete.');
    }
    const parts = this.chunks.map(chunk => {
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      return copy.buffer;
    });
    return new Blob(parts, { type: this.metadata.mimeType || 'application/octet-stream' });
  }

  clear(): void {
    this.chunks.splice(0, this.chunks.length);
    this.receivedBytes = 0;
    this.cleared = true;
  }

  private validateMetadata(metadata: MediaTranscriptionMetadata): void {
    if (!getMediaTranscriptionProvider(metadata.providerId)) {
      throw new Error('Choose a supported transcription provider.');
    }
    if (!getMediaTranscriptionModel(metadata.providerId, metadata.transcriptionModel)) {
      throw new Error('Choose a transcription model supported by the selected provider.');
    }
    if (!metadata.fileName?.trim()) throw new Error('Choose an audio or video file.');
    if (!isSupportedMediaTranscriptionFile(metadata.fileName, metadata.mimeType || '')) {
      throw new Error('Choose a supported audio or video file.');
    }
    if (!Number.isInteger(metadata.totalBytes) || metadata.totalBytes <= 0) {
      throw new Error('The selected media file is empty.');
    }
    if (metadata.totalBytes > MEDIA_TRANSCRIPTION_MAX_BYTES) {
      throw new Error('The selected media file exceeds the 25 MB transcription limit.');
    }
    if (
      metadata.fallbackDurationSeconds !== undefined
      && (
        !Number.isFinite(metadata.fallbackDurationSeconds)
        || metadata.fallbackDurationSeconds <= 0
        || metadata.fallbackDurationSeconds > MEDIA_TRANSCRIPTION_MAX_FALLBACK_DURATION_SECONDS
      )
    ) {
      throw new Error('The media fallback duration is invalid.');
    }
  }

  private decodeBase64(value: string): Uint8Array {
    let binary: string;
    try {
      binary = atob(value);
    } catch {
      throw new Error('The media chunk is not valid base64 data.');
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
}

export class MediaTranscriptionService {
  async transcribe(
    upload: MediaTranscriptionUpload,
    providerConfig: TranslationProviderRuntimeConfig | undefined,
    signal?: AbortSignal,
    onPartialText?: (text: string) => void
  ): Promise<MediaTranscriptionResult> {
    const definition = getMediaTranscriptionProvider(upload.metadata.providerId)!;
    const model = getMediaTranscriptionModel(
      upload.metadata.providerId,
      upload.metadata.transcriptionModel
    );
    if (!model) throw new Error('Choose a transcription model supported by the selected provider.');
    const apiKey = providerConfig?.apiKey?.trim() || '';
    if (!apiKey) throw new Error(`${definition.label} API key is not configured.`);

    const endpoint = this.resolveEndpoint(definition, providerConfig?.endpoint);
    const form = new FormData();
    form.append('file', upload.createBlob(), this.sanitizeFileName(upload.metadata.fileName));
    form.append('model', model.id);
    if (model.responseMode === 'text-sse') {
      form.append('stream', 'true');
      form.append('response_format', 'json');
    } else {
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'segment');
    }
    form.append('temperature', '0');
    const language = this.normalizeLanguage(upload.metadata.language);
    if (language) form.append('language', language);
    const prompt = this.normalizeText(upload.metadata.prompt, 1000);
    if (prompt) form.append('prompt', prompt);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal
    });
    if (!response.ok) {
      const data = await this.readErrorResponse(response);
      const providerMessage = typeof data?.error?.message === 'string' ? data.error.message.trim() : '';
      throw new Error(providerMessage || `${definition.label} request failed with HTTP ${response.status}.`);
    }

    if (model.responseMode === 'text-sse') {
      const text = await this.readStreamingTranscript(response, signal, onPartialText);
      const duration = this.normalizeFallbackDuration(upload.metadata.fallbackDurationSeconds);
      return {
        text,
        language: language || 'auto',
        duration,
        segments: [{ id: 1, start: 0, end: duration, text }],
        timingMode: 'fallback'
      };
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error(`${definition.label} returned invalid JSON.`);
    }

    const timedSegments = this.normalizeTimedSegments(data?.segments);
    const segments = timedSegments.length > 0
      ? timedSegments
      : this.normalizeFallbackSegment(
        data?.text,
        data?.duration ?? upload.metadata.fallbackDurationSeconds
      );
    if (segments.length === 0) throw new Error(`${definition.label} returned no transcript text.`);
    const text = typeof data?.text === 'string' && data.text.trim()
      ? data.text.trim()
      : segments.map(segment => segment.text).join(' ');
    const duration = this.toFiniteNumber(data?.duration)
      ?? Math.max(...segments.map(segment => segment.end));

    return {
      text,
      language: typeof data?.language === 'string' ? data.language : language || 'auto',
      duration: Math.max(0, duration),
      segments,
      timingMode: timedSegments.length > 0 ? 'provider-segments' : 'fallback'
    };
  }

  private async readErrorResponse(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private async readStreamingTranscript(
    response: Response,
    signal?: AbortSignal,
    onPartialText?: (text: string) => void
  ): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('OpenAI transcription stream is unavailable.');

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let completedText = '';
    let receivedDone = false;
    let processedEventCount = 0;
    let partialEmissionCount = 0;
    let lastPartialEmissionLength = 0;
    const abortReader = (): void => {
      void reader.cancel().catch(() => undefined);
    };
    signal?.addEventListener('abort', abortReader, { once: true });

    const assertNotAborted = (): void => {
      if (!signal?.aborted) return;
      const error = new Error('Media transcription was canceled.');
      error.name = 'AbortError';
      throw error;
    };
    const processEvent = (rawEvent: string): void => {
      processedEventCount++;
      if (processedEventCount > MEDIA_TRANSCRIPTION_MAX_SSE_EVENTS) {
        throw new Error('OpenAI transcription stream exceeded the event count limit.');
      }
      const lines = rawEvent.split(/\r?\n/);
      let eventName = '';
      const dataLines: string[] = [];
      for (const line of lines) {
        if (!line || line.startsWith(':')) continue;
        const separator = line.indexOf(':');
        const field = separator >= 0 ? line.slice(0, separator) : line;
        let value = separator >= 0 ? line.slice(separator + 1) : '';
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'event') eventName = value;
        else if (field === 'data') dataLines.push(value);
      }
      if (dataLines.length === 0) return;

      const serializedPayload = dataLines.join('\n').trim();
      if (serializedPayload === '[DONE]') {
        return;
      }

      let payload: any;
      try {
        payload = JSON.parse(serializedPayload);
      } catch {
        throw new Error('OpenAI transcription stream returned invalid JSON.');
      }
      const payloadType = typeof payload?.type === 'string' ? payload.type : '';
      const knownTypes = new Set(['transcript.text.delta', 'transcript.text.done']);
      const eventIsKnown = knownTypes.has(eventName);
      const payloadIsKnown = knownTypes.has(payloadType);
      if (!eventIsKnown && !payloadIsKnown) return;
      if ((eventName && eventName !== payloadType) || !payloadIsKnown) {
        throw new Error('OpenAI transcription stream returned a mismatched event type.');
      }
      if (receivedDone) {
        throw new Error('OpenAI transcription stream returned data after completion.');
      }

      if (payloadType === 'transcript.text.delta') {
        if (typeof payload.delta !== 'string') {
          throw new Error('OpenAI transcription stream returned an invalid text delta.');
        }
        accumulated += payload.delta.split('\u0000').join('');
        if (accumulated.length > MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH) {
          throw new Error('OpenAI transcription stream exceeded the transcript text limit.');
        }
        assertNotAborted();
        const shouldEmitPartial = partialEmissionCount < MEDIA_TRANSCRIPTION_INITIAL_PARTIAL_EMISSIONS
          || accumulated.length - lastPartialEmissionLength >= MEDIA_TRANSCRIPTION_PARTIAL_EMIT_INTERVAL;
        if (payload.delta && onPartialText && shouldEmitPartial) {
          onPartialText(this.takeTrailingCodePoints(
            accumulated,
            MEDIA_TRANSCRIPTION_PARTIAL_PREVIEW_LENGTH
          ));
          partialEmissionCount++;
          lastPartialEmissionLength = accumulated.length;
        }
        return;
      }

      if (typeof payload.text !== 'string') {
        throw new Error('OpenAI transcription stream returned an invalid completion event.');
      }
      if (payload.text.split('\u0000').join('').length > MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH) {
        throw new Error('OpenAI transcription stream exceeded the transcript text limit.');
      }
      completedText = this.normalizeText(payload.text, MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH);
      if (!completedText) {
        throw new Error('OpenAI transcription returned no transcript text.');
      }
      receivedDone = true;
    };
    const drainEvents = (flush: boolean): void => {
      let boundary: RegExpExecArray | null;
      const boundaryPattern = /\r?\n\r?\n/g;
      while ((boundary = boundaryPattern.exec(buffer))) {
        const event = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        boundaryPattern.lastIndex = 0;
        if (event) processEvent(event);
      }
      if (flush && buffer.trim()) {
        processEvent(buffer);
        buffer = '';
      }
      if (buffer.length > MEDIA_TRANSCRIPTION_MAX_SSE_EVENT_LENGTH) {
        throw new Error('OpenAI transcription stream event exceeded the size limit.');
      }
    };

    try {
      let streamEnded = false;
      while (!streamEnded) {
        assertNotAborted();
        const { done, value } = await reader.read();
        assertNotAborted();
        if (done) {
          streamEnded = true;
          continue;
        }
        buffer += decoder.decode(value, { stream: true });
        drainEvents(false);
      }
      buffer += decoder.decode();
      drainEvents(true);
    } finally {
      signal?.removeEventListener('abort', abortReader);
      reader.releaseLock();
    }

    if (!receivedDone) throw new Error('OpenAI transcription stream ended before completion.');
    return completedText;
  }

  private resolveEndpoint(
    definition: MediaTranscriptionProviderDefinition,
    configuredEndpoint?: string
  ): string {
    const configured = configuredEndpoint?.trim();
    if (!configured) return definition.defaultEndpoint;

    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error(`${definition.label} endpoint is invalid.`);
    }
    const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !isLocalHttp) {
      throw new Error(`${definition.label} endpoint must use HTTPS or localhost HTTP.`);
    }
    if (url.username || url.password) {
      throw new Error(`${definition.label} endpoint must not contain URL credentials.`);
    }

    const replacedPath = url.pathname.replace(
      /\/(?:chat\/completions|responses)\/?$/,
      '/audio/transcriptions'
    );
    if (replacedPath === url.pathname) {
      throw new Error(`${definition.label} chat endpoint must end in /chat/completions or /responses.`);
    }
    url.pathname = replacedPath;
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  private normalizeTimedSegments(value: unknown): MediaTranscriptionSegment[] {
    if (Array.isArray(value)) {
      const segments = value.flatMap((item, index) => {
        const text = this.normalizeText(item?.text, 10000);
        const start = this.toFiniteNumber(item?.start);
        const end = this.toFiniteNumber(item?.end);
        if (!text || start === null || end === null) return [];
        const safeStart = Math.max(0, start);
        return [{
          id: index + 1,
          start: safeStart,
          end: Math.max(safeStart + 0.05, end),
          text
        }];
      });
      if (segments.length > 0) return segments;
    }
    return [];
  }

  private normalizeFallbackSegment(fallbackText: unknown, durationValue: unknown): MediaTranscriptionSegment[] {
    const text = this.normalizeText(fallbackText, 100000);
    if (!text) return [];
    const duration = this.normalizeFallbackDuration(durationValue);
    return [{ id: 1, start: 0, end: duration, text }];
  }

  private normalizeFallbackDuration(value: unknown): number {
    const duration = this.toFiniteNumber(value) ?? MEDIA_TRANSCRIPTION_DEFAULT_FALLBACK_DURATION_SECONDS;
    return Math.max(0.05, Math.min(MEDIA_TRANSCRIPTION_MAX_FALLBACK_DURATION_SECONDS, duration));
  }

  private normalizeLanguage(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value === 'auto') return '';
    if (value === 'zh-CN' || value === 'zh-TW') return 'zh';
    return value.trim().split('-')[0]!.slice(0, 12);
  }

  private sanitizeFileName(value: string): string {
    const sanitized = Array.from(value)
      .map(character => character.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(character) ? '_' : character)
      .join('')
      .slice(0, 180);
    return sanitized || 'media.bin';
  }

  private normalizeText(value: unknown, maximumLength: number): string {
    return typeof value === 'string'
      ? value.split('\u0000').join('').trim().slice(0, maximumLength)
      : '';
  }

  private takeTrailingCodePoints(value: string, maximumCodePoints: number): string {
    let suffix = value.slice(-maximumCodePoints * 2);
    if (/^[\uDC00-\uDFFF]/.test(suffix)) suffix = suffix.slice(1);
    return Array.from(suffix).slice(-maximumCodePoints).join('');
  }

  private toFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
}

export const mediaTranscriptionService = new MediaTranscriptionService();
