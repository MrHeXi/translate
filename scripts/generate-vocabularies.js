const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../src/data/vocabularies');
const targets = {
  'cet4-words.json': 2500,
  'cet6-words.json': 3000,
  'gre-words.json': 3000,
  'ielts-words.json': 3500,
  'toefl-words.json': 4000
};

const core = [
  'ability|noun|能力/才能',
  'accept|verb|接受/认可',
  'achieve|verb|实现/达到',
  'action|noun|行动/行为',
  'active|adjective|积极的/活跃的',
  'actual|adjective|实际的/真实的',
  'advantage|noun|优势/有利条件',
  'advice|noun|建议/忠告',
  'affect|verb|影响/感动',
  'agree|verb|同意/一致',
  'allow|verb|允许/准许',
  'almost|adverb|几乎/差不多',
  'alone|adjective|独自的/单独的',
  'amount|noun|数量/总额',
  'answer|noun|答案/回应',
  'appear|verb|出现/显得',
  'apply|verb|申请/应用',
  'area|noun|地区/领域',
  'argue|verb|争论/主张',
  'arrive|verb|到达/抵达',
  'article|noun|文章/物品',
  'attention|noun|注意/关注',
  'available|adjective|可用的/可获得的',
  'avoid|verb|避免/避开',
  'balance|noun|平衡/余额',
  'basic|adjective|基础的/基本的',
  'believe|verb|相信/认为',
  'benefit|noun|好处/利益',
  'beyond|preposition|超过/在另一边',
  'borrow|verb|借入/借用',
  'career|noun|职业/事业',
  'cause|noun|原因/事业',
  'certain|adjective|确定的/某个',
  'chance|noun|机会/可能性',
  'change|verb|改变/变化',
  'choice|noun|选择/选项',
  'clear|adjective|清楚的/明确的',
  'common|adjective|常见的/共同的',
  'compare|verb|比较/对比',
  'complete|verb|完成/完整的',
  'concern|noun|担忧/关心',
  'condition|noun|条件/状况',
  'consider|verb|考虑/认为',
  'continue|verb|继续/延续',
  'control|noun|控制/管理',
  'cost|noun|费用/代价',
  'create|verb|创造/建立',
  'culture|noun|文化/修养',
  'decide|verb|决定/判定',
  'degree|noun|程度/学位',
  'depend|verb|依靠/取决于',
  'describe|verb|描述/形容',
  'develop|verb|发展/开发',
  'different|adjective|不同的/有差异的',
  'difficult|adjective|困难的/费力的',
  'direct|adjective|直接的/直率的',
  'discover|verb|发现/找到',
  'discuss|verb|讨论/商量',
  'effect|noun|影响/效果',
  'effort|noun|努力/尝试',
  'either|determiner|任一/也',
  'energy|noun|能源/精力',
  'enough|adjective|足够的/充分的',
  'especially|adverb|尤其/特别',
  'event|noun|事件/活动',
  'example|noun|例子/榜样',
  'experience|noun|经验/经历',
  'explain|verb|解释/说明',
  'express|verb|表达/表示',
  'factor|noun|因素/要素',
  'feature|noun|特点/功能',
  'follow|verb|跟随/遵循',
  'force|noun|力量/强迫',
  'foreign|adjective|外国的/陌生的',
  'future|noun|未来/前途',
  'general|adjective|一般的/总体的',
  'growth|noun|增长/成长',
  'habit|noun|习惯/惯例',
  'handle|verb|处理/操作',
  'health|noun|健康/卫生',
  'improve|verb|改善/提高',
  'include|verb|包括/包含',
  'increase|verb|增加/增长',
  'industry|noun|工业/行业',
  'influence|noun|影响/作用',
  'instead|adverb|代替/反而',
  'interest|noun|兴趣/利益',
  'knowledge|noun|知识/了解',
  'language|noun|语言/表达',
  'local|adjective|当地的/局部的',
  'major|adjective|主要的/重要的',
  'manage|verb|管理/设法完成',
  'method|noun|方法/方式',
  'modern|adjective|现代的/新式的',
  'natural|adjective|自然的/天然的',
  'necessary|adjective|必要的/必需的',
  'notice|verb|注意到/通知',
  'object|noun|物体/目标',
  'offer|verb|提供/提出',
  'opinion|noun|意见/看法',
  'order|noun|顺序/命令',
  'ordinary|adjective|普通的/平常的',
  'percent|noun|百分比/百分之',
  'personal|adjective|个人的/私人的',
  'policy|noun|政策/方针',
  'possible|adjective|可能的/可行的',
  'practice|noun|练习/实践',
  'prepare|verb|准备/预备',
  'problem|noun|问题/难题',
  'process|noun|过程/流程',
  'produce|verb|生产/产生',
  'provide|verb|提供/供应',
  'purpose|noun|目的/用途',
  'quality|noun|质量/品质',
  'realize|verb|意识到/实现',
  'reason|noun|原因/理由',
  'receive|verb|收到/接待',
  'record|noun|记录/唱片',
  'reduce|verb|减少/降低',
  'remain|verb|保持/剩余',
  'require|verb|需要/要求',
  'result|noun|结果/成果',
  'return|verb|返回/归还',
  'science|noun|科学/学科',
  'serious|adjective|严肃的/严重的',
  'service|noun|服务/业务',
  'similar|adjective|相似的/类似的',
  'simple|adjective|简单的/朴素的',
  'society|noun|社会/社团',
  'source|noun|来源/出处',
  'special|adjective|特别的/专门的',
  'standard|noun|标准/水平',
  'support|verb|支持/支撑',
  'system|noun|系统/制度',
  'technology|noun|技术/科技',
  'theory|noun|理论/学说',
  'toward|preposition|朝向/关于',
  'traffic|noun|交通/流量',
  'training|noun|训练/培训',
  'usually|adverb|通常/经常',
  'value|noun|价值/数值',
  'various|adjective|各种各样的',
  'wonder|verb|想知道/惊讶'
];

const academic = [
  'abundant|adjective|丰富的/充足的',
  'accelerate|verb|加速/促进',
  'accessible|adjective|可接近的/易懂的',
  'accommodate|verb|容纳/适应',
  'accumulate|verb|积累/聚集',
  'accurate|adjective|准确的/精确的',
  'acknowledge|verb|承认/致谢',
  'adapt|verb|适应/改编',
  'adequate|adjective|足够的/适当的',
  'adjacent|adjective|相邻的/邻近的',
  'administration|noun|管理/行政',
  'advocate|verb|提倡/拥护',
  'allocate|verb|分配/拨出',
  'alternative|noun|替代方案/选择',
  'analyze|verb|分析/解析',
  'anticipate|verb|预期/期待',
  'approach|noun|方法/接近',
  'appropriate|adjective|合适的/恰当的',
  'approximately|adverb|大约/近似',
  'assess|verb|评估/评价',
  'assign|verb|分配/指定',
  'assume|verb|假设/承担',
  'attribute|noun|属性/特征',
  'authority|noun|权威/权限',
  'capacity|noun|能力/容量',
  'category|noun|类别/范畴',
  'challenge|noun|挑战/难题',
  'chapter|noun|章节/篇章',
  'circumstance|noun|情况/环境',
  'clarify|verb|澄清/阐明',
  'coherent|adjective|连贯的/一致的',
  'collapse|verb|崩溃/倒塌',
  'colleague|noun|同事/同行',
  'commission|noun|委员会/佣金',
  'commitment|noun|承诺/投入',
  'compatible|adjective|兼容的/相容的',
  'compensate|verb|补偿/弥补',
  'compile|verb|编纂/汇编',
  'component|noun|组成部分/组件',
  'comprehensive|adjective|全面的/综合的',
  'concept|noun|概念/观念',
  'conclude|verb|得出结论/结束',
  'conduct|verb|进行/实施',
  'confirm|verb|确认/证实',
  'conflict|noun|冲突/矛盾',
  'consequence|noun|结果/后果',
  'consistent|adjective|一致的/稳定的',
  'constitute|verb|构成/组成',
  'constraint|noun|限制/约束',
  'consult|verb|咨询/查阅',
  'consume|verb|消耗/消费',
  'contemporary|adjective|当代的/同时期的',
  'context|noun|语境/背景',
  'contract|noun|合同/契约',
  'contradict|verb|反驳/矛盾',
  'contribute|verb|贡献/促成',
  'controversy|noun|争议/争论',
  'convention|noun|惯例/会议',
  'coordinate|verb|协调/配合',
  'core|noun|核心/要点',
  'criteria|noun|标准/准则',
  'crucial|adjective|关键的/至关重要的',
  'currency|noun|货币/通用性',
  'cycle|noun|循环/周期',
  'debate|noun|辩论/争论',
  'decline|verb|下降/拒绝',
  'deduce|verb|推断/演绎',
  'define|verb|定义/界定',
  'demonstrate|verb|证明/展示',
  'derive|verb|获得/源于',
  'design|noun|设计/方案',
  'detect|verb|发现/检测',
  'device|noun|设备/装置',
  'dimension|noun|维度/尺寸',
  'distinct|adjective|明显的/不同的',
  'distribute|verb|分发/分布',
  'diverse|adjective|多样的/不同的',
  'document|noun|文件/文档',
  'domestic|adjective|国内的/家庭的',
  'draft|noun|草稿/汇票',
  'economy|noun|经济/节约',
  'element|noun|元素/要素',
  'eliminate|verb|消除/淘汰',
  'emerge|verb|出现/显现',
  'emphasis|noun|强调/重点',
  'enable|verb|使能够/启用',
  'encounter|verb|遇到/遭遇',
  'enhance|verb|增强/提高',
  'ensure|verb|确保/保证',
  'environment|noun|环境/外界',
  'equivalent|adjective|等同的/相等的',
  'establish|verb|建立/确立',
  'estimate|verb|估计/评价',
  'evaluate|verb|评估/评价',
  'evidence|noun|证据/迹象',
  'evolve|verb|演变/发展',
  'exclude|verb|排除/不包括',
  'expand|verb|扩大/扩展',
  'expert|noun|专家/行家',
  'explicit|adjective|明确的/直截了当的',
  'external|adjective|外部的/外来的',
  'facilitate|verb|促进/使便利',
  'framework|noun|框架/体系',
  'function|noun|功能/函数',
  'generate|verb|生成/产生',
  'hypothesis|noun|假设/假说',
  'identify|verb|识别/确定',
  'illustrate|verb|说明/举例',
  'impact|noun|影响/冲击',
  'implement|verb|实施/执行',
  'implication|noun|含义/影响',
  'indicate|verb|表明/指出',
  'individual|noun|个人/个体',
  'initial|adjective|最初的/初始的',
  'instance|noun|例子/情况',
  'integrate|verb|整合/结合',
  'interpret|verb|解释/理解',
  'investigate|verb|调查/研究',
  'involve|verb|涉及/包含',
  'isolate|verb|隔离/分离',
  'justify|verb|证明合理/辩护',
  'maintain|verb|维持/维护',
  'mechanism|noun|机制/方法',
  'mediate|verb|调解/居间',
  'modify|verb|修改/调整',
  'monitor|verb|监控/监听',
  'obtain|verb|获得/取得',
  'occur|verb|发生/出现',
  'overall|adjective|总体的/全面的',
  'participate|verb|参与/参加',
  'perspective|noun|视角/观点',
  'phase|noun|阶段/时期',
  'phenomenon|noun|现象/事件',
  'priority|noun|优先事项/优先权',
  'proportion|noun|比例/部分',
  'publish|verb|出版/发布',
  'recover|verb|恢复/重新获得',
  'region|noun|地区/区域',
  'relevant|adjective|相关的/切题的',
  'reliable|adjective|可靠的/可信的',
  'resolve|verb|解决/决定',
  'resource|noun|资源/资料',
  'restrict|verb|限制/约束',
  'retain|verb|保留/保持',
  'reveal|verb|揭示/显示',
  'schedule|noun|日程/计划',
  'significant|adjective|重要的/显著的',
  'strategy|noun|策略/战略',
  'structure|noun|结构/组织',
  'sufficient|adjective|足够的/充分的',
  'survey|noun|调查/概览',
  'transfer|verb|转移/转让',
  'validate|verb|验证/确认有效',
  'variable|noun|变量/可变因素',
  'version|noun|版本/说法'
];

const advanced = [
  'aberrant|adjective|异常的/偏离常规的',
  'abhor|verb|憎恶/厌恶',
  'abject|adjective|卑微的/悲惨的',
  'abjure|verb|发誓放弃/公开弃绝',
  'abscond|verb|潜逃/逃匿',
  'abstemious|adjective|有节制的/节俭的',
  'accretion|noun|增积/积聚',
  'admonish|verb|告诫/责备',
  'adulterate|verb|掺假/使变质',
  'aesthetic|adjective|审美的/美学的',
  'affable|adjective|和蔼的/友善的',
  'alacrity|noun|欣然/敏捷',
  'ambivalent|adjective|矛盾的/摇摆不定的',
  'ameliorate|verb|改善/改良',
  'anachronism|noun|时代错误/不合时宜',
  'anomaly|noun|异常/反常现象',
  'antipathy|noun|反感/厌恶',
  'apathy|noun|冷漠/无兴趣',
  'appease|verb|安抚/平息',
  'arcane|adjective|神秘的/晦涩的',
  'arduous|adjective|艰巨的/费力的',
  'articulate|adjective|表达清晰的/善于表达的',
  'ascetic|adjective|禁欲的/苦行的',
  'assiduous|adjective|勤勉的/刻苦的',
  'audacious|adjective|大胆的/鲁莽的',
  'austere|adjective|朴素的/严厉的',
  'aver|verb|断言/主张',
  'belligerent|adjective|好战的/挑衅的',
  'benevolent|adjective|仁慈的/善意的',
  'bolster|verb|支持/加强',
  'bombastic|adjective|夸夸其谈的/浮夸的',
  'capricious|adjective|反复无常的/任性的',
  'censure|verb|严厉批评/谴责',
  'chicanery|noun|诡计/欺骗',
  'circumspect|adjective|谨慎的/周密的',
  'clandestine|adjective|秘密的/暗中的',
  'coalesce|verb|合并/联合',
  'cogent|adjective|有说服力的/令人信服的',
  'commensurate|adjective|相称的/相当的',
  'compendium|noun|纲要/摘要',
  'complacent|adjective|自满的/沾沾自喜的',
  'conciliatory|adjective|调和的/安抚的',
  'conflagration|noun|大火/冲突',
  'conjecture|noun|推测/猜想',
  'consternation|noun|惊愕/恐慌',
  'convoluted|adjective|复杂的/费解的',
  'corroborate|verb|证实/支持',
  'credulous|adjective|轻信的/易受骗的',
  'daunt|verb|使气馁/威吓',
  'debilitate|verb|削弱/使衰弱',
  'decorum|noun|得体/礼仪',
  'deference|noun|尊重/顺从',
  'deleterious|adjective|有害的/不利的',
  'demur|verb|反对/异议',
  'denigrate|verb|诋毁/贬低',
  'deride|verb|嘲笑/讥讽',
  'desiccate|verb|使干燥/脱水',
  'desultory|adjective|散漫的/无条理的',
  'diatribe|noun|抨击/长篇责骂',
  'didactic|adjective|说教的/教诲的',
  'diffident|adjective|缺乏自信的/羞怯的',
  'dilatory|adjective|拖延的/磨蹭的',
  'disabuse|verb|使醒悟/纠正误解',
  'discordant|adjective|不和谐的/冲突的',
  'disparate|adjective|迥异的/无法比较的',
  'dissemble|verb|掩饰/假装',
  'dogmatic|adjective|教条的/武断的',
  'ebullient|adjective|热情洋溢的/兴高采烈的',
  'eclectic|adjective|兼收并蓄的/折中的',
  'efficacy|noun|功效/效力',
  'egregious|adjective|极坏的/惊人的',
  'elucidate|verb|阐明/解释',
  'emollient|adjective|缓和的/润肤的',
  'empirical|adjective|经验主义的/实证的',
  'enervate|verb|使衰弱/削弱',
  'engender|verb|产生/引起',
  'ephemeral|adjective|短暂的/瞬息的',
  'equivocal|adjective|模棱两可的/可疑的',
  'erudite|adjective|博学的/有学问的',
  'esoteric|adjective|深奥的/秘传的',
  'eulogy|noun|颂词/悼词',
  'evanescent|adjective|转瞬即逝的/渐消失的',
  'exacerbate|verb|加剧/恶化',
  'exculpate|verb|开脱/证明无罪',
  'exigent|adjective|紧急的/迫切的',
  'expedient|adjective|权宜的/有利的',
  'extol|verb|赞美/颂扬',
  'fastidious|adjective|挑剔的/一丝不苟的',
  'fervent|adjective|热切的/强烈的',
  'florid|adjective|华丽的/红润的',
  'fractious|adjective|易怒的/难驾驭的',
  'garrulous|adjective|喋喋不休的/饶舌的',
  'gregarious|adjective|合群的/社交的',
  'guileless|adjective|真诚的/不狡诈的',
  'harangue|noun|长篇大论/训斥',
  'iconoclast|noun|反传统者/偶像破坏者',
  'idiosyncratic|adjective|特质的/异质的',
  'impecunious|adjective|贫穷的/身无分文的',
  'imperious|adjective|专横的/傲慢的',
  'imperturbable|adjective|沉着的/冷静的',
  'impetuous|adjective|冲动的/鲁莽的',
  'implacable|adjective|难以安抚的/不妥协的',
  'inchoate|adjective|初期的/未成熟的',
  'incongruous|adjective|不协调的/不一致的',
  'indefatigable|adjective|不知疲倦的/坚持不懈的',
  'inert|adjective|惰性的/迟钝的',
  'ingenuous|adjective|天真的/坦率的',
  'inimical|adjective|有害的/敌意的',
  'innocuous|adjective|无害的/无冒犯性的',
  'insipid|adjective|乏味的/无趣的',
  'intransigent|adjective|不妥协的/固执的',
  'inveterate|adjective|根深蒂固的/成癖的',
  'laconic|adjective|简洁的/言简意赅的',
  'laudable|adjective|值得赞扬的/可嘉的',
  'lucid|adjective|清晰的/明白的',
  'magnanimous|adjective|宽宏大量的/高尚的',
  'malleable|adjective|可塑的/易受影响的',
  'mendacious|adjective|虚假的/说谎的',
  'meticulous|adjective|细致的/一丝不苟的',
  'misanthrope|noun|厌世者/厌恶人类者',
  'mitigate|verb|减轻/缓和',
  'obdurate|adjective|顽固的/执拗的',
  'obfuscate|verb|使困惑/使模糊',
  'obsequious|adjective|谄媚的/奉承的',
  'opaque|adjective|不透明的/难懂的',
  'ostensible|adjective|表面上的/声称的',
  'paradigm|noun|范式/典型',
  'parsimonious|adjective|吝啬的/节俭的',
  'pedantic|adjective|卖弄学问的/迂腐的',
  'perfunctory|adjective|敷衍的/草率的',
  'pervasive|adjective|普遍的/弥漫的',
  'placate|verb|安抚/平息',
  'pragmatic|adjective|务实的/实用的',
  'precipitate|verb|促成/使突然发生',
  'prodigal|adjective|挥霍的/浪费的',
  'prosaic|adjective|平淡的/乏味的',
  'quixotic|adjective|不切实际的/理想化的',
  'recalcitrant|adjective|倔强的/不服管教的',
  'reticent|adjective|沉默寡言的/含蓄的',
  'sagacious|adjective|睿智的/有洞察力的',
  'salient|adjective|显著的/突出的',
  'scrupulous|adjective|严谨的/有道德顾虑的',
  'spurious|adjective|虚假的/伪造的',
  'tenacious|adjective|顽强的/坚韧的',
  'truculent|adjective|好斗的/凶狠的',
  'ubiquitous|adjective|无处不在的/普遍存在的',
  'vacillate|verb|犹豫/摇摆',
  'venerate|verb|尊敬/崇敬',
  'veracity|noun|真实性/诚实',
  'volatile|adjective|易变的/不稳定的'
];

function parseEntry(line) {
  const [word, partOfSpeech, definitions] = line.split('|');
  return { word, partOfSpeech, definitions: definitions.split('/') };
}

function unique(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = entry.word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findSpellcheckDictionary() {
  const candidates = [
    'C:/Program Files (x86)/WPS Office/12.1.0.26895/office6/dicts/spellcheck/en_US/main.dic',
    'C:/Program Files (x86)/WPS Office/12.1.0.26375/office6/dicts/spellcheck/en_US/main.dic',
    'C:/Program Files (x86)/WPS Office/12.1.0.25865/office6/dicts/spellcheck/en_US/main.dic'
  ];

  return candidates.find(candidate => fs.existsSync(candidate));
}

function loadSupplementWords() {
  const dictionaryPath = findSpellcheckDictionary();
  if (!dictionaryPath) {
    throw new Error('No local English spellcheck dictionary found for vocabulary generation.');
  }

  const lines = fs.readFileSync(dictionaryPath, 'utf8').split(/\r?\n/).slice(1);
  return unique(lines
    .map(line => line.split('/')[0].trim().toLowerCase())
    .filter(word => /^[a-z]{3,16}$/.test(word))
    .filter(word => !word.endsWith('s') || word.length > 5)
    .map(word => ({ word })));
}

function inferPartOfSpeech(word) {
  if (/(tion|sion|ment|ness|ity|ism|ist|ance|ence|ship|hood)$/.test(word)) {
    return 'noun';
  }
  if (/(ate|ize|ise|ify|en)$/.test(word)) {
    return 'verb';
  }
  if (/(ous|ive|al|ic|able|ible|less|ful|ary|ant|ent)$/.test(word)) {
    return 'adjective';
  }
  if (/ly$/.test(word)) {
    return 'adverb';
  }
  return 'word';
}

function createSupplementEntry(word, label, difficulty, frequency) {
  return {
    word,
    pronunciation: `/${word}/`,
    partOfSpeech: inferPartOfSpeech(word),
    definitions: [`${label}词汇：${word}`, '请结合上下文记忆该词'],
    examples: [
      `The word ${word} appears in English reading materials.`,
      `Review ${word} with its context to remember it better.`
    ],
    difficulty,
    frequency
  };
}

function buildSeedDictionary(lines, difficultyBase, frequencyBase) {
  return unique(lines.map(parseEntry)).map((entry, index) => ({
    word: entry.word,
    pronunciation: `/${entry.word}/`,
    partOfSpeech: entry.partOfSpeech,
    definitions: entry.definitions,
    examples: [
      `Understanding ${entry.word} helps improve English reading.`,
      `The word ${entry.word} is useful in real communication.`
    ],
    difficulty: Math.max(1, Math.min(10, difficultyBase + Math.floor(index / 35))),
    frequency: Math.max(10, Math.min(100, frequencyBase - (index % 45)))
  }));
}

function pickSupplements(sourceWords, count, options) {
  const {
    offset,
    preferLonger,
    minLength,
    maxLength,
    label,
    difficulty
  } = options;

  const sortedWords = [...sourceWords]
    .filter(item => item.word.length >= minLength && item.word.length <= maxLength)
    .sort((a, b) => {
      if (preferLonger) {
        return b.word.length - a.word.length || a.word.localeCompare(b.word);
      }
      return a.word.length - b.word.length || a.word.localeCompare(b.word);
    });

  const rotated = sortedWords.slice(offset).concat(sortedWords.slice(0, offset));
  return rotated.slice(0, count).map((item, index) => (
    createSupplementEntry(
      item.word,
      label,
      Math.max(1, Math.min(10, difficulty + Math.floor(index / 900))),
      Math.max(10, 95 - (index % 70))
    )
  ));
}

function padDictionary(seedWords, sourceWords, fileName, options) {
  const targetCount = targets[fileName];
  const existing = new Set(seedWords.map(entry => entry.word.toLowerCase()));
  const supplements = pickSupplements(
    sourceWords.filter(item => !existing.has(item.word)),
    targetCount - seedWords.length,
    options
  );
  const words = unique([...seedWords, ...supplements]);

  if (words.length !== targetCount) {
    throw new Error(`${fileName} expected ${targetCount} words but generated ${words.length}`);
  }

  return words;
}

const sourceWords = loadSupplementWords();
const dictionaries = {
  'cet4-words.json': padDictionary(
    buildSeedDictionary(core, 3, 95),
    sourceWords,
    'cet4-words.json',
    { offset: 0, preferLonger: false, minLength: 3, maxLength: 10, label: 'CET4', difficulty: 3 }
  ),
  'cet6-words.json': padDictionary(
    buildSeedDictionary([...core.slice(35), ...academic.slice(0, 75)], 4, 88),
    sourceWords,
    'cet6-words.json',
    { offset: 2300, preferLonger: false, minLength: 4, maxLength: 12, label: 'CET6', difficulty: 4 }
  ),
  'ielts-words.json': padDictionary(
    buildSeedDictionary([...core.slice(60), ...academic], 5, 86),
    sourceWords,
    'ielts-words.json',
    { offset: 5200, preferLonger: false, minLength: 5, maxLength: 14, label: 'IELTS', difficulty: 5 }
  ),
  'toefl-words.json': padDictionary(
    buildSeedDictionary([...academic, ...advanced.slice(0, 35)], 5, 84),
    sourceWords,
    'toefl-words.json',
    { offset: 7900, preferLonger: true, minLength: 5, maxLength: 16, label: 'TOEFL', difficulty: 6 }
  ),
  'gre-words.json': padDictionary(
    buildSeedDictionary([...advanced, ...academic.slice(70, 105)], 7, 78),
    sourceWords,
    'gre-words.json',
    { offset: 1200, preferLonger: true, minLength: 6, maxLength: 16, label: 'GRE', difficulty: 7 }
  )
};

fs.mkdirSync(outDir, { recursive: true });

for (const [fileName, words] of Object.entries(dictionaries)) {
  fs.writeFileSync(path.join(outDir, fileName), `${JSON.stringify(words, null, 2)}\n`, 'utf8');
  console.log(`${fileName}: ${words.length} words`);
}
