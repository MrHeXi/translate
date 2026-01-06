// 学习模式管理器
import { DictionaryManager, DictionaryType, WordDefinition } from './DictionaryManager';

export interface VocabularyItem {
  word: string;
  translation: string;
  context: string;
  sourceUrl: string;
  addedDate: Date;
  reviewCount: number;
  masteryLevel: number;
  nextReviewDate: Date;
  partOfSpeech?: string;
  pronunciation?: string;
  examples?: string[];
  dictionaryType?: DictionaryType; // 来源词库类型
}

/* eslint-disable no-unused-vars */
export enum ReviewPerformance {
  POOR = 1,
  FAIR = 2,
  GOOD = 3,
  EXCELLENT = 4
}
/* eslint-enable no-unused-vars */

export interface LearningStats {
  totalWordsLearned: number;
  dailyGoal: number;
  currentStreak: number;
  longestStreak: number;
  reviewAccuracy: number;
  timeSpentLearning: number;
  todayReviewedCount: number;
  reviewDueCount: number;
}

export interface DictionaryProgress {
  dictionaryType: DictionaryType;
  totalWords: number;
  learnedWords: number;
  masteryRate: number;
  lastStudyDate: Date;
  studyStreak: number;
}

export interface ReviewSession {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  wordsReviewed: number;
  correctAnswers: number;
  averageResponseTime: number;
}

export class LearningMode {
  private vocabulary: Map<string, VocabularyItem> = new Map();
  private learningStats: LearningStats = {
    totalWordsLearned: 0,
    dailyGoal: 20,
    currentStreak: 0,
    longestStreak: 0,
    reviewAccuracy: 0,
    timeSpentLearning: 0,
    todayReviewedCount: 0,
    reviewDueCount: 0
  };
  private dictionaryProgress: Map<DictionaryType, DictionaryProgress> = new Map();
  private currentReviewSession: ReviewSession | null = null;
  private dictionaryManager: DictionaryManager;

  constructor(dictionaryManager: DictionaryManager) {
    this.dictionaryManager = dictionaryManager;
  }

  async addVocabulary(item: VocabularyItem): Promise<void> {
    const key = item.word.toLowerCase();
    
    // 如果词汇已存在，更新信息
    if (this.vocabulary.has(key)) {
      const existing = this.vocabulary.get(key)!;
      existing.context = item.context;
      existing.sourceUrl = item.sourceUrl;
      existing.translation = item.translation;
      
      // 如果有新的词库信息，也更新
      if (item.dictionaryType) {
        existing.dictionaryType = item.dictionaryType;
      }
    } else {
      // 尝试从词典管理器获取详细信息
      let wordDefinition: WordDefinition | null = null;
      try {
        wordDefinition = await this.dictionaryManager.lookupWord(item.word);
      } catch (error) {
        console.warn(`无法查找单词 ${item.word} 的详细信息:`, error);
      }

      // 添加新词汇，保留传入的 masteryLevel 和 reviewCount
      const newItem: VocabularyItem = {
        ...item,
        reviewCount: item.reviewCount ?? 0,
        masteryLevel: item.masteryLevel ?? 0,
        nextReviewDate: item.nextReviewDate || new Date(Date.now() + 24 * 60 * 60 * 1000), // 明天复习
        partOfSpeech: wordDefinition?.partOfSpeech || item.partOfSpeech || 'unknown',
        pronunciation: wordDefinition?.pronunciation || item.pronunciation || '/unknown/',
        examples: wordDefinition?.examples || item.examples || []
      };
      
      this.vocabulary.set(key, newItem);
      this.learningStats.totalWordsLearned++;
      
      // 更新词库进度
      if (item.dictionaryType) {
        await this.updateDictionaryProgress(item.dictionaryType);
      }
    }

    // 保存到存储
    await this.saveVocabulary();
  }

  async removeVocabulary(word: string): Promise<void> {
    const key = word.toLowerCase();
    const item = this.vocabulary.get(key);
    
    if (this.vocabulary.delete(key)) {
      this.learningStats.totalWordsLearned--;
      
      // 更新词库进度
      if (item?.dictionaryType) {
        await this.updateDictionaryProgress(item.dictionaryType);
      }
      
      await this.saveVocabulary();
    }
  }

  async getVocabularyList(dictionaryType?: DictionaryType): Promise<VocabularyItem[]> {
    let vocabularyList = Array.from(this.vocabulary.values());
    
    // 如果指定了词库类型，只返回该词库的词汇
    if (dictionaryType) {
      vocabularyList = vocabularyList.filter(item => item.dictionaryType === dictionaryType);
    }
    
    return vocabularyList.sort((a, b) => 
      b.addedDate.getTime() - a.addedDate.getTime()
    );
  }

  async markAsLearned(word: string): Promise<void> {
    const key = word.toLowerCase();
    const item = this.vocabulary.get(key);
    
    if (item) {
      const oldMasteryLevel = item.masteryLevel;
      item.masteryLevel = Math.min(1.0, item.masteryLevel + 0.2);
      item.reviewCount++;
      
      // 如果掌握程度从低于0.8提升到0.8以上，认为是新学会的单词
      if (oldMasteryLevel < 0.8 && item.masteryLevel >= 0.8) {
        this.learningStats.todayReviewedCount++;
        
        // 更新词库进度
        if (item.dictionaryType) {
          await this.updateDictionaryProgress(item.dictionaryType);
        }
      }
      
      // 更新下次复习时间
      await this.updateReviewSchedule(word);
      await this.saveVocabulary();
    }
  }

  async updateReviewSchedule(word: string): Promise<void> {
    const key = word.toLowerCase();
    const item = this.vocabulary.get(key);
    
    if (item) {
      // 基于掌握程度和复习次数计算下次复习间隔（间隔重复算法）
      const baseInterval = 24 * 60 * 60 * 1000; // 1天
      const masteryMultiplier = Math.pow(2, item.masteryLevel * 5); // 掌握程度越高，间隔越长
      const reviewMultiplier = Math.pow(1.3, item.reviewCount); // 复习次数越多，间隔越长
      
      const interval = baseInterval * masteryMultiplier * reviewMultiplier;
      
      // 限制最大间隔为30天
      const maxInterval = 30 * 24 * 60 * 60 * 1000;
      const finalInterval = Math.min(interval, maxInterval);
      
      item.nextReviewDate = new Date(Date.now() + finalInterval);
    }
  }

  async getWordsForReview(limit?: number): Promise<VocabularyItem[]> {
    const now = new Date();
    const wordsForReview: VocabularyItem[] = [];
    
    for (const item of this.vocabulary.values()) {
      if (item.nextReviewDate <= now) {
        wordsForReview.push(item);
      }
    }
    
    // 按优先级排序：掌握程度低的优先，然后按到期时间排序
    const sortedWords = wordsForReview.sort((a, b) => {
      if (a.masteryLevel !== b.masteryLevel) {
        return a.masteryLevel - b.masteryLevel;
      }
      return a.nextReviewDate.getTime() - b.nextReviewDate.getTime();
    });
    
    // 如果指定了限制数量，只返回前N个
    return limit ? sortedWords.slice(0, limit) : sortedWords;
  }

  async scheduleNextReview(word: string, performance: ReviewPerformance): Promise<void> {
    const key = word.toLowerCase();
    const item = this.vocabulary.get(key);
    
    if (item) {
      // 根据复习表现调整掌握程度
      const performanceAdjustment = (performance - 2.5) * 0.1; // -0.15 到 +0.15
      item.masteryLevel = Math.max(0, Math.min(1, item.masteryLevel + performanceAdjustment));
      item.reviewCount++;
      
      // 更新复习时间
      await this.updateReviewSchedule(word);
      
      // 更新统计信息
      this.updateReviewStats(performance);
      
      // 更新词库进度
      if (item.dictionaryType) {
        await this.updateDictionaryProgress(item.dictionaryType);
      }
      
      await this.saveVocabulary();
    }
  }

  async getLearningStats(): Promise<LearningStats> {
    // 更新实时统计数据
    this.learningStats.reviewDueCount = await this.getReviewDueCount();
    this.learningStats.todayReviewedCount = await this.getTodayReviewedCount();
    
    return { ...this.learningStats };
  }

  async updateDailyGoal(goal: number): Promise<void> {
    this.learningStats.dailyGoal = goal;
    await this.saveVocabulary();
  }

  async getReviewDueCount(): Promise<number> {
    const wordsForReview = await this.getWordsForReview();
    return wordsForReview.length;
  }

  async getTodayReviewedCount(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // 这里简化处理，实际应该记录每次复习的具体时间
    // 目前基于词汇的复习次数来估算
    let count = 0;
    for (const item of this.vocabulary.values()) {
      if (item.reviewCount > 0 && item.masteryLevel >= 0.8) {
        count++;
      }
    }
    
    return Math.min(count, this.learningStats.dailyGoal);
  }

  // 新增方法：获取词库进度
  async getDictionaryProgress(dictionaryType: DictionaryType): Promise<DictionaryProgress | null> {
    return this.dictionaryProgress.get(dictionaryType) || null;
  }

  // 新增方法：获取所有词库进度
  async getAllDictionaryProgress(): Promise<DictionaryProgress[]> {
    return Array.from(this.dictionaryProgress.values());
  }

  // 新增方法：开始复习会话
  async startReviewSession(): Promise<string> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    this.currentReviewSession = {
      sessionId,
      startTime: new Date(),
      wordsReviewed: 0,
      correctAnswers: 0,
      averageResponseTime: 0
    };
    
    return sessionId;
  }

  // 新增方法：结束复习会话
  async endReviewSession(): Promise<ReviewSession | null> {
    if (this.currentReviewSession) {
      this.currentReviewSession.endTime = new Date();
      
      // 更新学习时间统计
      const sessionDuration = this.currentReviewSession.endTime.getTime() - 
                             this.currentReviewSession.startTime.getTime();
      this.learningStats.timeSpentLearning += Math.round(sessionDuration / 1000); // 转换为秒
      
      // 更新复习准确率
      if (this.currentReviewSession.wordsReviewed > 0) {
        const sessionAccuracy = this.currentReviewSession.correctAnswers / 
                               this.currentReviewSession.wordsReviewed;
        
        // 使用加权平均更新总体准确率
        const totalReviews = Array.from(this.vocabulary.values())
          .reduce((sum, item) => sum + item.reviewCount, 0);
        
        if (totalReviews > 0) {
          this.learningStats.reviewAccuracy = 
            (this.learningStats.reviewAccuracy * (totalReviews - this.currentReviewSession.wordsReviewed) + 
             sessionAccuracy * this.currentReviewSession.wordsReviewed) / totalReviews;
        } else {
          this.learningStats.reviewAccuracy = sessionAccuracy;
        }
      }
      
      const completedSession = { ...this.currentReviewSession };
      this.currentReviewSession = null;
      
      await this.saveVocabulary();
      return completedSession;
    }
    
    return null;
  }

  // 新增方法：记录复习结果
  async recordReviewResult(word: string, isCorrect: boolean, responseTime: number): Promise<void> {
    if (this.currentReviewSession) {
      this.currentReviewSession.wordsReviewed++;
      if (isCorrect) {
        this.currentReviewSession.correctAnswers++;
      }
      
      // 更新平均响应时间
      const totalTime = this.currentReviewSession.averageResponseTime * 
                       (this.currentReviewSession.wordsReviewed - 1) + responseTime;
      this.currentReviewSession.averageResponseTime = 
        totalTime / this.currentReviewSession.wordsReviewed;
    }
    
    // 根据结果调整掌握程度
    const performance = isCorrect ? 
      (responseTime < 3000 ? ReviewPerformance.EXCELLENT : ReviewPerformance.GOOD) :
      ReviewPerformance.POOR;
    
    await this.scheduleNextReview(word, performance);
  }

  private updateReviewStats(performance: ReviewPerformance): void {
    // 更新学习连续天数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 简化处理：如果今天有复习活动，更新连续天数
    if (performance >= ReviewPerformance.FAIR) {
      this.learningStats.currentStreak++;
      this.learningStats.longestStreak = Math.max(
        this.learningStats.longestStreak, 
        this.learningStats.currentStreak
      );
    }
  }

  private async updateDictionaryProgress(dictionaryType: DictionaryType): Promise<void> {
    try {
      // 先尝试加载词库，如果没有加载的话
      await this.dictionaryManager.loadBuiltInDictionary(dictionaryType);
      
      // 获取词库统计信息
      const dictionaryStats = await this.dictionaryManager.getLearningStats(dictionaryType);
      
      // 计算该词库中已学会的词汇数量
      const learnedWordsInDictionary = Array.from(this.vocabulary.values())
        .filter(item => item.dictionaryType === dictionaryType && item.masteryLevel >= 0.8)
        .length;
      
      const progress: DictionaryProgress = {
        dictionaryType,
        totalWords: dictionaryStats.totalWords,
        learnedWords: learnedWordsInDictionary,
        masteryRate: dictionaryStats.totalWords > 0 ? 
          learnedWordsInDictionary / dictionaryStats.totalWords : 0,
        lastStudyDate: new Date(),
        studyStreak: this.learningStats.currentStreak
      };
      
      this.dictionaryProgress.set(dictionaryType, progress);
    } catch (error) {
      console.warn(`更新词库进度失败: ${dictionaryType}`, error);
    }
  }

  private async saveVocabulary(): Promise<void> {
    try {
      // 将Map转换为数组以便存储
      const vocabularyArray = Array.from(this.vocabulary.entries()).map(([key, value]) => ({
        key,
        ...value,
        // 确保日期对象被正确序列化
        addedDate: value.addedDate.toISOString(),
        nextReviewDate: value.nextReviewDate.toISOString()
      }));

      // 将词库进度Map转换为数组
      const dictionaryProgressArray = Array.from(this.dictionaryProgress.entries()).map(([key, value]) => ({
        key,
        ...value,
        lastStudyDate: value.lastStudyDate.toISOString()
      }));

      // 使用Chrome Storage API保存
      await chrome.storage.local.set({
        vocabulary: vocabularyArray,
        learningStats: this.learningStats,
        dictionaryProgress: dictionaryProgressArray
      });
    } catch (error) {
      console.error('保存词汇数据失败:', error);
      throw new Error('无法保存词汇数据');
    }
  }

  async loadVocabulary(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['vocabulary', 'learningStats', 'dictionaryProgress']);
      
      if (result['vocabulary']) {
        // 重建词汇Map
        this.vocabulary.clear();
        this.learningStats.totalWordsLearned = 0; // 重置计数
        
        for (const item of result['vocabulary']) {
          const { key, addedDate, nextReviewDate, ...vocabularyItem } = item;
          // 确保日期对象正确转换
          vocabularyItem.addedDate = new Date(addedDate);
          vocabularyItem.nextReviewDate = new Date(nextReviewDate);
          this.vocabulary.set(key, vocabularyItem);
          this.learningStats.totalWordsLearned++;
        }
      }
      
      if (result['learningStats']) {
        this.learningStats = { 
          ...this.learningStats, 
          ...result['learningStats'],
          // 确保新增的字段有默认值
          todayReviewedCount: result['learningStats'].todayReviewedCount || 0,
          reviewDueCount: result['learningStats'].reviewDueCount || 0
        };
      }

      if (result['dictionaryProgress']) {
        // 重建词库进度Map
        this.dictionaryProgress.clear();
        for (const item of result['dictionaryProgress']) {
          const { key, lastStudyDate, ...progressItem } = item;
          progressItem.lastStudyDate = new Date(lastStudyDate);
          this.dictionaryProgress.set(key, progressItem);
        }
      }
    } catch (error) {
      console.error('加载词汇数据失败:', error);
      // 如果加载失败，使用默认值
    }
  }

  // 新增方法：重置学习数据
  async resetLearningData(): Promise<void> {
    this.vocabulary.clear();
    this.dictionaryProgress.clear();
    this.learningStats = {
      totalWordsLearned: 0,
      dailyGoal: 20,
      currentStreak: 0,
      longestStreak: 0,
      reviewAccuracy: 0,
      timeSpentLearning: 0,
      todayReviewedCount: 0,
      reviewDueCount: 0
    };
    
    await this.saveVocabulary();
  }

  // 新增方法：导出学习数据
  async exportLearningData(): Promise<any> {
    return {
      vocabulary: Array.from(this.vocabulary.entries()),
      learningStats: this.learningStats,
      dictionaryProgress: Array.from(this.dictionaryProgress.entries()),
      exportDate: new Date().toISOString()
    };
  }

  // 新增方法：导入学习数据
  async importLearningData(data: any): Promise<void> {
    try {
      if (data.vocabulary) {
        this.vocabulary.clear();
        for (const [key, item] of data.vocabulary) {
          // 确保日期对象正确转换
          if (typeof item.addedDate === 'string') {
            item.addedDate = new Date(item.addedDate);
          }
          if (typeof item.nextReviewDate === 'string') {
            item.nextReviewDate = new Date(item.nextReviewDate);
          }
          this.vocabulary.set(key, item);
        }
      }

      if (data.learningStats) {
        this.learningStats = { ...this.learningStats, ...data.learningStats };
      }

      if (data.dictionaryProgress) {
        this.dictionaryProgress.clear();
        for (const [key, progress] of data.dictionaryProgress) {
          if (typeof progress.lastStudyDate === 'string') {
            progress.lastStudyDate = new Date(progress.lastStudyDate);
          }
          this.dictionaryProgress.set(key, progress);
        }
      }

      await this.saveVocabulary();
    } catch (error) {
      console.error('导入学习数据失败:', error);
      throw new Error('无法导入学习数据');
    }
  }
}