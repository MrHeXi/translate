export interface DocumentBlock {
  id: number;
  originalText: string;
  layout?: DocumentBlockLayout;
}

export interface DocumentBlockLayout {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  source: 'pdf-text' | 'plain-text' | 'subtitle' | 'html' | 'json';
}

export class DocumentTextExtractor {
  static async extractFromFile(file: File): Promise<string> {
    if (this.isPdfFile(file)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return this.extractTextFromPdfBytes(bytes);
    }

    const text = await file.text();
    if (this.isHtmlFile(file)) {
      return this.extractTextFromHtml(text);
    }

    if (this.isJsonFile(file)) {
      return this.extractTextFromJson(text);
    }

    return text;
  }

  static async extractBlocksFromFile(file: File, maxBlockLength: number = 1200): Promise<DocumentBlock[]> {
    if (this.isPdfFile(file)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const layoutBlocks = this.extractLayoutBlocksFromPdfBytes(bytes);
      if (layoutBlocks.length > 0) return layoutBlocks;

      return this.splitIntoBlocks(this.extractTextFromPdfBytes(bytes), maxBlockLength);
    }

    const text = await file.text();
    if (this.isHtmlFile(file)) {
      return this.extractBlocksFromHtml(text, maxBlockLength);
    }

    if (this.isJsonFile(file)) {
      return this.extractBlocksFromJson(text, maxBlockLength);
    }

    return this.splitIntoBlocks(text, maxBlockLength);
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
    const layoutBlocks = this.extractLayoutBlocksFromPdfBytes(bytes);
    if (layoutBlocks.length > 0) {
      return layoutBlocks.map(block => block.originalText).join('\n').trim();
    }

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

  static extractTextFromHtml(html: string): string {
    return this.extractHtmlTextBlocks(html).join('\n\n').trim();
  }

  static extractBlocksFromHtml(html: string, maxBlockLength: number = 1200): DocumentBlock[] {
    const htmlBlocks = this.extractHtmlTextBlocks(html);
    const chunks = htmlBlocks.flatMap(block => this.chunkBlock(block, maxBlockLength));

    return chunks.map((originalText, index) => ({
      id: index + 1,
      originalText
    }));
  }

  static extractTextFromJson(json: string): string {
    return this.extractJsonTextBlocks(json).join('\n\n').trim();
  }

  static extractBlocksFromJson(json: string, maxBlockLength: number = 1200): DocumentBlock[] {
    const jsonBlocks = this.extractJsonTextBlocks(json);
    const chunks = jsonBlocks.flatMap(block => this.chunkBlock(block, maxBlockLength));

    return chunks.map((originalText, index) => ({
      id: index + 1,
      originalText
    }));
  }

  static extractLayoutBlocksFromPdfBytes(bytes: Uint8Array): DocumentBlock[] {
    const pdfText = this.bytesToBinaryString(bytes);
    const streams = this.extractPdfStreams(pdfText);
    const streamSources = streams.length > 0 ? streams : [{ pageNumber: 1, body: pdfText }];
    const items = streamSources.flatMap(stream => this.extractPdfLayoutItems(stream.body, stream.pageNumber));

    return items.map((item, index) => ({
      id: index + 1,
      originalText: item.text,
      layout: {
        pageNumber: item.pageNumber,
        x: item.x,
        y: item.y,
        width: Math.max(48, Math.round(item.text.length * 7)),
        height: 18,
        source: 'pdf-text'
      }
    }));
  }

  private static normalizeText(text: string): string {
    return text
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  private static uniqueTextBlocks(textBlocks: string[]): string[] {
    const seen = new Set<string>();

    return textBlocks
      .map(text => text.trim())
      .filter(Boolean)
      .filter(text => {
        const key = text.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
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

  private static isHtmlFile(file: File): boolean {
    const lowerName = file.name.toLowerCase();
    return file.type === 'text/html' ||
      file.type === 'application/xhtml+xml' ||
      lowerName.endsWith('.html') ||
      lowerName.endsWith('.htm') ||
      lowerName.endsWith('.xhtml');
  }

  private static isJsonFile(file: File): boolean {
    return file.type === 'application/json' ||
      file.type === 'text/json' ||
      file.name.toLowerCase().endsWith('.json');
  }

  private static extractHtmlTextBlocks(html: string): string[] {
    if (typeof DOMParser === 'undefined') {
      return this.splitHtmlTextWithoutParser(html);
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript, template, svg, canvas').forEach(node => node.remove());

    const root = doc.body || doc.documentElement;
    if (!root) return [];

    const blockSelector = [
      'article',
      'section',
      'main',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'li',
      'blockquote',
      'figcaption',
      'caption',
      'th',
      'td',
      'dt',
      'dd',
      'pre'
    ].join(',');

    const candidates = Array.from(root.querySelectorAll(blockSelector))
      .filter(element => !element.querySelector(blockSelector))
      .map(element => this.normalizeHtmlText(element.textContent || ''))
      .filter(Boolean);

    if (candidates.length > 0) {
      return this.uniqueTextBlocks(candidates);
    }

    return this.uniqueTextBlocks([this.normalizeHtmlText(root.textContent || '')]);
  }

  private static splitHtmlTextWithoutParser(html: string): string[] {
    const withoutNoise = html
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '\n')
      .replace(/<template[\s\S]*?<\/template>/gi, '\n');
    const withBlockBreaks = withoutNoise.replace(
      /<\/?(article|section|main|h[1-6]|p|li|blockquote|figcaption|caption|tr|th|td|dt|dd|pre|br)\b[^>]*>/gi,
      '\n'
    );
    const plainText = this.decodeHtmlEntities(withBlockBreaks.replace(/<[^>]+>/g, ' '));

    return this.uniqueTextBlocks(
      plainText
        .split(/\n{2,}|\n/)
        .map(block => this.normalizeHtmlText(block))
        .filter(Boolean)
    );
  }

  private static normalizeHtmlText(text: string): string {
    return this.decodeHtmlEntities(text)
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private static decodeHtmlEntities(text: string): string {
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = text;
      return textarea.value;
    }

    return text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)));
  }

  private static extractJsonTextBlocks(json: string): string[] {
    try {
      const parsed = JSON.parse(json) as unknown;
      const blocks: string[] = [];
      this.collectJsonStrings(parsed, blocks);
      return blocks
        .map(block => this.normalizeJsonText(block))
        .filter(Boolean);
    } catch {
      return this.splitIntoBlocks(json).map(block => block.originalText);
    }
  }

  private static collectJsonStrings(value: unknown, blocks: string[]): void {
    if (typeof value === 'string') {
      blocks.push(value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(item => this.collectJsonStrings(item, blocks));
      return;
    }

    if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(item => this.collectJsonStrings(item, blocks));
    }
  }

  private static normalizeJsonText(text: string): string {
    return text
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private static extractPdfStreams(pdfText: string): Array<{ pageNumber: number; body: string }> {
    const streams: Array<{ pageNumber: number; body: string }> = [];
    const streamPattern = /stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
    let pageNumber = 1;

    for (const match of pdfText.matchAll(streamPattern)) {
      const body = match[1] || '';
      if (!/BT[\s\S]*ET/.test(body)) continue;

      streams.push({ pageNumber, body });
      pageNumber++;
    }

    return streams;
  }

  private static extractPdfLayoutItems(streamBody: string, pageNumber: number): Array<{ pageNumber: number; text: string; x: number; y: number }> {
    const items: Array<{ pageNumber: number; text: string; x: number; y: number }> = [];
    const numberPattern = '[-+]?\\d*\\.?\\d+';
    const operatorPattern = new RegExp([
      `(${numberPattern})\\s+(${numberPattern})\\s+(${numberPattern})\\s+(${numberPattern})\\s+(${numberPattern})\\s+(${numberPattern})\\s+Tm`,
      `(${numberPattern})\\s+(${numberPattern})\\s+T[dD]`,
      `(\\((?:\\\\.|[^\\\\()])*\\)|<[\\dA-Fa-f\\s]+>)\\s*Tj`,
      `\\[((?:.|\\r|\\n)*?)\\]\\s*TJ`,
      'T\\*'
    ].join('|'), 'g');

    let currentX = 0;
    let currentY = 0;

    for (const match of streamBody.matchAll(operatorPattern)) {
      if (match[5] !== undefined && match[6] !== undefined) {
        currentX = Number(match[5]);
        currentY = Number(match[6]);
        continue;
      }

      if (match[7] !== undefined && match[8] !== undefined) {
        currentX += Number(match[7]);
        currentY += Number(match[8]);
        continue;
      }

      if (match[9]) {
        this.pushPdfLayoutItem(items, pageNumber, this.decodePdfTextToken(match[9]), currentX, currentY);
        continue;
      }

      if (match[10]) {
        const tokens = match[10].match(/\((?:\\.|[^\\()])*\)|<[\dA-Fa-f\s]+>/g) || [];
        const text = tokens.map(token => this.decodePdfTextToken(token)).join('');
        this.pushPdfLayoutItem(items, pageNumber, text, currentX, currentY);
        continue;
      }

      currentY -= 14;
    }

    return items;
  }

  private static pushPdfLayoutItem(
    items: Array<{ pageNumber: number; text: string; x: number; y: number }>,
    pageNumber: number,
    text: string,
    x: number,
    y: number
  ): void {
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    if (!normalizedText) return;

    items.push({
      pageNumber,
      text: normalizedText,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100
    });
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
