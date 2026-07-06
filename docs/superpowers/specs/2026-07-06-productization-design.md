# Translate Extension Productization Design

## 目标

把当前 Chrome 翻译扩展从“能用的项目”推进成“可以推广、可以上架、用户一眼能理解价值的软件”。核心原则：

- 保留现有功能：整页翻译、选词翻译、悬浮按钮、内置词库、生词本、复习、统计、导入导出、设置页。
- 不再自动翻译网页：用户必须通过悬浮按钮或弹窗明确开启翻译。
- 每完成一个功能批次，必须先验证，再单独提交 git。
- 产品定位聚焦“翻译即学习”，不把第一阶段做成 PDF/视频/会议/图片翻译全家桶。

## 当前项目基线

当前代码已经具备一个可推广产品的核心骨架：

- Manifest V3 扩展结构完整，有 background、content、popup、options、vocabulary、review 页面。
- 已有完整词库数据：CET4、CET6、GRE、IELTS、TOEFL。
- 已有学习闭环：查词、收藏、生词本、复习、词库进度、学习统计。
- 已有质量门禁：TypeScript、ESLint、Jest、Webpack build、zip 打包。
- 当前待提交工作树包含多项已经推进过的功能修复和增强，需要先作为“产品化基线”验证并提交。

## 竞品分析

### Immersive Translate

Immersive Translate 的公开定位是“Web、PDF、Video 的 AI 双语翻译工具”，官方页面强调网站翻译、PDF 保留排版、视频字幕、会议、图片、漫画翻译，并集成 20+ 翻译引擎和 100+ 语言对。它还强调双语网页布局、选词翻译、hover 翻译、输入框翻译，以及千万级用户规模。

来源：
- https://immersivetranslate.com/en/
- 关键页面信息：网页/PDF/视频/图片/漫画/会议翻译、20+ 引擎、100+ 语言对、双语网页翻译、选词翻译。

对本项目启发：
- 双语网页阅读是用户已经理解的强需求。
- 竞品规模和功能宽度很强，第一阶段不应该硬拼 PDF/视频/图片。
- 可借鉴“阅读流不中断”的体验，但差异化要放在学习闭环和考试词库上。

### DeepL for Chrome

DeepL Chrome 扩展强调高质量实时翻译、网页选中文本翻译、可编辑文本翻译、全页翻译和写作润色建议。DeepL 的优势是翻译质量、品牌信任和写作能力。

来源：
- https://www.deepl.com/en/chrome-extension
- 关键页面信息：浏览器内实时翻译网页与写作建议；选择网页文本即可翻译；DeepL Pro 解锁全页翻译等能力。

对本项目启发：
- “只做翻译质量”很难胜过 DeepL。
- 本项目应把翻译结果接入学习动作：加入生词、词库归类、复习安排、掌握度。
- 写作润色不是第一阶段核心，避免分散。

### Mate Translate

Mate 的定位是跨平台翻译应用，覆盖 iOS、macOS 和主流浏览器。官方强调 103 种语言、发音、跨平台同步、phrasebook、词性/同义词参考、轻量快捷的翻译体验。

来源：
- https://matetranslate.com/en
- 关键页面信息：103 languages、pronunciation、cross-platform sync、phrasebook、full reference。

对本项目启发：
- “保存短语/词组”和“跨设备同步”是推广时用户能理解的卖点。
- 当前项目已有 Chrome storage sync 和生词本基础，可以优先包装成“学习资产同步”。
- 语音和发音可作为后续增强，不放进第一阶段。

### Readlang

Readlang 的定位是“通过阅读学语言”。它强调网页阅读器、在线任意网页翻译、上传文本、上下文解释、flashcards、付费订阅，以及用户已翻译词数和文本数。

来源：
- https://readlang.com/
- 关键页面信息：Web Reader plugin、Context-aware explanations、Practice/export flashcards、统计数据、Premium 订阅。

对本项目启发：
- 本项目和 Readlang 最接近：网页阅读、查词、词汇积累、复习。
- 差异化可以是面向中文用户和考试词库：CET/GRE/IELTS/TOEFL 高亮与复习。
- 第一阶段应把“读网页时自动沉淀词汇”包装清楚，而不是只说“翻译插件”。

### Language Reactor

Language Reactor 在 Chrome Web Store 上定位为通过 Netflix、YouTube 和网页/书籍学习语言，强调双语字幕、popup dictionary、播放控制、导入文本、机器翻译和 TTS，并有教育类扩展、百万级用户规模。

来源：
- https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm
- 关键页面信息：dual language subtitles、popup dictionary、Books and Websites、machine translation、TTS、2,000,000 users。

对本项目启发：
- 视频字幕学习是大市场，但实现复杂且和当前代码耦合较远。
- 当前项目可以先守住“网页阅读学习”，之后再评估视频字幕插件化子模块。
- “真实材料学习”比“背单词软件”更有推广吸引力。

## Chrome Web Store 合规与推广要求

Chrome Web Store Program Policies 强调安全、诚实、有用、隐私保护、权限使用和披露要求。官方准备发布文档还明确列出上架前需要注册/设置开发者账户、创建高质量 listing、填写隐私字段、提供测试说明、管理反馈和商店数据分析。

来源：
- https://developer.chrome.com/docs/webstore/program-policies/
- https://developer.chrome.com/docs/webstore/prepare

产品化约束：
- 扩展说明必须清楚披露翻译会调用第三方翻译服务。
- 权限必须保持最小化，新增权限必须有用户可理解理由。
- 不加入默认遥测；如果后续需要统计，必须 opt-in 并有隐私说明。
- Listing、README、隐私政策、测试说明要和实际功能一致，不能夸大 PDF/视频/AI 能力。

## 推荐产品定位

推荐定位：LexiBridge Translate，面向中文用户的“网页翻译 + 词库学习 + 复习”浏览器扩展。

一句话卖点：

> 在真实网页里翻译、标记考试词汇，并把不认识的词沉淀到复习计划。

目标用户：

- 需要读英文网页、文档、技术资料的中文用户。
- 备考 CET4/CET6/GRE/IELTS/TOEFL 的学生。
- 希望边阅读边积累词汇，而不是单独打开背词软件的人。

非目标：

- 第一阶段不做 PDF 排版翻译、视频字幕、会议翻译、图片 OCR。
- 第一阶段不做多端原生 App。
- 第一阶段不做账号系统和云端后端。

## 可选路线

### 路线 A：翻译工具优先

优点：用户理解成本低，直接对标 Google Translate、DeepL、Immersive Translate。

缺点：翻译质量和功能宽度很难赢，推广文案容易变成同质化“网页翻译插件”。

结论：不推荐作为主线，只保留基础能力。

### 路线 B：翻译即学习优先

优点：与当前代码最匹配，能保留所有已有功能，并把词库、复习、统计变成清晰卖点。

缺点：需要把 onboarding、空状态、复习入口、词库说明做得更像产品。

结论：推荐作为第一阶段主线。

### 路线 C：资料/视频重度学习优先

优点：市场空间大，能对标 Immersive Translate 和 Language Reactor 的高价值场景。

缺点：PDF/视频/字幕解析会显著扩大工程面，短期不适合在当前脏工作树上继续叠。

结论：作为第二阶段探索，不进入第一阶段推广版本。

## 第一阶段产品化范围

### P0：提交当前产品化基线

范围：
- 验证当前已有修复：大词库、logo、手动触发翻译、悬浮按钮、复习与词库功能、消息通道。
- 全量通过 type-check、lint、Jest、production build、zip package。
- 提交当前已完成批次，避免继续在巨大未提交 diff 上叠功能。

验收：
- `tsc --noEmit` 通过。
- `eslint src --ext .ts,.js` 通过。
- `jest --runInBand --silent` 通过。
- `webpack --mode=production` 通过。
- `chrome-translation-extension.zip` 生成。
- git commit 完成。

### P1：产品包装与商店准备

范围：
- Manifest 名称、描述、default_title 从乱码/泛称改为可推广文案。
- README 改成面向用户和开发者都能读懂的产品页。
- 新增 `PRIVACY.md`，说明本地存储、Chrome sync、翻译 API 请求、无默认遥测。
- 新增 `RELEASE_CHECKLIST.md`，覆盖 Chrome Web Store listing、隐私字段、测试说明、截图清单、版本检查。
- 保留当前权限，不新增权限。

验收：
- manifest JSON 合法，build 成功。
- 文档无占位词。
- package 后 dist 中 manifest、README 相关说明一致。
- 提交 git：`docs/productize-release-basics` 或等价提交信息。

### P2：首次使用和空状态引导

范围：
- popup 顶部加入一句产品价值说明，不做营销页。
- 当没有生词或复习项时，显示明确空状态：选择词库、浏览英文网页、选词加入生词本。
- options 页解释每个词库用途和启用状态。
- 保持翻译必须由用户点击开启。

验收：
- 新增/更新 popup/options/review/vocabulary 测试。
- type-check、lint、相关 Jest、build 通过。
- 提交 git。

### P3：学习闭环强化

范围：
- popup 显示今日复习数量、已启用词库、最近收藏词。
- 选词翻译结果中突出“加入生词本”和“稍后复习”。
- review 页可从内置词库补充新词，保持已有复习算法。

验收：
- ReviewService、LearningMode、popup 测试覆盖。
- type-check、lint、Jest、build 通过。
- 提交 git。

### P4：商店素材与发布包

范围：
- 生成截图脚本或手工截图说明。
- 新增商店 listing 文案：短描述、详细描述、关键词、测试账号说明。
- 生成 release zip，并记录版本号。

验收：
- `chrome-translation-extension.zip` 存在且来自最新 build。
- `RELEASE_CHECKLIST.md` 勾选构建、测试、隐私、权限说明。
- 提交 git。

## 体验原则

- 默认不打扰：不自动翻译、不自动弹大面积蒙层。
- 用户可控：悬浮按钮是翻译开关；开启后按钮状态要明显，关闭立即恢复页面。
- 学习可见：每一次查词都应该能变成可复习资产。
- 不夸大能力：没有实现 PDF/视频/图片时，不在产品文案中写这些能力。
- 本地优先：学习数据默认保存在 Chrome storage，跨设备同步沿用 Chrome sync。

## 后续实施规则

- 每个功能批次先写测试或文档验收点，再改实现。
- 每个批次都要运行足够覆盖该批次的验证命令。
- 每个批次验证通过后立刻 git commit，再进入下一批。
- 不在一个提交里混入无关重构。
- 不为了推广删除或削弱现有功能。

## 自检

- 没有使用占位词。
- 已明确第一阶段不做 PDF、视频、会议、图片、账号系统。
- 已明确保留现有功能和手动翻译触发原则。
- 已明确每个批次的验证与提交要求。
- 已引用当前竞品和 Chrome Web Store 官方资料作为依据。
