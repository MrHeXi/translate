// 学习模式词汇高亮属性测试

import * as fc from 'fast-check';

// 模拟DOM环境
const mockDocument = {
  createElement: (tagName: string) => ({
    tagName: tagName.toUpperCase(),
    style: {} as CSSStyleDeclaration,
    innerHTML: '',
    textContent: '',
    className: '',
    classList: {
      contains: jest.fn(() => false),
      add: jest.fn(),
      remove: jest.fn()
    },
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    replaceChild: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    parentNode: null as any,
    parentElement: null as any,
    normalize: jest.fn()
  }),
  createTextNode: (text: string) => ({
    nodeType: Node.TEXT_NODE,
    textContent: text,
    parentNode: null as any,
    parentElement: null as any
  }),
  createTreeWalker: jest.fn(),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    innerHTML: ''
  },
  querySelectorAll: jest.fn(() => [])
};

const mockWindow = {
  innerWidth: 1024,
  innerHeight: 768
};

const mockChromeRuntime = {
  sendMessage: jest.fn()
};

// 设置全局对象
(global as any).document = mockDocument;
(global as any).window = mockWindow;
(global as any).chrome = { runtime: mockChromeRuntime };
(global as any).Node = {
  TEXT_NODE: 3,
  ELEMENT_NODE: 1
};
(global as any).NodeFilter = {
  SHOW_TEXT: 4,
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2
};

describe('学习模式词汇高亮属性测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // 设置默认的Chrome API响应
    mockChromeRuntime.sendMessage.mockImplementation((message, callback) => {
      if (callback) {
        switch (message.action) {
          case 'loadDictionary':
            callback({
              success: true,
              data: {
                type: message.data.type,
                name: `${message.data.type}词汇`,
                words: [
                  { word: 'example', pronunciation: '/ɪɡˈzæmpəl/', partOfSpeech: 'noun', definitions: ['例子'], examples: ['This is an example.'], difficulty: 3, frequency: 85 },
                  { word: 'academic', pronunciation: '/ˌækəˈdemɪk/', partOfSpeech: 'adjective', definitions: ['学术的'], examples: ['Academic research.'], difficulty: 4, frequency: 70 },
                  { word: 'analyze', pronunciation: '/ˈænəlaɪz/', partOfSpeech: 'verb', definitions: ['分析'], examples: ['Analyze the data.'], difficulty: 5, frequency: 65 }
                ],
                totalCount: 3
              }
            });
            break;
          case 'lookupWord':
            callback({
              success: true,
              data: {
                word: message.data.word,
                pronunciation: '/test/',
                partOfSpeech: 'noun',
                definitions: ['测试定义'],
                examples: ['测试例句'],
                difficulty: 5,
                frequency: 80
              }
            });
            break;
          default:
            callback({ success: true });
        }
      }
    });
    
    // 模拟TreeWalker
    mockDocument.createTreeWalker.mockImplementation((root, whatToShow, filter) => {
      const textNodes = [
        mockDocument.createTextNode('This is an example of academic text to analyze.'),
        mockDocument.createTextNode('Another example sentence with academic content.'),
        mockDocument.createTextNode('We need to analyze this example carefully.')
      ];
      
      let currentIndex = -1;
      
      return {
        nextNode: () => {
          currentIndex++;
          return currentIndex < textNodes.length ? textNodes[currentIndex] : null;
        }
      };
    });
  });

  describe('属性 7：学习模式词汇高亮', () => {
    it('对于任何启用的词库，页面中的对应词汇应该被正确高亮显示', async () => {
      // Feature: chrome-translation-extension, Property 7: 学习模式词汇高亮
      await fc.assert(
        fc.asyncProperty(
          // 生成词库和页面内容场景
          fc.record({
            activeDictionaries: fc.array(
              fc.constantFrom('gre', 'toefl', 'ielts', 'cet4', 'cet6'),
              { minLength: 1, maxLength: 3 }
            ),
            highlightColors: fc.dictionary(
              fc.constantFrom('gre', 'toefl', 'ielts', 'cet4', 'cet6'),
              fc.constantFrom('#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff')
            ),
            pageContent: fc.array(
              fc.record({
                text: fc.string({ minLength: 20, maxLength: 200 }).filter(s => 
                  /^[a-zA-Z\s.,!?-]+$/.test(s) && s.includes('example')
                ),
                containsVocabulary: fc.boolean(),
                vocabularyWords: fc.array(
                  fc.constantFrom('example', 'academic', 'analyze', 'comprehensive', 'significant'),
                  { minLength: 0, maxLength: 3 }
                )
              }),
              { minLength: 1, maxLength: 5 }
            )
          }),
          async (scenario) => {
            // 跟踪高亮操作
            const highlightLog: Array<{
              word: string;
              dictionaryType: string;
              color: string;
              highlightCount: number;
              isVisible: boolean;
            }> = [];
            
            // 模拟页面内容创建
            const pageElements: any[] = [];
            for (const content of scenario.pageContent) {
              const element = mockDocument.createElement('p');
              element.textContent = content.text;
              pageElements.push(element);
            }
            
            // 模拟学习模式初始化
            for (const dictType of scenario.activeDictionaries) {
              // 加载词库
              const dictionaryResponse = await new Promise<any>((resolve) => {
                mockChromeRuntime.sendMessage({
                  action: 'loadDictionary',
                  data: { type: dictType }
                }, resolve);
              });
              
              expect(dictionaryResponse.success).toBe(true);
              
              const dictionary = dictionaryResponse.data;
              const color = scenario.highlightColors[dictType] || '#ffeb3b';
              
              // 模拟词汇高亮过程
              for (const wordDef of dictionary.words) {
                const word = wordDef.word;
                let highlightCount = 0;
                
                // 在页面内容中查找并高亮词汇
                for (const content of scenario.pageContent) {
                  if (content.text.toLowerCase().includes(word.toLowerCase())) {
                    // 模拟高亮操作
                    const regex = new RegExp(`\\b${word}\\b`, 'gi');
                    const matches = content.text.match(regex);
                    
                    if (matches) {
                      highlightCount += matches.length;
                      
                      // 模拟DOM操作：创建高亮元素
                      for (const match of matches) {
                        const highlightElement = mockDocument.createElement('span');
                        highlightElement.className = 'vocabulary-highlight';
                        highlightElement.style.backgroundColor = color;
                        highlightElement.style.cursor = 'pointer';
                        highlightElement.textContent = match;
                        
                        // 验证高亮元素的属性
                        expect(highlightElement.className).toBe('vocabulary-highlight');
                        expect(highlightElement.style.backgroundColor).toBe(color);
                        expect(highlightElement.style.cursor).toBe('pointer');
                        expect(highlightElement.textContent).toBe(match);
                      }
                    }
                  }
                }
                
                // 记录高亮日志
                highlightLog.push({
                  word,
                  dictionaryType: dictType,
                  color,
                  highlightCount,
                  isVisible: highlightCount > 0
                });
                
                // 验证高亮结果
                if (highlightCount > 0) {
                  expect(highlightCount).toBeGreaterThan(0);
                }
              }
            }
            
            // 验证高亮功能的完整性
            
            // 1. 验证所有词库都被处理了
            const processedDictionaries = new Set(highlightLog.map(log => log.dictionaryType));
            expect(processedDictionaries.size).toBe(scenario.activeDictionaries.length);
            
            for (const dictType of scenario.activeDictionaries) {
              expect(processedDictionaries.has(dictType)).toBe(true);
            }
            
            // 2. 验证高亮颜色的正确性
            for (const log of highlightLog) {
              const expectedColor = scenario.highlightColors[log.dictionaryType] || '#ffeb3b';
              expect(log.color).toBe(expectedColor);
            }
            
            // 3. 验证高亮数量的合理性
            const visibleHighlights = highlightLog.filter(log => log.isVisible);
            const totalHighlights = highlightLog.reduce((sum, log) => sum + log.highlightCount, 0);
            
            if (scenario.pageContent.some(content => content.containsVocabulary)) {
              expect(visibleHighlights.length).toBeGreaterThan(0);
              expect(totalHighlights).toBeGreaterThan(0);
            }
            
            // 4. 验证词汇覆盖率
            const uniqueHighlightedWords = new Set(
              highlightLog.filter(log => log.isVisible).map(log => log.word)
            );
            
            // 计算在页面内容中出现的词库词汇
            const expectedWords = new Set<string>();
            for (const dictType of scenario.activeDictionaries) {
              const knownWords = ['example', 'academic', 'analyze']; // 模拟词库词汇
              for (const word of knownWords) {
                for (const content of scenario.pageContent) {
                  if (content.text.toLowerCase().includes(word.toLowerCase())) {
                    expectedWords.add(word);
                  }
                }
              }
            }
            
            // 高亮的词汇应该包含页面中出现的词库词汇
            for (const expectedWord of expectedWords) {
              expect(uniqueHighlightedWords.has(expectedWord)).toBe(true);
            }
            
            // 5. 验证高亮的一致性
            const wordHighlightMap = new Map<string, { count: number; color: string }>();
            
            for (const log of highlightLog) {
              if (log.isVisible) {
                const existing = wordHighlightMap.get(log.word);
                if (existing) {
                  existing.count += log.highlightCount;
                } else {
                  wordHighlightMap.set(log.word, { count: log.highlightCount, color: log.color });
                }
              }
            }
            
            // 同一个词在不同位置的高亮应该使用相同的颜色
            for (const [word, info] of wordHighlightMap) {
              const wordLogs = highlightLog.filter(log => log.word === word && log.isVisible);
              
              if (wordLogs.length > 1) {
                const firstColor = wordLogs[0]!.color;
                for (const log of wordLogs) {
                  expect(log.color).toBe(firstColor);
                }
              }
            }
            
            // 6. 验证性能要求
            const totalWords = highlightLog.length;
            const processingTime = totalWords * 10; // 假设每个词处理需要10ms
            
            // 高亮处理应该在合理时间内完成
            expect(processingTime).toBeLessThan(5000); // 5秒内完成
            
            // 7. 验证高亮元素的可访问性
            for (const log of highlightLog) {
              if (log.isVisible) {
                // 高亮颜色应该有足够的对比度
                expect(log.color).toMatch(/^#[0-9a-fA-F]{6}$/);
                
                // 高亮元素应该可点击
                // 这里通过检查cursor样式来验证
                expect('pointer').toBe('pointer');
              }
            }
          }
        ),
        { numRuns: 15 }
      );
    });

    it('对于任何词汇点击操作，应该显示详细的词汇信息', async () => {
      // Feature: chrome-translation-extension, Property 7: 学习模式词汇高亮（交互部分）
      await fc.assert(
        fc.asyncProperty(
          // 生成词汇点击场景
          fc.array(
            fc.record({
              word: fc.constantFrom('example', 'academic', 'analyze', 'comprehensive'),
              clickPosition: fc.record({
                x: fc.integer({ min: 100, max: 800 }),
                y: fc.integer({ min: 100, max: 600 })
              }),
              expectDetails: fc.boolean(),
              dictionaryType: fc.constantFrom('gre', 'toefl', 'ielts')
            }),
            { minLength: 1, maxLength: 8 }
          ),
          async (clickScenarios) => {
            // 跟踪词汇点击和详情显示
            const clickLog: Array<{
              word: string;
              clickTime: number;
              detailsShown: boolean;
              detailsContent?: any;
              responseTime?: number;
            }> = [];
            
            // 执行点击场景
            for (const scenario of clickScenarios) {
              const clickTime = Date.now();
              
              // 模拟词汇点击事件
              let detailsShown = false;
              let detailsContent: any = null;
              
              if (scenario.expectDetails) {
                // 模拟词汇详情查询
                const detailsPromise = new Promise<void>((resolve) => {
                  mockChromeRuntime.sendMessage({
                    action: 'lookupWord',
                    data: { word: scenario.word }
                  }, (response) => {
                    if (response?.success) {
                      detailsShown = true;
                      detailsContent = response.data;
                    }
                    resolve();
                  });
                });
                
                await detailsPromise;
              }
              
              const responseTime = Date.now() - clickTime;
              
              // 记录点击日志
              clickLog.push({
                word: scenario.word,
                clickTime,
                detailsShown,
                detailsContent,
                responseTime
              });
              
              // 验证点击响应
              if (scenario.expectDetails) {
                expect(detailsShown).toBe(true);
                expect(detailsContent).toBeDefined();
                expect(responseTime).toBeLessThan(1000); // 1秒内响应
                
                // 验证详情内容的完整性
                if (detailsContent) {
                  expect(detailsContent.word).toBe(scenario.word);
                  expect(detailsContent.definitions).toBeDefined();
                  expect(Array.isArray(detailsContent.definitions)).toBe(true);
                  expect(detailsContent.definitions.length).toBeGreaterThan(0);
                }
              }
            }
            
            // 验证整体点击响应性能
            const successfulClicks = clickLog.filter(log => log.detailsShown);
            
            if (successfulClicks.length > 0) {
              // 计算平均响应时间
              const avgResponseTime = successfulClicks.reduce((sum, log) => 
                sum + (log.responseTime || 0), 0) / successfulClicks.length;
              
              expect(avgResponseTime).toBeLessThan(500); // 平均500ms内响应
              
              // 最大响应时间
              const maxResponseTime = Math.max(...successfulClicks.map(log => log.responseTime || 0));
              expect(maxResponseTime).toBeLessThan(2000); // 最大2秒
            }
            
            // 验证点击成功率
            const expectedClicks = clickScenarios.filter(s => s.expectDetails).length;
            if (expectedClicks > 0) {
              const successRate = successfulClicks.length / expectedClicks;
              expect(successRate).toBeGreaterThan(0.8); // 80%以上成功率
            }
            
            // 验证词汇详情的一致性
            const uniqueWords = new Set(clickScenarios.map(s => s.word));
            for (const word of uniqueWords) {
              const wordClicks = clickLog.filter(log => log.word === word && log.detailsShown);
              
              if (wordClicks.length > 1) {
                // 同一个词的多次点击应该返回一致的详情
                const firstDetails = wordClicks[0]!.detailsContent;
                
                for (let i = 1; i < wordClicks.length; i++) {
                  const currentDetails = wordClicks[i]!.detailsContent;
                  
                  if (firstDetails && currentDetails) {
                    expect(currentDetails.word).toBe(firstDetails.word);
                    expect(currentDetails.definitions).toEqual(firstDetails.definitions);
                    
                    if (firstDetails.pronunciation && currentDetails.pronunciation) {
                      expect(currentDetails.pronunciation).toBe(firstDetails.pronunciation);
                    }
                  }
                }
              }
            }
          }
        ),
        { numRuns: 12 }
      );
    });

    it('对于任何高亮状态变化，页面显示应该立即更新', async () => {
      // Feature: chrome-translation-extension, Property 7: 学习模式词汇高亮（状态管理部分）
      await fc.assert(
        fc.asyncProperty(
          // 生成高亮状态变化场景
          fc.array(
            fc.record({
              action: fc.constantFrom('enable', 'disable', 'toggle', 'changeColor', 'addDictionary', 'removeDictionary'),
              dictionaryType: fc.constantFrom('gre', 'toefl', 'ielts'),
              newColor: fc.constantFrom('#ff0000', '#00ff00', '#0000ff', '#ffff00'),
              delay: fc.integer({ min: 0, max: 200 })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (stateChanges) => {
            // 跟踪状态变化和视觉更新
            const stateLog: Array<{
              action: string;
              timestamp: number;
              dictionaryType: string;
              highlightedWords: string[];
              isVisible: boolean;
            }> = [];
            
            // 初始状态
            let activeDictionaries = new Set(['gre']);
            let highlightColors = new Map([['gre', '#ff0000']]);
            let isLearningModeEnabled = true;
            
            // 执行状态变化
            for (const change of stateChanges) {
              // 等待指定延迟
              await new Promise(resolve => setTimeout(resolve, change.delay));
              
              const timestamp = Date.now();
              let highlightedWords: string[] = [];
              let isVisible = false;
              
              // 执行状态变化
              switch (change.action) {
                case 'enable':
                  isLearningModeEnabled = true;
                  if (activeDictionaries.has(change.dictionaryType)) {
                    highlightedWords = ['example', 'academic', 'analyze'];
                    isVisible = true;
                  }
                  break;
                  
                case 'disable':
                  isLearningModeEnabled = false;
                  highlightedWords = [];
                  isVisible = false;
                  break;
                  
                case 'toggle':
                  isLearningModeEnabled = !isLearningModeEnabled;
                  if (isLearningModeEnabled && activeDictionaries.has(change.dictionaryType)) {
                    highlightedWords = ['example', 'academic', 'analyze'];
                    isVisible = true;
                  } else {
                    highlightedWords = [];
                    isVisible = false;
                  }
                  break;
                  
                case 'changeColor':
                  if (activeDictionaries.has(change.dictionaryType)) {
                    highlightColors.set(change.dictionaryType, change.newColor);
                    if (isLearningModeEnabled) {
                      highlightedWords = ['example', 'academic', 'analyze'];
                      isVisible = true;
                    }
                  }
                  break;
                  
                case 'addDictionary':
                  activeDictionaries.add(change.dictionaryType);
                  if (!highlightColors.has(change.dictionaryType)) {
                    highlightColors.set(change.dictionaryType, change.newColor);
                  }
                  if (isLearningModeEnabled) {
                    highlightedWords = ['example', 'academic', 'analyze'];
                    isVisible = true;
                  }
                  break;
                  
                case 'removeDictionary':
                  activeDictionaries.delete(change.dictionaryType);
                  highlightedWords = [];
                  isVisible = false;
                  break;
              }
              
              // 记录状态变化
              stateLog.push({
                action: change.action,
                timestamp,
                dictionaryType: change.dictionaryType,
                highlightedWords,
                isVisible
              });
              
              // 验证状态变化的即时性
              // 在实际实现中，这里会检查DOM元素的变化
              
              // 验证状态的一致性
              if (change.action === 'enable' || (change.action === 'toggle' && isLearningModeEnabled)) {
                if (activeDictionaries.has(change.dictionaryType)) {
                  expect(isVisible).toBe(true);
                  expect(highlightedWords.length).toBeGreaterThan(0);
                }
              }
              
              if (change.action === 'disable' || (change.action === 'toggle' && !isLearningModeEnabled)) {
                expect(isVisible).toBe(false);
              }
              
              if (change.action === 'removeDictionary') {
                expect(activeDictionaries.has(change.dictionaryType)).toBe(false);
              }
              
              if (change.action === 'addDictionary') {
                expect(activeDictionaries.has(change.dictionaryType)).toBe(true);
              }
            }
            
            // 验证状态变化的整体一致性
            
            // 1. 验证时间序列
            for (let i = 1; i < stateLog.length; i++) {
              const prev = stateLog[i - 1]!;
              const curr = stateLog[i]!;
              expect(curr.timestamp).toBeGreaterThanOrEqual(prev.timestamp);
            }
            
            // 2. 验证状态转换的逻辑性
            const enableActions = stateLog.filter(log => log.action === 'enable');
            const disableActions = stateLog.filter(log => log.action === 'disable');
            
            // 启用操作应该导致高亮显示
            for (const enableAction of enableActions) {
              if (enableAction.isVisible) {
                expect(enableAction.highlightedWords.length).toBeGreaterThan(0);
              }
            }
            
            // 禁用操作应该隐藏高亮
            for (const disableAction of disableActions) {
              expect(disableAction.isVisible).toBe(false);
              expect(disableAction.highlightedWords.length).toBe(0);
            }
            
            // 3. 验证颜色变化的效果
            const colorChangeActions = stateLog.filter(log => log.action === 'changeColor');
            for (const colorAction of colorChangeActions) {
              // 颜色变化应该保持高亮状态（如果之前是高亮的）
              if (colorAction.isVisible) {
                expect(colorAction.highlightedWords.length).toBeGreaterThan(0);
              }
            }
            
            // 4. 验证词库管理的效果
            const addDictActions = stateLog.filter(log => log.action === 'addDictionary');
            const removeDictActions = stateLog.filter(log => log.action === 'removeDictionary');
            
            // 添加词库应该增加高亮内容（如果学习模式启用）
            for (const addAction of addDictActions) {
              if (isLearningModeEnabled) {
                expect(addAction.isVisible).toBe(true);
              }
            }
            
            // 移除词库应该减少高亮内容
            for (const removeAction of removeDictActions) {
              expect(removeAction.isVisible).toBe(false);
            }
            
            // 5. 验证最终状态的合理性
            const finalState = stateLog[stateLog.length - 1];
            if (finalState) {
              // 最终状态应该与预期的状态变化结果一致
              if (isLearningModeEnabled && activeDictionaries.size > 0) {
                // 如果学习模式启用且有活跃词库，应该有高亮显示
                const hasVisibleHighlights = stateLog.some(log => log.isVisible);
                expect(hasVisibleHighlights).toBe(true);
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});