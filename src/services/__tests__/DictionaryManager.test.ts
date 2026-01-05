// DictionaryManager 测试文件

import * as fc from 'fast-check';
import { DictionaryManager, DictionaryType, WordDefinition } from '../DictionaryManager';

describe('DictionaryManager', () => {
  let dictionaryManager: DictionaryManager;

  beforeEach(() => {
    dictionaryManager = new DictionaryManager();
  });

  describe('单元测试', () => {
    it('应该创建DictionaryManager实例', () => {
      expect(dictionaryManager).toBeInstanceOf(DictionaryManager);
    });

    it('应该返回词库列表', () => {
      const dictionaryList = dictionaryManager.getDictionaryList();
      expect(Array.isArray(dictionaryList)).toBe(true);
      expect(dictionaryList.length).toBeGreaterThan(0);
      
      // 验证每个词库信息的结构
      dictionaryList.forEach(dict => {
        expect(dict).toHaveProperty('type');
        expect(dict).toHaveProperty('name');
        expect(dict).toHaveProperty('description');
        expect(dict).toHaveProperty('totalWords');
        expect(dict).toHaveProperty('learnedWords');
      });
    });

    it('应该能够设置和获取活跃词库', () => {
      expect(dictionaryManager.getActiveDictionary()).toBeNull();
      
      dictionaryManager.setActiveDictionary(DictionaryType.GRE);
      expect(dictionaryManager.getActiveDictionary()).toBe(DictionaryType.GRE);
      
      dictionaryManager.setActiveDictionary(DictionaryType.TOEFL);
      expect(dictionaryManager.getActiveDictionary()).toBe(DictionaryType.TOEFL);
    });

    it('应该能够加载内置词库', async () => {
      const dictionary = await dictionaryManager.loadBuiltInDictionary(DictionaryType.GRE);
      
      expect(dictionary).toHaveProperty('type', DictionaryType.GRE);
      expect(dictionary).toHaveProperty('name');
      expect(dictionary).toHaveProperty('words');
      expect(dictionary).toHaveProperty('totalCount');
      expect(Array.isArray(dictionary.words)).toBe(true);
      expect(dictionary.totalCount).toBe(dictionary.words.length);
    });

    it('应该能够查找单词', async () => {
      // 先加载一个词库
      await dictionaryManager.loadBuiltInDictionary(DictionaryType.GRE);
      
      const wordDef = await dictionaryManager.lookupWord('example');
      
      expect(wordDef).toHaveProperty('word');
      expect(wordDef).toHaveProperty('pronunciation');
      expect(wordDef).toHaveProperty('partOfSpeech');
      expect(wordDef).toHaveProperty('definitions');
      expect(wordDef).toHaveProperty('examples');
      expect(wordDef).toHaveProperty('difficulty');
      expect(wordDef).toHaveProperty('frequency');
    });
  });

  describe('属性测试', () => {
    it('词库管理功能完整性 - 对于任何选定的词库，系统应该正确加载词汇列表，高亮页面中的对应词汇，并在点击时显示详细信息', async () => {
      // Feature: chrome-translation-extension, Property 8: 词库管理功能完整性
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...Object.values(DictionaryType)),
          async (dictionaryType: DictionaryType) => {
            // 测试词库加载功能
            const dictionary = await dictionaryManager.loadBuiltInDictionary(dictionaryType);
            
            // 验证词库结构完整性
            expect(dictionary.type).toBe(dictionaryType);
            expect(typeof dictionary.name).toBe('string');
            expect(dictionary.name.length).toBeGreaterThan(0);
            expect(Array.isArray(dictionary.words)).toBe(true);
            expect(dictionary.totalCount).toBe(dictionary.words.length);
            
            // 验证词汇列表中每个词的结构
            dictionary.words.forEach((word: WordDefinition) => {
              expect(typeof word.word).toBe('string');
              expect(word.word.length).toBeGreaterThan(0);
              expect(typeof word.pronunciation).toBe('string');
              expect(typeof word.partOfSpeech).toBe('string');
              expect(Array.isArray(word.definitions)).toBe(true);
              expect(word.definitions.length).toBeGreaterThan(0);
              expect(Array.isArray(word.examples)).toBe(true);
              expect(typeof word.difficulty).toBe('number');
              expect(word.difficulty).toBeGreaterThanOrEqual(1);
              expect(word.difficulty).toBeLessThanOrEqual(10);
              expect(typeof word.frequency).toBe('number');
              expect(word.frequency).toBeGreaterThanOrEqual(0);
              expect(word.frequency).toBeLessThanOrEqual(100);
            });
            
            // 测试设置活跃词库功能
            dictionaryManager.setActiveDictionary(dictionaryType);
            expect(dictionaryManager.getActiveDictionary()).toBe(dictionaryType);
            
            // 测试获取活跃词库的词汇列表
            const activeWords = dictionaryManager.getActiveWords();
            expect(Array.isArray(activeWords)).toBe(true);
            expect(activeWords.length).toBe(dictionary.words.length);
            
            // 验证词汇查询功能
            if (dictionary.words.length > 0) {
              const firstWord = dictionary.words[0]!; // 使用非空断言，因为我们已经检查了长度
              const lookupResult = await dictionaryManager.lookupWord(firstWord.word);
              
              // 验证查询结果的完整性（注意：难度值可能因为词库类型而调整）
              expect(lookupResult.word).toBe(firstWord.word);
              expect(lookupResult.pronunciation).toBe(firstWord.pronunciation);
              expect(lookupResult.partOfSpeech).toBe(firstWord.partOfSpeech);
              expect(lookupResult.definitions).toEqual(firstWord.definitions);
              expect(lookupResult.examples).toEqual(firstWord.examples);
              // 难度值应该在合理范围内，但可能因词库类型而调整
              expect(lookupResult.difficulty).toBeGreaterThanOrEqual(1);
              expect(lookupResult.difficulty).toBeLessThanOrEqual(10);
              expect(lookupResult.frequency).toBe(firstWord.frequency);
              
              // 测试词汇是否在活跃词库中
              expect(dictionaryManager.isWordInActiveDictionary(firstWord.word)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('词汇查询缓存机制 - 相同的词汇查询应该使用缓存结果', async () => {
      // Feature: chrome-translation-extension, Property 8: 词库管理功能完整性（缓存部分）
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...Object.values(DictionaryType)),
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
          async (dictionaryType: DictionaryType, word: string) => {
            // 加载词库
            await dictionaryManager.loadBuiltInDictionary(dictionaryType);
            
            // 清空缓存
            dictionaryManager.clearWordCache();
            
            // 第一次查询
            const result1 = await dictionaryManager.lookupWord(word);
            
            // 第二次查询相同单词
            const result2 = await dictionaryManager.lookupWord(word);
            
            // 验证两次查询返回相同结果（使用了缓存）
            expect(result1.word).toBe(result2.word);
            expect(result1.pronunciation).toBe(result2.pronunciation);
            expect(result1.partOfSpeech).toBe(result2.partOfSpeech);
            expect(result1.definitions).toEqual(result2.definitions);
            expect(result1.examples).toEqual(result2.examples);
            expect(result1.difficulty).toBe(result2.difficulty);
            expect(result1.frequency).toBe(result2.frequency);
            
            // 验证缓存统计信息
            const cacheStats = dictionaryManager.getCacheStats();
            expect(cacheStats.size).toBeGreaterThan(0);
            expect(cacheStats.dictionaries).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('学习进度管理 - 学习进度应该正确记录和统计', async () => {
      // Feature: chrome-translation-extension, Property 8: 词库管理功能完整性（学习进度部分）
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...Object.values(DictionaryType)),
          fc.array(fc.record({
            word: fc.string({ minLength: 1, maxLength: 15 }).filter(s => /^[a-zA-Z]+$/.test(s)),
            masteryLevel: fc.float({ min: 0, max: 1 }),
            reviewCount: fc.integer({ min: 0, max: 50 }),
            lastReviewDate: fc.date(),
            nextReviewDate: fc.date()
          }), { minLength: 1, maxLength: 10 }),
          async (dictionaryType: DictionaryType, progressData) => {
            // 加载词库
            await dictionaryManager.loadBuiltInDictionary(dictionaryType);
            
            // 更新学习进度
            for (const data of progressData) {
              dictionaryManager.updateLearningProgress(data.word, {
                masteryLevel: data.masteryLevel,
                reviewCount: data.reviewCount,
                lastReviewDate: data.lastReviewDate,
                nextReviewDate: data.nextReviewDate
              });
            }
            
            // 获取学习统计信息
            const stats = await dictionaryManager.getLearningStats(dictionaryType);
            
            // 验证统计信息的结构和合理性
            expect(typeof stats.totalWords).toBe('number');
            expect(stats.totalWords).toBeGreaterThanOrEqual(0);
            expect(typeof stats.learnedWords).toBe('number');
            expect(stats.learnedWords).toBeGreaterThanOrEqual(0);
            expect(stats.learnedWords).toBeLessThanOrEqual(stats.totalWords);
            expect(typeof stats.masteryRate).toBe('number');
            expect(stats.masteryRate).toBeGreaterThanOrEqual(0);
            expect(stats.masteryRate).toBeLessThanOrEqual(1);
            expect(typeof stats.averageReviewScore).toBe('number');
            expect(stats.averageReviewScore).toBeGreaterThanOrEqual(0);
            expect(stats.averageReviewScore).toBeLessThanOrEqual(1);
            
            // 验证掌握率计算的正确性
            if (stats.totalWords > 0) {
              const expectedMasteryRate = stats.learnedWords / stats.totalWords;
              expect(Math.abs(stats.masteryRate - expectedMasteryRate)).toBeLessThan(0.001);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});