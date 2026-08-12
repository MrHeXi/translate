export const BABELDOC_GUIDE_MAX_CODE_POINTS = 8_192;
export const BABELDOC_SOURCE_FILENAME_MAX_CODE_POINTS = 120;

export type BabelDocLanguageRole = 'source' | 'target';

export interface BabelDocWorkflowInput {
  sourceFileName: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface BabelDocWorkflowExport {
  filename: string;
  content: string;
  sourceFileName: string;
  sourceLanguage: string;
  targetLanguage: string;
}

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  en: 'en',
  'en-gb': 'en',
  'en-us': 'en',
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-hk': 'zh-HK',
  'zh-tw': 'zh-TW',
  'zh-hant': 'zh-TW',
  ja: 'ja',
  ko: 'ko',
  fr: 'fr',
  es: 'es',
  ru: 'ru',
  de: 'de',
  pt: 'pt',
  pl: 'pl',
  ms: 'ms',
  id: 'id',
  tk: 'tk',
  tl: 'tl',
  fil: 'tl',
  vi: 'vi',
  kk: 'kk'
});

const countCodePoints = (value: string): number => Array.from(value).length;

const hasControlCharacters = (value: string): boolean => Array.from(value).some(character => {
  const codePoint = character.codePointAt(0) || 0;
  return codePoint < 0x20 || codePoint === 0x7f;
});

const limitCodePoints = (value: string, maximum: number): string => (
  Array.from(value).slice(0, maximum).join('')
);

const assertShellArgument = (value: string): void => {
  if (!value || countCodePoints(value) > 1_024 || hasControlCharacters(value)) {
    throw new Error('Shell arguments must be non-empty, single-line values of at most 1024 characters.');
  }
};

export const quotePowerShellArgument = (value: string): string => {
  assertShellArgument(value);
  return `'${value.replace(/'/g, "''")}'`;
};

export const quotePosixShellArgument = (value: string): string => {
  assertShellArgument(value);
  return `'${value.replace(/'/g, `'"'"'`)}'`;
};

export const normalizeBabelDocLanguage = (
  value: string,
  role: BabelDocLanguageRole
): string => {
  const normalized = String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/_/g, '-');

  if (!normalized || countCodePoints(normalized) > 32 || hasControlCharacters(normalized)) {
    throw new Error(`Invalid BabelDOC ${role} language code.`);
  }

  if (normalized.toLowerCase() === 'auto') {
    if (role === 'source') return 'en';
    throw new Error('BabelDOC does not provide an automatic target language.');
  }

  const language = LANGUAGE_ALIASES[normalized.toLowerCase()];
  if (!language) {
    throw new Error(`Unsupported BabelDOC ${role} language code: ${normalized}`);
  }
  return language;
};

export const normalizeBabelDocPdfFileName = (value: string): string => {
  const normalized = String(value || '').normalize('NFKC');
  if (hasControlCharacters(normalized)) {
    throw new Error('PDF file names must not contain control characters.');
  }

  const leafName = normalized.split(/[\\/]/u).pop()?.trim() || '';
  if (!/\.pdf$/iu.test(leafName)) {
    throw new Error('BabelDOC workflow guides can only be created for PDF files.');
  }

  const baseName = leafName
    .slice(0, -4)
    .replace(/[^\p{L}\p{N}._ ()-]+/gu, '-')
    .replace(/\.+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[ ._-]+|[ ._-]+$/g, '');
  const boundedBaseName = limitCodePoints(
    baseName || 'document',
    BABELDOC_SOURCE_FILENAME_MAX_CODE_POINTS - 4
  ).replace(/[ ._-]+$/g, '') || 'document';

  return `${boundedBaseName}.pdf`;
};

const createCommand = (
  path: string,
  sourceLanguage: string,
  targetLanguage: string,
  quote: (value: string) => string
): string => [
  'babeldoc',
  '--files', quote(path),
  '--lang-in', quote(sourceLanguage),
  '--lang-out', quote(targetLanguage)
].join(' ');

export const createBabelDocWorkflow = (
  input: BabelDocWorkflowInput
): BabelDocWorkflowExport => {
  const requestedSourceLanguage = String(input.sourceLanguage || '').trim();
  const sourceFileName = normalizeBabelDocPdfFileName(input.sourceFileName);
  const sourceLanguage = normalizeBabelDocLanguage(requestedSourceLanguage, 'source');
  const targetLanguage = normalizeBabelDocLanguage(input.targetLanguage, 'target');
  const requestedAutomaticSource = requestedSourceLanguage.toLowerCase() === 'auto';
  const windowsPlaceholder = `C:\\ABSOLUTE\\PATH\\${sourceFileName}`;
  const posixPlaceholder = `/absolute/path/${sourceFileName}`;
  const powerShellCommand = createCommand(
    windowsPlaceholder,
    sourceLanguage,
    targetLanguage,
    quotePowerShellArgument
  );
  const posixCommand = createCommand(
    posixPlaceholder,
    sourceLanguage,
    targetLanguage,
    quotePosixShellArgument
  );
  const automaticSourceNotice = requestedAutomaticSource
    ? [
      '',
      '> Source language `auto` was resolved to `en`, the BabelDOC CLI default. This guide does not claim or enable automatic language detection; verify the source language before running the command.'
    ]
    : [];
  const content = [
    '# BabelDOC local workflow',
    '',
    `PDF: \`${sourceFileName}\``,
    '',
    'This is a local command guide, not an API integration. The extension did not upload the PDF, install BabelDOC, run a command, or obtain the PDF absolute path.',
    '',
    '## Languages',
    '',
    `- BabelDOC source language: \`${sourceLanguage}\``,
    `- BabelDOC target language: \`${targetLanguage}\``,
    ...automaticSourceNotice,
    '',
    '## Before running',
    '',
    '1. Install BabelDOC locally by following its official installation documentation, then confirm `babeldoc --help` works.',
    '2. Replace the safe example path below with the real absolute path to your local PDF.',
    '3. Review the languages and run the command yourself in a local terminal.',
    '',
    'Official documentation: https://funstory-ai.github.io/BabelDOC/',
    '',
    '## PowerShell',
    '',
    '```powershell',
    powerShellCommand,
    '```',
    '',
    '## POSIX shell',
    '',
    '```sh',
    posixCommand,
    '```',
    ''
  ].join('\n');

  if (countCodePoints(content) > BABELDOC_GUIDE_MAX_CODE_POINTS) {
    throw new Error('The BabelDOC workflow guide exceeds its export limit.');
  }

  return {
    filename: `${sourceFileName.slice(0, -4)}.babeldoc-guide.md`,
    content,
    sourceFileName,
    sourceLanguage,
    targetLanguage
  };
};
