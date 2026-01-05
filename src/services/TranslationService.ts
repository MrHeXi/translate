// 翻译服务接口和实现

export interface TranslationRequest {
  text: string;
  sourceLang?: string | undefined;
  targetLang: string;
  context?: string;
}

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  confidence: number;
  alternatives?: string[];
}

// 翻译缓存项接口
interface TranslationCacheItem {
  result: TranslationResult;
  timestamp: number;
  expiryTime: number;
}

// 请求限制器接口
interface RequestLimiter {
  canMakeRequest(): boolean;
  recordRequest(): void;
}

export class TranslationService {
  private cache: Map<string, TranslationCacheItem> = new Map();
  private requestLimiter: RequestLimiter;
  private readonly CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24小时缓存过期
  private readonly MAX_REQUESTS_PER_MINUTE = 60; // 每分钟最大请求数
  // private readonly API_KEY = 'your-api-key'; // 实际使用时需要配置

  constructor() {
    this.requestLimiter = this.createRequestLimiter();
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    // 检查请求限制
    if (!this.requestLimiter.canMakeRequest()) {
      throw new Error('翻译请求过于频繁，请稍后重试');
    }

    // 检查缓存
    const cacheKey = this.generateCacheKey(request);
    const cachedItem = this.cache.get(cacheKey);
    
    if (cachedItem && !this.isCacheExpired(cachedItem)) {
      return cachedItem.result;
    }

    try {
      // 记录请求
      this.requestLimiter.recordRequest();
      
      // 调用翻译API
      const result = await this.callTranslationAPI(request);
      
      // 缓存结果
      this.setCacheItem(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('翻译请求失败:', error);
      
      // 如果有过期的缓存，在API失败时返回过期缓存
      if (cachedItem) {
        console.warn('API调用失败，返回过期缓存结果');
        return cachedItem.result;
      }
      
      throw new Error('翻译服务暂时不可用，请稍后重试');
    }
  }

  async detectLanguage(text: string): Promise<string> {
    // 简单的语言检测逻辑
    // 实际实现中应该调用语言检测API
    const chineseRegex = /[\u4e00-\u9fff]/g;
    const englishRegex = /[a-zA-Z]/g;
    const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff]/g;
    const koreanRegex = /[\uac00-\ud7af]/g;
    
    // 统计各种字符的数量
    const chineseCount = (text.match(chineseRegex) || []).length;
    const englishCount = (text.match(englishRegex) || []).length;
    const japaneseCount = (text.match(japaneseRegex) || []).length;
    const koreanCount = (text.match(koreanRegex) || []).length;
    
    // 根据字符数量判断主要语言
    const counts = [
      { lang: 'zh-CN', count: chineseCount },
      { lang: 'en', count: englishCount },
      { lang: 'ja', count: japaneseCount },
      { lang: 'ko', count: koreanCount }
    ];
    
    // 找到字符数最多的语言
    const maxCount = Math.max(...counts.map(c => c.count));
    if (maxCount === 0) {
      return 'auto';
    }
    
    const detectedLang = counts.find(c => c.count === maxCount)?.lang || 'auto';
    return detectedLang;
  }

  async batchTranslate(texts: string[], targetLang: string): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    
    // 批量处理翻译请求，但要考虑请求限制
    for (const text of texts) {
      try {
        const result = await this.translate({
          text,
          targetLang
        });
        results.push(result);
      } catch (error) {
        console.error(`翻译文本失败: ${text}`, error);
        // 添加错误占位符
        results.push({
          originalText: text,
          translatedText: text, // 翻译失败时保持原文
          sourceLang: 'unknown',
          targetLang,
          confidence: 0
        });
      }
    }
    
    return results;
  }

  // 重试翻译请求
  async retryTranslate(request: TranslationRequest, maxRetries: number = 3): Promise<TranslationResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.translate(request);
      } catch (error) {
        lastError = error as Error;
        console.warn(`翻译重试 ${attempt}/${maxRetries} 失败:`, error);
        
        if (attempt < maxRetries) {
          // 等待一段时间后重试
          await this.delay(1000 * attempt);
        }
      }
    }
    
    throw lastError || new Error('翻译重试失败');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateCacheKey(request: TranslationRequest): string {
    return `${request.text}_${request.sourceLang || 'auto'}_${request.targetLang}`;
  }

  private setCacheItem(key: string, result: TranslationResult): void {
    const cacheItem: TranslationCacheItem = {
      result,
      timestamp: Date.now(),
      expiryTime: Date.now() + this.CACHE_EXPIRY_MS
    };
    this.cache.set(key, cacheItem);
  }

  private isCacheExpired(cacheItem: TranslationCacheItem): boolean {
    return Date.now() > cacheItem.expiryTime;
  }

  private createRequestLimiter(): RequestLimiter {
    const requests: number[] = [];
    
    return {
      canMakeRequest: () => {
        const now = Date.now();
        const oneMinuteAgo = now - 60 * 1000;
        
        // 清理过期的请求记录
        while (requests.length > 0 && requests[0]! < oneMinuteAgo) {
          requests.shift();
        }
        
        return requests.length < this.MAX_REQUESTS_PER_MINUTE;
      },
      
      recordRequest: () => {
        requests.push(Date.now());
      }
    };
  }

  private async callTranslationAPI(request: TranslationRequest): Promise<TranslationResult> {
    // 模拟API调用
    // 实际实现中应该调用真实的翻译API（如Google Translate API）
    
    // 模拟网络延迟和可能的失败
    const shouldFail = Math.random() < 0.05; // 5%的失败率用于测试
    
    return new Promise(async (resolve, reject) => {
      setTimeout(async () => {
        if (shouldFail) {
          reject(new Error('模拟API调用失败'));
          return;
        }

        // 检测源语言
        const detectedLang = request.sourceLang || this.detectLanguageSync(request.text);
        
        // 生成多个翻译选项
        const alternatives = [
          `[备选翻译1] ${request.text}`,
          `[备选翻译2] ${request.text}`,
          `[备选翻译3] ${request.text}`
        ];
        
        resolve({
          originalText: request.text,
          translatedText: `[翻译] ${request.text}`, // 模拟翻译结果
          sourceLang: detectedLang,
          targetLang: request.targetLang,
          confidence: 0.85 + Math.random() * 0.15, // 0.85-1.0之间的置信度
          alternatives
        });
      }, 100); // 减少延迟到100ms
    });
  }

  private detectLanguageSync(text: string): string {
    // 同步版本的语言检测，用于API调用中
    const chineseRegex = /[\u4e00-\u9fff]/;
    const englishRegex = /[a-zA-Z]/;
    
    if (chineseRegex.test(text)) {
      return 'zh-CN';
    } else if (englishRegex.test(text)) {
      return 'en';
    } else {
      return 'auto';
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  // 清理过期的缓存项
  cleanExpiredCache(): void {
    for (const [key, cacheItem] of this.cache.entries()) {
      if (this.isCacheExpired(cacheItem)) {
        this.cache.delete(key);
      }
    }
  }

  // 获取缓存统计信息
  getCacheStats(): { total: number; expired: number; valid: number } {
    let expired = 0;
    let valid = 0;
    
    for (const cacheItem of this.cache.values()) {
      if (this.isCacheExpired(cacheItem)) {
        expired++;
      } else {
        valid++;
      }
    }
    
    return {
      total: this.cache.size,
      expired,
      valid
    };
  }
}