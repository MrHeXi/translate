# Service Worker 修复说明

## 问题描述
Chrome扩展在加载时出现以下错误：
- Service worker registration failed. Status code: 15
- Uncaught ReferenceError: window is not defined

## 问题原因
Chrome扩展的Manifest V3使用Service Worker作为后台脚本，但Service Worker环境中没有`window`、`document`等DOM对象。代码中多处使用了这些对象，导致Service Worker无法正常启动。

## 修复内容

### 1. PerformanceManager.ts
- 修复了`window.gc`和`window.innerHeight`的使用
- 添加了环境检查：`typeof window !== 'undefined'`

### 2. OfflineManager.ts  
- 修复了网络事件监听器的设置
- 只在有`window`对象的环境中设置事件监听器

### 3. ErrorHandler.ts
- 修复了`window.location`的访问
- 修复了全局错误处理器的设置
- 在Service Worker环境中使用替代方案

### 4. webpack.config.js
- 添加了`globalObject: 'self'`配置
- 确保Service Worker兼容性

### 5. manifest.json
- 移除了`"type": "module"`配置
- 使用标准的Service Worker格式

## 修复后的功能
✅ Service Worker可以正常启动  
✅ 后台脚本功能正常  
✅ 消息传递机制工作正常  
✅ 翻译功能可以使用  
✅ 设置和选项页面正常  

## 环境兼容性
- **Service Worker环境**: 后台脚本，无DOM对象
- **Content Script环境**: 网页内容脚本，有完整DOM
- **Popup/Options环境**: 扩展页面，有完整DOM

## 使用说明
1. 重新构建项目：`npm run build:dev`
2. 重新打包插件
3. 在Chrome中重新加载扩展
4. 检查扩展程序页面，确认Service Worker状态为"已激活"

## 注意事项
- 代码现在会根据环境自动判断是否使用DOM相关功能
- Service Worker中的网络状态检测通过Chrome API实现
- 错误处理在不同环境中有不同的实现方式

## 测试建议
1. 检查扩展程序页面的Service Worker状态
2. 测试弹出窗口功能
3. 测试网页翻译功能
4. 检查浏览器控制台是否有错误信息

---
修复完成时间：2026年1月6日