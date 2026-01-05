// TranslationService 测试文件

import * as fc from 'fast-check';
import { TranslationService } from '../TranslationService';

describe('TranslationService', () => {
  let translationService: TranslationService;

  beforeEach(() => {
    translationService = new TranslationService();
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
            expect(['zh-CN', 'en', 'auto']).toContain(language);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('应该正确处理翻译请求', async () => {
      // Feature: chrome-translation-extension, Property 2: 翻译服务基本功能
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.constantFrom('zh-CN', 'en'),
          async (text: string, targetLang: string) => {
            const result = await translationService.translate({
              text,
              targetLang
            });
            
            // 验证返回结果的结构
            expect(result).toHaveProperty('originalText');
            expect(result).toHaveProperty('translatedText');
            expect(result).toHaveProperty('targetLang');
            expect(result).toHaveProperty('confidence');
            
            // 验证原文保持不变
            expect(result.originalText).toBe(text);
            
            // 验证目标语言正确
            expect(result.targetLang).toBe(targetLang);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});