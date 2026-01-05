export declare enum DictionaryType {
    GRE = "gre",
    TOEFL = "toefl",
    IELTS = "ielts",
    CET4 = "cet4",
    CET6 = "cet6"
}
export interface WordDefinition {
    word: string;
    pronunciation: string;
    partOfSpeech: string;
    definitions: string[];
    examples: string[];
    difficulty: number;
    frequency: number;
}
export interface Dictionary {
    type: DictionaryType;
    name: string;
    words: WordDefinition[];
    totalCount: number;
}
export interface DictionaryInfo {
    type: DictionaryType;
    name: string;
    description: string;
    totalWords: number;
    learnedWords: number;
}
export interface LearningProgress {
    masteryLevel: number;
    reviewCount: number;
    lastReviewDate: Date;
    nextReviewDate: Date;
}
export interface LearningStats {
    totalWords: number;
    learnedWords: number;
    masteryRate: number;
    averageReviewScore: number;
}
export declare class DictionaryManager {
    private dictionaries;
    private activeDictionary;
    private learningProgress;
    loadBuiltInDictionary(type: DictionaryType): Promise<Dictionary>;
    lookupWord(word: string): Promise<WordDefinition | null>;
    getDictionaryList(): DictionaryInfo[];
    setActiveDictionary(type: DictionaryType): void;
    getActiveDictionary(): DictionaryType | null;
    updateLearningProgress(word: string, progress: LearningProgress): void;
    getLearningStats(dictionaryType: DictionaryType): Promise<LearningStats>;
    private fetchDictionaryData;
    private lookupWordOnline;
    private getDictionaryName;
    private getLearnedWordsCount;
    private isWordInDictionary;
}
//# sourceMappingURL=DictionaryManager.d.ts.map