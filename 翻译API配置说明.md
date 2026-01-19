# 翻译 API 配置说明

## 问题描述
扩展一直报错"翻译服务暂时不可用，正在尝试备用服务..."，这是因为之前使用的是模拟翻译 API。

## 解决方案
已将翻译服务改为使用**真实的免费翻译 API**，无需配置 API Key。

## 使用的翻译服务

### 1. MyMemory API（主要服务）
- **特点**：免费、无需 API Key、支持多语言
- **限制**：每天 1000 次免费调用
- **API 地址**：`https://api.mymemory.translated.net/`
- **优点**：
  - 完全免费
  - 无需注册
  - 返回翻译置信度
  - 提供备选翻译

### 2. Google Translate 免费接口（备用服务）
- **特点**：免费、无需 API Key
- **API 地址**：`https://translate.googleapis.com/translate_a/single`
- **优点**：
  - 翻译质量高
  - 支持自动语言检测
  - 响应速度快
- **注意**：这是非官方接口，可能不稳定

## 工作流程

```
用户请求翻译
    ↓
检查缓存（24小时有效期）
    ↓
缓存未命中
    ↓
尝试 MyMemory API
    ↓
失败？
    ↓
尝试 Google Translate API
    ↓
失败？
    ↓
返回错误信息
```

## 代码实现

### MyMemory API 调用
```typescript
private async callMyMemoryAPI(request: TranslationRequest): Promise<TranslationResult> {
  const sourceLang = request.sourceLang || await this.detectLanguage(request.text);
  const langPair = `${sourceLang}|${request.targetLang}`;
  
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(request.text)}&langpair=${langPair}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  return {
    originalText: request.text,
    translatedText: data.responseData.translatedText,
    sourceLang: sourceLang,
    targetLang: request.targetLang,
    confidence: parseFloat(data.responseData.match) || 0.8,
    alternatives: data.matches?.slice(0, 3).map((m: any) => m.translation) || []
  };
}
```

### Google Translate API 调用（备用）
```typescript
private async callGoogleTranslateAPI(request: TranslationRequest): Promise<TranslationResult> {
  const sourceLang = request.sourceLang || 'auto';
  const targetLang = request.targetLang;
  
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(request.text)}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
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
```

## 性能优化

### 1. 缓存机制
- 翻译结果缓存 24 小时
- 相同的翻译请求直接返回缓存结果
- 减少 API 调用次数

### 2. 请求限制
- 每分钟最多 120 次请求
- 防止 API 滥用
- 保护服务稳定性

### 3. 错误处理
- 主服务失败自动切换到备用服务
- API 失败时返回过期缓存（如果有）
- 提供友好的错误提示

## 使用方法

### 重新加载扩展
1. 打开 Chrome 扩展管理页面：`chrome://extensions/`
2. 找到"Chrome翻译插件"
3. 点击"重新加载"按钮
4. 测试翻译功能

### 测试翻译
1. 打开任意网页
2. 选中一段英文文本
3. 应该会显示翻译结果（而不是 `[翻译] 原文`）

## 支持的语言

常用语言代码：
- `zh-CN` - 简体中文
- `zh-TW` - 繁体中文
- `en` - 英语
- `ja` - 日语
- `ko` - 韩语
- `fr` - 法语
- `de` - 德语
- `es` - 西班牙语
- `ru` - 俄语
- `ar` - 阿拉伯语

## 注意事项

1. **网络连接**：需要能够访问翻译 API 服务器
2. **请求限制**：MyMemory API 每天有 1000 次免费调用限制
3. **翻译质量**：免费 API 的翻译质量可能不如付费服务
4. **服务稳定性**：Google Translate 免费接口可能随时失效

## 升级到付费 API（可选）

如果需要更高的翻译质量和稳定性，可以考虑：

### Google Cloud Translation API
1. 注册 Google Cloud 账号
2. 启用 Translation API
3. 获取 API Key
4. 在代码中配置 API Key

### 其他翻译服务
- Microsoft Translator API
- DeepL API
- 百度翻译 API
- 有道翻译 API

## 故障排查

### 如果翻译仍然失败

1. **检查网络连接**
   ```bash
   # 测试 MyMemory API
   curl "https://api.mymemory.translated.net/get?q=hello&langpair=en|zh-CN"
   ```

2. **查看控制台错误**
   - 打开开发者工具（F12）
   - 切换到 Console 标签
   - 查看错误信息

3. **检查扩展权限**
   - 确认 manifest.json 中的 `host_permissions` 已配置
   - 重新加载扩展

4. **清除缓存**
   - 在扩展选项页面清除翻译缓存
   - 重试翻译

## 相关文件

- `src/services/TranslationService.ts` - 翻译服务实现
- `manifest.json` - API 权限配置
- `src/background/background.ts` - 后台服务处理
