// 复习页面脚本

interface ReviewItem {
  word: string;
  translation: string;
  context: string;
  sourceUrl: string;
  addedDate: Date | string;
  reviewCount: number;
  masteryLevel: number;
  nextReviewDate: Date | string;
  partOfSpeech?: string;
  pronunciation?: string;
  examples?: string[];
  dictionaryType?: string;
  fromBuiltInDictionary?: boolean;
}

interface ReviewResult {
  word: string;
  translation: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  responseTime: number;
  context?: string;
  sourceUrl?: string;
  dictionaryType?: string;
  partOfSpeech?: string;
  pronunciation?: string;
  examples?: string[];
  skipped?: boolean;
}

type QuestionMode = 'recognition' | 'recall';

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
  private hasAnsweredCurrentCard: boolean = false;
  private specificWord: string | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    this.bindEventListeners();
    this.checkUrlParameters();
    await this.loadReviewData();
  }

  private bindEventListeners(): void {
    document.getElementById('backBtn')?.addEventListener('click', () => {
      if (this.isReviewActive && !confirm('复习正在进行中，确定要退出吗？')) {
        return;
      }
      window.history.back();
    });

    document.getElementById('startReview')?.addEventListener('click', () => {
      this.startReview();
    });

    document.getElementById('cancelReview')?.addEventListener('click', () => {
      window.history.back();
    });

    document.querySelectorAll<HTMLInputElement>('input[name="reviewType"]').forEach(radio => {
      radio.addEventListener('change', () => {
        this.reviewType = radio.value;
        this.updateDueCount();
      });
    });

    document.querySelectorAll<HTMLInputElement>('input[name="reviewMode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        this.reviewMode = radio.value;
      });
    });

    document.getElementById('reviewCount')?.addEventListener('change', event => {
      const value = parseInt((event.target as HTMLInputElement).value, 10);
      this.reviewCount = Number.isFinite(value) ? value : 20;
    });

    document.getElementById('showAnswer')?.addEventListener('click', () => {
      this.showAnswer();
    });

    document.getElementById('nextCard')?.addEventListener('click', () => {
      this.nextCard();
    });

    document.getElementById('checkAnswer')?.addEventListener('click', () => {
      this.checkUserAnswer();
    });

    document.getElementById('userAnswer')?.addEventListener('keydown', event => {
      if ((event as KeyboardEvent).key === 'Enter') {
        this.checkUserAnswer();
      }
    });

    document.querySelectorAll<HTMLButtonElement>('.difficulty-btn').forEach(button => {
      button.addEventListener('click', () => {
        const difficulty = button.dataset['difficulty'] as 'easy' | 'medium' | 'hard';
        this.setDifficulty(difficulty);
      });
    });

    document.getElementById('pauseReview')?.addEventListener('click', () => {
      this.pauseReview();
    });

    document.getElementById('skipCard')?.addEventListener('click', () => {
      this.skipCard();
    });

    document.getElementById('endReview')?.addEventListener('click', () => {
      this.endReview();
    });

    document.getElementById('reviewIncorrect')?.addEventListener('click', () => {
      this.reviewIncorrectWords();
    });

    document.getElementById('backToVocabulary')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('vocabulary.html') });
    });

    document.getElementById('startNewReview')?.addEventListener('click', () => {
      this.resetReview();
    });

    document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(button => {
      button.addEventListener('click', () => {
        const tabId = button.dataset['tab'];
        if (tabId) this.switchResultTab(tabId);
      });
    });
  }

  private checkUrlParameters(): void {
    const specificWord = new URLSearchParams(window.location.search).get('word');
    if (!specificWord) return;

    this.specificWord = specificWord;
    this.reviewType = 'specific';
    this.reviewCount = 1;
  }

  private async loadReviewData(): Promise<void> {
    await this.updateDueCount();
  }

  private async updateDueCount(): Promise<void> {
    try {
      const response = await this.sendMessage({ action: 'getDueReviewCount' });
      if (response.success) {
        const dueCountElement = document.getElementById('dueCount');
        if (dueCountElement) dueCountElement.textContent = String(response.data);
      }
    } catch (error) {
      console.error('更新到期复习数量失败:', error);
    }
  }

  private async startReview(): Promise<void> {
    const startButton = document.getElementById('startReview') as HTMLButtonElement | null;
    if (startButton) startButton.disabled = true;

    try {
      const response = await this.sendMessage({
        action: 'getReviewItems',
        data: {
          type: this.reviewType,
          count: this.reviewCount,
          mode: this.reviewMode,
          word: this.specificWord || undefined
        }
      });

      if (!response.success) {
        alert(`开始复习失败：${response.error || '未知错误'}`);
        return;
      }

      if (!Array.isArray(response.data) || response.data.length === 0) {
        alert('没有找到可复习的词汇。请先在词库中添加单词，或到设置里启用至少一个词库。');
        return;
      }

      this.reviewItems = response.data;
      this.currentIndex = 0;
      this.reviewResults = [];
      this.startTime = Date.now();
      this.isReviewActive = true;
      this.hasAnsweredCurrentCard = false;

      this.showReviewInterface();
      this.showCurrentCard();
    } catch (error) {
      console.error('开始复习失败:', error);
      alert('开始复习失败，请重试。');
    } finally {
      if (startButton) startButton.disabled = false;
    }
  }

  private showReviewInterface(): void {
    const setupSection = document.getElementById('reviewSetup');
    const reviewSection = document.getElementById('reviewMain');
    const resultsSection = document.getElementById('reviewResults');

    if (setupSection) setupSection.style.display = 'none';
    if (resultsSection) resultsSection.style.display = 'none';
    if (reviewSection) reviewSection.style.display = 'flex';

    this.updateProgress();
  }

  private showCurrentCard(): void {
    if (this.currentIndex >= this.reviewItems.length) {
      this.completeReview();
      return;
    }

    const currentItem = this.reviewItems[this.currentIndex];
    if (!currentItem) return;

    this.currentQuestionStartTime = Date.now();
    this.hasAnsweredCurrentCard = false;

    this.setText('currentNumber', String(this.currentIndex + 1));
    this.setText('totalNumber', String(this.reviewItems.length));
    this.setText('cardType', this.getModeLabel());

    const mode = this.getQuestionMode();
    this.setText('questionText', mode === 'recognition' ? currentItem.word : currentItem.translation);

    const contextElement = document.getElementById('questionContext');
    if (contextElement) {
      contextElement.style.display = currentItem.context ? 'block' : 'none';
    }
    this.setText('contextText', currentItem.context || '');

    this.hideResultSection();

    if (mode === 'recognition') {
      this.renderAnswerOptions(currentItem);
    } else {
      this.renderAnswerInput();
    }

    this.updateProgress();
  }

  private renderAnswerOptions(currentItem: ReviewItem): void {
    const answerOptions = document.getElementById('answerOptions');
    const answerInput = document.getElementById('answerInput');
    const showAnswerButton = document.getElementById('showAnswer');

    if (answerInput) answerInput.style.display = 'none';
    if (showAnswerButton) showAnswerButton.style.display = 'inline-block';
    if (!answerOptions) return;

    answerOptions.style.display = 'grid';
    answerOptions.innerHTML = '';

    const options = this.buildTranslationOptions(currentItem);
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'option-btn';
      button.textContent = option;
      button.addEventListener('click', () => {
        this.answerCurrentCard(option, option === currentItem.translation);
      });
      answerOptions.appendChild(button);
    }
  }

  private renderAnswerInput(): void {
    const answerOptions = document.getElementById('answerOptions');
    const answerInput = document.getElementById('answerInput');
    const userAnswer = document.getElementById('userAnswer') as HTMLInputElement | null;
    const showAnswerButton = document.getElementById('showAnswer');

    if (answerOptions) {
      answerOptions.style.display = 'none';
      answerOptions.innerHTML = '';
    }
    if (answerInput) answerInput.style.display = 'flex';
    if (showAnswerButton) showAnswerButton.style.display = 'inline-block';
    if (userAnswer) {
      userAnswer.value = '';
      userAnswer.focus();
    }
  }

  private buildTranslationOptions(currentItem: ReviewItem): string[] {
    const distractors = this.reviewItems
      .map(item => item.translation)
      .filter(translation => translation && translation !== currentItem.translation);

    const fallbackOptions = ['不确定', '暂时想不起', '需要再看'];
    const uniqueDistractors = Array.from(new Set([...distractors, ...fallbackOptions]));
    const selectedDistractors = this.shuffle(uniqueDistractors).slice(0, 3);
    return this.shuffle([currentItem.translation, ...selectedDistractors]);
  }

  private showAnswer(): void {
    if (this.hasAnsweredCurrentCard) return;

    const currentItem = this.reviewItems[this.currentIndex];
    if (!currentItem) return;

    this.answerCurrentCard('', false, true);
  }

  private checkUserAnswer(): void {
    if (this.hasAnsweredCurrentCard) return;

    const userAnswerInput = document.getElementById('userAnswer') as HTMLInputElement | null;
    const currentItem = this.reviewItems[this.currentIndex];
    if (!userAnswerInput || !currentItem) return;

    const userAnswer = userAnswerInput.value.trim();
    const isCorrect = this.normalizeAnswer(userAnswer) === this.normalizeAnswer(currentItem.word);
    this.answerCurrentCard(userAnswer, isCorrect);
  }

  private answerCurrentCard(userAnswer: string, isCorrect: boolean, revealed: boolean = false): void {
    const currentItem = this.reviewItems[this.currentIndex];
    if (!currentItem) return;

    this.hasAnsweredCurrentCard = true;
    const correctAnswer = this.getQuestionMode() === 'recognition'
      ? currentItem.translation
      : currentItem.word;

    this.reviewResults.push({
      word: currentItem.word,
      translation: currentItem.translation,
      userAnswer,
      correctAnswer,
      isCorrect: revealed ? false : isCorrect,
      difficulty: null,
      responseTime: Date.now() - this.currentQuestionStartTime,
      context: currentItem.context,
      sourceUrl: currentItem.sourceUrl,
      dictionaryType: currentItem.dictionaryType,
      partOfSpeech: currentItem.partOfSpeech,
      pronunciation: currentItem.pronunciation,
      examples: currentItem.examples
    });

    this.showResult(revealed ? false : isCorrect, correctAnswer);
  }

  private showResult(isCorrect: boolean, correctAnswer: string): void {
    const answerOptions = document.getElementById('answerOptions');
    const answerInput = document.getElementById('answerInput');
    const resultSection = document.getElementById('resultSection');
    const resultIndicator = document.getElementById('resultIndicator');
    const resultIcon = document.getElementById('resultIcon');
    const resultText = document.getElementById('resultText');
    const nextButton = document.getElementById('nextCard');
    const showAnswerButton = document.getElementById('showAnswer');
    const difficultyButtons = document.getElementById('difficultyButtons');
    const currentItem = this.reviewItems[this.currentIndex];

    if (answerOptions) answerOptions.style.display = 'none';
    if (answerInput) answerInput.style.display = 'none';
    if (resultSection) resultSection.style.display = 'block';
    if (nextButton) nextButton.style.display = 'inline-block';
    if (showAnswerButton) showAnswerButton.style.display = 'none';
    if (difficultyButtons) difficultyButtons.style.display = 'flex';

    if (resultIndicator) {
      resultIndicator.className = `result-indicator ${isCorrect ? 'correct' : 'incorrect'}`;
    }
    if (resultIcon) resultIcon.textContent = isCorrect ? '✓' : '×';
    if (resultText) resultText.textContent = isCorrect ? '正确' : '需要复习';

    this.setText('correctAnswerText', correctAnswer);
    this.setText('detailTranslation', currentItem?.translation || '');
    this.setText('detailContext', currentItem?.context || '');

    const detailContextItem = document.getElementById('detailContextItem');
    if (detailContextItem) {
      detailContextItem.style.display = currentItem?.context ? 'block' : 'none';
    }
  }

  private hideResultSection(): void {
    const resultSection = document.getElementById('resultSection');
    const nextButton = document.getElementById('nextCard');
    const difficultyButtons = document.getElementById('difficultyButtons');
    const showAnswerButton = document.getElementById('showAnswer');

    if (resultSection) resultSection.style.display = 'none';
    if (nextButton) nextButton.style.display = 'none';
    if (difficultyButtons) difficultyButtons.style.display = 'none';
    if (showAnswerButton) showAnswerButton.style.display = 'none';
  }

  private setDifficulty(difficulty: 'easy' | 'medium' | 'hard'): void {
    const lastResult = this.reviewResults[this.reviewResults.length - 1];
    if (lastResult) lastResult.difficulty = difficulty;
    this.nextCard();
  }

  private nextCard(): void {
    this.currentIndex++;
    this.showCurrentCard();
  }

  private skipCard(): void {
    if (this.hasAnsweredCurrentCard) {
      this.nextCard();
      return;
    }

    const currentItem = this.reviewItems[this.currentIndex];
    if (!currentItem) return;

    this.reviewResults.push({
      word: currentItem.word,
      translation: currentItem.translation,
      userAnswer: '',
      correctAnswer: currentItem.translation,
      isCorrect: false,
      difficulty: null,
      responseTime: Date.now() - this.currentQuestionStartTime,
      context: currentItem.context,
      sourceUrl: currentItem.sourceUrl,
      dictionaryType: currentItem.dictionaryType,
      partOfSpeech: currentItem.partOfSpeech,
      pronunciation: currentItem.pronunciation,
      examples: currentItem.examples,
      skipped: true
    });

    this.nextCard();
  }

  private pauseReview(): void {
    const pauseButton = document.getElementById('pauseReview');
    this.isReviewActive = !this.isReviewActive;
    if (pauseButton) pauseButton.textContent = this.isReviewActive ? '暂停' : '继续';
  }

  private endReview(): void {
    if (confirm('确定要结束当前复习吗？')) {
      this.completeReview();
    }
  }

  private completeReview(): void {
    this.isReviewActive = false;
    this.saveReviewResults();
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
    const reviewSection = document.getElementById('reviewMain');
    const resultsSection = document.getElementById('reviewResults');

    if (reviewSection) reviewSection.style.display = 'none';
    if (resultsSection) resultsSection.style.display = 'flex';

    const totalWords = this.reviewResults.length;
    const correctWords = this.reviewResults.filter(result => result.isCorrect).length;
    const accuracy = totalWords > 0 ? Math.round((correctWords / totalWords) * 100) : 0;
    const minutes = Math.max(1, Math.round((Date.now() - this.startTime) / 60000));

    this.setText('totalReviewed', String(totalWords));
    this.setText('correctCount', String(correctWords));
    this.setText('accuracyRate', `${accuracy}%`);
    this.setText('reviewTime', String(minutes));

    this.displayDetailedResults();
  }

  private displayDetailedResults(): void {
    this.renderResultList('correctWords', this.reviewResults.filter(result => result.isCorrect));
    this.renderResultList('incorrectWords', this.reviewResults.filter(result => !result.isCorrect && !result.skipped));
    this.renderResultList('skippedWords', this.reviewResults.filter(result => result.skipped));
  }

  private renderResultList(containerId: string, results: ReviewResult[]): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    for (const result of results) {
      container.appendChild(this.createResultItem(result));
    }
  }

  private createResultItem(result: ReviewResult): HTMLElement {
    const item = document.createElement('div');
    item.className = 'word-item';
    item.innerHTML = `
      <div>
        <div class="word">${this.escapeHtml(result.word)}</div>
        <div class="translation">${this.escapeHtml(result.translation)}</div>
      </div>
      <div class="translation">${this.escapeHtml(result.userAnswer || '未作答')}</div>
    `;
    return item;
  }

  private reviewIncorrectWords(): void {
    const incorrectResults = this.reviewResults.filter(result => !result.isCorrect);
    if (incorrectResults.length === 0) {
      alert('没有错误的词汇需要复习。');
      return;
    }

    this.reviewItems = incorrectResults.map(result => ({
      word: result.word,
      translation: result.translation,
      context: result.context || '',
      sourceUrl: result.sourceUrl || '',
      addedDate: new Date(),
      reviewCount: 0,
      masteryLevel: 0,
      nextReviewDate: new Date(),
      dictionaryType: result.dictionaryType
    }));

    this.currentIndex = 0;
    this.reviewResults = [];
    this.startTime = Date.now();
    this.isReviewActive = true;
    this.showReviewInterface();
    this.showCurrentCard();
  }

  private resetReview(): void {
    this.reviewItems = [];
    this.currentIndex = 0;
    this.reviewResults = [];
    this.isReviewActive = false;

    const resultsSection = document.getElementById('reviewResults');
    const setupSection = document.getElementById('reviewSetup');
    const reviewSection = document.getElementById('reviewMain');

    if (resultsSection) resultsSection.style.display = 'none';
    if (reviewSection) reviewSection.style.display = 'none';
    if (setupSection) setupSection.style.display = 'flex';

    this.loadReviewData();
  }

  private switchResultTab(tabId: string): void {
    document.querySelectorAll('.tab-btn').forEach(button => {
      button.classList.toggle('active', (button as HTMLButtonElement).dataset['tab'] === tabId);
    });

    document.querySelectorAll('.word-list').forEach(content => {
      content.classList.remove('active');
    });

    document.getElementById(`${tabId}Words`)?.classList.add('active');
  }

  private updateProgress(): void {
    const total = this.reviewItems.length;
    const current = total > 0 ? Math.min(this.currentIndex + 1, total) : 0;
    const percentage = total > 0 ? Math.round((this.currentIndex / total) * 100) : 0;

    this.setText('progressText', `${current} / ${total}`);
    const progressFill = document.getElementById('progressFill');
    if (progressFill) progressFill.style.width = `${percentage}%`;
  }

  private getQuestionMode(): QuestionMode {
    if (this.reviewMode === 'mixed') {
      return this.currentIndex % 2 === 0 ? 'recognition' : 'recall';
    }

    return this.reviewMode === 'recall' ? 'recall' : 'recognition';
  }

  private getModeLabel(): string {
    const mode = this.getQuestionMode();
    return mode === 'recognition' ? '识别模式' : '回忆模式';
  }

  private normalizeAnswer(answer: string): string {
    return answer.toLowerCase().trim();
  }

  private setText(id: string, text: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private shuffle<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = shuffled[index];
      const swap = shuffled[swapIndex];
      if (current !== undefined && swap !== undefined) {
        shuffled[index] = swap;
        shuffled[swapIndex] = current;
      }
    }
    return shuffled;
  }

  private sendMessage(message: any): Promise<any> {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        resolve(response || { success: false, error: 'No response' });
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ReviewController();
});
