import { DictionaryManager, DictionaryType, WordDefinition } from '../DictionaryManager';
import { LearningMode, ReviewPerformance } from '../LearningMode';
import { ReviewService } from '../ReviewService';
import { StorageManager, UserSettings } from '../StorageManager';

const makeWord = (
  word: string,
  definitions: string[],
  overrides: Partial<WordDefinition> = {}
): WordDefinition => ({
  word,
  pronunciation: `/${word}/`,
  partOfSpeech: 'noun',
  definitions,
  examples: [`${word} example.`],
  difficulty: 4,
  frequency: 80,
  ...overrides
});

const makeSettings = (activeDictionaries: string[]): UserSettings => ({
  defaultTargetLanguage: 'zh-CN',
  translationProvider: 'google',
  pageTranslationDisplayMode: 'bilingual',
  floatingIconPosition: { x: 20, y: 20 },
  learningModeEnabled: true,
  activeDictionaries,
  highlightColors: {},
  autoTranslate: false,
  showFloatingIcon: true
});

describe('ReviewService', () => {
  let learningMode: jest.Mocked<LearningMode>;
  let dictionaryManager: jest.Mocked<DictionaryManager>;
  let storageManager: jest.Mocked<StorageManager>;
  let reviewService: ReviewService;

  beforeEach(() => {
    learningMode = {
      getVocabularyList: jest.fn(),
      getWordsForReview: jest.fn(),
      addVocabulary: jest.fn(),
      scheduleNextReview: jest.fn()
    } as unknown as jest.Mocked<LearningMode>;

    dictionaryManager = {
      loadBuiltInDictionary: jest.fn(),
      lookupWord: jest.fn()
    } as unknown as jest.Mocked<DictionaryManager>;

    storageManager = {
      getSettings: jest.fn()
    } as unknown as jest.Mocked<StorageManager>;

    reviewService = new ReviewService(learningMode, dictionaryManager, storageManager);
  });

  it('uses enabled built-in dictionaries when the user vocabulary is empty', async () => {
    learningMode.getVocabularyList.mockResolvedValue([]);
    storageManager.getSettings.mockResolvedValue(makeSettings(['cet4']));
    dictionaryManager.loadBuiltInDictionary.mockResolvedValue({
      type: DictionaryType.CET4,
      name: 'CET4',
      totalCount: 2,
      words: [
        makeWord('ability', ['能力']),
        makeWord('abandon', ['放弃'])
      ]
    });

    const items = await reviewService.getReviewItems({ type: 'new', count: 2 });

    expect(items).toHaveLength(2);
    expect(items.map(item => item.word)).toEqual(['ability', 'abandon']);
    expect(items[0]).toMatchObject({
      translation: '能力',
      sourceUrl: 'built-in:cet4',
      dictionaryType: DictionaryType.CET4,
      fromBuiltInDictionary: true
    });
  });

  it('fills due review sessions from built-in dictionaries when no words are due', async () => {
    learningMode.getWordsForReview.mockResolvedValue([]);
    learningMode.getVocabularyList.mockResolvedValue([]);
    storageManager.getSettings.mockResolvedValue(makeSettings(['gre']));
    dictionaryManager.loadBuiltInDictionary.mockResolvedValue({
      type: DictionaryType.GRE,
      name: 'GRE',
      totalCount: 1,
      words: [makeWord('aberration', ['偏差'], { difficulty: 8 })]
    });

    const items = await reviewService.getReviewItems({ type: 'due', count: 5 });

    expect(items).toHaveLength(1);
    expect(items[0]?.word).toBe('aberration');
    expect(learningMode.getWordsForReview).toHaveBeenCalledWith(5);
  });

  it('adds built-in review words to vocabulary before scheduling review results', async () => {
    learningMode.getVocabularyList.mockResolvedValue([]);
    learningMode.addVocabulary.mockResolvedValue();
    learningMode.scheduleNextReview.mockResolvedValue();

    await reviewService.saveReviewResults({
      sessionDuration: 30000,
      results: [
        {
          word: 'abandon',
          translation: '放弃',
          userAnswer: '放弃',
          correctAnswer: '放弃',
          isCorrect: true,
          difficulty: 'easy',
          responseTime: 1200,
          context: 'abandon example.',
          sourceUrl: 'built-in:cet4',
          dictionaryType: DictionaryType.CET4
        }
      ]
    });

    expect(learningMode.addVocabulary).toHaveBeenCalledWith(expect.objectContaining({
      word: 'abandon',
      translation: '放弃',
      context: 'abandon example.',
      sourceUrl: 'built-in:cet4',
      dictionaryType: DictionaryType.CET4,
      masteryLevel: 0,
      reviewCount: 0
    }));
    expect(learningMode.scheduleNextReview).toHaveBeenCalledWith(
      'abandon',
      ReviewPerformance.EXCELLENT
    );
  });

  it('keeps the translation text when saving recall-mode answers', async () => {
    learningMode.getVocabularyList.mockResolvedValue([]);
    learningMode.addVocabulary.mockResolvedValue();
    learningMode.scheduleNextReview.mockResolvedValue();

    await reviewService.saveReviewResults({
      results: [
        {
          word: 'ability',
          translation: '能力',
          userAnswer: 'ability',
          correctAnswer: 'ability',
          isCorrect: true,
          difficulty: 'medium',
          responseTime: 2000
        }
      ]
    });

    expect(learningMode.addVocabulary).toHaveBeenCalledWith(expect.objectContaining({
      word: 'ability',
      translation: '能力'
    }));
  });
});
