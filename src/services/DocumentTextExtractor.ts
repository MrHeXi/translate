export interface DocumentBlock {
  id: number;
  originalText: string;
  layout?: DocumentBlockLayout;
  subtitle?: DocumentSubtitleCue;
  json?: DocumentJsonStringValue;
  docx?: DocumentDocxParagraph;
}

export interface DocumentBlockLayout {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  source: 'pdf-text' | 'plain-text' | 'subtitle' | 'html' | 'json';
}

export interface DocumentSubtitleCue {
  format: 'srt' | 'vtt';
  index?: string;
  identifier?: string;
  timing: string;
  textLines: string[];
}

export interface DocumentJsonStringValue {
  path: Array<string | number>;
}

export interface DocumentDocxParagraph {
  entryName: string;
  paragraphIndex: number;
}

interface ZipCentralEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

interface ZipFileData {
  name: string;
  data: Uint8Array;
}

export class DocumentTextExtractor {
  static async extractFromFile(file: File): Promise<string> {
    if (this.isPdfFile(file)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return this.extractTextFromPdfBytes(bytes);
    }

    if (this.isDocxFile(file)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return this.extractTextFromDocxBytes(bytes);
    }

    if (this.isEpubFile(file)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return this.extractTextFromEpubBytes(bytes);
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

    if (this.isDocxFile(file)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return this.extractBlocksFromDocxBytes(bytes, maxBlockLength);
    }

    if (this.isEpubFile(file)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return this.extractBlocksFromEpubBytes(bytes, maxBlockLength);
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

    const subtitleBlocks = this.extractBlocksFromSubtitleText(normalizedText);
    if (subtitleBlocks.length > 0) return subtitleBlocks;

    const rawBlocks = normalizedText.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);

    const chunks = rawBlocks.flatMap(block => this.chunkBlock(block, maxBlockLength));

    return chunks.map((originalText, index) => ({
      id: index + 1,
      originalText
    }));
  }

  static extractBlocksFromSubtitleText(text: string, preferredFormat?: 'srt' | 'vtt'): DocumentBlock[] {
    const normalizedText = this.normalizeText(text);
    if (!normalizedText || !/-->/.test(normalizedText)) return [];

    const format = preferredFormat || (normalizedText.trimStart().startsWith('WEBVTT') ? 'vtt' : 'srt');
    const cueBlocks = normalizedText
      .split(/\n{2,}/)
      .map(block => block.split('\n').map(line => line.trim()))
      .filter(lines => lines.length > 0);
    const documentBlocks: DocumentBlock[] = [];

    for (const lines of cueBlocks) {
      const firstLine = lines[0] || '';
      if (/^WEBVTT\b/i.test(firstLine) || /^NOTE\b/i.test(firstLine) || /^STYLE\b/i.test(firstLine) || /^REGION\b/i.test(firstLine)) {
        continue;
      }

      const timingIndex = lines.findIndex(line => /-->\s*\d{2}:\d{2}/.test(line) || /\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(line));
      if (timingIndex < 0) continue;

      const leadingLines = lines.slice(0, timingIndex).filter(Boolean);
      const index = leadingLines.length === 1 && /^\d+$/.test(leadingLines[0]!) ? leadingLines[0] : undefined;
      const identifier = leadingLines.length > 0 && !index ? leadingLines.join('\n') : undefined;
      const textLines = lines.slice(timingIndex + 1).filter(Boolean);
      if (textLines.length === 0) continue;

      const subtitle: DocumentSubtitleCue = {
        format,
        timing: lines[timingIndex]!,
        textLines
      };

      if (index) subtitle.index = index;
      if (identifier) subtitle.identifier = identifier;

      documentBlocks.push({
        id: documentBlocks.length + 1,
        originalText: textLines.join('\n'),
        subtitle
      });
    }

    return documentBlocks;
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
    try {
      const parsed = JSON.parse(json) as unknown;
      const values: Array<{ text: string; path: Array<string | number> }> = [];
      this.collectJsonStringValues(parsed, [], values);

      return values
        .map(value => ({
          originalText: this.normalizeJsonText(value.text),
          json: { path: value.path }
        }))
        .filter(value => value.originalText)
        .map((value, index) => ({
          id: index + 1,
          originalText: value.originalText,
          json: value.json
        }));
    } catch {
      const jsonBlocks = this.extractJsonTextBlocks(json);
      const chunks = jsonBlocks.flatMap(block => this.chunkBlock(block, maxBlockLength));

      return chunks.map((originalText, index) => ({
        id: index + 1,
        originalText
      }));
    }
  }

  static rewriteJsonWithTranslations(
    json: string,
    results: Array<{ block: DocumentBlock; translatedText: string }>
  ): string {
    let parsed = JSON.parse(json) as unknown;

    results.forEach(result => {
      if (!result.block.json || !result.translatedText.trim()) return;
      if (result.block.json.path.length === 0) {
        parsed = result.translatedText.trim();
        return;
      }

      this.setJsonValueAtPath(parsed, result.block.json.path, result.translatedText.trim());
    });

    return `${JSON.stringify(parsed, null, 2)}\n`;
  }

  static async extractTextFromDocxBytes(bytes: Uint8Array): Promise<string> {
    return (await this.extractDocxTextBlocksFromBytes(bytes)).join('\n\n').trim();
  }

  static async extractBlocksFromDocxBytes(bytes: Uint8Array, maxBlockLength: number = 1200): Promise<DocumentBlock[]> {
    void maxBlockLength;
    return this.extractDocxParagraphBlocksFromBytes(bytes);
  }

  static async rewriteDocxWithTranslations(
    bytes: Uint8Array,
    results: Array<{ block: DocumentBlock; translatedText: string }>
  ): Promise<Uint8Array> {
    const entries = this.readZipCentralDirectory(bytes);
    const replacements = new Map<string, Map<number, string>>();

    results.forEach(result => {
      if (!result.block.docx || !result.translatedText.trim()) return;

      const entryReplacements = replacements.get(result.block.docx.entryName) || new Map<number, string>();
      entryReplacements.set(result.block.docx.paragraphIndex, result.translatedText.trim());
      replacements.set(result.block.docx.entryName, entryReplacements);
    });

    const files: ZipFileData[] = [];
    for (const entry of entries) {
      let data = await this.readZipEntryData(bytes, entry);

      const entryReplacements = replacements.get(entry.name);
      if (entryReplacements) {
        const xml = new TextDecoder('utf-8').decode(data);
        data = new TextEncoder().encode(this.rewriteDocxXmlParagraphs(xml, entryReplacements));
      }

      files.push({ name: entry.name, data });
    }

    return this.createStoredZip(files);
  }

  static async extractTextFromEpubBytes(bytes: Uint8Array): Promise<string> {
    return (await this.extractEpubTextBlocksFromBytes(bytes)).join('\n\n').trim();
  }

  static async extractBlocksFromEpubBytes(bytes: Uint8Array, maxBlockLength: number = 1200): Promise<DocumentBlock[]> {
    const epubBlocks = await this.extractEpubTextBlocksFromBytes(bytes);
    const chunks = epubBlocks.flatMap(block => this.chunkBlock(block, maxBlockLength));

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

  private static isDocxFile(file: File): boolean {
    return file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.toLowerCase().endsWith('.docx');
  }

  private static isEpubFile(file: File): boolean {
    return file.type === 'application/epub+zip' ||
      file.name.toLowerCase().endsWith('.epub');
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

  private static collectJsonStringValues(
    value: unknown,
    path: Array<string | number>,
    values: Array<{ text: string; path: Array<string | number> }>
  ): void {
    if (typeof value === 'string') {
      values.push({ text: value, path });
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => this.collectJsonStringValues(item, [...path, index], values));
      return;
    }

    if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        this.collectJsonStringValues(item, [...path, key], values);
      });
    }
  }

  private static setJsonValueAtPath(value: unknown, path: Array<string | number>, translatedText: string): void {
    if (path.length === 0) return;

    let current = value as Record<string, unknown> | unknown[];
    for (const segment of path.slice(0, -1)) {
      if (typeof segment === 'number' && Array.isArray(current)) {
        current = current[segment] as Record<string, unknown> | unknown[];
        continue;
      }

      if (typeof segment === 'string' && current && !Array.isArray(current) && typeof current === 'object') {
        current = (current as Record<string, unknown>)[segment] as Record<string, unknown> | unknown[];
        continue;
      }

      return;
    }

    const lastSegment = path[path.length - 1];
    if (typeof lastSegment === 'number' && Array.isArray(current)) {
      current[lastSegment] = translatedText;
      return;
    }

    if (typeof lastSegment === 'string' && current && !Array.isArray(current) && typeof current === 'object') {
      (current as Record<string, unknown>)[lastSegment] = translatedText;
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

  private static async extractDocxTextBlocksFromBytes(bytes: Uint8Array): Promise<string[]> {
    return (await this.extractDocxParagraphBlocksFromBytes(bytes)).map(block => block.originalText);
  }

  private static async extractDocxParagraphBlocksFromBytes(bytes: Uint8Array): Promise<DocumentBlock[]> {
    const entries = this.readZipCentralDirectory(bytes);
    const xmlNames = [
      'word/document.xml',
      ...entries
        .map(entry => entry.name)
        .filter(name => /^word\/(?:header|footer|footnotes|endnotes)\d*\.xml$/i.test(name))
    ];
    const blocks: DocumentBlock[] = [];

    for (const xmlName of xmlNames) {
      const xml = await this.readZipTextEntry(bytes, entries, xmlName);
      if (xml) blocks.push(...this.extractDocxXmlParagraphBlocks(xml, xmlName, blocks.length));
    }

    return blocks;
  }

  private static extractDocxXmlTextBlocks(xml: string): string[] {
    return this.extractDocxXmlParagraphBlocks(xml, 'word/document.xml', 0).map(block => block.originalText);
  }

  private static extractDocxXmlParagraphBlocks(xml: string, entryName: string, startIndex: number): DocumentBlock[] {
    const paragraphs = xml.match(/<(?:\w+:)?p\b[\s\S]*?<\/(?:\w+:)?p>/g) || [xml];

    return paragraphs
      .map((paragraph, paragraphIndex) => ({
        paragraphIndex,
        text: this.extractWordprocessingText(paragraph)
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      }))
      .filter(block => block.text)
      .map((block, index) => ({
        id: startIndex + index + 1,
        originalText: block.text,
        docx: {
          entryName,
          paragraphIndex: block.paragraphIndex
        }
      }));
  }

  private static rewriteDocxXmlParagraphs(xml: string, replacements: Map<number, string>): string {
    let paragraphIndex = 0;

    return xml.replace(/<(?:\w+:)?p\b[\s\S]*?<\/(?:\w+:)?p>/g, paragraph => {
      const translatedText = replacements.get(paragraphIndex);
      paragraphIndex++;

      if (!translatedText) return paragraph;
      return this.replaceDocxParagraphText(paragraph, translatedText);
    });
  }

  private static replaceDocxParagraphText(paragraph: string, translatedText: string): string {
    let replacedFirstTextRun = false;
    const escapedText = this.escapeXmlText(translatedText);

    return paragraph.replace(/(<(?:\w+:)?t\b[^>]*>)([\s\S]*?)(<\/(?:\w+:)?t>)/g, (_match, open: string, _text: string, close: string) => {
      if (replacedFirstTextRun) return `${open}${close}`;

      replacedFirstTextRun = true;
      return `${open}${escapedText}${close}`;
    });
  }

  private static extractWordprocessingText(xml: string): string {
    const tokens = /<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>|<(?:\w+:)?tab\b[^>]*\/>|<(?:\w+:)?br\b[^>]*\/>/g;
    let text = '';

    for (const match of xml.matchAll(tokens)) {
      if (match[1] !== undefined) {
        text += this.decodeXmlEntities(match[1]);
      } else if (match[0].includes(':tab') || match[0].includes('<tab')) {
        text += '\t';
      } else {
        text += '\n';
      }
    }

    return text;
  }

  private static async extractEpubTextBlocksFromBytes(bytes: Uint8Array): Promise<string[]> {
    const entries = this.readZipCentralDirectory(bytes);
    const contentPaths = await this.getEpubContentPaths(bytes, entries);
    const blocks: string[] = [];

    for (const contentPath of contentPaths) {
      const html = await this.readZipTextEntry(bytes, entries, contentPath);
      if (html) blocks.push(...this.extractHtmlTextBlocks(html));
    }

    return blocks;
  }

  private static async getEpubContentPaths(bytes: Uint8Array, entries: ZipCentralEntry[]): Promise<string[]> {
    const container = await this.readZipTextEntry(bytes, entries, 'META-INF/container.xml');
    const rootFilePath = container ? this.getXmlAttribute(container, 'full-path') : null;

    if (rootFilePath) {
      const opf = await this.readZipTextEntry(bytes, entries, rootFilePath);
      if (opf) {
        const spinePaths = this.extractEpubSpinePaths(opf, rootFilePath);
        if (spinePaths.length > 0) return spinePaths;
      }
    }

    return entries
      .map(entry => entry.name)
      .filter(name => /\.(?:xhtml|html|htm)$/i.test(name) && !name.startsWith('META-INF/'))
      .sort((left, right) => left.localeCompare(right));
  }

  private static extractEpubSpinePaths(opf: string, opfPath: string): string[] {
    const manifest = new Map<string, string>();
    const manifestItems = opf.match(/<item\b[^>]*>/g) || [];

    for (const item of manifestItems) {
      const id = this.getXmlAttribute(item, 'id');
      const href = this.getXmlAttribute(item, 'href');
      const mediaType = this.getXmlAttribute(item, 'media-type') || '';

      if (id && href && /(?:application\/xhtml\+xml|text\/html)/i.test(mediaType)) {
        manifest.set(id, this.resolveZipPath(opfPath, href));
      }
    }

    const spineItems = opf.match(/<itemref\b[^>]*>/g) || [];
    const spinePaths = spineItems
      .map(item => this.getXmlAttribute(item, 'idref'))
      .map(id => id ? manifest.get(id) : undefined)
      .filter((path): path is string => Boolean(path));

    if (spinePaths.length > 0) return spinePaths;
    return Array.from(manifest.values());
  }

  private static getXmlAttribute(xml: string, attributeName: string): string | null {
    const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
    const match = pattern.exec(xml);
    const value = match?.[1] ?? match?.[2];

    return value ? this.decodeXmlEntities(value) : null;
  }

  private static resolveZipPath(baseFilePath: string, relativePath: string): string {
    const baseParts = baseFilePath.split('/').slice(0, -1);
    const relativeParts = relativePath.split('/');
    const resolvedParts: string[] = [];

    for (const part of [...baseParts, ...relativeParts]) {
      if (!part || part === '.') continue;
      if (part === '..') {
        resolvedParts.pop();
        continue;
      }

      resolvedParts.push(part);
    }

    return resolvedParts.join('/');
  }

  private static readZipCentralDirectory(bytes: Uint8Array): ZipCentralEntry[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocdOffset = this.findZipEndOfCentralDirectory(view);
    if (eocdOffset < 0) {
      throw new Error('Could not read the document archive.');
    }

    const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const entries: ZipCentralEntry[] = [];
    let offset = centralDirectoryOffset;

    for (let index = 0; index < totalEntries; index++) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;

      const compressionMethod = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const fileNameLength = view.getUint16(offset + 28, true);
      const extraFieldLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);
      const fileNameBytes = bytes.slice(offset + 46, offset + 46 + fileNameLength);
      const name = this.normalizeZipEntryName(new TextDecoder('utf-8').decode(fileNameBytes));

      entries.push({
        name,
        compressionMethod,
        compressedSize,
        localHeaderOffset
      });

      offset += 46 + fileNameLength + extraFieldLength + commentLength;
    }

    return entries;
  }

  private static findZipEndOfCentralDirectory(view: DataView): number {
    const minOffset = Math.max(0, view.byteLength - 65557);

    for (let offset = view.byteLength - 22; offset >= minOffset; offset--) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        return offset;
      }
    }

    return -1;
  }

  private static async readZipTextEntry(
    bytes: Uint8Array,
    entries: ZipCentralEntry[],
    entryName: string
  ): Promise<string | null> {
    const normalizedEntryName = this.normalizeZipEntryName(entryName);
    const entry = entries.find(candidate => candidate.name === normalizedEntryName);
    if (!entry) return null;

    const data = await this.readZipEntryData(bytes, entry);
    return new TextDecoder('utf-8').decode(data);
  }

  private static async readZipEntryData(bytes: Uint8Array, entry: ZipCentralEntry): Promise<Uint8Array> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const localOffset = entry.localHeaderOffset;

    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error(`Could not read archive entry: ${entry.name}`);
    }

    const fileNameLength = view.getUint16(localOffset + 26, true);
    const extraFieldLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + fileNameLength + extraFieldLength;
    const compressedData = bytes.slice(dataStart, dataStart + entry.compressedSize);

    if (entry.compressionMethod === 0) return compressedData;
    if (entry.compressionMethod === 8) return this.inflateRawDeflate(compressedData, entry.name);

    throw new Error(`Unsupported archive compression method ${entry.compressionMethod} for ${entry.name}`);
  }

  private static createStoredZip(files: ZipFileData[]): Uint8Array {
    const encoder = new TextEncoder();
    const localChunks: Uint8Array[] = [];
    const centralChunks: Uint8Array[] = [];
    let localOffset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const crc = this.crc32(file.data);
      const localHeader = new Uint8Array(30 + nameBytes.length);

      this.writeUint32(localHeader, 0, 0x04034b50);
      this.writeUint16(localHeader, 4, 20);
      this.writeUint16(localHeader, 6, 0x0800);
      this.writeUint16(localHeader, 8, 0);
      this.writeUint32(localHeader, 14, crc);
      this.writeUint32(localHeader, 18, file.data.length);
      this.writeUint32(localHeader, 22, file.data.length);
      this.writeUint16(localHeader, 26, nameBytes.length);
      localHeader.set(nameBytes, 30);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      this.writeUint32(centralHeader, 0, 0x02014b50);
      this.writeUint16(centralHeader, 4, 20);
      this.writeUint16(centralHeader, 6, 20);
      this.writeUint16(centralHeader, 8, 0x0800);
      this.writeUint16(centralHeader, 10, 0);
      this.writeUint32(centralHeader, 16, crc);
      this.writeUint32(centralHeader, 20, file.data.length);
      this.writeUint32(centralHeader, 24, file.data.length);
      this.writeUint16(centralHeader, 28, nameBytes.length);
      this.writeUint32(centralHeader, 42, localOffset);
      centralHeader.set(nameBytes, 46);

      localChunks.push(localHeader, file.data);
      centralChunks.push(centralHeader);
      localOffset += localHeader.length + file.data.length;
    }

    const centralDirectory = this.concatBytes(centralChunks);
    const endOfCentralDirectory = new Uint8Array(22);
    this.writeUint32(endOfCentralDirectory, 0, 0x06054b50);
    this.writeUint16(endOfCentralDirectory, 8, files.length);
    this.writeUint16(endOfCentralDirectory, 10, files.length);
    this.writeUint32(endOfCentralDirectory, 12, centralDirectory.length);
    this.writeUint32(endOfCentralDirectory, 16, localOffset);

    return this.concatBytes([...localChunks, centralDirectory, endOfCentralDirectory]);
  }

  private static concatBytes(chunks: Uint8Array[]): Uint8Array {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  private static writeUint16(bytes: Uint8Array, offset: number, value: number): void {
    new DataView(bytes.buffer).setUint16(offset, value, true);
  }

  private static writeUint32(bytes: Uint8Array, offset: number, value: number): void {
    new DataView(bytes.buffer).setUint32(offset, value >>> 0, true);
  }

  private static crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;

    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  private static async inflateRawDeflate(compressedData: Uint8Array, entryName: string): Promise<Uint8Array> {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error(`Compressed archive entry needs browser decompression support: ${entryName}`);
    }

    const deflateBuffer = new ArrayBuffer(compressedData.byteLength);
    new Uint8Array(deflateBuffer).set(compressedData);
    const stream = new Blob([deflateBuffer]).stream().pipeThrough(
      new DecompressionStream('deflate-raw' as CompressionFormat)
    );
    const buffer = await new Response(stream).arrayBuffer();

    return new Uint8Array(buffer);
  }

  private static normalizeZipEntryName(name: string): string {
    return name.replace(/\\/g, '/').replace(/^\/+/, '');
  }

  private static decodeXmlEntities(text: string): string {
    return this.decodeHtmlEntities(text);
  }

  private static escapeXmlText(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
