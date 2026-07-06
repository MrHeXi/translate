// 词典管理器

/* eslint-disable no-unused-vars */
export enum DictionaryType {
  GRE = 'gre',
  TOEFL = 'toefl',
  IELTS = 'ielts',
  CET4 = 'cet4',
  CET6 = 'cet6'
}
/* eslint-enable no-unused-vars */

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

export interface DictionaryProgressSummary {
  dictionaryType: DictionaryType;
  totalWords: number;
  learnedWords: number;
  masteryRate: number;
}

export type DictionaryProgressSummaryMap = Record<DictionaryType, DictionaryProgressSummary>;

export class DictionaryManager {
  private dictionaries: Map<DictionaryType, Dictionary> = new Map();
  private activeDictionary: DictionaryType | null = null;
  private learningProgress: Map<string, LearningProgress> = new Map();
  private wordCache: Map<string, WordDefinition> = new Map(); // 词汇查询缓存

  async loadBuiltInDictionary(type: DictionaryType): Promise<Dictionary> {
    // 如果已经加载过，直接返回
    if (this.dictionaries.has(type)) {
      return this.dictionaries.get(type)!;
    }

    try {
      // 加载词库数据
      const dictionary = await this.fetchDictionaryData(type);
      this.dictionaries.set(type, dictionary);
      return dictionary;
    } catch (error) {
      console.error(`加载词库失败: ${type}`, error);
      throw new Error(`无法加载${type}词库`);
    }
  }

  async lookupWord(word: string): Promise<WordDefinition> {
    const normalizedWord = word.toLowerCase();

    // 检查缓存
    if (this.wordCache.has(normalizedWord)) {
      return this.wordCache.get(normalizedWord)!;
    }

    // 在所有已加载的词库中查找单词
    for (const dictionary of this.dictionaries.values()) {
      const wordDef = dictionary.words.find(w => w.word.toLowerCase() === normalizedWord);
      if (wordDef) {
        // 缓存结果
        this.wordCache.set(normalizedWord, wordDef);
        return wordDef;
      }
    }

    // 如果本地词库中没有找到，调用在线词典API
    const onlineResult = await this.lookupWordOnline(word);
    if (onlineResult) {
      // 缓存在线查询结果
      this.wordCache.set(normalizedWord, onlineResult);
      return onlineResult;
    }

    // 如果都没有找到，返回一个默认的词汇定义
    const defaultDef: WordDefinition = {
      word,
      pronunciation: '/unknown/',
      partOfSpeech: 'unknown',
      definitions: ['未找到定义'],
      examples: [],
      difficulty: 1,
      frequency: 0
    };

    // 缓存默认结果
    this.wordCache.set(normalizedWord, defaultDef);
    return defaultDef;
  }

  getDictionaryList(): DictionaryInfo[] {
    const dictionaryInfos: DictionaryInfo[] = [
      {
        type: DictionaryType.GRE,
        name: 'GRE词汇',
        description: '研究生入学考试核心词汇',
        totalWords: 3000,
        learnedWords: this.getLearnedWordsCount(DictionaryType.GRE)
      },
      {
        type: DictionaryType.TOEFL,
        name: '托福词汇',
        description: '托福考试必备词汇',
        totalWords: 4000,
        learnedWords: this.getLearnedWordsCount(DictionaryType.TOEFL)
      },
      {
        type: DictionaryType.IELTS,
        name: '雅思词汇',
        description: '雅思考试核心词汇',
        totalWords: 3500,
        learnedWords: this.getLearnedWordsCount(DictionaryType.IELTS)
      },
      {
        type: DictionaryType.CET4,
        name: '大学英语四级',
        description: '大学英语四级考试词汇',
        totalWords: 2500,
        learnedWords: this.getLearnedWordsCount(DictionaryType.CET4)
      },
      {
        type: DictionaryType.CET6,
        name: '大学英语六级',
        description: '大学英语六级考试词汇',
        totalWords: 3000,
        learnedWords: this.getLearnedWordsCount(DictionaryType.CET6)
      }
    ];

    return dictionaryInfos;
  }

  setActiveDictionary(type: DictionaryType): void {
    this.activeDictionary = type;
  }

  getActiveDictionary(): DictionaryType | null {
    return this.activeDictionary;
  }

  updateLearningProgress(word: string, progress: LearningProgress): void {
    this.learningProgress.set(word.toLowerCase(), progress);
  }

  async getLearningStats(dictionaryType: DictionaryType): Promise<LearningStats> {
    const dictionary = this.dictionaries.get(dictionaryType);
    if (!dictionary) {
      throw new Error(`词库${dictionaryType}未加载`);
    }

    const totalWords = dictionary.totalCount;
    const learnedWords = this.getLearnedWordsCount(dictionaryType);
    const masteryRate = totalWords > 0 ? learnedWords / totalWords : 0;

    // 计算平均复习分数
    let totalScore = 0;
    let reviewCount = 0;

    for (const [word, progress] of this.learningProgress) {
      if (this.isWordInDictionary(word, dictionaryType)) {
        totalScore += progress.masteryLevel;
        reviewCount++;
      }
    }

    const averageReviewScore = reviewCount > 0 ? totalScore / reviewCount : 0;

    return {
      totalWords,
      learnedWords,
      masteryRate,
      averageReviewScore
    };
  }

  async getDictionaryProgressSummaries(): Promise<DictionaryProgressSummaryMap> {
    const summaries = {} as DictionaryProgressSummaryMap;

    for (const dictionaryType of Object.values(DictionaryType)) {
      const dictionary = await this.loadBuiltInDictionary(dictionaryType);
      const learnedWords = this.getLearnedWordsCount(dictionaryType);

      summaries[dictionaryType] = {
        dictionaryType,
        totalWords: dictionary.totalCount,
        learnedWords,
        masteryRate: dictionary.totalCount > 0 ? learnedWords / dictionary.totalCount : 0
      };
    }

    return summaries;
  }

  private async fetchDictionaryData(type: DictionaryType): Promise<Dictionary> {
    try {
      // 从本地JSON文件加载词库数据
      const fileName = this.getDictionaryFileName(type);
      const response = await fetch(chrome.runtime.getURL(`data/vocabularies/${fileName}`));

      if (!response.ok) {
        throw new Error(`无法加载词库文件: ${fileName}`);
      }

      const words: WordDefinition[] = await response.json();

      return {
        type,
        name: this.getDictionaryName(type),
        words,
        totalCount: words.length
      };
    } catch (error) {
      console.error(`加载词库数据失败: ${type}`, error);
      // 如果加载失败，返回示例数据作为备用
      const sampleWords: WordDefinition[] = this.generateSampleWords(type);
      return {
        type,
        name: this.getDictionaryName(type),
        words: sampleWords,
        totalCount: sampleWords.length
      };
    }
  }

  private generateSampleWords(type: DictionaryType): WordDefinition[] {
    // 根据不同词库类型生成示例词汇
    const baseWords: WordDefinition[] = [
      {
        word: 'example',
        pronunciation: '/ɪɡˈzæmpəl/',
        partOfSpeech: 'noun',
        definitions: ['例子', '实例', '榜样'],
        examples: ['This is an example sentence.', 'Follow his example.'],
        difficulty: 3,
        frequency: 85
      },
      {
        word: 'academic',
        pronunciation: '/ˌækəˈdemɪk/',
        partOfSpeech: 'adjective',
        definitions: ['学术的', '理论的', '大学的'],
        examples: ['Academic research is important.', 'She has academic interests.'],
        difficulty: 4,
        frequency: 70
      },
      {
        word: 'analyze',
        pronunciation: '/ˈænəlaɪz/',
        partOfSpeech: 'verb',
        definitions: ['分析', '解析', '研究'],
        examples: ['We need to analyze the data.', 'Analyze this problem carefully.'],
        difficulty: 5,
        frequency: 65
      },
      {
        word: 'comprehensive',
        pronunciation: '/ˌkɑːmprɪˈhensɪv/',
        partOfSpeech: 'adjective',
        definitions: ['全面的', '综合的', '详尽的'],
        examples: ['A comprehensive study was conducted.', 'This is a comprehensive guide.'],
        difficulty: 6,
        frequency: 55
      },
      {
        word: 'significant',
        pronunciation: '/sɪɡˈnɪfɪkənt/',
        partOfSpeech: 'adjective',
        definitions: ['重要的', '显著的', '有意义的'],
        examples: ['This is a significant discovery.', 'There was a significant change.'],
        difficulty: 5,
        frequency: 75
      }
    ];

    // 根据词库类型调整难度和词汇数量
    const difficultyMultiplier = this.getDifficultyMultiplier(type);
    const wordCount = Math.min(this.getWordCount(type), baseWords.length);

    const words: WordDefinition[] = [];
    for (let i = 0; i < wordCount; i++) {
      const baseWord = baseWords[i];
      if (baseWord) {
        words.push({
          word: baseWord.word,
          pronunciation: baseWord.pronunciation,
          partOfSpeech: baseWord.partOfSpeech,
          definitions: baseWord.definitions,
          examples: baseWord.examples,
          difficulty: Math.min(10, Math.round(baseWord.difficulty * difficultyMultiplier)),
          frequency: baseWord.frequency
        });
      }
    }

    return words;
  }

  private getDifficultyMultiplier(type: DictionaryType): number {
    const multipliers = {
      [DictionaryType.CET4]: 0.8,
      [DictionaryType.CET6]: 1.0,
      [DictionaryType.IELTS]: 1.2,
      [DictionaryType.TOEFL]: 1.3,
      [DictionaryType.GRE]: 1.5
    };
    return multipliers[type] || 1.0;
  }

  private getWordCount(type: DictionaryType): number {
    const counts = {
      [DictionaryType.CET4]: 2500,
      [DictionaryType.CET6]: 3000,
      [DictionaryType.IELTS]: 3500,
      [DictionaryType.TOEFL]: 4000,
      [DictionaryType.GRE]: 3000
    };
    return counts[type] || 1000;
  }

  private async lookupWordOnline(word: string): Promise<WordDefinition | null> {
    // 模拟在线词典查询
    // 实际实现中应该调用在线词典API

    return {
      word,
      pronunciation: '/unknown/',
      partOfSpeech: 'unknown',
      definitions: ['在线查询结果'],
      examples: [],
      difficulty: 1,
      frequency: 50
    };
  }

  private getDictionaryName(type: DictionaryType): string {
    const names = {
      [DictionaryType.GRE]: 'GRE词汇',
      [DictionaryType.TOEFL]: '托福词汇',
      [DictionaryType.IELTS]: '雅思词汇',
      [DictionaryType.CET4]: '大学英语四级',
      [DictionaryType.CET6]: '大学英语六级'
    };
    return names[type];
  }

  private getDictionaryFileName(type: DictionaryType): string {
    const fileNames = {
      [DictionaryType.GRE]: 'gre-words.json',
      [DictionaryType.TOEFL]: 'toefl-words.json',
      [DictionaryType.IELTS]: 'ielts-words.json',
      [DictionaryType.CET4]: 'cet4-words.json',
      [DictionaryType.CET6]: 'cet6-words.json'
    };
    return fileNames[type];
  }

  private getLearnedWordsCount(dictionaryType: DictionaryType): number {
    let count = 0;
    for (const [word, progress] of this.learningProgress) {
      if (this.isWordInDictionary(word, dictionaryType) && progress.masteryLevel >= 0.8) {
        count++;
      }
    }
    return count;
  }

  private isWordInDictionary(word: string, dictionaryType: DictionaryType): boolean {
    const dictionary = this.dictionaries.get(dictionaryType);
    if (!dictionary) return false;

    return dictionary.words.some(w => w.word.toLowerCase() === word.toLowerCase());
  }

  // 清空词汇查询缓存
  clearWordCache(): void {
    this.wordCache.clear();
  }

  // 获取缓存统计信息
  getCacheStats(): { size: number; dictionaries: number } {
    return {
      size: this.wordCache.size,
      dictionaries: this.dictionaries.size
    };
  }

  // 预加载所有词库
  async preloadAllDictionaries(): Promise<void> {
    const types = Object.values(DictionaryType);
    const loadPromises = types.map(type => this.loadBuiltInDictionary(type));

    try {
      await Promise.all(loadPromises);
      console.log('所有词库预加载完成');
    } catch (error) {
      console.error('词库预加载失败:', error);
      throw error;
    }
  }

  // 获取当前活跃词库的词汇列表
  getActiveWords(): WordDefinition[] {
    if (!this.activeDictionary) {
      return [];
    }

    const dictionary = this.dictionaries.get(this.activeDictionary);
    return dictionary ? dictionary.words : [];
  }

  // 检查单词是否在当前活跃词库中
  isWordInActiveDictionary(word: string): boolean {
    if (!this.activeDictionary) {
      return false;
    }

    return this.isWordInDictionary(word, this.activeDictionary);
  }
}
