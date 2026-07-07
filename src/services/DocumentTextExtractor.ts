export interface DocumentBlock {
  id: number;
  originalText: string;
}

export class DocumentTextExtractor {
  static async extractFromFile(file: File): Promise<string> {
    if (this.isPdfFile(file)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return this.extractTextFromPdfBytes(bytes);
    }

    return file.text();
  }

  static splitIntoBlocks(text: string, maxBlockLength: number = 1200): DocumentBlock[] {
    const normalizedText = this.normalizeText(text);
    if (!normalizedText) return [];

    const subtitleBlocks = this.extractSubtitleBlocks(normalizedText);
    const rawBlocks = subtitleBlocks.length > 0
      ? subtitleBlocks
      : normalizedText.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);

    const chunks = rawBlocks.flatMap(block => this.chunkBlock(block, maxBlockLength));

    return chunks.map((originalText, index) => ({
      id: index + 1,
      originalText
    }));
  }

  static extractTextFromPdfBytes(bytes: Uint8Array): string {
    const pdfText = this.bytesToBinaryString(bytes);
    const extracted: string[] = [];

    const textOperatorPattern = /(\((?:\\.|[^\\()])*\)|<[\dA-Fa-f\s]+>)\s*Tj/g;
    for (const match of pdfText.matchAll(textOperatorPattern)) {
      const token = match[1];
      if (token) extracted.push(this.decodePdfTextToken(token));
    }

    const arrayOperatorPattern = /\[((?:.|\r|\n)*?)\]\s*TJ/g;
    for (const match of pdfText.matchAll(arrayOperatorPattern)) {
      const arrayBody = match[1] || '';
      const tokens = arrayBody.match(/\((?:\\.|[^\\()])*\)|<[\dA-Fa-f\s]+>/g) || [];
      const joinedText = tokens.map(token => this.decodePdfTextToken(token)).join('');
      if (joinedText.trim()) extracted.push(joinedText);
    }

    return extracted
      .map(text => text.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private static normalizeText(text: string): string {
    return text
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  private static extractSubtitleBlocks(text: string): string[] {
    if (!/-->\s*\d{2}:\d{2}|\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(text)) {
      return [];
    }

    return text
      .split(/\n{2,}/)
      .map(cue => cue
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !/^\d+$/.test(line) && !/-->/.test(line))
        .join(' ')
        .trim()
      )
      .filter(Boolean);
  }

  private static chunkBlock(block: string, maxBlockLength: number): string[] {
    const normalizedBlock = block.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (normalizedBlock.length <= maxBlockLength) return [normalizedBlock];

    const sentences = normalizedBlock.match(/[^.!?。！？]+[.!?。！？]?/g) || [normalizedBlock];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const nextChunk = currentChunk ? `${currentChunk} ${sentence.trim()}` : sentence.trim();
      if (nextChunk.length > maxBlockLength && currentChunk) {
        chunks.push(currentChunk);
        currentChunk = sentence.trim();
      } else {
        currentChunk = nextChunk;
      }
    }

    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  }

  private static isPdfFile(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  private static bytesToBinaryString(bytes: Uint8Array): string {
    const chunkSize = 8192;
    let result = '';

    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.slice(index, index + chunkSize);
      result += String.fromCharCode(...chunk);
    }

    return result;
  }

  private static decodePdfTextToken(token: string): string {
    if (token.startsWith('<')) {
      return this.decodePdfHexString(token);
    }

    return this.decodePdfLiteralString(token);
  }

  private static decodePdfLiteralString(token: string): string {
    const body = token.slice(1, -1);

    return body.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_match, escape: string) => {
      switch (escape) {
        case 'n':
          return '\n';
        case 'r':
          return '\r';
        case 't':
          return '\t';
        case 'b':
          return '\b';
        case 'f':
          return '\f';
        case '(':
        case ')':
        case '\\':
          return escape;
        default:
          return String.fromCharCode(parseInt(escape, 8));
      }
    });
  }

  private static decodePdfHexString(token: string): string {
    const hex = token.slice(1, -1).replace(/\s+/g, '');
    const normalizedHex = hex.length % 2 === 0 ? hex : `${hex}0`;
    const bytes: number[] = [];

    for (let index = 0; index < normalizedHex.length; index += 2) {
      bytes.push(parseInt(normalizedHex.slice(index, index + 2), 16));
    }

    if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return this.decodeUtf16Be(bytes.slice(2));
    }

    return String.fromCharCode(...bytes);
  }

  private static decodeUtf16Be(bytes: number[]): string {
    let result = '';

    for (let index = 0; index < bytes.length; index += 2) {
      const high = bytes[index] || 0;
      const low = bytes[index + 1] || 0;
      result += String.fromCharCode((high << 8) | low);
    }

    return result;
  }
}
