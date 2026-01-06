import { LearningMode, VocabularyItem, ReviewPerformance } from '../LearningMode';
import { DictionaryManager, DictionaryType } from '../DictionaryManager';
import * as fc from 'fast-check';

// 模拟Chrome Storage API
const mockChromeStorage = {
  local: {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({}),
    clear: jest.fn().mockResolvedValue(undefined)
  }
};

// 设置全局Chrome对象
(global as any).chrome = {
  storage: mockChromeStorage
};

describe('LearningMode', () => {
  let learningMode: LearningMode;
  let dictionaryManager: DictionaryManager;

  beforeEach(() => {
    // 重置所有mock
    jest.clearAllMocks();
    
    // 创建DictionaryManager实例
    dictionaryManager = new DictionaryManager();
    
    // 创建LearningMode实例
    learningMode = new LearningMode(dictionaryManager);
  });

  describe('基本功能测试', () => {
    it('应该能够添加词汇到生词本', async () => {
      const vocabularyItem: VocabularyItem = {
        word: 'example',
        translation: '例子',
        context: 'This is an example.',
        sourceUrl: 'https://example.com',
        addedDate: new Date(),
        reviewCount: 0,
        masteryLevel: 0,
        nextReviewDate: new Date()
      };

      await learningMode.addVocabulary(vocabularyItem);
      
      const vocabularyList = await learningMode.getVocabularyList();
      expect(vocabularyList).toHaveLength(1);
      expect(vocabularyList[0]?.word).toBe('example');
      expect(vocabularyList[0]?.translation).toBe('例子');
    });

    it('应该能够移除词汇', async () => {
      const vocabularyItem: VocabularyItem = {
        word: 'test',
        translation: '测试',
        context: 'This is a test.',
        sourceUrl: 'https://test.com',
        addedDate: new Date(),
        reviewCount: 0,
        masteryLevel: 0,
        nextReviewDate: new Date()
      };

      await learningMode.addVocabulary(vocabularyItem);
      await learningMode.removeVocabulary('test');
      
      const vocabularyList = await learningMode.getVocabularyList();
      expect(vocabularyList).toHaveLength(0);
    });

    it('应该能够标记词汇为已学会', async () => {
      const vocabularyItem: VocabularyItem = {
        word: 'learn',
        translation: '学习',
        context: 'I want to learn.',
        sourceUrl: 'https://learn.com',
        addedDate: new Date(),
        reviewCount: 0,
        masteryLevel: 0,
        nextReviewDate: new Date()
      };

      await learningMode.addVocabulary(vocabularyItem);
      await learningMode.markAsLearned('learn');
      
      const vocabularyList = await learningMode.getVocabularyList();
      expect(vocabularyList[0]?.masteryLevel).toBeGreaterThan(0);
      expect(vocabularyList[0]?.reviewCount).toBe(1);
    });

    it('应该能够获取需要复习的词汇', async () => {
      // 先加载现有数据
      await learningMode.loadVocabulary();
      
      const vocabularyItem: VocabularyItem = {
        word: 'review',
        translation: '复习',
        context: 'Time to review.',
        sourceUrl: 'https://review.com',
        addedDate: new Date(),
        reviewCount: 0,
        masteryLevel: 0,
        nextReviewDate: new Date(Date.now() - 1000) // 过期的复习时间
      };

      await learningMode.addVocabulary(vocabularyItem);
      
      const wordsForReview = await learningMode.getWordsForReview();
      expect(wordsForReview.length).toBeGreaterThanOrEqual(1);
      expect(wordsForReview.some(w => w.word === 'review')).toBe(true);
    });
  });

  describe('属性测试', () => {
    it('学习进度准确性 - 对于任何学习活动，系统记录的进度数据应该准确反映用户的学习状态和统计信息', async () => {
      // Feature: chrome-translation-extension, Property 9: 学习进度准确性
      await fc.assert(
        fc.asyncProperty(
          // 生成词汇列表 - 确保单词唯一（考虑大小写）
          fc.array(
            fc.record({
              word: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
              translation: fc.string({ minLength: 1, maxLength: 50 }),
              context: fc.string({ minLength: 1, maxLength: 100 }),
              sourceUrl: fc.webUrl(),
              dictionaryType: fc.constantFrom(...Object.values(DictionaryType))
            }),
            { minLength: 1, maxLength: 10 }
          ).map(words => {
            // 去重：基于小写单词
            const uniqueWords = new Map();
            words.forEach(word => {
              const key = word.word.toLowerCase();
              if (!uniqueWords.has(key)) {
                uniqueWords.set(key, word);
              }
            });
            return Array.from(uniqueWords.values());
          }),
          // 生成复习表现序列
          fc.array(
            fc.record({
              wordIndex: fc.nat(),
              performance: fc.constantFrom(...Object.values(ReviewPerformance).filter(v => typeof v === 'number'))
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (vocabularyData, reviewActions) => {
            // 重置学习模式
            await learningMode.resetLearningData();
            
            // 添加词汇到生词本
            const addedWords: string[] = [];
            for (const vocabData of vocabularyData) {
              const vocabularyItem: VocabularyItem = {
                word: vocabData.word,
                translation: vocabData.translation,
                context: vocabData.context,
                sourceUrl: vocabData.sourceUrl,
                addedDate: new Date(),
                reviewCount: 0,
                masteryLevel: 0,
                nextReviewDate: new Date(),
                dictionaryType: vocabData.dictionaryType
              };
              
              await learningMode.addVocabulary(vocabularyItem);
              addedWords.push(vocabData.word);
            }
            
            // 获取初始统计信息
            const initialStats = await learningMode.getLearningStats();
            expect(initialStats.totalWordsLearned).toBe(vocabularyData.length);
            
            // 执行复习活动
            let expectedReviewCount = 0;
            const wordMasteryLevels = new Map<string, number>();
            
            for (const action of reviewActions) {
              const wordIndex = action.wordIndex % addedWords.length;
              const word = addedWords[wordIndex];
              
              if (!word) continue; // 跳过undefined的情况
              
              // 记录复习前的掌握程度
              const vocabularyList = await learningMode.getVocabularyList();
              const wordItem = vocabularyList.find(item => item.word.toLowerCase() === word.toLowerCase());
              const previousMastery = wordItem?.masteryLevel || 0;
              
              // 执行复习
              await learningMode.scheduleNextReview(word, action.performance);
              expectedReviewCount++;
              
              // 计算预期的掌握程度变化
              const performanceAdjustment = (action.performance - 2.5) * 0.1;
              const expectedMastery = Math.max(0, Math.min(1, previousMastery + performanceAdjustment));
              wordMasteryLevels.set(word.toLowerCase(), expectedMastery);
            }
            
            // 验证最终统计信息的准确性
            const finalStats = await learningMode.getLearningStats();
            const finalVocabularyList = await learningMode.getVocabularyList();
            
            // 验证词汇总数保持不变
            expect(finalStats.totalWordsLearned).toBe(vocabularyData.length);
            
            // 验证每个词汇的掌握程度变化是准确的
            for (const [word, expectedMastery] of wordMasteryLevels) {
              const wordItem = finalVocabularyList.find(item => item.word.toLowerCase() === word);
              expect(wordItem).toBeDefined();
              expect(wordItem!.masteryLevel).toBeCloseTo(expectedMastery, 2);
            }
            
            // 验证复习次数统计
            const totalReviewCount = finalVocabularyList.reduce((sum, item) => sum + item.reviewCount, 0);
            expect(totalReviewCount).toBeGreaterThanOrEqual(expectedReviewCount);
            
            // 验证复习准确率在合理范围内
            expect(finalStats.reviewAccuracy).toBeGreaterThanOrEqual(0);
            expect(finalStats.reviewAccuracy).toBeLessThanOrEqual(1);
            
            // 验证学习时间是递增的
            expect(finalStats.timeSpentLearning).toBeGreaterThanOrEqual(initialStats.timeSpentLearning);
            
            // 验证词库进度统计的准确性
            const dictionaryProgressList = await learningMode.getAllDictionaryProgress();
            for (const progress of dictionaryProgressList) {
              expect(progress.learnedWords).toBeGreaterThanOrEqual(0);
              expect(progress.learnedWords).toBeLessThanOrEqual(progress.totalWords);
              expect(progress.masteryRate).toBeGreaterThanOrEqual(0);
              expect(progress.masteryRate).toBeLessThanOrEqual(1);
              
              // 验证掌握率计算的准确性
              if (progress.totalWords > 0) {
                const expectedMasteryRate = progress.learnedWords / progress.totalWords;
                expect(progress.masteryRate).toBeCloseTo(expectedMasteryRate, 2);
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('复习调度算法准确性 - 复习间隔应该基于掌握程度和复习次数合理计算', async () => {
      // Feature: chrome-translation-extension, Property 9: 学习进度准确性（复习调度部分）
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
          fc.array(fc.constantFrom(...Object.values(ReviewPerformance).filter(v => typeof v === 'number')), { minLength: 1, maxLength: 10 }),
          async (word, performanceSequence) => {
            // 重置学习模式
            await learningMode.resetLearningData();
            
            // 添加测试词汇
            const vocabularyItem: VocabularyItem = {
              word,
              translation: '测试翻译',
              context: '测试上下文',
              sourceUrl: 'https://test.com',
              addedDate: new Date(),
              reviewCount: 0,
              masteryLevel: 0,
              nextReviewDate: new Date()
            };
            
            await learningMode.addVocabulary(vocabularyItem);
            
            let previousNextReviewDate = vocabularyItem.nextReviewDate;
            let expectedMasteryLevel = 0;
            let expectedReviewCount = 0;
            
            // 执行复习序列
            for (const performance of performanceSequence) {
              await learningMode.scheduleNextReview(word, performance);
              expectedReviewCount++;
              
              // 计算预期掌握程度
              const performanceAdjustment = (performance - 2.5) * 0.1;
              expectedMasteryLevel = Math.max(0, Math.min(1, expectedMasteryLevel + performanceAdjustment));
              
              // 获取更新后的词汇信息
              const vocabularyList = await learningMode.getVocabularyList();
              const updatedItem = vocabularyList.find(item => item.word === word);
              
              expect(updatedItem).toBeDefined();
              expect(updatedItem!.reviewCount).toBe(expectedReviewCount);
              expect(updatedItem!.masteryLevel).toBeCloseTo(expectedMasteryLevel, 2);
              
              // 验证复习间隔随掌握程度增加而延长
              if (expectedMasteryLevel > 0) {
                const currentInterval = updatedItem!.nextReviewDate.getTime() - Date.now();
                const previousInterval = previousNextReviewDate.getTime() - Date.now();
                
                // 如果掌握程度提高，复习间隔应该增加（或至少不减少太多）
                if (performance >= ReviewPerformance.GOOD) {
                  expect(currentInterval).toBeGreaterThanOrEqual(previousInterval * 0.8);
                }
                
                // 复习间隔应该在合理范围内（1小时到30天）
                expect(currentInterval).toBeGreaterThanOrEqual(60 * 60 * 1000); // 至少1小时
                expect(currentInterval).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000); // 最多30天
              }
              
              previousNextReviewDate = updatedItem!.nextReviewDate;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('词库进度统计一致性 - 词库进度应该与实际学习情况保持一致', async () => {
      // Feature: chrome-translation-extension, Property 9: 学习进度准确性（词库进度部分）
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...Object.values(DictionaryType)),
          fc.array(
            fc.record({
              word: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
              masteryLevel: fc.float({ min: 0, max: 1 })
            }),
            { minLength: 1, maxLength: 20 }
          ).map(words => {
            // 去重：基于小写单词
            const uniqueWords = new Map();
            words.forEach(word => {
              const key = word.word.toLowerCase();
              if (!uniqueWords.has(key)) {
                uniqueWords.set(key, word);
              }
            });
            return Array.from(uniqueWords.values());
          }),
          async (dictionaryType, wordsData) => {
            // 重置学习模式
            await learningMode.resetLearningData();
            
            // 添加指定词库的词汇
            let expectedLearnedWords = 0;
            for (const wordData of wordsData) {
              const vocabularyItem: VocabularyItem = {
                word: wordData.word,
                translation: '测试翻译',
                context: '测试上下文',
                sourceUrl: 'https://test.com',
                addedDate: new Date(),
                reviewCount: 0,
                masteryLevel: wordData.masteryLevel,
                nextReviewDate: new Date(),
                dictionaryType
              };
              
              await learningMode.addVocabulary(vocabularyItem);
              
              // 如果掌握程度 >= 0.8，认为是已学会的词汇
              if (wordData.masteryLevel >= 0.8) {
                expectedLearnedWords++;
              }
            }
            
            // 获取词库进度
            const dictionaryProgress = await learningMode.getDictionaryProgress(dictionaryType);
            
            if (dictionaryProgress) {
              // 验证已学会词汇数量的准确性
              expect(dictionaryProgress.learnedWords).toBe(expectedLearnedWords);
              
              // 验证掌握率计算的准确性
              const expectedMasteryRate = dictionaryProgress.totalWords > 0 ? 
                expectedLearnedWords / dictionaryProgress.totalWords : 0;
              expect(dictionaryProgress.masteryRate).toBeCloseTo(expectedMasteryRate, 2);
              
              // 验证词库类型正确
              expect(dictionaryProgress.dictionaryType).toBe(dictionaryType);
              
              // 验证学习日期是最近的
              const timeDiff = Date.now() - dictionaryProgress.lastStudyDate.getTime();
              expect(timeDiff).toBeLessThan(60 * 1000); // 应该在1分钟内
            }
            
            // 验证按词库类型筛选词汇列表的准确性
            const vocabularyByType = await learningMode.getVocabularyList(dictionaryType);
            expect(vocabularyByType).toHaveLength(wordsData.length);
            
            for (const item of vocabularyByType) {
              expect(item.dictionaryType).toBe(dictionaryType);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('复习会话管理', () => {
    it('应该能够正确管理复习会话', async () => {
      // 开始复习会话
      const sessionId = await learningMode.startReviewSession();
      expect(sessionId).toBeDefined();
      expect(sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
      
      // 添加测试词汇
      const vocabularyItem: VocabularyItem = {
        word: 'session',
        translation: '会话',
        context: 'Review session.',
        sourceUrl: 'https://session.com',
        addedDate: new Date(),
        reviewCount: 0,
        masteryLevel: 0,
        nextReviewDate: new Date()
      };
      
      await learningMode.addVocabulary(vocabularyItem);
      
      // 记录复习结果
      await learningMode.recordReviewResult('session', true, 2000);
      await learningMode.recordReviewResult('session', false, 5000);
      
      // 结束复习会话
      const completedSession = await learningMode.endReviewSession();
      
      expect(completedSession).toBeDefined();
      expect(completedSession!.sessionId).toBe(sessionId);
      expect(completedSession!.wordsReviewed).toBe(2);
      expect(completedSession!.correctAnswers).toBe(1);
      expect(completedSession!.endTime).toBeDefined();
    });
  });

  describe('数据导入导出', () => {
    it('应该能够导出和导入学习数据', async () => {
      // 先重置以确保干净的状态
      await learningMode.resetLearningData();
      
      // 添加测试数据
      const vocabularyItem: VocabularyItem = {
        word: 'export',
        translation: '导出',
        context: 'Export data.',
        sourceUrl: 'https://export.com',
        addedDate: new Date(),
        reviewCount: 5,
        masteryLevel: 0.8,
        nextReviewDate: new Date(Date.now() + 86400000)
      };
      
      await learningMode.addVocabulary(vocabularyItem);
      await learningMode.updateDailyGoal(30);
      
      // 导出数据
      const exportedData = await learningMode.exportLearningData();
      
      expect(exportedData).toHaveProperty('vocabulary');
      expect(exportedData).toHaveProperty('learningStats');
      expect(exportedData).toHaveProperty('dictionaryProgress');
      expect(exportedData).toHaveProperty('exportDate');
      
      // 重置数据
      await learningMode.resetLearningData();
      
      // 验证数据已重置
      let stats = await learningMode.getLearningStats();
      expect(stats.totalWordsLearned).toBe(0);
      expect(stats.dailyGoal).toBe(20);
      
      // 导入数据
      await learningMode.importLearningData(exportedData);
      
      // 验证数据已恢复
      stats = await learningMode.getLearningStats();
      expect(stats.totalWordsLearned).toBe(1);
      expect(stats.dailyGoal).toBe(30);
      
      const vocabularyList = await learningMode.getVocabularyList();
      expect(vocabularyList).toHaveLength(1);
      expect(vocabularyList[0]?.word).toBe('export');
      expect(vocabularyList[0]?.masteryLevel).toBe(0.8);
    });
  });
});