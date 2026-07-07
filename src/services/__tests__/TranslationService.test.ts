// TranslationService 测试文件

import * as fc from 'fast-check';
import { TranslationService } from '../TranslationService';
import {
  AVAILABLE_TRANSLATION_PROVIDERS,
  TRANSLATION_LANGUAGES,
  TRANSLATION_PROVIDERS
} from '../TranslationProviderRegistry';

describe('TranslationService', () => {
  let translationService: TranslationService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    translationService = new TranslationService();
  });

  afterEach(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete (global as any).fetch;
    }
  });

  describe('单元测试', () => {
    it('应该创建TranslationService实例', () => {
      expect(translationService).toBeInstanceOf(TranslationService);
    });

    it('应该检测中文文本', async () => {
      const chineseText = '你好世界';
      const language = await translationService.detectLanguage(chineseText);
      expect(language).toBe('zh-CN');
    });

    it('应该检测英文文本', async () => {
      const englishText = 'Hello World';
      const language = await translationService.detectLanguage(englishText);
      expect(language).toBe('en');
    });

    it('tracks a 20-plus provider roadmap and 100-plus target language choices', () => {
      expect(TRANSLATION_PROVIDERS.length).toBeGreaterThanOrEqual(20);
      expect(AVAILABLE_TRANSLATION_PROVIDERS.map(provider => provider.id)).toEqual(['google', 'mymemory']);
      expect(TRANSLATION_LANGUAGES.length).toBeGreaterThanOrEqual(100);
      expect(TRANSLATION_LANGUAGES.some(language => language.code === 'zh-CN')).toBe(true);
      expect(TRANSLATION_LANGUAGES.some(language => language.code === 'en')).toBe(true);
      expect(TRANSLATION_LANGUAGES.some(language => language.code === 'es')).toBe(true);
    });

    it('uses the requested available provider before fallback providers', async () => {
      const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('translate.googleapis.com')) {
          return {
            ok: true,
            json: async () => [[['Google result', 'Hello', null, null, 3]], null, 'en']
          };
        }

        return {
          ok: true,
          json: async () => ({
            responseStatus: 200,
            responseData: { translatedText: 'MyMemory result', match: '0.8' },
            matches: []
          })
        };
      });
      (global as any).fetch = fetchMock;

      const googleResult = await translationService.translate({
        text: 'Hello',
        targetLang: 'zh-CN',
        provider: 'google'
      });

      expect(fetchMock.mock.calls[0]?.[0].toString()).toContain('translate.googleapis.com');
      expect(googleResult.translatedText).toBe('Google result');

      translationService.clearCache();

      const myMemoryResult = await translationService.translate({
        text: 'Hello',
        targetLang: 'zh-CN',
        provider: 'mymemory'
      });

      expect(fetchMock.mock.calls[1]?.[0].toString()).toContain('api.mymemory.translated.net');
      expect(myMemoryResult.translatedText).toBe('MyMemory result');
    });
  });

  describe('属性测试', () => {
    it('应该为任何非空字符串返回语言检测结果', async () => {
      // Feature: chrome-translation-extension, Property 1: 语言检测基本功能
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (text: string) => {
            const language = await translationService.detectLanguage(text);
            
            // 验证返回的语言代码是有效的
            expect(typeof language).toBe('string');
            expect(language.length).toBeGreaterThan(0);
            expect(['zh-CN', 'en', 'ja', 'ko', 'auto']).toContain(language);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该正确处理翻译请求', async () => {
      // Feature: chrome-translation-extension, Property 2: 翻译服务基本功能
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.constantFrom('zh-CN', 'en'),
          async (text: string, targetLang: string) => {
            try {
              const result = await translationService.translate({
                text,
                targetLang
              });
              
              // 验证成功时的返回结果结构
              expect(result).toHaveProperty('originalText');
              expect(result).toHaveProperty('translatedText');
              expect(result).toHaveProperty('targetLang');
              expect(result).toHaveProperty('confidence');
              
              // 验证原文保持不变
              expect(result.originalText).toBe(text);
              
              // 验证目标语言正确
              expect(result.targetLang).toBe(targetLang);
              
              // 验证置信度在合理范围内
              expect(result.confidence).toBeGreaterThanOrEqual(0);
              expect(result.confidence).toBeLessThanOrEqual(1);
              
            } catch (error) {
              // 验证错误处理机制
              expect(error).toBeInstanceOf(Error);
              const errorMessage = (error as Error).message;
              
              // 验证错误消息是有意义的
              expect(typeof errorMessage).toBe('string');
              expect(errorMessage.length).toBeGreaterThan(0);
              
              // 验证错误类型是预期的
              const expectedErrorMessages = [
                '翻译服务暂时不可用，请稍后重试',
                '翻译请求过于频繁，请稍后重试'
              ];
              expect(expectedErrorMessages.some(msg => errorMessage.includes(msg))).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('翻译API调用可靠性 - 对于任何翻译请求，系统应该正确调用翻译API并处理响应，包括错误情况的处理和重试机制', async () => {
      // Feature: chrome-translation-extension, Property 10: 翻译API调用可靠性
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            text: fc.string({ minLength: 1, maxLength: 100 }),
            sourceLang: fc.option(fc.constantFrom('zh-CN', 'en', 'ja', 'ko'), { nil: undefined }),
            targetLang: fc.constantFrom('zh-CN', 'en', 'ja', 'ko'),
            context: fc.option(fc.string({ maxLength: 50 }), { nil: undefined })
          }),
          async (requestData) => {
            // 构建符合接口的请求对象
            const request: any = {
              text: requestData.text,
              targetLang: requestData.targetLang
            };
            
            if (requestData.sourceLang !== undefined) {
              request.sourceLang = requestData.sourceLang;
            }
            
            if (requestData.context !== undefined) {
              request.context = requestData.context;
            }
            
            try {
              const result = await translationService.translate(request);
              
              // 验证API调用成功时的响应结构
              expect(result).toBeDefined();
              expect(result.originalText).toBe(request.text);
              expect(result.targetLang).toBe(request.targetLang);
              expect(typeof result.translatedText).toBe('string');
              expect(typeof result.sourceLang).toBe('string');
              expect(typeof result.confidence).toBe('number');
              expect(result.confidence).toBeGreaterThanOrEqual(0);
              expect(result.confidence).toBeLessThanOrEqual(1);
              
              // 验证备选翻译是数组（如果存在）
              if (result.alternatives) {
                expect(Array.isArray(result.alternatives)).toBe(true);
                result.alternatives.forEach(alt => {
                  expect(typeof alt).toBe('string');
                });
              }
              
            } catch (error) {
              // 验证错误处理机制
              expect(error).toBeInstanceOf(Error);
              const errorMessage = (error as Error).message;
              
              // 验证错误消息是有意义的
              expect(typeof errorMessage).toBe('string');
              expect(errorMessage.length).toBeGreaterThan(0);
              
              // 验证错误类型是预期的
              const expectedErrorMessages = [
                '翻译服务暂时不可用，请稍后重试',
                '翻译请求过于频繁，请稍后重试'
              ];
              expect(expectedErrorMessages.some(msg => errorMessage.includes(msg) || errorMessage.includes('模拟API调用失败'))).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('缓存机制可靠性 - 相同的翻译请求应该使用缓存结果', async () => {
      // Feature: chrome-translation-extension, Property 10: 翻译API调用可靠性（缓存部分）
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            text: fc.string({ minLength: 1, maxLength: 50 }),
            targetLang: fc.constantFrom('zh-CN', 'en')
          }),
          async (request) => {
            // 清空缓存
            translationService.clearCache();
            
            try {
              // 第一次调用
              const result1 = await translationService.translate(request);
              
              // 第二次调用相同请求
              const result2 = await translationService.translate(request);
              
              // 验证两次调用返回相同结果（使用了缓存）
              expect(result1.originalText).toBe(result2.originalText);
              expect(result1.translatedText).toBe(result2.translatedText);
              expect(result1.sourceLang).toBe(result2.sourceLang);
              expect(result1.targetLang).toBe(result2.targetLang);
              expect(result1.confidence).toBe(result2.confidence);
              
              // 验证缓存确实被使用了
              expect(translationService.getCacheSize()).toBeGreaterThan(0);
              
            } catch (error) {
              // 如果第一次调用失败，第二次调用也应该有一致的行为
              try {
                await translationService.translate(request);
              } catch (secondError) {
                expect((secondError as Error).message).toBe((error as Error).message);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('语言检测准确性 - 对于任何输入文本，系统应该能够检测语言并选择合适的翻译方向', async () => {
      // Feature: chrome-translation-extension, Property 11: 语言检测准确性
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            // 中文文本
            fc.string({ minLength: 1, maxLength: 50 }).map(s => '你好' + s + '世界'),
            // 英文文本
            fc.string({ minLength: 1, maxLength: 50 }).map(s => 'Hello' + s + 'World'),
            // 日文文本
            fc.string({ minLength: 1, maxLength: 50 }).map(s => 'こんにちは' + s),
            // 韩文文本
            fc.string({ minLength: 1, maxLength: 50 }).map(s => '안녕하세요' + s),
            // 混合文本
            fc.string({ minLength: 1, maxLength: 50 })
          ),
          async (text: string) => {
            const detectedLang = await translationService.detectLanguage(text);
            
            // 验证返回的语言代码是有效的
            expect(typeof detectedLang).toBe('string');
            expect(detectedLang.length).toBeGreaterThan(0);
            
            // 验证返回的是支持的语言代码
            const supportedLanguages = ['zh-CN', 'en', 'ja', 'ko', 'auto'];
            expect(supportedLanguages).toContain(detectedLang);
            
            // 验证语言检测的逻辑正确性
            if (text.includes('你好') || text.includes('世界') || /[\u4e00-\u9fff]/.test(text)) {
              // 包含中文字符的文本应该被检测为中文（除非其他语言字符更多）
              const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
              const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
              const japaneseCount = (text.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
              const koreanCount = (text.match(/[\uac00-\ud7af]/g) || []).length;
              
              const maxCount = Math.max(chineseCount, englishCount, japaneseCount, koreanCount);
              
              if (maxCount > 0) {
                if (chineseCount === maxCount) {
                  expect(detectedLang).toBe('zh-CN');
                } else if (englishCount === maxCount) {
                  expect(detectedLang).toBe('en');
                } else if (japaneseCount === maxCount) {
                  expect(detectedLang).toBe('ja');
                } else if (koreanCount === maxCount) {
                  expect(detectedLang).toBe('ko');
                }
              } else {
                expect(detectedLang).toBe('auto');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
