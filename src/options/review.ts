// 复习页面脚本

interface ReviewItem {
  word: string;
  translation: string;
  context: string;
  sourceUrl: string;
  addedDate: Date;
  reviewCount: number;
  masteryLevel: number;
  nextReviewDate: Date;
}

interface ReviewResult {
  word: string;
  translation: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  responseTime: number;
}

class ReviewController {
  private reviewItems: ReviewItem[] = [];
  private currentIndex: number = 0;
  private reviewResults: ReviewResult[] = [];
  private startTime: number = 0;
  private currentQuestionStartTime: number = 0;
  private reviewType: string = 'due';
  private reviewMode: string = 'recognition';
  private reviewCount: number = 20;
  private isReviewActive: boolean = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // 绑定事件监听器
    this.bindEventListeners();
    
    // 检查URL参数（是否指定了特定单词）
    this.checkUrlParameters();
    
    // 加载复习数据
    await this.loadReviewData();
  }

  private bindEventListeners(): void {
    // 返回按钮
    const backBtn = document.getElementById('backBtn');
    backBtn?.addEventListener('click', () => {
      if (this.isReviewActive) {
        if (confirm('复习正在进行中，确定要退出吗？')) {
          window.history.back();
        }
      } else {
        window.history.back();
      }
    });

    // 复习设置
    const startReview = document.getElementById('startReview');
    startReview?.addEventListener('click', () => this.startReview());

    const cancelReview = document.getElementById('cancelReview');
    cancelReview?.addEventListener('click', () => window.history.back());

    // 复习类型变化
    const reviewTypeRadios = document.querySelectorAll('input[name="reviewType"]');
    reviewTypeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.reviewType = (e.target as HTMLInputElement).value;
        this.updateDueCount();
      });
    });

    // 复习模式变化
    const reviewModeRadios = document.querySelectorAll('input[name="reviewMode"]');
    reviewModeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.reviewMode = (e.target as HTMLInputElement).value;
      });
    });

    // 复习数量变化
    const reviewCountInput = document.getElementById('reviewCount') as HTMLInputElement;
    reviewCountInput?.addEventListener('change', (e) => {
      this.reviewCount = parseInt((e.target as HTMLInputElement).value) || 20;
    });

    // 复习界面事件
    const showAnswer = document.getElementById('showAnswer');
    showAnswer?.addEventListener('click', () => this.showAnswer());

    const nextCard = document.getElementById('nextCard');
    nextCard?.addEventListener('click', () => this.nextCard());

    const checkAnswer = document.getElementById('checkAnswer');
    checkAnswer?.addEventListener('click', () => this.checkUserAnswer());

    const userAnswer = document.getElementById('userAnswer') as HTMLInputElement;
    userAnswer?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.checkUserAnswer();
      }
    });

    // 难度按钮
    const difficultyButtons = document.querySelectorAll('.difficulty-btn');
    difficultyButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const difficulty = (e.target as HTMLButtonElement).dataset['difficulty'] as 'easy' | 'medium' | 'hard';
        this.setDifficulty(difficulty);
      });
    });

    // 复习控制
    const pauseReview = document.getElementById('pauseReview');
    pauseReview?.addEventListener('click', () => this.pauseReview());

    const skipCard = document.getElementById('skipCard');
    skipCard?.addEventListener('click', () => this.skipCard());

    const endReview = document.getElementById('endReview');
    endReview?.addEventListener('click', () => this.endReview());

    // 结果页面事件
    const reviewIncorrect = document.getElementById('reviewIncorrect');
    reviewIncorrect?.addEventListener('click', () => this.reviewIncorrectWords());

    const backToVocabulary = document.getElementById('backToVocabulary');
    backToVocabulary?.addEventListener('click', () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/options/vocabulary.html')
      });
    });

    const startNewReview = document.getElementById('startNewReview');
    startNewReview?.addEventListener('click', () => this.resetReview());

    // 结果标签页切换
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        const tabId = target.dataset['tab'];
        if (tabId) {
          this.switchResultTab(tabId);
        }
      });
    });
  }

  private checkUrlParameters(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const specificWord = urlParams.get('word');
    
    if (specificWord) {
      // 如果指定了特定单词，直接开始复习该单词
      this.reviewType = 'specific';
      this.reviewCount = 1;
    }
  }

  private async loadReviewData(): Promise<void> {
    try {
      // 加载到期复习数量
      await this.updateDueCount();
    } catch (error) {
      console.error('加载复习数据失败:', error);
    }
  }

  private async updateDueCount(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getDueReviewCount' });
      if (response.success) {
        const dueCountElement = document.getElementById('dueCount');
        if (dueCountElement) {
          dueCountElement.textContent = response.data.toString();
        }
      }
    } catch (error) {
      console.error('更新到期复习数量失败:', error);
    }
  }

  private async startReview(): Promise<void> {
    try {
      // 获取复习词汇
      const response = await this.sendMessage({
        action: 'getReviewItems',
        data: {
          type: this.reviewType,
          count: this.reviewCount,
          mode: this.reviewMode
        }
      });

      if (response.success && response.data.length > 0) {
        this.reviewItems = response.data;
        this.currentIndex = 0;
        this.reviewResults = [];
        this.startTime = Date.now();
        this.isReviewActive = true;

        // 切换到复习界面
        this.showReviewInterface();
        this.showCurrentCard();
      } else {
        alert('没有找到需要复习的词汇');
      }
    } catch (error) {
      console.error('开始复习失败:', error);
      alert('开始复习失败，请重试');
    }
  }

  private showReviewInterface(): void {
    // 隐藏设置界面，显示复习界面
    const setupSection = document.getElementById('reviewSetup');
    const reviewSection = document.getElementById('reviewInterface');
    
    if (setupSection) setupSection.style.display = 'none';
    if (reviewSection) reviewSection.style.display = 'block';

    // 更新进度显示
    this.updateProgress();
  }

  private showCurrentCard(): void {
    if (this.currentIndex >= this.reviewItems.length) {
      this.completeReview();
      return;
    }

    const currentItem = this.reviewItems[this.currentIndex];
    if (!currentItem) {
      console.error('当前复习项为空');
      return;
    }

    this.currentQuestionStartTime = Date.now();

    // 更新卡片内容
    const wordElement = document.getElementById('currentWord');
    const contextElement = document.getElementById('wordContext');
    const answerSection = document.getElementById('answerSection');
    const inputSection = document.getElementById('inputSection');
    const userAnswerInput = document.getElementById('userAnswer') as HTMLInputElement;

    if (wordElement) wordElement.textContent = currentItem.word;
    if (contextElement) contextElement.textContent = currentItem.context || '无上下文';

    // 根据复习模式显示不同界面
    if (this.reviewMode === 'recognition') {
      // 识别模式：显示单词，用户选择是否认识
      if (answerSection) answerSection.style.display = 'none';
      if (inputSection) inputSection.style.display = 'none';
      
      const showAnswerBtn = document.getElementById('showAnswer');
      if (showAnswerBtn) showAnswerBtn.style.display = 'block';
    } else {
      // 拼写模式：用户输入翻译
      if (answerSection) answerSection.style.display = 'none';
      if (inputSection) inputSection.style.display = 'block';
      if (userAnswerInput) {
        userAnswerInput.value = '';
        userAnswerInput.focus();
      }
    }

    this.updateProgress();
  }

  private showAnswer(): void {
    const currentItem = this.reviewItems[this.currentIndex];
    if (!currentItem) {
      console.error('当前复习项为空');
      return;
    }

    const answerSection = document.getElementById('answerSection');
    const correctAnswer = document.getElementById('correctAnswer');
    const showAnswerBtn = document.getElementById('showAnswer');

    if (correctAnswer) correctAnswer.textContent = currentItem.translation;
    if (answerSection) answerSection.style.display = 'block';
    if (showAnswerBtn) showAnswerBtn.style.display = 'none';
  }

  private checkUserAnswer(): void {
    const userAnswerInput = document.getElementById('userAnswer') as HTMLInputElement;
    const currentItem = this.reviewItems[this.currentIndex];
    
    if (!userAnswerInput || !currentItem) {
      console.error('用户输入框或当前复习项为空');
      return;
    }

    const userAnswer = userAnswerInput.value.trim();
    const correctAnswer = currentItem.translation;
    const isCorrect = this.isAnswerCorrect(userAnswer, correctAnswer);
    const responseTime = Date.now() - this.currentQuestionStartTime;

    // 记录结果
    const result: ReviewResult = {
      word: currentItem.word,
      translation: correctAnswer,
      userAnswer: userAnswer,
      correctAnswer: correctAnswer,
      isCorrect: isCorrect,
      difficulty: null,
      responseTime: responseTime
    };

    this.reviewResults.push(result);

    // 显示答案和反馈
    this.showAnswerFeedback(isCorrect, correctAnswer);
  }

  private isAnswerCorrect(userAnswer: string, correctAnswer: string): boolean {
    // 简单的答案匹配逻辑，可以根据需要扩展
    const normalizedUser = userAnswer.toLowerCase().trim();
    const normalizedCorrect = correctAnswer.toLowerCase().trim();
    
    // 检查完全匹配或包含关系
    return normalizedUser === normalizedCorrect || 
           normalizedCorrect.includes(normalizedUser) ||
           normalizedUser.includes(normalizedCorrect);
  }

  private showAnswerFeedback(isCorrect: boolean, correctAnswer: string): void {
    const feedbackElement = document.getElementById('answerFeedback');
    const correctAnswerElement = document.getElementById('correctAnswer');
    const inputSection = document.getElementById('inputSection');
    const answerSection = document.getElementById('answerSection');

    if (correctAnswerElement) correctAnswerElement.textContent = correctAnswer;
    if (inputSection) inputSection.style.display = 'none';
    if (answerSection) answerSection.style.display = 'block';

    if (feedbackElement) {
      feedbackElement.textContent = isCorrect ? '✓ 正确！' : '✗ 错误';
      feedbackElement.className = isCorrect ? 'feedback correct' : 'feedback incorrect';
      feedbackElement.style.display = 'block';
    }
  }

  private setDifficulty(difficulty: 'easy' | 'medium' | 'hard'): void {
    if (this.reviewResults.length > 0) {
      const lastResult = this.reviewResults[this.reviewResults.length - 1];
      if (lastResult) {
        lastResult.difficulty = difficulty;
      }
    }
    
    // 继续下一张卡片
    this.nextCard();
  }

  private nextCard(): void {
    this.currentIndex++;
    
    // 隐藏反馈
    const feedbackElement = document.getElementById('answerFeedback');
    if (feedbackElement) feedbackElement.style.display = 'none';
    
    this.showCurrentCard();
  }

  private skipCard(): void {
    // 记录跳过的结果
    const currentItem = this.reviewItems[this.currentIndex];
    if (!currentItem) {
      console.error('当前复习项为空');
      return;
    }

    const result: ReviewResult = {
      word: currentItem.word,
      translation: currentItem.translation,
      userAnswer: '',
      correctAnswer: currentItem.translation,
      isCorrect: false,
      difficulty: null,
      responseTime: Date.now() - this.currentQuestionStartTime
    };
    
    this.reviewResults.push(result);
    this.nextCard();
  }

  private pauseReview(): void {
    const pauseBtn = document.getElementById('pauseReview');
    
    if (this.isReviewActive) {
      this.isReviewActive = false;
      if (pauseBtn) pauseBtn.textContent = '继续复习';
      
      // 可以添加暂停逻辑，比如隐藏当前卡片
    } else {
      this.isReviewActive = true;
      if (pauseBtn) pauseBtn.textContent = '暂停复习';
    }
  }

  private endReview(): void {
    if (confirm('确定要结束当前复习吗？')) {
      this.completeReview();
    }
  }

  private completeReview(): void {
    this.isReviewActive = false;
    
    // 保存复习结果
    this.saveReviewResults();
    
    // 显示结果页面
    this.showResults();
  }

  private async saveReviewResults(): Promise<void> {
    try {
      const response = await this.sendMessage({
        action: 'saveReviewResults',
        data: {
          results: this.reviewResults,
          sessionDuration: Date.now() - this.startTime
        }
      });
      
      if (!response.success) {
        console.error('保存复习结果失败:', response.error);
      }
    } catch (error) {
      console.error('保存复习结果失败:', error);
    }
  }

  private showResults(): void {
    // 隐藏复习界面，显示结果界面
    const reviewSection = document.getElementById('reviewInterface');
    const resultsSection = document.getElementById('reviewResults');
    
    if (reviewSection) reviewSection.style.display = 'none';
    if (resultsSection) resultsSection.style.display = 'block';

    // 计算统计数据
    const totalWords = this.reviewResults.length;
    const correctWords = this.reviewResults.filter(r => r.isCorrect).length;
    const accuracy = totalWords > 0 ? Math.round((correctWords / totalWords) * 100) : 0;
    const avgTime = totalWords > 0 ? Math.round(this.reviewResults.reduce((sum, r) => sum + r.responseTime, 0) / totalWords / 1000) : 0;

    // 更新结果显示
    const accuracyElement = document.getElementById('accuracy');
    const totalWordsElement = document.getElementById('totalWords');
    const avgTimeElement = document.getElementById('avgTime');

    if (accuracyElement) accuracyElement.textContent = `${accuracy}%`;
    if (totalWordsElement) totalWordsElement.textContent = totalWords.toString();
    if (avgTimeElement) avgTimeElement.textContent = `${avgTime}秒`;

    // 显示详细结果
    this.displayDetailedResults();
  }

  private displayDetailedResults(): void {
    const correctList = document.getElementById('correctList');
    const incorrectList = document.getElementById('incorrectList');

    if (correctList) {
      correctList.innerHTML = '';
      this.reviewResults.filter(r => r.isCorrect).forEach(result => {
        const item = this.createResultItem(result);
        correctList.appendChild(item);
      });
    }

    if (incorrectList) {
      incorrectList.innerHTML = '';
      this.reviewResults.filter(r => !r.isCorrect).forEach(result => {
        const item = this.createResultItem(result);
        incorrectList.appendChild(item);
      });
    }
  }

  private createResultItem(result: ReviewResult): HTMLElement {
    const item = document.createElement('div');
    item.className = 'result-item';
    
    item.innerHTML = `
      <div class="word">${result.word}</div>
      <div class="translation">${result.translation}</div>
      <div class="user-answer">${result.userAnswer || '未回答'}</div>
      <div class="response-time">${Math.round(result.responseTime / 1000)}秒</div>
    `;
    
    return item;
  }

  private reviewIncorrectWords(): void {
    // 重新复习错误的单词
    const incorrectWords = this.reviewResults.filter(r => !r.isCorrect);
    
    if (incorrectWords.length === 0) {
      alert('没有错误的单词需要复习');
      return;
    }

    // 重置复习状态
    this.reviewItems = incorrectWords.map(r => ({
      word: r.word,
      translation: r.translation,
      context: '',
      sourceUrl: '',
      addedDate: new Date(),
      reviewCount: 0,
      masteryLevel: 0,
      nextReviewDate: new Date()
    }));
    
    this.currentIndex = 0;
    this.reviewResults = [];
    this.startTime = Date.now();
    this.isReviewActive = true;

    // 返回复习界面
    const resultsSection = document.getElementById('reviewResults');
    const reviewSection = document.getElementById('reviewInterface');
    
    if (resultsSection) resultsSection.style.display = 'none';
    if (reviewSection) reviewSection.style.display = 'block';

    this.showCurrentCard();
  }

  private resetReview(): void {
    // 重置所有状态
    this.reviewItems = [];
    this.currentIndex = 0;
    this.reviewResults = [];
    this.isReviewActive = false;

    // 返回设置界面
    const resultsSection = document.getElementById('reviewResults');
    const setupSection = document.getElementById('reviewSetup');
    
    if (resultsSection) resultsSection.style.display = 'none';
    if (setupSection) setupSection.style.display = 'block';

    // 重新加载数据
    this.loadReviewData();
  }

  private switchResultTab(tabId: string): void {
    // 切换结果标签页
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));

    const activeButton = document.querySelector(`[data-tab="${tabId}"]`);
    const activeContent = document.getElementById(tabId);

    if (activeButton) activeButton.classList.add('active');
    if (activeContent) activeContent.classList.add('active');
  }

  private updateProgress(): void {
    const progressElement = document.getElementById('reviewProgress');
    const progressBar = document.getElementById('progressBar');
    
    if (progressElement && this.reviewItems.length > 0) {
      const progress = Math.round((this.currentIndex / this.reviewItems.length) * 100);
      progressElement.textContent = `${this.currentIndex + 1} / ${this.reviewItems.length}`;
      
      if (progressBar) {
        progressBar.style.width = `${progress}%`;
      }
    }
  }

  private async sendMessage(message: any): Promise<any> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response || { success: false, error: 'No response' });
      });
    });
  }
}

// 初始化复习控制器
document.addEventListener('DOMContentLoaded', () => {
  new ReviewController();
});