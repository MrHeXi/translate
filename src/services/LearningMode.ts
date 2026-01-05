// 学习模式管理器

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

export enum ReviewPerformance {
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

export class LearningMode {
  private vocabulary: Map<string, VocabularyItem> = new Map();
  private learningStats: LearningStats = {
    totalWordsLearned: 0,
    dailyGoal: 20,
    currentStreak: 0,
    longestStreak: 0,
    reviewAccuracy: 0,
    timeSpentLearning: 0
  };

  async addVocabulary(item: VocabularyItem): Promise<void> {
    const key = item.word.toLowerCase();
    
    // 如果词汇已存在，更新信息
    if (this.vocabulary.has(key)) {
      const existing = this.vocabulary.get(key)!;
      existing.context = item.context;
      existing.sourceUrl = item.sourceUrl;
    } else {
      // 添加新词汇
      const newItem: VocabularyItem = {
        ...item,
        reviewCount: 0,
        masteryLevel: 0,
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // 明天复习
      };
      
      this.vocabulary.set(key, newItem);
      this.learningStats.totalWordsLearned++;
    }

    // 保存到存储
    await this.saveVocabulary();
  }

  async removeVocabulary(word: string): Promise<void> {
    const key = word.toLowerCase();
    if (this.vocabulary.delete(key)) {
      this.learningStats.totalWordsLearned--;
      await this.saveVocabulary();
    }
  }

  async getVocabularyList(): Promise<VocabularyItem[]> {
    return Array.from(this.vocabulary.values()).sort((a, b) => 
      b.addedDate.getTime() - a.addedDate.getTime()
    );
  }

  async markAsLearned(word: string): Promise<void> {
    const key = word.toLowerCase();
    const item = this.vocabulary.get(key);
    
    if (item) {
      item.masteryLevel = Math.min(1.0, item.masteryLevel + 0.2);
      item.reviewCount++;
      
      // 更新下次复习时间
      await this.updateReviewSchedule(word);
      await this.saveVocabulary();
    }
  }

  async updateReviewSchedule(word: string): Promise<void> {
    const key = word.toLowerCase();
    const item = this.vocabulary.get(key);
    
    if (item) {
      // 基于掌握程度计算下次复习间隔
      const baseInterval = 24 * 60 * 60 * 1000; // 1天
      const masteryMultiplier = Math.pow(2, item.masteryLevel * 5); // 掌握程度越高，间隔越长
      const interval = baseInterval * masteryMultiplier;
      
      item.nextReviewDate = new Date(Date.now() + interval);
    }
  }

  async getWordsForReview(): Promise<VocabularyItem[]> {
    const now = new Date();
    const wordsForReview: VocabularyItem[] = [];
    
    for (const item of this.vocabulary.values()) {
      if (item.nextReviewDate <= now) {
        wordsForReview.push(item);
      }
    }
    
    // 按优先级排序：掌握程度低的优先
    return wordsForReview.sort((a, b) => a.masteryLevel - b.masteryLevel);
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
      
      await this.saveVocabulary();
    }
  }

  async getLearningStats(): Promise<LearningStats> {
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
    
    let count = 0;
    for (const item of this.vocabulary.values()) {
      if (item.reviewCount > 0) {
        // 这里简化处理，实际应该记录每次复习的时间
        count++;
      }
    }
    
    return count;
  }

  private updateReviewStats(_performance: ReviewPerformance): void {
    // 更新复习准确率
    const totalReviews = Array.from(this.vocabulary.values())
      .reduce((sum, item) => sum + item.reviewCount, 0);
    
    if (totalReviews > 0) {
      const correctReviews = Array.from(this.vocabulary.values())
        .reduce((sum, item) => sum + (item.masteryLevel > 0.5 ? item.reviewCount : 0), 0);
      
      this.learningStats.reviewAccuracy = correctReviews / totalReviews;
    }
    
    // 更新学习时间（简化处理）
    this.learningStats.timeSpentLearning += 30; // 假设每次复习30秒
  }

  private async saveVocabulary(): Promise<void> {
    try {
      // 将Map转换为数组以便存储
      const vocabularyArray = Array.from(this.vocabulary.entries()).map(([key, value]) => ({
        key,
        ...value
      }));

      // 使用Chrome Storage API保存
      await chrome.storage.local.set({
        vocabulary: vocabularyArray,
        learningStats: this.learningStats
      });
    } catch (error) {
      console.error('保存词汇数据失败:', error);
      throw new Error('无法保存词汇数据');
    }
  }

  async loadVocabulary(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['vocabulary', 'learningStats']);
      
      if (result['vocabulary']) {
        // 重建Map
        this.vocabulary.clear();
        for (const item of result['vocabulary']) {
          const { key, ...vocabularyItem } = item;
          // 确保日期对象正确转换
          vocabularyItem.addedDate = new Date(vocabularyItem.addedDate);
          vocabularyItem.nextReviewDate = new Date(vocabularyItem.nextReviewDate);
          this.vocabulary.set(key, vocabularyItem);
        }
      }
      
      if (result['learningStats']) {
        this.learningStats = { ...this.learningStats, ...result['learningStats'] };
      }
    } catch (error) {
      console.error('加载词汇数据失败:', error);
      // 如果加载失败，使用默认值
    }
  }
}