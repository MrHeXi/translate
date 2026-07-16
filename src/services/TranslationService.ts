// 翻译服务接口和实现

import {
  getTranslationProvider,
  isAvailableTranslationProvider,
  providerSupportsTargetLanguage,
  TRANSLATION_LANGUAGES,
  TranslationProviderRuntimeConfig
} from './TranslationProviderRegistry';
import {
  AiTranslationPreferences,
  buildAiTranslationSystemPrompt,
  buildAiTranslationUserMessage,
  normalizeAiTranslationPreferences
} from './AiTranslationPreferences';

export interface TranslationRequest {
  text: string;
  sourceLang?: string | undefined;
  targetLang: string;
  provider?: string | undefined;
  providerConfig?: TranslationProviderRuntimeConfig | undefined;
  context?: string;
  aiPreferences?: Partial<AiTranslationPreferences>;
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
  private readonly MAX_REQUESTS_PER_MINUTE = 120; // 每分钟最大请求数（放宽限制）
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
      const result = await this.callTranslationAPIWithProvider(request);
      
      // 缓存结果
      this.setCacheItem(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('翻译请求失败:', error);
      
      // 如果有过期的缓存，在API失败时返回过期缓存
      if (error instanceof TranslationProviderError) {
        throw error;
      }

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
    const providerVariant = [
      request.providerConfig?.endpoint || '',
      request.providerConfig?.model || '',
      request.providerConfig?.region || ''
    ].join('|');

    const aiVariant = JSON.stringify({
      context: request.context || '',
      preferences: normalizeAiTranslationPreferences(request.aiPreferences)
    });

    return `${request.provider || 'auto-provider'}_${providerVariant}_${aiVariant}_${request.text}_${request.sourceLang || 'auto'}_${request.targetLang}`;
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

  private async callTranslationAPIWithProvider(request: TranslationRequest): Promise<TranslationResult> {
    const providerOrder = this.getProviderOrder(request.provider);
    let lastError: unknown = null;

    for (const provider of providerOrder) {
      try {
        const definition = getTranslationProvider(provider);
        if (!definition?.adapter) {
          throw new TranslationProviderError(`${definition?.label || provider} is not implemented`);
        }
        if (!providerSupportsTargetLanguage(provider, request.targetLang)) {
          throw new TranslationProviderError(
            `${definition.label} does not support ${this.getLanguageLabel(request.targetLang)}`
          );
        }

        switch (definition.adapter) {
          case 'google': return await this.callGoogleTranslateAPI(request);
          case 'mymemory': return await this.callMyMemoryAPI(request);
          case 'deepl': return await this.callDeepLAPI(request);
          case 'microsoft': return await this.callMicrosoftTranslatorAPI(request);
          case 'openai-compatible': return await this.callOpenAICompatibleAPI(request, provider);
          case 'azure-openai': return await this.callAzureOpenAIAPI(request, provider);
          case 'gemini': return await this.callGeminiAPI(request);
          case 'anthropic': return await this.callAnthropicAPI(request, provider);
          case 'libretranslate': return await this.callLibreTranslateAPI(request, provider);
          case 'yandex': return await this.callYandexTranslateAPI(request, provider);
          case 'niutrans': return await this.callNiuTransAPI(request, provider);
          case 'caiyun': return await this.callCaiyunAPI(request, provider);
          case 'modernmt': return await this.callModernMTAPI(request, provider);
          case 'lingvanex': return await this.callLingvanexAPI(request, provider);
        }
      } catch (error) {
        lastError = error;
        const canFallback = provider === 'google' || provider === 'mymemory';
        console.warn(`${provider} API failed${canFallback ? ', trying fallback provider' : ''}`, error);
        if (!canFallback) throw error;
      }
    }

    console.error('All translation providers failed:', lastError);
    throw new Error('翻译服务暂时不可用，请稍后重试');
  }

  private getProviderOrder(providerId?: string): string[] {
    if (isAvailableTranslationProvider(providerId)) {
      if (providerId !== 'google' && providerId !== 'mymemory') {
        return [providerId!];
      }

      const fallbackProviders = ['google', 'mymemory'].filter(provider => provider !== providerId);
      return [providerId!, ...fallbackProviders];
    }

    return ['mymemory', 'google'];
  }

  private async callTranslationAPI(request: TranslationRequest): Promise<TranslationResult> {
    // 尝试使用真实的翻译API
    try {
      // 首先尝试使用 MyMemory API（免费，无需 API Key）
      return await this.callMyMemoryAPI(request);
    } catch (error) {
      console.warn('MyMemory API 调用失败，尝试备用服务:', error);
      
      try {
        // 备用方案：使用 Google Translate 免费接口
        return await this.callGoogleTranslateAPI(request);
      } catch (fallbackError) {
        console.error('所有翻译服务都失败:', fallbackError);
        throw new Error('翻译服务暂时不可用，正在尝试备用服务...');
      }
    }
  }

  // MyMemory 翻译 API（免费，无需 API Key）
  private async callMyMemoryAPI(request: TranslationRequest): Promise<TranslationResult> {
    const sourceLang = request.sourceLang || await this.detectLanguage(request.text);
    const langPair = `${sourceLang}|${request.targetLang}`;
    
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(request.text)}&langpair=${langPair}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`MyMemory API 请求失败: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.responseStatus !== 200) {
      throw new Error(`MyMemory API 返回错误: ${data.responseStatus}`);
    }
    
    return {
      originalText: request.text,
      translatedText: data.responseData.translatedText,
      sourceLang: sourceLang,
      targetLang: request.targetLang,
      confidence: parseFloat(data.responseData.match) || 0.8,
      alternatives: data.matches?.slice(0, 3).map((m: any) => m.translation) || []
    };
  }

  // Google Translate 免费接口（备用方案）
  private async callGoogleTranslateAPI(request: TranslationRequest): Promise<TranslationResult> {
    const sourceLang = request.sourceLang || 'auto';
    const targetLang = request.targetLang;
    
    // 使用 Google Translate 的免费接口
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(request.text)}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Google Translate API 请求失败: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Google Translate 返回的数据格式：[[["翻译文本","原文本",null,null,3]],null,"en"]
    if (!data || !data[0] || !data[0][0]) {
      throw new Error('Google Translate API 返回数据格式错误');
    }
    
    const translatedText = data[0].map((item: any) => item[0]).join('');
    const detectedLang = data[2] || sourceLang;
    
    return {
      originalText: request.text,
      translatedText: translatedText,
      sourceLang: detectedLang,
      targetLang: targetLang,
      confidence: 0.9,
      alternatives: []
    };
  }

  private async callDeepLAPI(request: TranslationRequest): Promise<TranslationResult> {
    const config = this.getProviderRuntimeConfig('deepl', request.providerConfig);
    const body = new URLSearchParams();
    body.set('text', request.text);
    body.set('target_lang', this.mapDeepLLanguage(request.targetLang, true));
    if (request.sourceLang && request.sourceLang !== 'auto') {
      body.set('source_lang', this.mapDeepLLanguage(request.sourceLang, false));
    }

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${config.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
    const data = await this.readProviderJson(response, 'DeepL');
    const translation = data?.translations?.[0];
    if (!translation || typeof translation.text !== 'string') {
      throw new TranslationProviderError('DeepL returned an invalid translation response');
    }

    return {
      originalText: request.text,
      translatedText: translation.text,
      sourceLang: this.normalizeProviderLanguage(translation.detected_source_language || request.sourceLang || 'auto'),
      targetLang: request.targetLang,
      confidence: 0.95,
      alternatives: []
    };
  }

  private async callMicrosoftTranslatorAPI(request: TranslationRequest): Promise<TranslationResult> {
    const config = this.getProviderRuntimeConfig('microsoft', request.providerConfig);
    const url = new URL(config.endpoint);
    url.searchParams.set('api-version', '3.0');
    url.searchParams.set('to', this.mapMicrosoftLanguage(request.targetLang));
    if (request.sourceLang && request.sourceLang !== 'auto') {
      url.searchParams.set('from', this.mapMicrosoftLanguage(request.sourceLang));
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': config.apiKey
    };
    if (config.region) {
      headers['Ocp-Apim-Subscription-Region'] = config.region;
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify([{ Text: request.text }])
    });
    const data = await this.readProviderJson(response, 'Microsoft Translator');
    const translatedText = data?.[0]?.translations?.[0]?.text;
    if (typeof translatedText !== 'string') {
      throw new TranslationProviderError('Microsoft Translator returned an invalid translation response');
    }

    return {
      originalText: request.text,
      translatedText,
      sourceLang: this.normalizeProviderLanguage(data?.[0]?.detectedLanguage?.language || request.sourceLang || 'auto'),
      targetLang: request.targetLang,
      confidence: typeof data?.[0]?.detectedLanguage?.score === 'number'
        ? data[0].detectedLanguage.score
        : 0.9,
      alternatives: []
    };
  }

  private async callOpenAICompatibleAPI(
    request: TranslationRequest,
    providerId: string = 'openai'
  ): Promise<TranslationResult> {
    const provider = getTranslationProvider(providerId)!;
    const config = this.getProviderRuntimeConfig(providerId, request.providerConfig);
    const sourceLanguage = request.sourceLang && request.sourceLang !== 'auto'
      ? this.getLanguageLabel(request.sourceLang)
      : 'the detected source language';
    const targetLanguage = this.getLanguageLabel(request.targetLang);
    const systemPrompt = buildAiTranslationSystemPrompt(
      sourceLanguage,
      targetLanguage,
      request.aiPreferences
    );
    const userMessage = buildAiTranslationUserMessage(
      request.text,
      request.context,
      request.aiPreferences
    );
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          { role: 'user', content: userMessage }
        ]
      })
    });
    const data = await this.readProviderJson(response, provider.label);
    const content = data?.choices?.[0]?.message?.content;
    const translatedText = typeof content === 'string'
      ? content.trim()
      : Array.isArray(content)
        ? content.map((part: any) => part?.text || '').join('').trim()
        : '';
    if (!translatedText) {
      throw new TranslationProviderError(`${provider.label} returned an invalid translation response`);
    }

    return {
      originalText: request.text,
      translatedText,
      sourceLang: request.sourceLang && request.sourceLang !== 'auto'
        ? request.sourceLang
        : await this.detectLanguage(request.text),
      targetLang: request.targetLang,
      confidence: 0.9,
      alternatives: []
    };
  }

  private async callGeminiAPI(request: TranslationRequest): Promise<TranslationResult> {
    const config = this.getProviderRuntimeConfig('gemini', request.providerConfig);
    const sourceLanguage = request.sourceLang && request.sourceLang !== 'auto'
      ? this.getLanguageLabel(request.sourceLang)
      : 'the detected source language';
    const targetLanguage = this.getLanguageLabel(request.targetLang);
    const systemPrompt = buildAiTranslationSystemPrompt(
      sourceLanguage,
      targetLanguage,
      request.aiPreferences
    );
    const userMessage = buildAiTranslationUserMessage(
      request.text,
      request.context,
      request.aiPreferences
    );
    const endpoint = `${config.endpoint.replace(/\/$/, '')}/${encodeURIComponent(config.model)}:generateContent`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: systemPrompt
          }]
        },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0 }
      })
    });
    const data = await this.readProviderJson(response, 'Google Gemini');
    const translatedText = (data?.candidates?.[0]?.content?.parts || [])
      .map((part: any) => typeof part?.text === 'string' ? part.text : '')
      .join('')
      .trim();
    if (!translatedText) {
      throw new TranslationProviderError('Google Gemini returned an invalid translation response');
    }

    return {
      originalText: request.text,
      translatedText,
      sourceLang: request.sourceLang && request.sourceLang !== 'auto'
        ? request.sourceLang
        : await this.detectLanguage(request.text),
      targetLang: request.targetLang,
      confidence: 0.9,
      alternatives: []
    };
  }

  private async callAzureOpenAIAPI(
    request: TranslationRequest,
    providerId: string
  ): Promise<TranslationResult> {
    const provider = getTranslationProvider(providerId)!;
    const config = this.getProviderRuntimeConfig(providerId, request.providerConfig);
    const sourceLanguage = request.sourceLang && request.sourceLang !== 'auto'
      ? this.getLanguageLabel(request.sourceLang)
      : 'the detected source language';
    const targetLanguage = this.getLanguageLabel(request.targetLang);
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: buildAiTranslationSystemPrompt(sourceLanguage, targetLanguage, request.aiPreferences)
          },
          {
            role: 'user',
            content: buildAiTranslationUserMessage(request.text, request.context, request.aiPreferences)
          }
        ]
      })
    });
    const data = await this.readProviderJson(response, provider.label);
    const translatedText = this.extractOpenAIMessageText(data?.choices?.[0]?.message?.content);
    if (!translatedText) {
      throw new TranslationProviderError(`${provider.label} returned an invalid translation response`);
    }
    return this.createProviderTranslationResult(request, translatedText);
  }

  private async callAnthropicAPI(
    request: TranslationRequest,
    providerId: string
  ): Promise<TranslationResult> {
    const provider = getTranslationProvider(providerId)!;
    const config = this.getProviderRuntimeConfig(providerId, request.providerConfig);
    const sourceLanguage = request.sourceLang && request.sourceLang !== 'auto'
      ? this.getLanguageLabel(request.sourceLang)
      : 'the detected source language';
    const targetLanguage = this.getLanguageLabel(request.targetLang);
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4096,
        temperature: 0,
        system: buildAiTranslationSystemPrompt(sourceLanguage, targetLanguage, request.aiPreferences),
        messages: [{
          role: 'user',
          content: buildAiTranslationUserMessage(request.text, request.context, request.aiPreferences)
        }]
      })
    });
    const data = await this.readProviderJson(response, provider.label);
    const translatedText = (data?.content || [])
      .map((part: any) => typeof part?.text === 'string' ? part.text : '')
      .join('')
      .trim();
    if (!translatedText) {
      throw new TranslationProviderError(`${provider.label} returned an invalid translation response`);
    }
    return this.createProviderTranslationResult(request, translatedText);
  }

  private async callLibreTranslateAPI(
    request: TranslationRequest,
    providerId: string
  ): Promise<TranslationResult> {
    const provider = getTranslationProvider(providerId)!;
    const config = this.getProviderRuntimeConfig(providerId, request.providerConfig);
    const body: Record<string, string> = {
      q: request.text,
      source: request.sourceLang && request.sourceLang !== 'auto'
        ? this.mapPortableLanguage(request.sourceLang)
        : 'auto',
      target: this.mapPortableLanguage(request.targetLang),
      format: 'text'
    };
    if (config.apiKey) body['api_key'] = config.apiKey;

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await this.readProviderJson(response, provider.label);
    if (typeof data?.translatedText !== 'string' || !data.translatedText.trim()) {
      throw new TranslationProviderError(`${provider.label} returned an invalid translation response`);
    }
    return this.createProviderTranslationResult(
      request,
      data.translatedText.trim(),
      data.detectedLanguage?.language
    );
  }

  private async callYandexTranslateAPI(
    request: TranslationRequest,
    providerId: string
  ): Promise<TranslationResult> {
    const provider = getTranslationProvider(providerId)!;
    const config = this.getProviderRuntimeConfig(providerId, request.providerConfig);
    const body: Record<string, unknown> = {
      texts: [request.text],
      targetLanguageCode: this.mapPortableLanguage(request.targetLang)
    };
    if (request.sourceLang && request.sourceLang !== 'auto') {
      body['sourceLanguageCode'] = this.mapPortableLanguage(request.sourceLang);
    }
    if (config.region) body['folderId'] = config.region;

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Api-Key ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await this.readProviderJson(response, provider.label);
    const translation = data?.translations?.[0];
    if (typeof translation?.text !== 'string' || !translation.text.trim()) {
      throw new TranslationProviderError(`${provider.label} returned an invalid translation response`);
    }
    return this.createProviderTranslationResult(
      request,
      translation.text.trim(),
      translation.detectedLanguageCode
    );
  }

  private async callNiuTransAPI(
    request: TranslationRequest,
    providerId: string
  ): Promise<TranslationResult> {
    const provider = getTranslationProvider(providerId)!;
    const config = this.getProviderRuntimeConfig(providerId, request.providerConfig);
    const body = new URLSearchParams({
      from: request.sourceLang && request.sourceLang !== 'auto'
        ? this.mapPortableLanguage(request.sourceLang)
        : 'auto',
      to: this.mapPortableLanguage(request.targetLang),
      apikey: config.apiKey,
      src_text: request.text
    });
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const data = await this.readProviderJson(response, provider.label);
    if (typeof data?.tgt_text !== 'string' || !data.tgt_text.trim()) {
      throw new TranslationProviderError(
        typeof data?.error_msg === 'string' ? data.error_msg : `${provider.label} returned an invalid translation response`
      );
    }
    return this.createProviderTranslationResult(request, data.tgt_text.trim());
  }

  private async callCaiyunAPI(
    request: TranslationRequest,
    providerId: string
  ): Promise<TranslationResult> {
    const provider = getTranslationProvider(providerId)!;
    const config = this.getProviderRuntimeConfig(providerId, request.providerConfig);
    const target = this.mapCaiyunLanguage(request.targetLang);
    const source = request.sourceLang && request.sourceLang !== 'auto'
      ? this.mapCaiyunLanguage(request.sourceLang)
      : 'auto';
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'x-authorization': `token ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: [request.text],
        trans_type: `${source}2${target}`,
        request_id: `lexibridge-${Date.now()}`,
        detect: source === 'auto'
      })
    });
    const data = await this.readProviderJson(response, provider.label);
    const translatedText = Array.isArray(data?.target) ? data.target[0] : data?.target;
    if (typeof translatedText !== 'string' || !translatedText.trim()) {
      throw new TranslationProviderError(`${provider.label} returned an invalid translation response`);
    }
    return this.createProviderTranslationResult(request, translatedText.trim());
  }

  private async callModernMTAPI(
    request: TranslationRequest,
    providerId: string
  ): Promise<TranslationResult> {
    const provider = getTranslationProvider(providerId)!;
    const config = this.getProviderRuntimeConfig(providerId, request.providerConfig);
    const body = new URLSearchParams({
      q: request.text,
      source: request.sourceLang && request.sourceLang !== 'auto'
        ? this.mapPortableLanguage(request.sourceLang)
        : 'auto',
      target: this.mapPortableLanguage(request.targetLang),
      key: config.apiKey
    });
    if (request.context) body.set('context', request.context.slice(0, 4000));
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const data = await this.readProviderJson(response, provider.label);
    const translatedText = data?.data?.translation;
    if (typeof translatedText !== 'string' || !translatedText.trim()) {
      throw new TranslationProviderError(`${provider.label} returned an invalid translation response`);
    }
    return this.createProviderTranslationResult(request, translatedText.trim(), data?.data?.detectedLanguage);
  }

  private async callLingvanexAPI(
    request: TranslationRequest,
    providerId: string
  ): Promise<TranslationResult> {
    const provider = getTranslationProvider(providerId)!;
    const config = this.getProviderRuntimeConfig(providerId, request.providerConfig);
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: config.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        platform: 'api',
        from: request.sourceLang && request.sourceLang !== 'auto'
          ? this.mapLingvanexLanguage(request.sourceLang)
          : 'auto',
        to: this.mapLingvanexLanguage(request.targetLang),
        data: request.text
      })
    });
    const data = await this.readProviderJson(response, provider.label);
    const translatedText = Array.isArray(data?.result) ? data.result[0] : data?.result;
    if (typeof translatedText !== 'string' || !translatedText.trim()) {
      throw new TranslationProviderError(`${provider.label} returned an invalid translation response`);
    }
    return this.createProviderTranslationResult(request, translatedText.trim());
  }

  private extractOpenAIMessageText(content: unknown): string {
    return typeof content === 'string'
      ? content.trim()
      : Array.isArray(content)
        ? content.map((part: any) => part?.text || '').join('').trim()
        : '';
  }

  private async createProviderTranslationResult(
    request: TranslationRequest,
    translatedText: string,
    detectedLanguage?: string,
    confidence: number = 0.9
  ): Promise<TranslationResult> {
    const sourceLang = detectedLanguage
      ? this.normalizeProviderLanguage(detectedLanguage)
      : request.sourceLang && request.sourceLang !== 'auto'
        ? request.sourceLang
        : await this.detectLanguage(request.text);
    return {
      originalText: request.text,
      translatedText,
      sourceLang,
      targetLang: request.targetLang,
      confidence,
      alternatives: []
    };
  }

  private mapPortableLanguage(language: string): string {
    if (language === 'zh-CN' || language === 'zh-TW') return 'zh';
    if (language === 'no') return 'nb';
    return language.split('-')[0]!;
  }

  private mapLingvanexLanguage(language: string): string {
    if (language === 'zh-CN') return 'zh-Hans';
    if (language === 'zh-TW') return 'zh-Hant';
    return language;
  }

  private mapCaiyunLanguage(language: string): string {
    if (language === 'zh-CN') return 'zh';
    if (language === 'zh-TW') return 'zh-Hant';
    return language.split('-')[0]!;
  }

  private getProviderRuntimeConfig(
    providerId: string,
    runtimeConfig?: TranslationProviderRuntimeConfig
  ): { apiKey: string; endpoint: string; model: string; region: string } {
    const provider = getTranslationProvider(providerId);
    if (!provider || provider.status !== 'available') {
      throw new TranslationProviderError('Unknown or unavailable translation provider');
    }
    const apiKey = runtimeConfig?.apiKey?.trim() || '';
    if (provider.requiresApiKey && !apiKey) {
      throw new TranslationProviderError(`${provider.label} API key is not configured`);
    }

    const endpointValue = runtimeConfig?.endpoint?.trim() || provider.defaultEndpoint || '';
    if (!endpointValue) {
      throw new TranslationProviderError(`${provider.label} endpoint is not configured`);
    }
    const endpoint = this.validateProviderEndpoint(endpointValue, provider.label);
    const model = runtimeConfig?.model?.trim() || provider.defaultModel || '';
    if (provider.configFields?.includes('model') && !model) {
      throw new TranslationProviderError(`${provider.label} model is not configured`);
    }

    return {
      apiKey,
      endpoint,
      model,
      region: runtimeConfig?.region?.trim() || ''
    };
  }

  private validateProviderEndpoint(endpoint: string, providerLabel: string): string {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch (error) {
      throw new TranslationProviderError(`${providerLabel} endpoint must be HTTPS or a localhost HTTP URL`);
    }

    const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !isLocalHttp) {
      throw new TranslationProviderError(`${providerLabel} endpoint must be HTTPS or a localhost HTTP URL`);
    }
    if (url.username || url.password) {
      throw new TranslationProviderError(`${providerLabel} endpoint must not contain URL credentials`);
    }
    return url.toString();
  }

  private async readProviderJson(response: Response, providerLabel: string): Promise<any> {
    if (!response.ok) {
      throw new TranslationProviderError(`${providerLabel} request failed with HTTP ${response.status}`);
    }

    try {
      return await response.json();
    } catch (error) {
      throw new TranslationProviderError(`${providerLabel} returned invalid JSON`);
    }
  }

  private mapDeepLLanguage(language: string, isTarget: boolean): string {
    const mappings: Record<string, string> = {
      'zh-CN': isTarget ? 'ZH-HANS' : 'ZH',
      'zh-TW': isTarget ? 'ZH-HANT' : 'ZH',
      en: isTarget ? 'EN-US' : 'EN',
      pt: isTarget ? 'PT-PT' : 'PT',
      no: 'NB'
    };
    return mappings[language] || language.toUpperCase();
  }

  private mapMicrosoftLanguage(language: string): string {
    if (language === 'zh-CN') return 'zh-Hans';
    if (language === 'zh-TW') return 'zh-Hant';
    return language;
  }

  private normalizeProviderLanguage(language: string): string {
    const normalized = language.toLowerCase();
    if (normalized === 'zh' || normalized === 'zh-hans') return 'zh-CN';
    if (normalized === 'zh-hant') return 'zh-TW';
    return normalized;
  }

  private getLanguageLabel(languageCode: string): string {
    return TRANSLATION_LANGUAGES.find(language => language.code === languageCode)?.label || languageCode;
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

class TranslationProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationProviderError';
  }
}
