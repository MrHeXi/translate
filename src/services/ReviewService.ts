import { DictionaryManager, DictionaryType, WordDefinition } from './DictionaryManager';
import { LearningMode, ReviewPerformance, VocabularyItem } from './LearningMode';
import { StorageManager } from './StorageManager';

export type ReviewType = 'due' | 'random' | 'difficult' | 'new' | 'specific';
export type ReviewDifficulty = 'easy' | 'medium' | 'hard';

export interface ReviewItem extends VocabularyItem {
  fromBuiltInDictionary?: boolean;
}

export interface ReviewRequest {
  type: ReviewType;
  count?: number;
  word?: string;
}

export interface ReviewResult {
  word: string;
  translation: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  difficulty?: ReviewDifficulty | null;
  responseTime: number;
  context?: string;
  sourceUrl?: string;
  dictionaryType?: DictionaryType;
  partOfSpeech?: string;
  pronunciation?: string;
  examples?: string[];
}

export interface SaveReviewResultsRequest {
  results: ReviewResult[];
  sessionDuration?: number;
}

export class ReviewService {
  constructor(
    private readonly learningMode: LearningMode,
    private readonly dictionaryManager: DictionaryManager,
    private readonly storageManager: StorageManager
  ) {}

  async getDueReviewCount(): Promise<number> {
    return this.learningMode.getReviewDueCount();
  }

  async getReviewItems(request: ReviewRequest): Promise<ReviewItem[]> {
    const count = this.normalizeCount(request.count);
    const userItems = await this.getUserReviewItems(request, count);
    const selectedItems = userItems.slice(0, count).map(item => this.asReviewItem(item));

    if (selectedItems.length >= count || request.type === 'specific') {
      return selectedItems;
    }

    const knownWords = new Set<string>();
    const vocabulary = await this.learningMode.getVocabularyList();
    for (const item of vocabulary) {
      knownWords.add(item.word.toLowerCase());
    }
    for (const item of selectedItems) {
      knownWords.add(item.word.toLowerCase());
    }

    const builtInItems = await this.getBuiltInReviewItems(
      request.type,
      count - selectedItems.length,
      knownWords
    );

    return [...selectedItems, ...builtInItems];
  }

  async saveReviewResults(request: SaveReviewResultsRequest): Promise<void> {
    const vocabulary = await this.learningMode.getVocabularyList();
    const knownWords = new Set(vocabulary.map(item => item.word.toLowerCase()));

    for (const result of request.results) {
      if (!result.word) continue;

      const normalizedWord = result.word.toLowerCase();
      if (!knownWords.has(normalizedWord)) {
        await this.learningMode.addVocabulary(this.reviewResultToVocabularyItem(result));
        knownWords.add(normalizedWord);
      }

      await this.learningMode.scheduleNextReview(
        result.word,
        this.toReviewPerformance(result)
      );
    }
  }

  private async getUserReviewItems(request: ReviewRequest, count: number): Promise<VocabularyItem[]> {
    if (request.type === 'specific') {
      return this.getSpecificWord(request.word);
    }

    if (request.type === 'due') {
      return this.learningMode.getWordsForReview(count);
    }

    const vocabulary = await this.learningMode.getVocabularyList();

    switch (request.type) {
      case 'new':
        return vocabulary.filter(item => item.masteryLevel === 0);
      case 'difficult':
        return vocabulary.filter(item =>
          (item.reviewCount > 0 && item.masteryLevel < 0.5) ||
          item.reviewCount > 3
        );
      case 'random':
        return this.shuffle(vocabulary);
      default:
        return vocabulary;
    }
  }

  private async getSpecificWord(word?: string): Promise<VocabularyItem[]> {
    if (!word) return [];

    const vocabulary = await this.learningMode.getVocabularyList();
    const existingItem = vocabulary.find(
      item => item.word.toLowerCase() === word.toLowerCase()
    );

    if (existingItem) {
      return [existingItem];
    }

    const definition = await this.dictionaryManager.lookupWord(word);
    return [this.wordDefinitionToReviewItem(definition, undefined)];
  }

  private async getBuiltInReviewItems(
    reviewType: ReviewType,
    count: number,
    knownWords: Set<string>
  ): Promise<ReviewItem[]> {
    if (count <= 0) return [];

    const dictionaryTypes = await this.getActiveDictionaryTypes();
    const items: ReviewItem[] = [];

    for (const dictionaryType of dictionaryTypes) {
      const dictionary = await this.dictionaryManager.loadBuiltInDictionary(dictionaryType);
      const words = this.filterBuiltInWordsForReview(dictionary.words, reviewType);

      for (const word of words) {
        const normalizedWord = word.word.toLowerCase();
        if (knownWords.has(normalizedWord)) continue;

        items.push(this.wordDefinitionToReviewItem(word, dictionaryType));
        knownWords.add(normalizedWord);

        if (items.length >= count) {
          return this.orderBuiltInItems(items, reviewType).slice(0, count);
        }
      }
    }

    return this.orderBuiltInItems(items, reviewType).slice(0, count);
  }

  private filterBuiltInWordsForReview(
    words: WordDefinition[],
    reviewType: ReviewType
  ): WordDefinition[] {
    if (reviewType === 'difficult') {
      return [...words]
        .filter(word => word.difficulty >= 7)
        .sort((a, b) => b.difficulty - a.difficulty || b.frequency - a.frequency);
    }

    if (reviewType === 'random') {
      return this.shuffle(words);
    }

    return words;
  }

  private orderBuiltInItems(items: ReviewItem[], reviewType: ReviewType): ReviewItem[] {
    if (reviewType !== 'difficult') {
      return items;
    }

    return [...items].sort((a, b) => {
      const aDifficulty = typeof a.masteryLevel === 'number' ? a.masteryLevel : 0;
      const bDifficulty = typeof b.masteryLevel === 'number' ? b.masteryLevel : 0;
      return aDifficulty - bDifficulty;
    });
  }

  private async getActiveDictionaryTypes(): Promise<DictionaryType[]> {
    const settings = await this.storageManager.getSettings();
    const activeTypes = (settings.activeDictionaries || [])
      .filter((type): type is DictionaryType =>
        Object.values(DictionaryType).includes(type as DictionaryType)
      );

    return activeTypes.length > 0
      ? activeTypes
      : [DictionaryType.GRE, DictionaryType.TOEFL];
  }

  private wordDefinitionToReviewItem(
    definition: WordDefinition,
    dictionaryType?: DictionaryType
  ): ReviewItem {
    return {
      word: definition.word,
      translation: definition.definitions.join('; '),
      context: definition.examples[0] || '',
      sourceUrl: dictionaryType ? `built-in:${dictionaryType}` : 'dictionary-lookup',
      addedDate: new Date(),
      reviewCount: 0,
      masteryLevel: 0,
      nextReviewDate: new Date(),
      partOfSpeech: definition.partOfSpeech,
      pronunciation: definition.pronunciation,
      examples: definition.examples,
      dictionaryType,
      fromBuiltInDictionary: Boolean(dictionaryType)
    };
  }

  private reviewResultToVocabularyItem(result: ReviewResult): VocabularyItem {
    const translation = result.translation || result.correctAnswer;

    return {
      word: result.word,
      translation,
      context: result.context || '',
      sourceUrl: result.sourceUrl || 'review-session',
      addedDate: new Date(),
      reviewCount: 0,
      masteryLevel: 0,
      nextReviewDate: new Date(),
      partOfSpeech: result.partOfSpeech,
      pronunciation: result.pronunciation,
      examples: result.examples || [],
      dictionaryType: result.dictionaryType
    };
  }

  private asReviewItem(item: VocabularyItem): ReviewItem {
    return { ...item, fromBuiltInDictionary: false };
  }

  private toReviewPerformance(result: ReviewResult): ReviewPerformance {
    if (!result.isCorrect) {
      return ReviewPerformance.POOR;
    }

    switch (result.difficulty) {
      case 'easy':
        return ReviewPerformance.EXCELLENT;
      case 'medium':
        return ReviewPerformance.GOOD;
      case 'hard':
        return ReviewPerformance.FAIR;
      default:
        return result.responseTime < 3000
          ? ReviewPerformance.EXCELLENT
          : ReviewPerformance.GOOD;
    }
  }

  private normalizeCount(count?: number): number {
    if (!count || count <= 0) return 20;
    return Math.min(Math.max(Math.floor(count), 1), 50);
  }

  private shuffle<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = shuffled[index];
      const swap = shuffled[swapIndex];

      if (current !== undefined && swap !== undefined) {
        shuffled[index] = swap;
        shuffled[swapIndex] = current;
      }
    }
    return shuffled;
  }
}
