export const ACADEMIC_HANDOFF_SCHEMA_VERSION = 1 as const;
export const ACADEMIC_HANDOFF_MAX_BLOCKS = 10_000;
export const ACADEMIC_HANDOFF_MAX_CODE_POINTS = 4_000_000;

export interface AcademicDocumentHandoffBlock {
  label: string;
  originalText: string;
  translatedText: string;
}

export interface AcademicDocumentHandoffInput {
  title: string;
  sourceName?: string;
  sourceUrl?: string;
  provider: string;
  targetLanguage: string;
  exportedAt: string;
  blocks: AcademicDocumentHandoffBlock[];
}

export interface AcademicDocumentHandoffExport {
  schemaVersion: typeof ACADEMIC_HANDOFF_SCHEMA_VERSION;
  blockCount: number;
  filename: string;
  content: string;
}

const normalizeLine = (value: string, fallback: string): string => (
  value.replace(/\s+/g, ' ').trim() || fallback
);

const escapeInlineMarkdown = (value: string): string => (
  value.replace(/([\\`*_[\]])/g, '\\$1')
);

const normalizeSourceUrl = (value: string | undefined): string => {
  if (!value?.trim()) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
};

const renderFencedText = (value: string): string => {
  const text = value.replace(/\r\n?/g, '\n').trim();
  const longestFence = Math.max(0, ...(text.match(/`+/g) || []).map(run => run.length));
  const fence = '`'.repeat(Math.max(3, longestFence + 1));
  return `${fence}text\n${text}\n${fence}`;
};

const createFilename = (title: string, sourceName: string | undefined): string => {
  const baseName = normalizeLine(sourceName || title, 'translated-document')
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'translated-document';
  return `${baseName}.bilingual-research-note.md`;
};

export const createAcademicDocumentHandoff = (
  input: AcademicDocumentHandoffInput
): AcademicDocumentHandoffExport => {
  if (!Array.isArray(input.blocks) || input.blocks.length === 0) {
    throw new Error('Translate document text before exporting a research note.');
  }
  if (input.blocks.length > ACADEMIC_HANDOFF_MAX_BLOCKS) {
    throw new Error(`Research note export supports at most ${ACADEMIC_HANDOFF_MAX_BLOCKS} blocks.`);
  }

  const exportedAt = new Date(input.exportedAt);
  if (!Number.isFinite(exportedAt.getTime())) {
    throw new Error('The research note export time is invalid.');
  }

  const blocks = input.blocks.map((block, index) => ({
    label: normalizeLine(block.label, `Block ${index + 1}`),
    originalText: block.originalText.replace(/\r\n?/g, '\n').trim(),
    translatedText: block.translatedText.replace(/\r\n?/g, '\n').trim()
  })).filter(block => block.originalText || block.translatedText);
  if (blocks.length === 0) {
    throw new Error('Translate document text before exporting a research note.');
  }

  const totalCodePoints = blocks.reduce((total, block) => (
    total
    + Array.from(block.label).length
    + Array.from(block.originalText).length
    + Array.from(block.translatedText).length
  ), 0);
  if (totalCodePoints > ACADEMIC_HANDOFF_MAX_CODE_POINTS) {
    throw new Error('The research note exceeds the local export size limit.');
  }

  const title = normalizeLine(input.title, 'Bilingual research note');
  const sourceName = normalizeLine(input.sourceName || '', 'Pasted document');
  const provider = normalizeLine(input.provider, 'unknown');
  const targetLanguage = normalizeLine(input.targetLanguage, 'unknown');
  const sourceUrl = normalizeSourceUrl(input.sourceUrl);
  const metadata = [
    `- Source: ${escapeInlineMarkdown(sourceName)}`,
    ...(sourceUrl ? [`- Source URL: [${escapeInlineMarkdown(sourceUrl)}](${sourceUrl})`] : []),
    `- Translation provider: ${escapeInlineMarkdown(provider)}`,
    `- Target language: ${escapeInlineMarkdown(targetLanguage)}`,
    `- Exported: ${exportedAt.toISOString()}`,
    `- Handoff schema: ${ACADEMIC_HANDOFF_SCHEMA_VERSION}`
  ];
  const sections = blocks.map(block => [
    `## ${escapeInlineMarkdown(block.label)}`,
    '',
    '**Original**',
    '',
    renderFencedText(block.originalText),
    '',
    '**Translation**',
    '',
    renderFencedText(block.translatedText)
  ].join('\n'));

  return {
    schemaVersion: ACADEMIC_HANDOFF_SCHEMA_VERSION,
    blockCount: blocks.length,
    filename: createFilename(title, input.sourceName),
    content: [
      `# ${escapeInlineMarkdown(title)}`,
      '',
      ...metadata,
      '',
      ...sections.flatMap((section, index) => index === 0 ? [section] : ['', section]),
      ''
    ].join('\n')
  };
};
