import { TranslationProviderRuntimeConfig } from './TranslationProviderRegistry';

export type MediaTranscriptionProviderId = 'openai' | 'groq';

export interface MediaTranscriptionProviderDefinition {
  id: MediaTranscriptionProviderId;
  label: string;
  defaultEndpoint: string;
  defaultModel: string;
}

export interface MediaTranscriptionMetadata {
  providerId: MediaTranscriptionProviderId;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  language?: string;
  prompt?: string;
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
}

export const MEDIA_TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;
export const MEDIA_TRANSCRIPTION_CHUNK_BYTES = 256 * 1024;

const MEDIA_TRANSCRIPTION_EXTENSION_PATTERN = /\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i;
const MEDIA_TRANSCRIPTION_MIME_TYPES = new Set([
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/wave',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
  'audio/vnd.wave',
  'video/mp4',
  'video/webm'
]);

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
    defaultModel: 'whisper-1'
  },
  {
    id: 'groq',
    label: 'Groq transcription',
    defaultEndpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    defaultModel: 'whisper-large-v3-turbo'
  }
];

export const getMediaTranscriptionProvider = (
  providerId: unknown
): MediaTranscriptionProviderDefinition | undefined => (
  MEDIA_TRANSCRIPTION_PROVIDERS.find(provider => provider.id === providerId)
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
    signal?: AbortSignal
  ): Promise<MediaTranscriptionResult> {
    const definition = getMediaTranscriptionProvider(upload.metadata.providerId)!;
    const apiKey = providerConfig?.apiKey?.trim() || '';
    if (!apiKey) throw new Error(`${definition.label} API key is not configured.`);

    const endpoint = this.resolveEndpoint(definition, providerConfig?.endpoint);
    const form = new FormData();
    form.append('file', upload.createBlob(), this.sanitizeFileName(upload.metadata.fileName));
    form.append('model', definition.defaultModel);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
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
    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error(`${definition.label} returned invalid JSON.`);
    }
    if (!response.ok) {
      const providerMessage = typeof data?.error?.message === 'string' ? data.error.message.trim() : '';
      throw new Error(providerMessage || `${definition.label} request failed with HTTP ${response.status}.`);
    }

    const segments = this.normalizeSegments(data?.segments, data?.text, data?.duration);
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
      segments
    };
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

  private normalizeSegments(value: unknown, fallbackText: unknown, durationValue: unknown): MediaTranscriptionSegment[] {
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

    const text = this.normalizeText(fallbackText, 100000);
    if (!text) return [];
    const duration = this.toFiniteNumber(durationValue) ?? 5;
    return [{ id: 1, start: 0, end: Math.max(0.05, duration), text }];
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

  private toFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
}

export const mediaTranscriptionService = new MediaTranscriptionService();
