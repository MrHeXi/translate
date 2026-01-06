// StorageManager 属性测试文件

import * as fc from 'fast-check';
import { StorageManager, UserData } from '../StorageManager';

// 模拟 Chrome Storage API
const mockChromeStorage = {
  sync: {
    set: jest.fn(),
    get: jest.fn(),
    clear: jest.fn(),
    getBytesInUse: jest.fn()
  },
  local: {
    set: jest.fn(),
    get: jest.fn(),
    clear: jest.fn(),
    getBytesInUse: jest.fn()
  },
  onChanged: {
    addListener: jest.fn()
  }
};

// 设置全局 chrome 对象
(global as any).chrome = {
  storage: mockChromeStorage
};

describe('StorageManager', () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    storageManager = new StorageManager();
    jest.clearAllMocks();
  });

  describe('单元测试', () => {
    it('应该创建 StorageManager 实例', () => {
      expect(storageManager).toBeInstanceOf(StorageManager);
    });

    it('应该能够保存用户数据到同步存储', async () => {
      const testData: Partial<UserData> = {
        settings: {
          defaultTargetLanguage: 'en',
          translationProvider: 'google',
          floatingIconPosition: { x: 10, y: 10 },
          learningModeEnabled: true,
          activeDictionaries: ['gre'],
          highlightColors: { gre: '#ff0000' },
          autoTranslate: false,
          showFloatingIcon: true
        }
      };

      mockChromeStorage.sync.set.mockResolvedValue(undefined);

      await storageManager.saveUserData(testData);

      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith(testData);
    });
  });

  describe('属性测试', () => {
    it('数据存储往返一致性 - 对于任何用户数据，保存后重新加载应该得到完全相同的数据', async () => {
      // Feature: chrome-translation-extension, Property 6: 数据存储往返一致性
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            settings: fc.record({
              defaultTargetLanguage: fc.constantFrom('zh-CN', 'en'),
              translationProvider: fc.constantFrom('google', 'microsoft'),
              floatingIconPosition: fc.record({
                x: fc.integer({ min: 0, max: 100 }),
                y: fc.integer({ min: 0, max: 100 })
              }),
              learningModeEnabled: fc.boolean(),
              activeDictionaries: fc.array(fc.constantFrom('gre', 'toefl'), { maxLength: 2 }),
              highlightColors: fc.dictionary(fc.constantFrom('gre', 'toefl'), fc.constant('#ff0000')),
              autoTranslate: fc.boolean(),
              showFloatingIcon: fc.boolean()
            }),
            vocabulary: fc.array(
              fc.record({
                word: fc.string({ minLength: 1, maxLength: 10 }),
                translation: fc.string({ minLength: 1, maxLength: 20 })
              }),
              { maxLength: 3 }
            ),
            learningStats: fc.record({
              totalWordsLearned: fc.integer({ min: 0, max: 100 }),
              dailyGoal: fc.integer({ min: 1, max: 20 }),
              currentStreak: fc.integer({ min: 0, max: 30 }),
              longestStreak: fc.integer({ min: 0, max: 30 }),
              reviewAccuracy: fc.float({ min: 0, max: 1 }),
              timeSpentLearning: fc.integer({ min: 0, max: 1000 })
            }),
            dictionaryProgress: fc.dictionary(
              fc.constantFrom('gre', 'toefl'),
              fc.record({
                totalWords: fc.integer({ min: 0, max: 100 }),
                learnedWords: fc.integer({ min: 0, max: 100 }),
                masteryRate: fc.float({ min: 0, max: 1 }),
                lastStudyDate: fc.date()
              })
            )
          }),
          async (originalData: UserData) => {
            // 模拟存储操作成功
            mockChromeStorage.sync.set.mockResolvedValue(undefined);
            mockChromeStorage.sync.get.mockResolvedValue(originalData);

            // 保存数据
            await storageManager.saveUserData(originalData);

            // 重新加载数据
            const loadedData = await storageManager.loadUserData();

            // 验证核心数据完整性
            expect(loadedData.settings.defaultTargetLanguage).toBe(originalData.settings.defaultTargetLanguage);
            expect(loadedData.settings.translationProvider).toBe(originalData.settings.translationProvider);
            expect(loadedData.settings.learningModeEnabled).toBe(originalData.settings.learningModeEnabled);
            expect(loadedData.vocabulary.length).toBe(originalData.vocabulary.length);
          }
        ),
        { numRuns: 5 }
      );
    }, 15000);

    it('数据导出完整性 - 对于任何用户数据导出操作，导出的数据应该包含所有用户的设置、生词和学习进度信息', async () => {
      // Feature: chrome-translation-extension, Property 13: 数据导出完整性
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            settings: fc.record({
              defaultTargetLanguage: fc.constantFrom('zh-CN', 'en', 'fr'),
              translationProvider: fc.constantFrom('google', 'microsoft', 'baidu'),
              floatingIconPosition: fc.record({
                x: fc.integer({ min: 0, max: 200 }),
                y: fc.integer({ min: 0, max: 200 })
              }),
              learningModeEnabled: fc.boolean(),
              activeDictionaries: fc.array(fc.constantFrom('gre', 'toefl', 'ielts'), { maxLength: 3 }),
              highlightColors: fc.dictionary(fc.constantFrom('gre', 'toefl', 'ielts'), fc.constant('#ff0000')),
              autoTranslate: fc.boolean(),
              showFloatingIcon: fc.boolean()
            }),
            vocabulary: fc.array(
              fc.record({
                word: fc.string({ minLength: 1, maxLength: 15 }),
                translation: fc.string({ minLength: 1, maxLength: 30 }),
                context: fc.string({ minLength: 0, maxLength: 50 }),
                sourceUrl: fc.constant('https://example.com'),
                addedDate: fc.date(),
                reviewCount: fc.integer({ min: 0, max: 20 }),
                masteryLevel: fc.float({ min: 0, max: 1 }),
                nextReviewDate: fc.date()
              }),
              { maxLength: 5 }
            ),
            learningStats: fc.record({
              totalWordsLearned: fc.integer({ min: 0, max: 1000 }),
              dailyGoal: fc.integer({ min: 1, max: 50 }),
              currentStreak: fc.integer({ min: 0, max: 100 }),
              longestStreak: fc.integer({ min: 0, max: 100 }),
              reviewAccuracy: fc.float({ min: 0, max: 1 }),
              timeSpentLearning: fc.integer({ min: 0, max: 3600 })
            }),
            dictionaryProgress: fc.dictionary(
              fc.constantFrom('gre', 'toefl', 'ielts'),
              fc.record({
                totalWords: fc.integer({ min: 0, max: 1000 }),
                learnedWords: fc.integer({ min: 0, max: 1000 }),
                masteryRate: fc.float({ min: 0, max: 1 }),
                lastStudyDate: fc.date()
              })
            )
          }),
          async (originalData: UserData) => {
            // 模拟存储中有数据
            mockChromeStorage.sync.get.mockResolvedValue(originalData);

            // 导出数据
            const exportedDataString = await storageManager.exportData();
            const exportedData = JSON.parse(exportedDataString);

            // 验证导出数据的结构完整性
            expect(exportedData).toHaveProperty('version');
            expect(exportedData).toHaveProperty('exportDate');
            expect(exportedData).toHaveProperty('data');
            expect(typeof exportedData.version).toBe('string');
            expect(typeof exportedData.exportDate).toBe('string');

            // 验证导出的数据包含所有原始数据
            const exportedUserData = exportedData.data;

            // 验证设置数据完整性
            expect(exportedUserData.settings).toEqual(originalData.settings);
            expect(exportedUserData.settings.defaultTargetLanguage).toBe(originalData.settings.defaultTargetLanguage);
            expect(exportedUserData.settings.translationProvider).toBe(originalData.settings.translationProvider);
            expect(exportedUserData.settings.floatingIconPosition).toEqual(originalData.settings.floatingIconPosition);
            expect(exportedUserData.settings.learningModeEnabled).toBe(originalData.settings.learningModeEnabled);
            expect(exportedUserData.settings.activeDictionaries).toEqual(originalData.settings.activeDictionaries);
            expect(exportedUserData.settings.highlightColors).toEqual(originalData.settings.highlightColors);
            expect(exportedUserData.settings.autoTranslate).toBe(originalData.settings.autoTranslate);
            expect(exportedUserData.settings.showFloatingIcon).toBe(originalData.settings.showFloatingIcon);

            // 验证词汇数据完整性
            expect(exportedUserData.vocabulary).toEqual(originalData.vocabulary);
            expect(exportedUserData.vocabulary.length).toBe(originalData.vocabulary.length);
            
            originalData.vocabulary.forEach((originalVocab, index) => {
              const exportedVocab = exportedUserData.vocabulary[index];
              expect(exportedVocab.word).toBe(originalVocab.word);
              expect(exportedVocab.translation).toBe(originalVocab.translation);
              expect(exportedVocab.context).toBe(originalVocab.context);
              expect(exportedVocab.sourceUrl).toBe(originalVocab.sourceUrl);
              expect(new Date(exportedVocab.addedDate)).toEqual(originalVocab.addedDate);
              expect(exportedVocab.reviewCount).toBe(originalVocab.reviewCount);
              expect(exportedVocab.masteryLevel).toBe(originalVocab.masteryLevel);
              expect(new Date(exportedVocab.nextReviewDate)).toEqual(originalVocab.nextReviewDate);
            });

            // 验证学习统计数据完整性
            expect(exportedUserData.learningStats).toEqual(originalData.learningStats);
            expect(exportedUserData.learningStats.totalWordsLearned).toBe(originalData.learningStats.totalWordsLearned);
            expect(exportedUserData.learningStats.dailyGoal).toBe(originalData.learningStats.dailyGoal);
            expect(exportedUserData.learningStats.currentStreak).toBe(originalData.learningStats.currentStreak);
            expect(exportedUserData.learningStats.longestStreak).toBe(originalData.learningStats.longestStreak);
            expect(exportedUserData.learningStats.reviewAccuracy).toBe(originalData.learningStats.reviewAccuracy);
            expect(exportedUserData.learningStats.timeSpentLearning).toBe(originalData.learningStats.timeSpentLearning);

            // 验证词库进度数据完整性
            Object.keys(originalData.dictionaryProgress).forEach(dictType => {
              const originalProgress = originalData.dictionaryProgress[dictType];
              const exportedProgress = exportedUserData.dictionaryProgress[dictType];
              
              expect(exportedProgress.totalWords).toBe(originalProgress.totalWords);
              expect(exportedProgress.learnedWords).toBe(originalProgress.learnedWords);
              expect(exportedProgress.masteryRate).toBe(originalProgress.masteryRate);
              
              // 处理Date对象的序列化问题
              if (originalProgress.lastStudyDate instanceof Date) {
                expect(new Date(exportedProgress.lastStudyDate)).toEqual(originalProgress.lastStudyDate);
              } else {
                expect(exportedProgress.lastStudyDate).toEqual(originalProgress.lastStudyDate);
              }
              
              expect(exportedProgress.totalWords).toBe(originalProgress.totalWords);
              expect(exportedProgress.learnedWords).toBe(originalProgress.learnedWords);
              expect(exportedProgress.masteryRate).toBe(originalProgress.masteryRate);
              expect(new Date(exportedProgress.lastStudyDate)).toEqual(originalProgress.lastStudyDate);
            });

            // 验证导出数据可以被重新导入
            await storageManager.importData(exportedDataString);
            
            // 验证导入后的数据一致性
            mockChromeStorage.sync.get.mockResolvedValue(originalData);
            const reimportedData = await storageManager.loadUserData();
            expect(reimportedData.settings).toEqual(originalData.settings);
            expect(reimportedData.vocabulary.length).toBe(originalData.vocabulary.length);
          }
        ),
        { numRuns: 5 }
      );
    }, 20000);

    it('跨设备数据同步一致性 - 对于任何登录Chrome账户的用户，在不同设备间的数据应该保持同步和一致', async () => {
      // Feature: chrome-translation-extension, Property 14: 跨设备数据同步一致性
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            settings: fc.record({
              defaultTargetLanguage: fc.constantFrom('zh-CN', 'en', 'ja'),
              translationProvider: fc.constantFrom('google', 'microsoft'),
              floatingIconPosition: fc.record({
                x: fc.integer({ min: 0, max: 150 }),
                y: fc.integer({ min: 0, max: 150 })
              }),
              learningModeEnabled: fc.boolean(),
              activeDictionaries: fc.array(fc.constantFrom('gre', 'toefl'), { maxLength: 2 }),
              highlightColors: fc.dictionary(fc.constantFrom('gre', 'toefl'), fc.constant('#00ff00')),
              autoTranslate: fc.boolean(),
              showFloatingIcon: fc.boolean()
            }),
            vocabulary: fc.array(
              fc.record({
                word: fc.string({ minLength: 1, maxLength: 12 }),
                translation: fc.string({ minLength: 1, maxLength: 25 }),
                context: fc.string({ minLength: 0, maxLength: 40 }),
                sourceUrl: fc.constant('https://test.com'),
                addedDate: fc.date(),
                reviewCount: fc.integer({ min: 0, max: 15 }),
                masteryLevel: fc.float({ min: 0, max: 1 }),
                nextReviewDate: fc.date()
              }),
              { maxLength: 4 }
            ),
            learningStats: fc.record({
              totalWordsLearned: fc.integer({ min: 0, max: 500 }),
              dailyGoal: fc.integer({ min: 1, max: 30 }),
              currentStreak: fc.integer({ min: 0, max: 50 }),
              longestStreak: fc.integer({ min: 0, max: 50 }),
              reviewAccuracy: fc.float({ min: 0, max: 1 }),
              timeSpentLearning: fc.integer({ min: 0, max: 1800 })
            })
          }),
          async (deviceAData: Partial<UserData>) => {
            // 模拟设备A的本地存储有数据
            mockChromeStorage.local.get.mockResolvedValue(deviceAData);
            mockChromeStorage.sync.set.mockResolvedValue(undefined);

            // 设备A执行数据同步到云端
            await storageManager.syncData();

            // 验证同步操作被正确调用
            expect(mockChromeStorage.local.get).toHaveBeenCalledWith(null);
            expect(mockChromeStorage.sync.set).toHaveBeenCalledWith(deviceAData);

            // 模拟设备B从云端同步数据
            mockChromeStorage.sync.get.mockResolvedValue(deviceAData);
            mockChromeStorage.local.get.mockResolvedValue({});

            // 设备B加载数据（应该从同步存储获取）
            const deviceBData = await storageManager.loadUserData();

            // 验证跨设备数据一致性
            if (deviceAData.settings) {
              expect(deviceBData.settings.defaultTargetLanguage).toBe(deviceAData.settings.defaultTargetLanguage);
              expect(deviceBData.settings.translationProvider).toBe(deviceAData.settings.translationProvider);
              expect(deviceBData.settings.floatingIconPosition).toEqual(deviceAData.settings.floatingIconPosition);
              expect(deviceBData.settings.learningModeEnabled).toBe(deviceAData.settings.learningModeEnabled);
              expect(deviceBData.settings.activeDictionaries).toEqual(deviceAData.settings.activeDictionaries);
              expect(deviceBData.settings.highlightColors).toEqual(deviceAData.settings.highlightColors);
              expect(deviceBData.settings.autoTranslate).toBe(deviceAData.settings.autoTranslate);
              expect(deviceBData.settings.showFloatingIcon).toBe(deviceAData.settings.showFloatingIcon);
            }

            // 验证词汇数据同步一致性
            if (deviceAData.vocabulary) {
              expect(deviceBData.vocabulary.length).toBe(deviceAData.vocabulary.length);
              
              deviceAData.vocabulary.forEach((originalVocab, index) => {
                const syncedVocab = deviceBData.vocabulary[index];
                expect(syncedVocab.word).toBe(originalVocab.word);
                expect(syncedVocab.translation).toBe(originalVocab.translation);
                expect(syncedVocab.context).toBe(originalVocab.context);
                expect(syncedVocab.sourceUrl).toBe(originalVocab.sourceUrl);
                expect(syncedVocab.reviewCount).toBe(originalVocab.reviewCount);
                expect(syncedVocab.masteryLevel).toBe(originalVocab.masteryLevel);
              });
            }

            // 验证学习统计数据同步一致性
            if (deviceAData.learningStats) {
              expect(deviceBData.learningStats.totalWordsLearned).toBe(deviceAData.learningStats.totalWordsLearned);
              expect(deviceBData.learningStats.dailyGoal).toBe(deviceAData.learningStats.dailyGoal);
              expect(deviceBData.learningStats.currentStreak).toBe(deviceAData.learningStats.currentStreak);
              expect(deviceBData.learningStats.longestStreak).toBe(deviceAData.learningStats.longestStreak);
              expect(deviceBData.learningStats.reviewAccuracy).toBe(deviceAData.learningStats.reviewAccuracy);
              expect(deviceBData.learningStats.timeSpentLearning).toBe(deviceAData.learningStats.timeSpentLearning);
            }

            // 测试双向同步：设备B修改数据后同步回云端
            const modifiedData = {
              ...deviceAData,
              settings: {
                ...deviceAData.settings!,
                defaultTargetLanguage: 'fr' // 修改语言设置
              }
            };

            mockChromeStorage.local.get.mockResolvedValue(modifiedData);
            await storageManager.syncData();

            // 验证修改后的数据被同步到云端
            expect(mockChromeStorage.sync.set).toHaveBeenCalledWith(modifiedData);

            // 模拟设备A重新从云端获取数据
            mockChromeStorage.sync.get.mockResolvedValue(modifiedData);
            const updatedDeviceAData = await storageManager.loadUserData();

            // 验证设备A获取到了设备B的修改
            expect(updatedDeviceAData.settings.defaultTargetLanguage).toBe('fr');

            // 验证存储使用情况统计功能
            mockChromeStorage.sync.getBytesInUse.mockResolvedValue(1024);
            mockChromeStorage.local.getBytesInUse.mockResolvedValue(512);

            const storageUsage = await storageManager.getStorageUsage();
            expect(storageUsage.sync).toBe(1024);
            expect(storageUsage.local).toBe(512);
            expect(typeof storageUsage.sync).toBe('number');
            expect(typeof storageUsage.local).toBe('number');
          }
        ),
        { numRuns: 5 }
      );
    }, 25000);
  });
});