export type TranslationProviderStatus = 'available' | 'planned';
export type TranslationProviderConfigField = 'apiKey' | 'endpoint' | 'model' | 'region';

export interface TranslationProviderRuntimeConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  region?: string;
}

export interface TranslationProviderDefinition {
  id: string;
  label: string;
  status: TranslationProviderStatus;
  requiresApiKey: boolean;
  supportsAutoDetect: boolean;
  configFields?: TranslationProviderConfigField[];
  defaultEndpoint?: string;
  defaultModel?: string;
}

export interface TranslationLanguageDefinition {
  code: string;
  label: string;
}

export const TRANSLATION_PROVIDERS: TranslationProviderDefinition[] = [
  { id: 'google', label: 'Google Translate', status: 'available', requiresApiKey: false, supportsAutoDetect: true },
  { id: 'mymemory', label: 'MyMemory', status: 'available', requiresApiKey: false, supportsAutoDetect: true },
  {
    id: 'deepl',
    label: 'DeepL',
    status: 'available',
    requiresApiKey: true,
    supportsAutoDetect: true,
    configFields: ['apiKey', 'endpoint'],
    defaultEndpoint: 'https://api-free.deepl.com/v2/translate'
  },
  {
    id: 'microsoft',
    label: 'Microsoft Translator',
    status: 'available',
    requiresApiKey: true,
    supportsAutoDetect: true,
    configFields: ['apiKey', 'region'],
    defaultEndpoint: 'https://api.cognitive.microsofttranslator.com/translate'
  },
  {
    id: 'openai',
    label: 'OpenAI compatible',
    status: 'available',
    requiresApiKey: true,
    supportsAutoDetect: true,
    configFields: ['apiKey', 'endpoint', 'model'],
    defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini'
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    status: 'available',
    requiresApiKey: true,
    supportsAutoDetect: true,
    configFields: ['apiKey', 'model'],
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.5-flash'
  },
  { id: 'libretranslate', label: 'LibreTranslate', status: 'planned', requiresApiKey: false, supportsAutoDetect: true },
  { id: 'yandex', label: 'Yandex Translate', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'papago', label: 'Naver Papago', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'baidu', label: 'Baidu Translate', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'tencent', label: 'Tencent Cloud TMT', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'volcengine', label: 'Volcengine Translate', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'alibaba', label: 'Alibaba Machine Translation', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'youdao', label: 'Youdao Translate', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'caiyun', label: 'Caiyun Translate', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'niutrans', label: 'NiuTrans', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'aws', label: 'Amazon Translate', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'ibm', label: 'IBM Watson Language Translator', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'modernmt', label: 'ModernMT', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'lingvanex', label: 'Lingvanex', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'reverso', label: 'Reverso Context', status: 'planned', requiresApiKey: false, supportsAutoDetect: true },
  { id: 'systran', label: 'SYSTRAN Translate', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'chatglm', label: 'ChatGLM', status: 'planned', requiresApiKey: true, supportsAutoDetect: true },
  { id: 'ollama', label: 'Ollama local model', status: 'planned', requiresApiKey: false, supportsAutoDetect: true }
];

export const TRANSLATION_LANGUAGES: TranslationLanguageDefinition[] = [
  { code: 'af', label: 'Afrikaans' },
  { code: 'sq', label: 'Albanian' },
  { code: 'am', label: 'Amharic' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hy', label: 'Armenian' },
  { code: 'as', label: 'Assamese' },
  { code: 'ay', label: 'Aymara' },
  { code: 'az', label: 'Azerbaijani' },
  { code: 'bm', label: 'Bambara' },
  { code: 'eu', label: 'Basque' },
  { code: 'be', label: 'Belarusian' },
  { code: 'bn', label: 'Bengali' },
  { code: 'bho', label: 'Bhojpuri' },
  { code: 'bs', label: 'Bosnian' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'ca', label: 'Catalan' },
  { code: 'ceb', label: 'Cebuano' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'co', label: 'Corsican' },
  { code: 'hr', label: 'Croatian' },
  { code: 'cs', label: 'Czech' },
  { code: 'da', label: 'Danish' },
  { code: 'dv', label: 'Dhivehi' },
  { code: 'doi', label: 'Dogri' },
  { code: 'nl', label: 'Dutch' },
  { code: 'en', label: 'English' },
  { code: 'eo', label: 'Esperanto' },
  { code: 'et', label: 'Estonian' },
  { code: 'ee', label: 'Ewe' },
  { code: 'fil', label: 'Filipino' },
  { code: 'fi', label: 'Finnish' },
  { code: 'fr', label: 'French' },
  { code: 'fy', label: 'Frisian' },
  { code: 'gl', label: 'Galician' },
  { code: 'ka', label: 'Georgian' },
  { code: 'de', label: 'German' },
  { code: 'el', label: 'Greek' },
  { code: 'gn', label: 'Guarani' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'ht', label: 'Haitian Creole' },
  { code: 'ha', label: 'Hausa' },
  { code: 'haw', label: 'Hawaiian' },
  { code: 'he', label: 'Hebrew' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hmn', label: 'Hmong' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'is', label: 'Icelandic' },
  { code: 'ig', label: 'Igbo' },
  { code: 'ilo', label: 'Ilocano' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ga', label: 'Irish' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'jv', label: 'Javanese' },
  { code: 'kn', label: 'Kannada' },
  { code: 'kk', label: 'Kazakh' },
  { code: 'km', label: 'Khmer' },
  { code: 'rw', label: 'Kinyarwanda' },
  { code: 'gom', label: 'Konkani' },
  { code: 'ko', label: 'Korean' },
  { code: 'kri', label: 'Krio' },
  { code: 'ku', label: 'Kurdish (Kurmanji)' },
  { code: 'ckb', label: 'Kurdish (Sorani)' },
  { code: 'ky', label: 'Kyrgyz' },
  { code: 'lo', label: 'Lao' },
  { code: 'la', label: 'Latin' },
  { code: 'lv', label: 'Latvian' },
  { code: 'ln', label: 'Lingala' },
  { code: 'lt', label: 'Lithuanian' },
  { code: 'lg', label: 'Luganda' },
  { code: 'lb', label: 'Luxembourgish' },
  { code: 'mk', label: 'Macedonian' },
  { code: 'mai', label: 'Maithili' },
  { code: 'mg', label: 'Malagasy' },
  { code: 'ms', label: 'Malay' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'mt', label: 'Maltese' },
  { code: 'mi', label: 'Maori' },
  { code: 'mr', label: 'Marathi' },
  { code: 'mni-Mtei', label: 'Meiteilon' },
  { code: 'lus', label: 'Mizo' },
  { code: 'mn', label: 'Mongolian' },
  { code: 'my', label: 'Myanmar (Burmese)' },
  { code: 'ne', label: 'Nepali' },
  { code: 'no', label: 'Norwegian' },
  { code: 'ny', label: 'Nyanja' },
  { code: 'or', label: 'Odia' },
  { code: 'om', label: 'Oromo' },
  { code: 'ps', label: 'Pashto' },
  { code: 'fa', label: 'Persian' },
  { code: 'pl', label: 'Polish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'qu', label: 'Quechua' },
  { code: 'ro', label: 'Romanian' },
  { code: 'ru', label: 'Russian' },
  { code: 'sm', label: 'Samoan' },
  { code: 'sa', label: 'Sanskrit' },
  { code: 'gd', label: 'Scots Gaelic' },
  { code: 'nso', label: 'Sepedi' },
  { code: 'sr', label: 'Serbian' },
  { code: 'st', label: 'Sesotho' },
  { code: 'sn', label: 'Shona' },
  { code: 'sd', label: 'Sindhi' },
  { code: 'si', label: 'Sinhala' },
  { code: 'sk', label: 'Slovak' },
  { code: 'sl', label: 'Slovenian' },
  { code: 'so', label: 'Somali' },
  { code: 'es', label: 'Spanish' },
  { code: 'su', label: 'Sundanese' },
  { code: 'sw', label: 'Swahili' },
  { code: 'sv', label: 'Swedish' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'tg', label: 'Tajik' },
  { code: 'ta', label: 'Tamil' },
  { code: 'tt', label: 'Tatar' },
  { code: 'te', label: 'Telugu' },
  { code: 'th', label: 'Thai' },
  { code: 'ti', label: 'Tigrinya' },
  { code: 'ts', label: 'Tsonga' },
  { code: 'tr', label: 'Turkish' },
  { code: 'tk', label: 'Turkmen' },
  { code: 'ak', label: 'Twi' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ug', label: 'Uyghur' },
  { code: 'uz', label: 'Uzbek' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'cy', label: 'Welsh' },
  { code: 'xh', label: 'Xhosa' },
  { code: 'yi', label: 'Yiddish' },
  { code: 'yo', label: 'Yoruba' },
  { code: 'zu', label: 'Zulu' }
];

export const AVAILABLE_TRANSLATION_PROVIDERS = TRANSLATION_PROVIDERS.filter(
  provider => provider.status === 'available'
);

export const getTranslationProvider = (providerId: string | undefined): TranslationProviderDefinition | undefined =>
  TRANSLATION_PROVIDERS.find(provider => provider.id === providerId);

export const isAvailableTranslationProvider = (providerId: string | undefined): boolean =>
  AVAILABLE_TRANSLATION_PROVIDERS.some(provider => provider.id === providerId);
