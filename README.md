# Chrome翻译插件

一个功能强大的Chrome浏览器扩展，提供智能网页翻译、选词翻译和学习模式功能。

## 功能特性

### 🌐 网页翻译
- 一键翻译整个网页
- 双语对照显示
- 保持原始页面布局
- 动态内容自动翻译

### 📝 选词翻译
- 选中文本即时翻译
- 智能工具提示
- 词汇详细信息显示
- 一键收藏生词

### 📚 学习模式
- 内置分级词库（GRE、托福、雅思、四六级）
- 生词本管理
- 学习进度跟踪
- 智能复习系统

### 💾 数据管理
- 本地数据存储
- 跨设备同步
- 数据导入导出
- 学习统计分析

## 技术架构

- **框架**: Manifest V3
- **语言**: TypeScript
- **构建工具**: Webpack 5
- **测试框架**: Jest + fast-check
- **代码规范**: ESLint + TypeScript

## 项目结构

```
chrome-translation-extension/
├── src/
│   ├── background/          # 后台脚本
│   ├── content/            # 内容脚本
│   │   └── components/     # UI组件
│   ├── services/           # 核心服务
│   ├── popup/              # 弹出窗口
│   ├── options/            # 选项页面
│   └── test/               # 测试文件
├── dist/                   # 构建输出
├── icons/                  # 图标文件
├── manifest.json           # 扩展清单
├── webpack.config.js       # Webpack配置
├── tsconfig.json          # TypeScript配置
└── package.json           # 项目配置
```

## 开发指南

### 环境要求

- Node.js 16+
- npm 8+
- Chrome浏览器

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 运行测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

### 代码检查

```bash
# 检查代码规范
npm run lint

# 自动修复
npm run lint:fix
```

## 安装扩展

1. 运行 `npm run build` 构建项目
2. 打开Chrome浏览器，进入 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目的 `dist` 文件夹

## 使用说明

### 基本使用

1. 点击浏览器工具栏中的插件图标
2. 在弹出窗口中开启翻译模式
3. 访问任意网页，点击浮动翻译图标进行翻译

### 选词翻译

1. 在网页中选中任意文本
2. 自动显示翻译工具提示
3. 点击"收藏"按钮添加到生词本

### 学习模式

1. 在插件设置中选择词库类型
2. 开启学习模式后，页面中的词库词汇会被高亮显示
3. 点击高亮词汇查看详细信息
4. 使用生词本进行复习和学习

## 测试策略

### 单元测试
- 验证具体功能和边缘情况
- 测试组件交互和错误处理

### 属性测试
- 使用fast-check进行属性测试
- 验证通用正确性属性
- 每个测试运行100+次迭代

### 集成测试
- 端到端功能测试
- 跨组件交互测试

## 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

## 许可证

MIT License

## 更新日志

### v1.0.0
- 初始版本发布
- 基础翻译功能
- 选词翻译
- 学习模式
- 数据存储和同步