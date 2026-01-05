export interface VocabularyItem {
    word: string;
    translation: string;
    context: string;
    sourceUrl: string;
    addedDate: Date;
    reviewCount: number;
    masteryLevel: number;
    nextReviewDate: Date;
}
export declare enum ReviewPerformance {
    POOR = 1,
    FAIR = 2,
    GOOD = 3,
    EXCELLENT = 4
}
export interface LearningStats {
    totalWordsLearned: number;
    dailyGoal: number;
    currentStreak: number;
    longestStreak: number;
    reviewAccuracy: number;
    timeSpentLearning: number;
}
export declare class LearningMode {
    private vocabulary;
    private learningStats;
    addVocabulary(item: VocabularyItem): Promise<void>;
    removeVocabulary(word: string): Promise<void>;
    getVocabularyList(): Promise<VocabularyItem[]>;
    markAsLearned(word: string): Promise<void>;
    updateReviewSchedule(word: string): Promise<void>;
    getWordsForReview(): Promise<VocabularyItem[]>;
    scheduleNextReview(word: string, performance: ReviewPerformance): Promise<void>;
    getLearningStats(): Promise<LearningStats>;
    updateDailyGoal(goal: number): Promise<void>;
    getReviewDueCount(): Promise<number>;
    getTodayReviewedCount(): Promise<number>;
    private updateReviewStats;
    private saveVocabulary;
    loadVocabulary(): Promise<void>;
}
//# sourceMappingURL=LearningMode.d.ts.map