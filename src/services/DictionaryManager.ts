// 词典管理器

export enum DictionaryType {
  GRE = 'gre',
  TOEFL = 'toefl',
  IELTS = 'ielts',
  CET4 = 'cet4',
  CET6 = 'cet6'
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

export class DictionaryManager {
  private dictionaries: Map<DictionaryType, Dictionary> = new Map();
  private activeDictionary: DictionaryType | null = null;
  private learningProgress: Map<string, LearningProgress> = new Map();

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

  async lookupWord(word: string): Promise<WordDefinition | null> {
    // 在所有已加载的词库中查找单词
    for (const dictionary of this.dictionaries.values()) {
      const wordDef = dictionary.words.find(w => w.word.toLowerCase() === word.toLowerCase());
      if (wordDef) {
        return wordDef;
      }
    }
    
    // 如果本地词库中没有找到，可以调用在线词典API
    return await this.lookupWordOnline(word);
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

  private async fetchDictionaryData(type: DictionaryType): Promise<Dictionary> {
    // 模拟加载词库数据
    // 实际实现中应该从本地文件或远程API加载
    
    const sampleWords: WordDefinition[] = [
      {
        word: 'example',
        pronunciation: '/ɪɡˈzæmpəl/',
        partOfSpeech: 'noun',
        definitions: ['例子', '实例', '榜样'],
        examples: ['This is an example sentence.'],
        difficulty: 3,
        frequency: 85
      }
    ];

    return {
      type,
      name: this.getDictionaryName(type),
      words: sampleWords,
      totalCount: sampleWords.length
    };
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
}