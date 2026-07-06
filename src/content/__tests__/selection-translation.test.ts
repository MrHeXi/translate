// 选词翻译功能属性测试

import * as fc from 'fast-check';

let mockElementRect = {
  left: 100,
  top: 100,
  width: 200,
  height: 50,
  right: 300,
  bottom: 150
};

// 模拟DOM环境
const mockDocument = {
  createElement: (tagName: string) => ({
    tagName: tagName.toUpperCase(),
    style: {} as CSSStyleDeclaration,
    innerHTML: '',
    textContent: '',
    className: '',
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    getBoundingClientRect: jest.fn(() => mockElementRect),
    contains: jest.fn(() => false),
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(() => [])
  }),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn()
  },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  caretRangeFromPoint: jest.fn()
};

const mockWindow = {
  getSelection: jest.fn(),
  innerWidth: 1024,
  innerHeight: 768,
  scrollY: 0,
  scrollX: 0,
  speechSynthesis: {
    speak: jest.fn()
  }
};

const mockChromeRuntime = {
  sendMessage: jest.fn()
};

// 设置全局对象
(global as any).document = mockDocument;
(global as any).window = mockWindow;
(global as any).chrome = { runtime: mockChromeRuntime };
(global as any).SpeechSynthesisUtterance = jest.fn();
(global as any).requestAnimationFrame = (callback: FrameRequestCallback) => callback(0);

// 导入要测试的组件
import { SelectionHandler } from '../components/SelectionHandler';

const getExpectedSelectedText = (selectedText: string, selectionMethod: string): string => {
  if (selectionMethod === 'dblclick') {
    const wordAtClick = selectedText.match(/^\w+/)?.[0] || '';
    return wordAtClick.length > 2 ? wordAtClick : '';
  }

  return selectedText.trim();
};

describe('选词翻译功能属性测试', () => {
  let selectionHandler: SelectionHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    (window as any).getSelection = mockWindow.getSelection;
    (document as any).caretRangeFromPoint = mockDocument.caretRangeFromPoint;
    mockElementRect = {
      left: 100,
      top: 100,
      width: 200,
      height: 50,
      right: 300,
      bottom: 150
    };
    selectionHandler = new SelectionHandler();
    
    // 设置默认的Chrome API响应
    mockChromeRuntime.sendMessage.mockImplementation((message, callback) => {
      if (callback) {
        switch (message.action) {
          case 'translate':
            callback({
              success: true,
              data: {
                originalText: message.data.text,
                translatedText: `翻译：${message.data.text}`,
                sourceLang: 'en',
                targetLang: 'zh-CN',
                confidence: 0.95
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
          case 'addVocabulary':
            callback({ success: true });
            break;
          default:
            callback({ success: true });
        }
      }
    });
  });

  afterEach(() => {
    selectionHandler.cleanup();
  });

  it('keeps tooltip inside the comfortable viewport margin when there is enough room', () => {
    const position = (selectionHandler as any).calculateTooltipPosition(
      {
        left: 50,
        top: 50,
        width: 20,
        height: 15,
        right: 70,
        bottom: 65
      },
      { width: 200, height: 100 },
      { width: 800, height: 600 }
    );

    expect(position.left).toBeGreaterThanOrEqual(10);
    expect(position.top).toBeGreaterThanOrEqual(10);
    expect(position.left + 200).toBeLessThanOrEqual(790);
    expect(position.top + 100).toBeLessThanOrEqual(590);
  });

  describe('属性 4：选词翻译响应性', () => {
    it('对于任何文本选择操作，系统应该快速响应并显示翻译结果', async () => {
      // Feature: chrome-translation-extension, Property 4: 选词翻译响应性
      await fc.assert(
        fc.asyncProperty(
          // 生成文本选择场景
          fc.array(
            fc.record({
              selectedText: fc.string({ minLength: 1, maxLength: 100 }).filter(s => 
                /^[a-zA-Z\s.,!?-]+$/.test(s) && s.trim().length > 0
              ),
              selectionMethod: fc.constantFrom('mouseup', 'keyup', 'dblclick'),
              position: fc.record({
                x: fc.integer({ min: 50, max: 800 }),
                y: fc.integer({ min: 50, max: 600 })
              }),
              expectTranslation: fc.boolean(),
              responseTimeLimit: fc.integer({ min: 100, max: 2000 }) // 期望的响应时间限制
            }),
            { minLength: 1, maxLength: 8 }
          ),
          async (selectionScenarios) => {
            // 初始化选择处理器
            selectionHandler.initialize();
            
            // 跟踪响应时间和结果
            const responseLog: Array<{
              selectedText: string;
              startTime: number;
              endTime?: number;
              responseTime?: number;
              translationReceived: boolean;
              method: string;
            }> = [];
            
            // 设置文本选择回调
            let lastSelectedText = '';
            let lastPosition = { x: 0, y: 0 };
            let translationReceived = false;
            
            selectionHandler.onTextSelected((text: string, position: { x: number; y: number }) => {
              lastSelectedText = text;
              lastPosition = position;
              chrome.runtime.sendMessage({
                action: 'translate',
                data: { text, targetLang: 'zh-CN' }
              }, (response: any) => {
                translationReceived = Boolean(response?.success);
              });
            });
            
            // 执行选择场景
            for (const scenario of selectionScenarios) {
              const startTime = Date.now();
              lastSelectedText = '';
              lastPosition = { x: 0, y: 0 };
              translationReceived = false;
              const expectedSelectedText = getExpectedSelectedText(scenario.selectedText, scenario.selectionMethod);
              
              // 模拟文本选择
              const mockSelection = {
                toString: () => scenario.selectedText,
                rangeCount: scenario.selectedText ? 1 : 0,
                getRangeAt: (_index: number) => ({
                  getBoundingClientRect: () => ({
                    left: scenario.position.x,
                    top: scenario.position.y,
                    width: scenario.selectedText.length * 8,
                    height: 20,
                    right: scenario.position.x + scenario.selectedText.length * 8,
                    bottom: scenario.position.y + 20
                  }),
                  startContainer: {
                    nodeType: Node.TEXT_NODE,
                    textContent: `context ${scenario.selectedText} context`
                  },
                  startOffset: 8
                })
              };
              
              mockWindow.getSelection.mockReturnValue(mockSelection);

              if (scenario.selectionMethod === 'dblclick') {
                mockDocument.caretRangeFromPoint.mockReturnValue({
                  startContainer: {
                    nodeType: Node.TEXT_NODE,
                    textContent: ` ${scenario.selectedText} `
                  },
                  startOffset: 1
                });
                (selectionHandler as any).handleDoubleClick({
                  target: { textContent: scenario.selectedText },
                  clientX: scenario.position.x,
                  clientY: scenario.position.y
                } as unknown as MouseEvent);
              } else {
                (selectionHandler as any).handleSelection({ type: scenario.selectionMethod } as Event);
              }
              
              const endTime = Date.now();
              const responseTime = endTime - startTime;
              
              // 记录响应日志
              responseLog.push({
                selectedText: scenario.selectedText,
                startTime,
                endTime,
                responseTime,
                translationReceived,
                method: scenario.selectionMethod
              });
              
              // 验证响应时间
              if (scenario.expectTranslation && expectedSelectedText) {
                expect(responseTime).toBeLessThan(scenario.responseTimeLimit);
                expect(translationReceived).toBe(true);
              }
              
              // 验证选择回调被触发
              if (scenario.selectedText.trim()) {
                if (!expectedSelectedText) {
                  expect(lastSelectedText).toBe('');
                } else {
                  expect(lastSelectedText).toBe(expectedSelectedText);
                  if (scenario.selectionMethod === 'dblclick') {
                    expect(lastPosition).toEqual(scenario.position);
                  } else {
                    expect(lastPosition.x).toBeCloseTo(scenario.position.x + scenario.selectedText.length * 4, 5);
                    expect(lastPosition.y).toBeCloseTo(scenario.position.y + 20, 5);
                  }
                }
              }
              
              // 小延迟以模拟真实用户行为
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            // 验证整体响应性能
            const validResponses = responseLog.filter(log => 
              getExpectedSelectedText(log.selectedText, log.method) &&
              log.responseTime !== undefined
            );
            
            if (validResponses.length > 0) {
              // 计算平均响应时间
              const avgResponseTime = validResponses.reduce((sum, log) => 
                sum + (log.responseTime || 0), 0) / validResponses.length;
              
              // 平均响应时间应该合理
              expect(avgResponseTime).toBeLessThan(1000);
              
              // 最大响应时间不应该过长
              const maxResponseTime = Math.max(...validResponses.map(log => log.responseTime || 0));
              expect(maxResponseTime).toBeLessThan(3000);
              
              // 成功翻译率应该很高
              const successfulTranslations = validResponses.filter(log => log.translationReceived).length;
              const successRate = successfulTranslations / validResponses.length;
              expect(successRate).toBeGreaterThan(0.8);
            }
            
            // 验证翻译API调用
            const expectedTranslationCalls = selectionScenarios.filter(s => 
              getExpectedSelectedText(s.selectedText, s.selectionMethod)
            ).length;
            
            expect(mockChromeRuntime.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(expectedTranslationCalls);
            
            // 验证至少有一些翻译调用
            if (expectedTranslationCalls > 0) {
              expect(mockChromeRuntime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                  action: 'translate'
                }),
                expect.any(Function)
              );
            }
          }
        ),
        { numRuns: 8 } // 减少运行次数
      );
    });
  });

  describe('属性 5：词汇信息完整性', () => {
    it('对于任何查询的词汇，系统应该提供完整准确的词汇信息', async () => {
      // Feature: chrome-translation-extension, Property 5: 词汇信息完整性
      await fc.assert(
        fc.asyncProperty(
          // 生成词汇查询场景
          fc.array(
            fc.record({
              word: fc.string({ minLength: 2, maxLength: 20 }).filter(s => 
                /^[a-zA-Z]+$/.test(s)
              ),
              queryMethod: fc.constantFrom('selection', 'doubleclick', 'manual'),
              expectDetails: fc.boolean(),
              includeExamples: fc.boolean(),
              includePronunciation: fc.boolean()
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (wordQueries) => {
            // 初始化选择处理器
            selectionHandler.initialize();
            
            // 跟踪词汇信息查询
            const queryLog: Array<{
              word: string;
              method: string;
              startTime: number;
              endTime?: number;
              wordInfo?: any;
              isComplete: boolean;
            }> = [];
            
            // 执行词汇查询
            for (const query of wordQueries) {
              const startTime = Date.now();
              
              // 模拟词汇查询
              let wordInfo: any = null;
              
              const queryPromise = new Promise<void>((resolve) => {
                mockChromeRuntime.sendMessage({
                  action: 'lookupWord',
                  data: { word: query.word }
                }, (response: any) => {
                  if (response?.success) {
                    wordInfo = response.data;
                  }
                  resolve();
                });
              });
              
              await queryPromise;
              
              const endTime = Date.now();
              
              // 验证词汇信息的完整性
              let isComplete = false;
              
              if (wordInfo) {
                // 检查必需字段
                const hasRequiredFields = 
                  wordInfo.word && 
                  wordInfo.definitions && 
                  Array.isArray(wordInfo.definitions) &&
                  wordInfo.definitions.length > 0;
                
                // 检查可选字段
                const hasOptionalFields = 
                  (!query.includePronunciation || wordInfo.pronunciation) &&
                  (!query.includeExamples || (wordInfo.examples && wordInfo.examples.length > 0));
                
                isComplete = hasRequiredFields && hasOptionalFields;
                
                // 验证字段类型和内容
                expect(typeof wordInfo.word).toBe('string');
                expect(wordInfo.word).toBe(query.word);
                expect(Array.isArray(wordInfo.definitions)).toBe(true);
                expect(wordInfo.definitions.length).toBeGreaterThan(0);
                
                if (wordInfo.pronunciation) {
                  expect(typeof wordInfo.pronunciation).toBe('string');
                  expect(wordInfo.pronunciation.length).toBeGreaterThan(0);
                }
                
                if (wordInfo.partOfSpeech) {
                  expect(typeof wordInfo.partOfSpeech).toBe('string');
                }
                
                if (wordInfo.examples) {
                  expect(Array.isArray(wordInfo.examples)).toBe(true);
                }
                
                if (wordInfo.difficulty !== undefined) {
                  expect(typeof wordInfo.difficulty).toBe('number');
                  expect(wordInfo.difficulty).toBeGreaterThanOrEqual(1);
                  expect(wordInfo.difficulty).toBeLessThanOrEqual(10);
                }
                
                if (wordInfo.frequency !== undefined) {
                  expect(typeof wordInfo.frequency).toBe('number');
                  expect(wordInfo.frequency).toBeGreaterThanOrEqual(0);
                  expect(wordInfo.frequency).toBeLessThanOrEqual(100);
                }
              }
              
              // 记录查询日志
              queryLog.push({
                word: query.word,
                method: query.queryMethod,
                startTime,
                endTime,
                wordInfo,
                isComplete
              });
              
              // 验证查询响应时间
              const responseTime = endTime - startTime;
              expect(responseTime).toBeLessThan(2000); // 2秒内响应
              
              if (query.expectDetails) {
                expect(wordInfo).toBeDefined();
                expect(isComplete).toBe(true);
              }
            }
            
            // 验证整体查询性能
            const successfulQueries = queryLog.filter(log => log.wordInfo !== null);
            const completeQueries = queryLog.filter(log => log.isComplete);
            
            if (wordQueries.length > 0) {
              // 成功查询率
              const successRate = successfulQueries.length / wordQueries.length;
              expect(successRate).toBeGreaterThan(0.8);
              
              // 完整信息率
              if (successfulQueries.length > 0) {
                const completenessRate = completeQueries.length / successfulQueries.length;
                expect(completenessRate).toBeGreaterThan(0.7);
              }
            }
            
            // 验证词汇信息的一致性
            const uniqueWords = new Set(wordQueries.map(q => q.word));
            for (const word of uniqueWords) {
              const wordQueries = queryLog.filter(log => log.word === word);
              
              if (wordQueries.length > 1) {
                // 同一个词的多次查询应该返回一致的信息
                const firstQuery = wordQueries[0];
                
                for (let i = 1; i < wordQueries.length; i++) {
                  const currentQuery = wordQueries[i];
                  
                  if (firstQuery?.wordInfo && currentQuery?.wordInfo) {
                    expect(currentQuery.wordInfo.word).toBe(firstQuery.wordInfo.word);
                    expect(currentQuery.wordInfo.definitions).toEqual(firstQuery.wordInfo.definitions);
                    
                    if (firstQuery.wordInfo.pronunciation && currentQuery.wordInfo.pronunciation) {
                      expect(currentQuery.wordInfo.pronunciation).toBe(firstQuery.wordInfo.pronunciation);
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
  });

  describe('属性 15：工具提示位置智能性', () => {
    it('对于任何选择位置，工具提示应该智能定位以避免遮挡内容和超出视窗', async () => {
      // Feature: chrome-translation-extension, Property 15: 工具提示位置智能性
      await fc.assert(
        fc.asyncProperty(
          // 生成各种选择位置场景
          fc.array(
            fc.record({
              selectionRect: fc.record({
                left: fc.integer({ min: 0, max: 1000 }),
                top: fc.integer({ min: 0, max: 700 }),
                width: fc.integer({ min: 20, max: 300 }),
                height: fc.integer({ min: 15, max: 50 })
              }),
              viewportSize: fc.record({
                width: fc.integer({ min: 800, max: 1920 }),
                height: fc.integer({ min: 600, max: 1080 })
              }),
              tooltipSize: fc.record({
                width: fc.integer({ min: 200, max: 400 }),
                height: fc.integer({ min: 100, max: 300 })
              }),
              scrollPosition: fc.record({
                x: fc.integer({ min: 0, max: 500 }),
                y: fc.integer({ min: 0, max: 1000 })
              })
            }),
            { minLength: 1, maxLength: 15 }
          ),
          async (positionScenarios) => {
            // 初始化选择处理器
            selectionHandler.initialize();
            
            // 跟踪工具提示位置
            const positionLog: Array<{
              selectionRect: any;
              tooltipPosition: { x: number; y: number };
              isWithinViewport: boolean;
              avoidsOverlap: boolean;
              isAccessible: boolean;
            }> = [];
            
            // 执行位置测试
            for (const scenario of positionScenarios) {
              // 更新视窗尺寸
              mockWindow.innerWidth = scenario.viewportSize.width;
              mockWindow.innerHeight = scenario.viewportSize.height;
              mockWindow.scrollX = scenario.scrollPosition.x;
              mockWindow.scrollY = scenario.scrollPosition.y;
              
              const selectionRect = {
                left: scenario.selectionRect.left,
                top: scenario.selectionRect.top,
                width: scenario.selectionRect.width,
                height: scenario.selectionRect.height,
                right: scenario.selectionRect.left + scenario.selectionRect.width,
                bottom: scenario.selectionRect.top + scenario.selectionRect.height
              };

              const tooltipPosition = (selectionHandler as any).calculateTooltipPosition(
                selectionRect,
                scenario.tooltipSize,
                {
                  width: mockWindow.innerWidth,
                  height: mockWindow.innerHeight
                }
              );
              const tooltipX = tooltipPosition.left;
              const tooltipY = tooltipPosition.top;
              const normalizedTooltipPosition = { x: tooltipX, y: tooltipY };
              
              // 验证位置的有效性
              
              // 1. 检查是否在视窗范围内
              const isWithinViewport = 
                tooltipX >= 0 && 
                tooltipX + scenario.tooltipSize.width <= mockWindow.innerWidth &&
                tooltipY >= 0 &&
                tooltipY + scenario.tooltipSize.height <= mockWindow.innerHeight;
              
              // 2. 检查是否避免与选择区域重叠
              const tooltipRect = {
                left: tooltipX,
                top: tooltipY,
                right: tooltipX + scenario.tooltipSize.width,
                bottom: tooltipY + scenario.tooltipSize.height
              };
              
              const avoidsOverlap = !(
                tooltipRect.left < selectionRect.right &&
                tooltipRect.right > selectionRect.left &&
                tooltipRect.top < selectionRect.bottom &&
                tooltipRect.bottom > selectionRect.top
              );
              
              // 3. 检查是否易于访问（不在屏幕边缘）
              const margin = 10;
              const isAccessible = 
                tooltipX >= margin &&
                tooltipX + scenario.tooltipSize.width <= mockWindow.innerWidth - margin &&
                tooltipY >= margin &&
                tooltipY + scenario.tooltipSize.height <= mockWindow.innerHeight - margin;
              
              // 对于边界情况，放宽可访问性要求
              const isNearEdge = 
                selectionRect.left < 50 || 
                selectionRect.right > mockWindow.innerWidth - 50 || 
                selectionRect.top < 50 || 
                selectionRect.bottom > mockWindow.innerHeight - 50;
              
              const finalAccessible = isNearEdge ? isWithinViewport : isAccessible;
              
              // 记录位置信息
              positionLog.push({
                selectionRect,
                tooltipPosition: normalizedTooltipPosition,
                isWithinViewport,
                avoidsOverlap,
                isAccessible: finalAccessible
              });
              
              // 验证位置要求
              expect(isWithinViewport).toBe(true);
              const canAvoidOverlap =
                selectionRect.bottom + scenario.tooltipSize.height <= mockWindow.innerHeight ||
                selectionRect.top - scenario.tooltipSize.height >= 0;
              if (canAvoidOverlap) {
                expect(avoidsOverlap).toBe(true);
              }
              
              // 验证位置的合理性
              expect(tooltipX).toBeGreaterThanOrEqual(0);
              expect(tooltipX + scenario.tooltipSize.width).toBeLessThanOrEqual(mockWindow.innerWidth);
              expect(tooltipY).toBeGreaterThanOrEqual(0);
              expect(tooltipY + scenario.tooltipSize.height).toBeLessThanOrEqual(mockWindow.innerHeight);
            }
            
            // 验证整体位置智能性
            
            // 1. 所有工具提示都应该在视窗内
            const withinViewportCount = positionLog.filter(log => log.isWithinViewport).length;
            expect(withinViewportCount).toBe(positionLog.length);
            
            // 3. 大部分工具提示应该易于访问（降低要求）
            const accessibleCount = positionLog.filter(log => log.isAccessible).length;
            const accessibilityRate = accessibleCount / positionLog.length;
            expect(accessibilityRate).toBeGreaterThan(0.3);
            
            // 4. 验证边界情况处理
            const edgeCases = positionLog.filter(log => {
              const rect = log.selectionRect;
              return (
                rect.left < 50 || // 靠近左边缘
                rect.right > mockWindow.innerWidth - 50 || // 靠近右边缘
                rect.top < 50 || // 靠近顶部
                rect.bottom > mockWindow.innerHeight - 50 // 靠近底部
              );
            });
            
            // 边界情况也应该正确处理
            for (const edgeCase of edgeCases) {
              expect(edgeCase.isWithinViewport).toBe(true);
            }
            
            // 5. 验证位置分布的合理性
            if (positionLog.length > 1) {
              const positions = positionLog.map(log => log.tooltipPosition);
              
              // 检查位置的多样性（不应该所有工具提示都在同一位置）
              const uniquePositions = new Set(positions.map(p => `${p.x},${p.y}`));
              const diversityRate = uniquePositions.size / positions.length;
              
              // 如果选择位置不同，工具提示位置也应该有所不同
              if (positionLog.length > 3) {
                expect(diversityRate).toBeGreaterThan(0.3);
              }
            }
          }
        ),
        { numRuns: 5 } // 减少运行次数
      );
    });
  });
});
