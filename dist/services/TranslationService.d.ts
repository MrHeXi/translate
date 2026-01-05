export interface TranslationRequest {
    text: string;
    sourceLang?: string | undefined;
    targetLang: string;
    context?: string;
}
export interface TranslationResult {
    originalText: string;
    translatedText: string;
    sourceLang: string;
    targetLang: string;
    confidence: number;
    alternatives?: string[];
}
export declare class TranslationService {
    private cache;
    translate(request: TranslationRequest): Promise<TranslationResult>;
    detectLanguage(text: string): Promise<string>;
    batchTranslate(texts: string[], targetLang: string): Promise<TranslationResult[]>;
    private generateCacheKey;
    private callTranslationAPI;
    clearCache(): void;
    getCacheSize(): number;
}
//# sourceMappingURL=TranslationService.d.ts.map