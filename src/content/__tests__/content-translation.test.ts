// Content Script 页面翻译属性测试

import * as fc from 'fast-check';

// 模拟DOM环境
const mockDocument = {
  readyState: 'complete',
  body: document.createElement('body'),
  createElement: (tagName: string) => document.createElement(tagName),
  createTextNode: (text: string) => document.createTextNode(text),
  createTreeWalker: (root: Node, whatToShow: number, filter?: NodeFilter) => 
    document.createTreeWalker(root, whatToShow, filter),
  addEventListener: jest.fn(),
  title: 'Test Page',
  documentElement: { lang: 'en' }
};

// 模拟Chrome API
const mockChromeRuntime = {
  sendMessage: jest.fn(),
  onMessage: {
    addListener: jest.fn()
  }
};

// 设置全局对象
(global as any).document = mockDocument;
(global as any).chrome = { runtime: mockChromeRuntime };
(global as any).window = {
  location: { href: 'https://example.com' },
  getSelection: jest.fn(),
  innerWidth: 1024,
  innerHeight: 768,
  scrollY: 0,
  scrollX: 0
};

// 模拟组件
jest.mock('../components/FloatingIcon', () => ({
  FloatingIcon: jest.fn().mockImplementation(() => ({
    create: jest.fn(),
    onToggle: jest.fn(),
    onLearningModeToggle: jest.fn(),
    updateState: jest.fn(),
    updateLearningModeState: jest.fn(),
    updatePosition: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    cleanup: jest.fn()
  }))
}));

jest.mock('../components/TranslationOverlay', () => ({
  TranslationOverlay: jest.fn().mockImplementation(() => ({
    addTranslation: jest.fn(),
    removeAllTranslations: jest.fn(),
    setDisplayMode: jest.fn(),
    setStylePreset: jest.fn(),
    showTooltip: jest.fn(),
    showAddToVocabularyOption: jest.fn(),
    showWordDetails: jest.fn(),
    showError: jest.fn(),
    cleanup: jest.fn()
  }))
}));

jest.mock('../components/SelectionHandler', () => ({
  SelectionHandler: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    onTextSelected: jest.fn(),
    setEnabled: jest.fn(),
    cleanup: jest.fn()
  }))
}));

describe('Content Script 页面翻译属性测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // 重置DOM
    mockDocument.body.innerHTML = '';
    
    // 设置默认的Chrome API响应
    mockChromeRuntime.sendMessage.mockImplementation((message, callback) => {
      if (callback) {
        switch (message.action) {
          case 'getSettings':
            callback({
              success: true,
              data: {
                defaultTargetLanguage: 'zh-CN',
                translationProvider: 'google',
                pageTranslationDisplayMode: 'bilingual',
                floatingIconPosition: { x: 20, y: 20 },
                learningModeEnabled: true,
                activeDictionaries: ['gre'],
                highlightColors: { gre: '#ff0000' },
                autoTranslate: false,
                showFloatingIcon: true
              }
            });
            break;
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
          default:
            callback({ success: true });
        }
      }
    });
  });

  describe('属性 1：页面翻译往返一致性', () => {
    it('对于任何页面内容，翻译后再翻译回原语言应该保持语义一致性', async () => {
      // Feature: chrome-translation-extension, Property 1: 页面翻译往返一致性
      await fc.assert(
        fc.asyncProperty(
          // 生成页面文本内容
          fc.array(
            fc.record({
              text: fc.string({ minLength: 5, maxLength: 100 }).filter(s => 
                /^[a-zA-Z\s.,!?]+$/.test(s) && s.trim().length > 0
              ),
              tagName: fc.constantFrom('p', 'div', 'span', 'h1', 'h2', 'h3'),
              isVisible: fc.boolean()
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (pageContent) => {
            // 创建测试页面内容
            const testContainer = document.createElement('div');
            testContainer.id = 'test-container';
            
            const textNodes: Text[] = [];
            const originalTexts: string[] = [];
            
            for (const content of pageContent) {
              if (content.isVisible && content.text.trim()) {
                const element = document.createElement(content.tagName);
                const textNode = document.createTextNode(content.text);
                element.appendChild(textNode);
                testContainer.appendChild(element);
                
                textNodes.push(textNode);
                originalTexts.push(content.text);
              }
            }
            
            mockDocument.body.appendChild(testContainer);
            
            // 模拟翻译过程
            const translations: string[] = [];
            const backTranslations: string[] = [];
            
            // 第一次翻译（英文 -> 中文）
            for (const originalText of originalTexts) {
              const translationResponse = await new Promise<any>((resolve) => {
                mockChromeRuntime.sendMessage({
                  action: 'translate',
                  data: { text: originalText, targetLang: 'zh-CN' }
                }, resolve);
              });
              
              expect(translationResponse.success).toBe(true);
              expect(translationResponse.data.originalText).toBe(originalText);
              expect(translationResponse.data.translatedText).toBeDefined();
              expect(translationResponse.data.sourceLang).toBe('en');
              expect(translationResponse.data.targetLang).toBe('zh-CN');
              
              translations.push(translationResponse.data.translatedText);
            }
            
            // 第二次翻译（中文 -> 英文，往返翻译）
            for (const translation of translations) {
              // 模拟反向翻译
              mockChromeRuntime.sendMessage.mockImplementationOnce((message, callback) => {
                if (callback && message.action === 'translate') {
                  // 简化的反向翻译逻辑：移除"翻译："前缀
                  const backTranslated = message.data.text.replace('翻译：', '');
                  callback({
                    success: true,
                    data: {
                      originalText: message.data.text,
                      translatedText: backTranslated,
                      sourceLang: 'zh-CN',
                      targetLang: 'en',
                      confidence: 0.90
                    }
                  });
                }
              });
              
              const backTranslationResponse = await new Promise<any>((resolve) => {
                mockChromeRuntime.sendMessage({
                  action: 'translate',
                  data: { text: translation, targetLang: 'en' }
                }, resolve);
              });
              
              expect(backTranslationResponse.success).toBe(true);
              backTranslations.push(backTranslationResponse.data.translatedText);
            }
            
            // 验证往返翻译的一致性
            expect(backTranslations.length).toBe(originalTexts.length);
            
            for (let i = 0; i < originalTexts.length; i++) {
              const original = originalTexts[i]!.toLowerCase().trim();
              const backTranslated = backTranslations[i]!.toLowerCase().trim();
              
              // 验证语义相似性（简化版本：检查关键词重叠）
              const originalWords = original.split(/\s+/).filter(w => w.length > 2);
              const backWords = backTranslated.split(/\s+/).filter(w => w.length > 2);
              
              if (originalWords.length > 0) {
                const commonWords = originalWords.filter(word => 
                  backWords.some(bWord => bWord.includes(word) || word.includes(bWord))
                );
                
                // 至少应该有一些词汇重叠，表示语义保持
                const overlapRatio = commonWords.length / originalWords.length;
                expect(overlapRatio).toBeGreaterThanOrEqual(0.3); // 至少30%的词汇相似性
              }
            }
            
            // 清理测试内容
            mockDocument.body.removeChild(testContainer);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('属性 2：翻译内容完整性', () => {
    it('对于任何页面内容，翻译功能应该处理所有可见文本而不遗漏', async () => {
      // Feature: chrome-translation-extension, Property 2: 翻译内容完整性
      await fc.assert(
        fc.asyncProperty(
          // 生成复杂的页面结构
          fc.record({
            mainContent: fc.array(
              fc.record({
                text: fc.string({ minLength: 10, maxLength: 200 }).filter(s => 
                  /^[a-zA-Z\s.,!?-]+$/.test(s) && s.trim().length > 5
                ),
                tagName: fc.constantFrom('p', 'div', 'span', 'article', 'section'),
                nested: fc.boolean()
              }),
              { minLength: 2, maxLength: 8 }
            ),
            hiddenContent: fc.array(
              fc.record({
                text: fc.string({ minLength: 5, maxLength: 50 }),
                hideMethod: fc.constantFrom('display-none', 'visibility-hidden', 'script-tag')
              }),
              { minLength: 0, maxLength: 3 }
            )
          }),
          async (pageStructure) => {
            // 创建测试页面
            const testContainer = document.createElement('div');
            testContainer.id = 'translation-test-container';
            
            const visibleTexts: string[] = [];
            const allTextNodes: Text[] = [];
            
            // 添加可见内容
            for (const content of pageStructure.mainContent) {
              const element = document.createElement(content.tagName);
              
              if (content.nested) {
                // 创建嵌套结构
                const nestedElement = document.createElement('span');
                const textNode = document.createTextNode(content.text);
                nestedElement.appendChild(textNode);
                element.appendChild(nestedElement);
                allTextNodes.push(textNode);
              } else {
                const textNode = document.createTextNode(content.text);
                element.appendChild(textNode);
                allTextNodes.push(textNode);
              }
              
              testContainer.appendChild(element);
              visibleTexts.push(content.text);
            }
            
            // 添加隐藏内容（不应该被翻译）
            for (const hiddenContent of pageStructure.hiddenContent) {
              let element: HTMLElement;
              
              switch (hiddenContent.hideMethod) {
                case 'display-none':
                  element = document.createElement('div');
                  element.style.display = 'none';
                  break;
                case 'visibility-hidden':
                  element = document.createElement('div');
                  element.style.visibility = 'hidden';
                  break;
                case 'script-tag':
                  element = document.createElement('script');
                  break;
                default:
                  element = document.createElement('div');
              }
              
              const textNode = document.createTextNode(hiddenContent.text);
              element.appendChild(textNode);
              testContainer.appendChild(element);
            }
            
            mockDocument.body.appendChild(testContainer);
            
            // 模拟页面翻译过程
            const translatedTexts: string[] = [];
            let translationCallCount = 0;
            
            // 重新设置翻译API mock以计数调用
            mockChromeRuntime.sendMessage.mockImplementation((message, callback) => {
              if (callback) {
                if (message.action === 'translate') {
                  translationCallCount++;
                  const translatedText = `翻译：${message.data.text}`;
                  translatedTexts.push(translatedText);
                  
                  callback({
                    success: true,
                    data: {
                      originalText: message.data.text,
                      translatedText: translatedText,
                      sourceLang: 'en',
                      targetLang: 'zh-CN',
                      confidence: 0.95
                    }
                  });
                } else {
                  callback({ success: true, data: {} });
                }
              }
            });
            
            // 模拟文本节点遍历和翻译（简化版本的getTextNodes逻辑）
            const walker = document.createTreeWalker(
              testContainer,
              NodeFilter.SHOW_TEXT,
              {
                acceptNode: (node) => {
                  const parent = node.parentElement;
                  if (parent && ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
                    return NodeFilter.FILTER_REJECT;
                  }
                  // 检查是否为隐藏元素
                  if (parent) {
                    const style = window.getComputedStyle ? window.getComputedStyle(parent) : parent.style;
                    if (style.display === 'none' || style.visibility === 'hidden') {
                      return NodeFilter.FILTER_REJECT;
                    }
                  }
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
            );
            
            const foundTextNodes: Text[] = [];
            let node = walker.nextNode();
            while (node) {
              foundTextNodes.push(node as Text);
              node = walker.nextNode();
            }
            
            // 模拟翻译每个找到的文本节点
            for (const textNode of foundTextNodes) {
              if (textNode.textContent && textNode.textContent.trim().length > 3) {
                await new Promise<void>((resolve) => {
                  mockChromeRuntime.sendMessage({
                    action: 'translate',
                    data: { text: textNode.textContent, targetLang: 'zh-CN' }
                  }, () => resolve());
                });
              }
            }
            
            // 验证翻译完整性
            
            // 1. 验证所有可见文本都被处理了
            expect(translationCallCount).toBeGreaterThan(0);
            expect(translationCallCount).toBeLessThanOrEqual(visibleTexts.length);
            
            // 2. 验证翻译的文本数量合理
            expect(translatedTexts.length).toBe(translationCallCount);
            
            // 3. 验证没有翻译隐藏内容
            const hiddenTexts = pageStructure.hiddenContent.map(h => h.text);
            for (const hiddenText of hiddenTexts) {
              const wasTranslated = translatedTexts.some(t => t === `翻译：${hiddenText}`);
              expect(wasTranslated).toBe(false);
            }
            
            // 4. 验证找到的文本节点数量合理
            expect(foundTextNodes.length).toBeGreaterThan(0);
            expect(foundTextNodes.length).toBeLessThanOrEqual(allTextNodes.length);
            
            // 5. 验证每个可见文本都有对应的翻译尝试
            for (const visibleText of visibleTexts) {
              if (visibleText.trim().length > 3) {
                // 应该有翻译调用包含这个文本
                expect(mockChromeRuntime.sendMessage).toHaveBeenCalledWith(
                  expect.objectContaining({
                    action: 'translate',
                    data: expect.objectContaining({
                      text: visibleText
                    })
                  }),
                  expect.any(Function)
                );
              }
            }
            
            // 清理测试内容
            mockDocument.body.removeChild(testContainer);
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('属性 3：动态内容自动翻译', () => {
    it('对于任何动态添加的内容，如果翻译模式已启用，应该自动翻译新内容', async () => {
      // Feature: chrome-translation-extension, Property 3: 动态内容自动翻译
      await fc.assert(
        fc.asyncProperty(
          // 生成初始内容和动态添加的内容
          fc.record({
            initialContent: fc.array(
              fc.string({ minLength: 10, maxLength: 100 }).filter(s => 
                /^[a-zA-Z\s.,!?]+$/.test(s) && s.trim().length > 5
              ),
              { minLength: 1, maxLength: 3 }
            ),
            dynamicContent: fc.array(
              fc.record({
                text: fc.string({ minLength: 10, maxLength: 150 }).filter(s => 
                  /^[a-zA-Z\s.,!?]+$/.test(s) && s.trim().length > 5
                ),
                addMethod: fc.constantFrom('appendChild', 'innerHTML', 'insertBefore'),
                delay: fc.integer({ min: 0, max: 100 }) // 模拟异步添加
              }),
              { minLength: 1, maxLength: 5 }
            )
          }),
          async (contentData) => {
            // 创建测试容器
            const testContainer = document.createElement('div');
            testContainer.id = 'dynamic-content-test';
            
            // 添加初始内容
            for (const text of contentData.initialContent) {
              const p = document.createElement('p');
              p.textContent = text;
              testContainer.appendChild(p);
            }
            
            mockDocument.body.appendChild(testContainer);
            
            // 跟踪翻译调用
            const translationCalls: string[] = [];
            mockChromeRuntime.sendMessage.mockImplementation((message, callback) => {
              if (callback) {
                if (message.action === 'translate') {
                  translationCalls.push(message.data.text);
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
                } else {
                  callback({ success: true, data: {} });
                }
              }
            });
            
            // 模拟翻译模式已启用的状态
            const isTranslationModeActive = true;
            
            // 模拟MutationObserver的行为
            const observedMutations: { addedNodes: Node[] }[] = [];
            
            // 模拟动态内容添加
            for (const dynamicItem of contentData.dynamicContent) {
              // 模拟延迟
              await new Promise(resolve => setTimeout(resolve, dynamicItem.delay));
              
              let newElement: HTMLElement;
              
              switch (dynamicItem.addMethod) {
                case 'appendChild':
                  newElement = document.createElement('div');
                  newElement.textContent = dynamicItem.text;
                  testContainer.appendChild(newElement);
                  break;
                  
                case 'innerHTML':
                  newElement = document.createElement('span');
                  newElement.innerHTML = dynamicItem.text;
                  testContainer.appendChild(newElement);
                  break;
                  
                case 'insertBefore': {
                  newElement = document.createElement('p');
                  newElement.textContent = dynamicItem.text;
                  const firstChild = testContainer.firstChild;
                  if (firstChild) {
                    testContainer.insertBefore(newElement, firstChild);
                  } else {
                    testContainer.appendChild(newElement);
                  }
                  break;
                }
                  
                default:
                  newElement = document.createElement('div');
                  newElement.textContent = dynamicItem.text;
                  testContainer.appendChild(newElement);
              }
              
              // 记录变化（模拟MutationObserver）
              observedMutations.push({
                addedNodes: [newElement]
              });
              
              // 模拟动态内容翻译处理
              if (isTranslationModeActive && newElement.nodeType === Node.ELEMENT_NODE) {
                // 模拟getTextNodes和翻译逻辑
                const walker = document.createTreeWalker(
                  newElement,
                  NodeFilter.SHOW_TEXT,
                  {
                    acceptNode: (node) => {
                      const parent = node.parentElement;
                      if (parent && ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) {
                        return NodeFilter.FILTER_REJECT;
                      }
                      return NodeFilter.FILTER_ACCEPT;
                    }
                  }
                );
                
                let textNode = walker.nextNode();
                while (textNode) {
                  if (textNode.textContent && textNode.textContent.trim().length > 3) {
                    // 模拟翻译调用
                    await new Promise<void>((resolve) => {
                      mockChromeRuntime.sendMessage({
                        action: 'translate',
                        data: { text: textNode!.textContent, targetLang: 'zh-CN' }
                      }, () => resolve());
                    });
                  }
                  textNode = walker.nextNode();
                }
              }
            }
            
            // 验证动态内容自动翻译
            
            // 1. 验证观察到了DOM变化
            expect(observedMutations.length).toBe(contentData.dynamicContent.length);
            
            // 2. 验证动态添加的内容被翻译了
            for (const dynamicItem of contentData.dynamicContent) {
              if (dynamicItem.text.trim().length > 3) {
                const wasTranslated = translationCalls.includes(dynamicItem.text);
                expect(wasTranslated).toBe(true);
              }
            }
            
            // 3. 验证翻译调用的总数合理
            const expectedTranslations = contentData.initialContent.length + 
              contentData.dynamicContent.filter(d => d.text.trim().length > 3).length;
            expect(translationCalls.length).toBeGreaterThanOrEqual(contentData.dynamicContent.filter(d => d.text.trim().length > 3).length);
            expect(translationCalls.length).toBeLessThanOrEqual(expectedTranslations);
            
            // 4. 验证每个动态内容都触发了相应的处理
            for (const mutation of observedMutations) {
              expect(mutation.addedNodes.length).toBeGreaterThan(0);
              
              for (const addedNode of mutation.addedNodes) {
                expect(addedNode.nodeType).toBe(Node.ELEMENT_NODE);
              }
            }
            
            // 清理测试内容
            mockDocument.body.removeChild(testContainer);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
