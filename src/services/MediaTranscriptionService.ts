import type { TranslationProviderRuntimeConfig } from './TranslationProviderRegistry';

export type MediaTranscriptionProviderId = 'openai' | 'groq' | 'deepgram' | 'cloudflare';
export type MediaTranscriptionModelId =
  | 'whisper-1'
  | 'gpt-4o-transcribe'
  | 'gpt-4o-mini-transcribe'
  | 'whisper-large-v3-turbo'
  | 'whisper-large-v3'
  | 'nova-3'
  | 'nova-2'
  | '@cf/openai/whisper'
  | '@cf/openai/whisper-large-v3-turbo';

export interface MediaTranscriptionModelDefinition {
  id: MediaTranscriptionModelId;
  providerId: MediaTranscriptionProviderId;
  label: string;
  responseMode: 'timed-json' | 'text-sse' | 'deepgram-json' | 'cloudflare-json';
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
export const MEDIA_TRANSCRIPTION_MAX_SEGMENTS = 10_000;
export const MEDIA_TRANSCRIPTION_MAX_SSE_EVENTS = 50_000;
export const MEDIA_TRANSCRIPTION_PARTIAL_PREVIEW_LENGTH = 4_000;
export const MEDIA_TRANSCRIPTION_MAX_JSON_RESPONSE_BYTES = 4 * 1024 * 1024;

const MEDIA_TRANSCRIPTION_MAX_SSE_EVENT_LENGTH = MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH + 8192;
const MEDIA_TRANSCRIPTION_MAX_ERROR_RESPONSE_BYTES = 64 * 1024;
const MEDIA_TRANSCRIPTION_INITIAL_PARTIAL_EMISSIONS = 16;
const MEDIA_TRANSCRIPTION_PARTIAL_EMIT_INTERVAL = 64;
const MEDIA_TRANSCRIPTION_DEFAULT_FALLBACK_DURATION_SECONDS = 5;
const MEDIA_TRANSCRIPTION_MAX_FALLBACK_DURATION_SECONDS = 24 * 60 * 60;
const MEDIA_TRANSCRIPTION_MAX_SEGMENT_TEXT_LENGTH = 10_000;
const MEDIA_TRANSCRIPTION_MAX_DEEPGRAM_CHANNELS = 8;
const MEDIA_TRANSCRIPTION_MAX_DEEPGRAM_ALTERNATIVES = 5;
const MEDIA_TRANSCRIPTION_MAX_CLOUDFLARE_VTT_LENGTH =
  MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH + MEDIA_TRANSCRIPTION_MAX_SEGMENTS * 64;
const CLOUDFLARE_ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const CLOUDFLARE_TRANSCRIPTION_MODELS = new Set<MediaTranscriptionModelId>([
  '@cf/openai/whisper',
  '@cf/openai/whisper-large-v3-turbo'
]);

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
  },
  {
    id: 'deepgram',
    label: 'Deepgram transcription',
    defaultEndpoint: 'https://api.deepgram.com/v1/listen',
    defaultModel: 'nova-3',
    maxBytes: MEDIA_TRANSCRIPTION_MAX_BYTES,
    supportedMimeTypes: MEDIA_TRANSCRIPTION_SUPPORTED_MIME_TYPES,
    supportsTimedSegments: true,
    supportsCancellation: true,
    progressMode: 'indeterminate'
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI transcription',
    defaultEndpoint: 'https://api.cloudflare.com/client/v4/accounts',
    defaultModel: '@cf/openai/whisper',
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
  },
  {
    id: 'nova-3',
    providerId: 'deepgram',
    label: 'Nova-3',
    responseMode: 'deepgram-json',
    supportsTimedSegments: true
  },
  {
    id: 'nova-2',
    providerId: 'deepgram',
    label: 'Nova-2',
    responseMode: 'deepgram-json',
    supportsTimedSegments: true
  },
  {
    id: '@cf/openai/whisper',
    providerId: 'cloudflare',
    label: 'Cloudflare Whisper',
    responseMode: 'cloudflare-json',
    supportsTimedSegments: true
  },
  {
    id: '@cf/openai/whisper-large-v3-turbo',
    providerId: 'cloudflare',
    label: 'Cloudflare Whisper Large V3 Turbo',
    responseMode: 'cloudflare-json',
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
    this.assertComplete();
    const parts = this.chunks.map(chunk => {
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      return copy.buffer;
    });
    return new Blob(parts, { type: this.metadata.mimeType || 'application/octet-stream' });
  }

  createBytes(): Uint8Array {
    this.assertComplete();
    const bytes = new Uint8Array(this.receivedBytes);
    let offset = 0;
    for (const chunk of this.chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  getByteChunks(): readonly Uint8Array[] {
    this.assertComplete();
    return this.chunks;
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

  private assertComplete(): void {
    if (this.cleared) throw new Error('The media upload is no longer active.');
    if (this.receivedBytes !== this.metadata.totalBytes) {
      throw new Error('The media upload is incomplete.');
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
    if (model.responseMode === 'deepgram-json') {
      return this.transcribeDeepgram(upload, definition, model, apiKey, endpoint, signal);
    }
    if (model.responseMode === 'cloudflare-json') {
      return this.transcribeCloudflare(
        upload,
        definition,
        model,
        apiKey,
        endpoint,
        providerConfig?.clientId,
        signal
      );
    }

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
      const data = await this.readErrorResponse(response, definition.label, signal);
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

    const data = await this.readBoundedJsonResponse(
      response,
      MEDIA_TRANSCRIPTION_MAX_JSON_RESPONSE_BYTES,
      definition.label,
      signal
    );

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

  private async transcribeDeepgram(
    upload: MediaTranscriptionUpload,
    definition: MediaTranscriptionProviderDefinition,
    model: MediaTranscriptionModelDefinition,
    apiKey: string,
    endpoint: string,
    signal?: AbortSignal
  ): Promise<MediaTranscriptionResult> {
    this.assertNotAborted(signal);
    const requestUrl = new URL(endpoint);
    requestUrl.searchParams.set('model', model.id);
    requestUrl.searchParams.set('smart_format', 'true');
    requestUrl.searchParams.set('utterances', 'true');
    const language = this.normalizeDeepgramLanguage(upload.metadata.language);
    if (language) requestUrl.searchParams.set('language', language);
    else requestUrl.searchParams.set('detect_language', 'true');

    const media = upload.createBlob();
    const response = await fetch(requestUrl.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': media.type || 'application/octet-stream'
      },
      body: media,
      signal
    });
    this.assertNotAborted(signal);
    if (!response.ok) {
      const data = await this.readErrorResponse(response, definition.label, signal);
      this.assertNotAborted(signal);
      const providerMessage = this.getDeepgramErrorMessage(data);
      throw new Error(
        providerMessage || `${definition.label} request failed with HTTP ${response.status}.`
      );
    }

    const data = await this.readBoundedJsonResponse(
      response,
      MEDIA_TRANSCRIPTION_MAX_JSON_RESPONSE_BYTES,
      definition.label,
      signal
    );
    this.assertNotAborted(signal);
    return this.normalizeDeepgramResult(data, language, definition.label);
  }

  private async transcribeCloudflare(
    upload: MediaTranscriptionUpload,
    definition: MediaTranscriptionProviderDefinition,
    model: MediaTranscriptionModelDefinition,
    apiKey: string,
    endpoint: string,
    configuredAccountId: string | undefined,
    signal?: AbortSignal
  ): Promise<MediaTranscriptionResult> {
    this.assertNotAborted(signal);
    const accountId = this.normalizeCloudflareAccountId(configuredAccountId, definition.label);
    const requestUrl = this.buildCloudflareRequestUrl(endpoint, accountId, model.id, definition.label);
    const language = this.normalizeLanguage(upload.metadata.language);
    const prompt = this.normalizeText(upload.metadata.prompt, 1000);
    let requestBody: BodyInit;
    let contentType: string;
    if (language || prompt) {
      requestBody = JSON.stringify({
        audio: await this.encodeCloudflareAudio(upload, signal),
        ...(language ? { language } : {}),
        ...(prompt ? { initial_prompt: prompt } : {})
      });
      contentType = 'application/json';
    } else {
      const media = upload.createBlob();
      requestBody = media;
      contentType = media.type || 'application/octet-stream';
    }

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': contentType
        },
        body: requestBody,
        signal
      });
    } catch (error) {
      this.assertNotAborted(signal);
      const message = error instanceof Error ? error.message : '';
      throw new Error(
        this.normalizeText(this.redactSecret(message, apiKey), 1000)
        || `${definition.label} request failed.`
      );
    }
    this.assertNotAborted(signal);

    if (!response.ok) {
      const data = await this.readBoundedJsonResponse(
        response,
        MEDIA_TRANSCRIPTION_MAX_ERROR_RESPONSE_BYTES,
        definition.label,
        signal
      );
      this.assertNotAborted(signal);
      throw new Error(
        this.getCloudflareErrorMessage(data, apiKey)
        || `${definition.label} request failed with HTTP ${response.status}.`
      );
    }

    const data = await this.readBoundedJsonResponse(
      response,
      MEDIA_TRANSCRIPTION_MAX_JSON_RESPONSE_BYTES,
      definition.label,
      signal
    );
    this.assertNotAborted(signal);
    return this.normalizeCloudflareResult(data, upload, definition.label, apiKey);
  }

  private async readErrorResponse(
    response: Response,
    providerLabel: string,
    signal?: AbortSignal
  ): Promise<any> {
    try {
      return await this.readBoundedJsonResponse(
        response,
        MEDIA_TRANSCRIPTION_MAX_ERROR_RESPONSE_BYTES,
        providerLabel,
        signal
      );
    } catch (error) {
      if (error instanceof Error && /exceeded the size limit/i.test(error.message)) throw error;
      return null;
    }
  }

  private normalizeDeepgramResult(
    value: unknown,
    requestedLanguage: string,
    providerLabel: string
  ): MediaTranscriptionResult {
    if (!this.isRecord(value)) {
      throw new Error(`${providerLabel} returned a malformed transcript result.`);
    }
    const results = value.results;
    if (!this.isRecord(results)) {
      throw new Error(`${providerLabel} returned a malformed transcript result.`);
    }
    const channels = results.channels;
    if (
      !Array.isArray(channels)
      || channels.length === 0
      || channels.length > MEDIA_TRANSCRIPTION_MAX_DEEPGRAM_CHANNELS
    ) {
      throw new Error(`${providerLabel} returned a malformed or oversized channel result.`);
    }

    const primaryAlternatives = channels.map(channel => {
      if (!this.isRecord(channel) || !Array.isArray(channel.alternatives)) {
        throw new Error(`${providerLabel} returned a malformed channel result.`);
      }
      if (
        channel.alternatives.length === 0
        || channel.alternatives.length > MEDIA_TRANSCRIPTION_MAX_DEEPGRAM_ALTERNATIVES
        || channel.alternatives.some(alternative => !this.isRecord(alternative))
      ) {
        throw new Error(`${providerLabel} returned a malformed or oversized alternatives result.`);
      }
      return channel.alternatives[0] as Record<string, unknown>;
    });

    let segments: MediaTranscriptionSegment[];
    if (Array.isArray(results.utterances) && results.utterances.length > 0) {
      segments = this.normalizeDeepgramUtterances(results.utterances, providerLabel);
    } else if (results.utterances !== undefined && !Array.isArray(results.utterances)) {
      throw new Error(`${providerLabel} returned malformed utterances.`);
    } else {
      const words = primaryAlternatives.flatMap(alternative => {
        if (!Array.isArray(alternative.words)) {
          throw new Error(`${providerLabel} returned no timed transcript words.`);
        }
        return alternative.words;
      });
      segments = this.normalizeDeepgramWords(words, providerLabel);
    }

    segments.sort((left, right) => left.start - right.start || left.end - right.end);
    segments = segments.map((segment, index) => ({ ...segment, id: index + 1 }));
    const text = segments.map(segment => segment.text).join(' ').trim();
    if (!text) throw new Error(`${providerLabel} returned no transcript text.`);
    if (text.length > MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH) {
      throw new Error(`${providerLabel} transcript exceeded the text limit.`);
    }

    const metadata = this.isRecord(value.metadata) ? value.metadata : null;
    const metadataDuration = this.toFiniteNumber(metadata?.duration);
    if (
      metadataDuration !== null
      && (metadataDuration < 0 || metadataDuration > MEDIA_TRANSCRIPTION_MAX_FALLBACK_DURATION_SECONDS)
    ) {
      throw new Error(`${providerLabel} returned an invalid duration.`);
    }
    const duration = Math.max(metadataDuration ?? 0, ...segments.map(segment => segment.end));
    const detectedLanguage = channels
      .map(channel => this.isRecord(channel) ? channel.detected_language : undefined)
      .find(language => typeof language === 'string' && language.trim());

    return {
      text,
      language: typeof detectedLanguage === 'string'
        ? this.normalizeProviderLanguage(detectedLanguage)
        : this.normalizeRequestedLanguage(requestedLanguage),
      duration,
      segments,
      timingMode: 'provider-segments'
    };
  }

  private normalizeCloudflareResult(
    value: unknown,
    upload: MediaTranscriptionUpload,
    providerLabel: string,
    apiKey: string
  ): MediaTranscriptionResult {
    if (!this.isRecord(value)) {
      throw new Error(`${providerLabel} returned a malformed response envelope.`);
    }
    if (value.success !== true) {
      throw new Error(
        this.getCloudflareErrorMessage(value, apiKey)
        || `${providerLabel} reported an unsuccessful request.`
      );
    }
    if (!this.isRecord(value.result)) {
      throw new Error(`${providerLabel} returned a malformed transcript result.`);
    }

    const result = value.result;
    const transcriptionInfo = this.isRecord(result.transcription_info)
      ? result.transcription_info
      : null;
    const responseText = this.readCloudflareText(
      result.text ?? transcriptionInfo?.text,
      MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH,
      providerLabel,
      'transcript text'
    );
    const timedSegments = this.normalizeCloudflareSegments(
      result.segments ?? transcriptionInfo?.segments,
      providerLabel
    );
    const vttSegments = timedSegments.length === 0
      ? this.normalizeCloudflareVtt(result.vtt, providerLabel)
      : [];
    const wordSegments = timedSegments.length === 0 && vttSegments.length === 0
      ? this.normalizeCloudflareWords(result.words, providerLabel)
      : [];
    let segments = timedSegments.length > 0
      ? timedSegments
      : vttSegments.length > 0
        ? vttSegments
        : wordSegments;
    const text = responseText || segments.map(segment => segment.text).join(' ').trim();
    if (!text) throw new Error(`${providerLabel} returned no transcript text.`);
    if (text.length > MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH) {
      throw new Error(`${providerLabel} transcript exceeded the text limit.`);
    }

    if (segments.length === 0) {
      segments = this.normalizeFallbackSegment(
        text,
        transcriptionInfo?.duration ?? upload.metadata.fallbackDurationSeconds
      );
    }
    const duration = Math.max(...segments.map(segment => segment.end));
    const detectedLanguage = typeof transcriptionInfo?.language === 'string'
      ? this.normalizeProviderLanguage(transcriptionInfo.language)
      : '';
    const requestedLanguage = this.normalizeLanguage(upload.metadata.language);

    return {
      text,
      language: detectedLanguage || requestedLanguage || 'auto',
      duration,
      segments,
      timingMode: timedSegments.length > 0 || vttSegments.length > 0 || wordSegments.length > 0
        ? 'provider-segments'
        : 'fallback'
    };
  }

  private normalizeCloudflareSegments(
    value: unknown,
    providerLabel: string
  ): MediaTranscriptionSegment[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      throw new Error(`${providerLabel} returned malformed transcript segments.`);
    }
    if (value.length === 0) return [];
    if (value.length > MEDIA_TRANSCRIPTION_MAX_SEGMENTS) {
      throw new Error(`${providerLabel} returned too many transcript segments.`);
    }

    let totalTextLength = 0;
    const segments = value.map((segment, index) => {
      if (!this.isRecord(segment)) {
        throw new Error(`${providerLabel} returned a malformed transcript segment.`);
      }
      const text = this.readCloudflareText(
        segment.text,
        MEDIA_TRANSCRIPTION_MAX_SEGMENT_TEXT_LENGTH,
        providerLabel,
        'transcript segment'
      );
      const normalized = this.createStrictTimedSegment(
        index + 1,
        segment.start,
        segment.end,
        text,
        providerLabel
      );
      totalTextLength = this.addBoundedTextLength(totalTextLength, normalized.text, providerLabel);
      return normalized;
    });
    return this.sortAndRenumberSegments(segments);
  }

  private normalizeCloudflareVtt(
    value: unknown,
    providerLabel: string
  ): MediaTranscriptionSegment[] {
    if (value === undefined || value === null || value === '') return [];
    if (typeof value !== 'string') {
      throw new Error(`${providerLabel} returned malformed WebVTT captions.`);
    }
    if (value.length > MEDIA_TRANSCRIPTION_MAX_CLOUDFLARE_VTT_LENGTH) {
      throw new Error(`${providerLabel} WebVTT captions exceeded the size limit.`);
    }

    const lines = value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    if (!/^WEBVTT(?:[ \t].*)?$/.test(lines[0] || '')) {
      throw new Error(`${providerLabel} returned malformed WebVTT captions.`);
    }

    const segments: MediaTranscriptionSegment[] = [];
    let totalTextLength = 0;
    let index = 1;
    while (index < lines.length && lines[index]?.trim()) index++;
    while (index < lines.length) {
      while (index < lines.length && !lines[index]?.trim()) index++;
      if (index >= lines.length) break;

      const blockStart = lines[index]!.trim();
      if (/^(?:NOTE|STYLE|REGION)(?:[ \t]|$)/.test(blockStart)) {
        while (index < lines.length && lines[index]?.trim()) index++;
        continue;
      }

      let timingLine = blockStart;
      index++;
      if (!timingLine.includes('-->')) {
        if (index >= lines.length) {
          throw new Error(`${providerLabel} returned malformed WebVTT captions.`);
        }
        timingLine = lines[index]!.trim();
        index++;
      }
      const timing = /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(timingLine);
      if (!timing) throw new Error(`${providerLabel} returned malformed WebVTT captions.`);

      const cueLines: string[] = [];
      while (index < lines.length && lines[index]?.trim()) {
        cueLines.push(lines[index]!);
        index++;
      }
      const text = this.readCloudflareText(
        cueLines.join(' ').replace(/<[^>\r\n]{1,256}>/g, ''),
        MEDIA_TRANSCRIPTION_MAX_SEGMENT_TEXT_LENGTH,
        providerLabel,
        'WebVTT cue'
      );
      const start = this.parseCloudflareVttTimestamp(timing[1]!);
      const end = this.parseCloudflareVttTimestamp(timing[2]!);
      const segment = this.createStrictTimedSegment(
        segments.length + 1,
        start,
        end,
        text,
        providerLabel
      );
      totalTextLength = this.addBoundedTextLength(totalTextLength, segment.text, providerLabel);
      segments.push(segment);
      if (segments.length > MEDIA_TRANSCRIPTION_MAX_SEGMENTS) {
        throw new Error(`${providerLabel} returned too many transcript segments.`);
      }
    }
    if (segments.length === 0) {
      throw new Error(`${providerLabel} returned malformed WebVTT captions.`);
    }
    return this.sortAndRenumberSegments(segments);
  }

  private normalizeCloudflareWords(
    value: unknown,
    providerLabel: string
  ): MediaTranscriptionSegment[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      throw new Error(`${providerLabel} returned malformed transcript words.`);
    }
    if (value.length === 0) return [];
    if (value.length > MEDIA_TRANSCRIPTION_MAX_SEGMENTS) {
      throw new Error(`${providerLabel} returned too many transcript words.`);
    }

    let totalTextLength = 0;
    const segments = value.map((word, index) => {
      if (!this.isRecord(word)) {
        throw new Error(`${providerLabel} returned a malformed transcript word.`);
      }
      const text = this.readCloudflareText(
        word.word,
        MEDIA_TRANSCRIPTION_MAX_SEGMENT_TEXT_LENGTH,
        providerLabel,
        'transcript word'
      );
      const segment = this.createStrictTimedSegment(
        index + 1,
        word.start,
        word.end,
        text,
        providerLabel
      );
      totalTextLength = this.addBoundedTextLength(totalTextLength, segment.text, providerLabel);
      return segment;
    });
    return this.sortAndRenumberSegments(segments);
  }

  private parseCloudflareVttTimestamp(value: string): number | null {
    const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
    if (!match) return null;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const milliseconds = Number(match[4]);
    const timestamp = hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  private sortAndRenumberSegments(
    segments: MediaTranscriptionSegment[]
  ): MediaTranscriptionSegment[] {
    return segments
      .sort((left, right) => left.start - right.start || left.end - right.end || left.id - right.id)
      .map((segment, index) => ({ ...segment, id: index + 1 }));
  }

  private addBoundedTextLength(current: number, text: string, providerLabel: string): number {
    const next = current + text.length + (current > 0 ? 1 : 0);
    if (next > MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH) {
      throw new Error(`${providerLabel} transcript exceeded the text limit.`);
    }
    return next;
  }

  private readCloudflareText(
    value: unknown,
    maximumLength: number,
    providerLabel: string,
    fieldLabel: string
  ): string {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string') {
      throw new Error(`${providerLabel} returned a malformed ${fieldLabel}.`);
    }
    const text = value.split('\u0000').join('').trim();
    if (!text || text.length > maximumLength) {
      throw new Error(`${providerLabel} returned an oversized or empty ${fieldLabel}.`);
    }
    return text;
  }

  private normalizeDeepgramUtterances(
    utterances: unknown[],
    providerLabel: string
  ): MediaTranscriptionSegment[] {
    if (utterances.length > MEDIA_TRANSCRIPTION_MAX_SEGMENTS) {
      throw new Error(`${providerLabel} returned too many transcript segments.`);
    }
    let totalTextLength = 0;
    const segments = utterances.map((utterance, index) => {
      if (!this.isRecord(utterance)) {
        throw new Error(`${providerLabel} returned a malformed utterance.`);
      }
      let text = this.readDeepgramText(utterance.transcript);
      if (!text && Array.isArray(utterance.words)) {
        if (utterance.words.length > MEDIA_TRANSCRIPTION_MAX_SEGMENTS) {
          throw new Error(`${providerLabel} returned too many transcript words.`);
        }
        text = utterance.words.map(word => this.readDeepgramWordText(word, providerLabel)).join(' ');
      }
      const segment = this.createStrictTimedSegment(
        index + 1,
        utterance.start,
        utterance.end,
        text,
        providerLabel
      );
      totalTextLength = this.addDeepgramTextLength(totalTextLength, segment.text, providerLabel);
      return segment;
    });
    if (segments.length === 0) throw new Error(`${providerLabel} returned no transcript segments.`);
    return segments;
  }

  private normalizeDeepgramWords(words: unknown[], providerLabel: string): MediaTranscriptionSegment[] {
    if (words.length === 0) throw new Error(`${providerLabel} returned no timed transcript words.`);
    if (words.length > MEDIA_TRANSCRIPTION_MAX_SEGMENTS) {
      throw new Error(`${providerLabel} returned too many transcript segments.`);
    }
    let totalTextLength = 0;
    return words.map((word, index) => {
      if (!this.isRecord(word)) {
        throw new Error(`${providerLabel} returned a malformed transcript word.`);
      }
      const segment = this.createStrictTimedSegment(
        index + 1,
        word.start,
        word.end,
        this.readDeepgramWordText(word, providerLabel),
        providerLabel
      );
      totalTextLength = this.addDeepgramTextLength(totalTextLength, segment.text, providerLabel);
      return segment;
    });
  }

  private addDeepgramTextLength(current: number, text: string, providerLabel: string): number {
    const next = current + text.length + (current > 0 ? 1 : 0);
    if (next > MEDIA_TRANSCRIPTION_MAX_TEXT_LENGTH) {
      throw new Error(`${providerLabel} transcript exceeded the text limit.`);
    }
    return next;
  }

  private createStrictTimedSegment(
    id: number,
    startValue: unknown,
    endValue: unknown,
    text: string,
    providerLabel: string
  ): MediaTranscriptionSegment {
    const start = this.toFiniteNumber(startValue);
    const end = this.toFiniteNumber(endValue);
    if (
      !text
      || text.length > MEDIA_TRANSCRIPTION_MAX_SEGMENT_TEXT_LENGTH
      || start === null
      || end === null
      || start < 0
      || end <= start
      || end > MEDIA_TRANSCRIPTION_MAX_FALLBACK_DURATION_SECONDS
    ) {
      throw new Error(`${providerLabel} returned a malformed transcript segment.`);
    }
    return { id, start, end, text };
  }

  private readDeepgramWordText(value: unknown, providerLabel: string): string {
    if (!this.isRecord(value)) {
      throw new Error(`${providerLabel} returned a malformed transcript word.`);
    }
    const text = this.readDeepgramText(value.punctuated_word)
      || this.readDeepgramText(value.word);
    if (!text) throw new Error(`${providerLabel} returned a malformed transcript word.`);
    return text;
  }

  private readDeepgramText(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.split('\u0000').join('').trim();
  }

  private normalizeProviderLanguage(value: string): string {
    const language = value.trim();
    return language && language.length <= 32 ? language : 'auto';
  }

  private normalizeDeepgramLanguage(value: unknown): string {
    if (typeof value !== 'string') return '';
    const language = value.trim();
    if (!language || language.toLowerCase() === 'auto') return '';
    if (language.toLowerCase() === 'multi') return 'multi';
    return /^(?:[A-Za-z]{2,3})(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(language)
      ? language.slice(0, 32)
      : '';
  }

  private normalizeRequestedLanguage(value: string): string {
    if (!value) return 'auto';
    if (value === 'multi') return value;
    return value.split('-')[0] || 'auto';
  }

  private getDeepgramErrorMessage(value: unknown): string {
    if (!this.isRecord(value)) return '';
    const message = typeof value.err_msg === 'string'
      ? value.err_msg
      : typeof value.error === 'string'
        ? value.error
        : '';
    return this.normalizeText(message, 1000);
  }

  private getCloudflareErrorMessage(value: unknown, apiKey: string): string {
    if (!this.isRecord(value)) return '';
    let message = '';
    if (Array.isArray(value.errors) && value.errors.length <= 100) {
      const firstError = value.errors.find(error => (
        this.isRecord(error) && typeof error.message === 'string' && error.message.trim()
      ));
      if (this.isRecord(firstError)) message = String(firstError.message);
    }
    if (!message && this.isRecord(value.error) && typeof value.error.message === 'string') {
      message = value.error.message;
    }
    return this.normalizeText(this.redactSecret(message, apiKey), 1000);
  }

  private redactSecret(message: string, secret: string): string {
    if (!message || !secret) return message;
    let redacted = message.split(secret).join('[redacted]');
    const encodedSecret = encodeURIComponent(secret);
    if (encodedSecret !== secret) redacted = redacted.split(encodedSecret).join('[redacted]');
    return redacted;
  }

  private async encodeCloudflareAudio(
    upload: MediaTranscriptionUpload,
    signal?: AbortSignal
  ): Promise<string> {
    this.assertNotAborted(signal);
    const encoded: string[] = [];
    const chunkSize = 24_576;
    const yieldAfterBytes = 1024 * 1024;
    let bytesSinceYield = 0;
    let carry = new Uint8Array(0);

    for (const sourceChunk of upload.getByteChunks()) {
      this.assertNotAborted(signal);
      let bytes = sourceChunk;
      if (carry.byteLength > 0) {
        bytes = new Uint8Array(carry.byteLength + sourceChunk.byteLength);
        bytes.set(carry);
        bytes.set(sourceChunk, carry.byteLength);
      }
      const completeLength = bytes.byteLength - (bytes.byteLength % 3);
      for (let offset = 0; offset < completeLength; offset += chunkSize) {
        this.assertNotAborted(signal);
        const chunk = bytes.subarray(offset, Math.min(completeLength, offset + chunkSize));
        let binary = '';
        for (let index = 0; index < chunk.length; index++) {
          binary += String.fromCharCode(chunk[index]!);
        }
        encoded.push(btoa(binary));
        bytesSinceYield += chunk.byteLength;
        if (bytesSinceYield >= yieldAfterBytes) {
          bytesSinceYield = 0;
          await new Promise<void>(resolve => setTimeout(resolve, 0));
          this.assertNotAborted(signal);
        }
      }
      carry = bytes.slice(completeLength);
    }
    if (carry.byteLength > 0) {
      let binary = '';
      for (let index = 0; index < carry.byteLength; index++) {
        binary += String.fromCharCode(carry[index]!);
      }
      encoded.push(btoa(binary));
    }
    this.assertNotAborted(signal);
    return encoded.join('');
  }

  private async readBoundedJsonResponse(
    response: Response,
    maximumBytes: number,
    providerLabel: string,
    signal?: AbortSignal
  ): Promise<any> {
    const declaredLength = response.headers?.get?.('content-length');
    if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maximumBytes) {
      throw new Error(`${providerLabel} response exceeded the size limit.`);
    }

    let text: string;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      let complete = false;
      try {
        while (!complete) {
          this.assertNotAborted(signal);
          const { done, value } = await reader.read();
          if (done) {
            complete = true;
            continue;
          }
          if (!value) continue;
          totalBytes += value.byteLength;
          if (totalBytes > maximumBytes) {
            await reader.cancel();
            throw new Error(`${providerLabel} response exceeded the size limit.`);
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      text = new TextDecoder().decode(bytes);
    } else if (typeof response.text === 'function') {
      text = await response.text();
      if (this.getUtf8ByteLength(text) > maximumBytes) {
        throw new Error(`${providerLabel} response exceeded the size limit.`);
      }
    } else {
      let data: any;
      let serialized: string;
      try {
        data = await response.json();
        serialized = JSON.stringify(data);
      } catch {
        throw new Error(`${providerLabel} returned invalid JSON.`);
      }
      if (this.getUtf8ByteLength(serialized) > maximumBytes) {
        throw new Error(`${providerLabel} response exceeded the size limit.`);
      }
      this.assertNotAborted(signal);
      return data;
    }

    this.assertNotAborted(signal);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${providerLabel} returned invalid JSON.`);
    }
  }

  private getUtf8ByteLength(value: string): number {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength;
    return new Blob([value]).size;
  }

  private normalizeCloudflareAccountId(value: unknown, providerLabel: string): string {
    if (typeof value !== 'string' || !CLOUDFLARE_ACCOUNT_ID_PATTERN.test(value.trim())) {
      throw new Error(`${providerLabel} account ID must be exactly 32 hexadecimal characters.`);
    }
    return value.trim().toLowerCase();
  }

  private buildCloudflareRequestUrl(
    endpoint: string,
    accountId: string,
    modelId: MediaTranscriptionModelId,
    providerLabel: string
  ): string {
    if (!CLOUDFLARE_TRANSCRIPTION_MODELS.has(modelId)) {
      throw new Error(`${providerLabel} model path is invalid.`);
    }
    const modelSegments = modelId.split('/');
    if (
      modelSegments.length !== 3
      || modelSegments[0] !== '@cf'
      || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(modelSegments[1] || '')
      || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(modelSegments[2] || '')
    ) {
      throw new Error(`${providerLabel} model path is invalid.`);
    }

    const url = new URL(endpoint);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/${accountId}/ai/run/${modelId}`;
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  private assertNotAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    const error = new Error('Media transcription was canceled.');
    error.name = 'AbortError';
    throw error;
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

    if (definition.id === 'deepgram') {
      if (!/\/v1\/listen\/?$/.test(url.pathname)) {
        throw new Error(`${definition.label} endpoint must end in /v1/listen.`);
      }
      url.pathname = url.pathname.replace(/\/$/, '');
      url.search = '';
      url.hash = '';
      return url.toString();
    }

    if (definition.id === 'cloudflare') {
      if (
        url.protocol !== 'https:'
        || url.hostname !== 'api.cloudflare.com'
        || url.port
        || !/^\/client\/v4\/accounts\/?$/.test(url.pathname)
        || url.search
        || url.hash
      ) {
        throw new Error(
          `${definition.label} endpoint must be https://api.cloudflare.com/client/v4/accounts.`
        );
      }
      url.pathname = '/client/v4/accounts';
      return url.toString();
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

export const mediaTranscriptionService = new MediaTranscriptionService();
