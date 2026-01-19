// 生词本页面脚本

interface VocabularyItem {
  word: string;
  translation: string;
  context: string;
  sourceUrl: string;
  addedDate: Date;
  reviewCount: number;
  masteryLevel: number; // 0-1之间的值
  nextReviewDate: Date;
}

class VocabularyController {
  private vocabulary: VocabularyItem[] = [];
  private filteredVocabulary: VocabularyItem[] = [];
  private currentPage: number = 1;
  private itemsPerPage: number = 12;
  private currentSort: string = 'addedDate';
  private currentFilter: string = 'all';
  private searchQuery: string = '';

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // 绑定事件监听器
    this.bindEventListeners();
    
    // 加载生词数据
    await this.loadVocabulary();
    
    // 更新显示
    this.updateDisplay();
  }

  private bindEventListeners(): void {
    // 返回按钮
    const backBtn = document.getElementById('backBtn');
    backBtn?.addEventListener('click', () => {
      window.history.back();
    });

    // 搜索功能
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const searchBtn = document.getElementById('searchBtn');
    
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.applyFiltersAndSort();
    });
    
    searchBtn?.addEventListener('click', () => {
      this.applyFiltersAndSort();
    });

    // 排序和筛选
    const sortBy = document.getElementById('sortBy') as HTMLSelectElement;
    sortBy?.addEventListener('change', (e) => {
      this.currentSort = (e.target as HTMLSelectElement).value;
      this.applyFiltersAndSort();
    });

    const filterBy = document.getElementById('filterBy') as HTMLSelectElement;
    filterBy?.addEventListener('change', (e) => {
      this.currentFilter = (e.target as HTMLSelectElement).value;
      this.applyFiltersAndSort();
    });

    // 导出和复习按钮
    const exportBtn = document.getElementById('exportBtn');
    exportBtn?.addEventListener('click', () => this.exportVocabulary());

    const reviewBtn = document.getElementById('reviewBtn');
    reviewBtn?.addEventListener('click', () => this.startReview());

    // 分页按钮
    const prevPage = document.getElementById('prevPage');
    prevPage?.addEventListener('click', () => this.goToPreviousPage());

    const nextPage = document.getElementById('nextPage');
    nextPage?.addEventListener('click', () => this.goToNextPage());

    // 模态框事件
    const closeModal = document.getElementById('closeModal');
    closeModal?.addEventListener('click', () => this.closeModal());

    const deleteWord = document.getElementById('deleteWord');
    deleteWord?.addEventListener('click', () => this.deleteCurrentWord());

    const markAsMastered = document.getElementById('markAsMastered');
    markAsMastered?.addEventListener('click', () => this.markCurrentWordAsMastered());

    const reviewWord = document.getElementById('reviewWord');
    reviewWord?.addEventListener('click', () => this.reviewCurrentWord());

    // 点击模态框外部关闭
    const modal = document.getElementById('wordModal');
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeModal();
      }
    });
  }

  private async loadVocabulary(): Promise<void> {
    try {
      const loadingState = document.getElementById('loadingState');
      if (loadingState) loadingState.style.display = 'block';

      const response = await this.sendMessage({ action: 'getVocabulary' });
      
      if (response.success) {
        this.vocabulary = response.data.map((item: any) => ({
          ...item,
          addedDate: new Date(item.addedDate),
          nextReviewDate: new Date(item.nextReviewDate)
        }));
        
        this.applyFiltersAndSort();
      } else {
        console.error('加载生词失败:', response.error);
        this.showError('加载生词失败');
      }
    } catch (error) {
      console.error('加载生词失败:', error);
      this.showError('加载生词失败');
    } finally {
      const loadingState = document.getElementById('loadingState');
      if (loadingState) loadingState.style.display = 'none';
    }
  }

  private applyFiltersAndSort(): void {
    let filtered = [...this.vocabulary];

    // 应用搜索过滤
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        item.word.toLowerCase().includes(query) ||
        item.translation.toLowerCase().includes(query) ||
        item.context.toLowerCase().includes(query)
      );
    }

    // 应用状态过滤
    switch (this.currentFilter) {
      case 'new':
        filtered = filtered.filter(item => item.masteryLevel === 0);
        break;
      case 'learning':
        filtered = filtered.filter(item => item.masteryLevel > 0 && item.masteryLevel < 0.8);
        break;
      case 'mastered':
        filtered = filtered.filter(item => item.masteryLevel >= 0.8);
        break;
      case 'difficult':
        filtered = filtered.filter(item => item.reviewCount > 3 && item.masteryLevel < 0.5);
        break;
    }

    // 应用排序
    switch (this.currentSort) {
      case 'word':
        filtered.sort((a, b) => a.word.localeCompare(b.word));
        break;
      case 'masteryLevel':
        filtered.sort((a, b) => a.masteryLevel - b.masteryLevel);
        break;
      case 'reviewCount':
        filtered.sort((a, b) => b.reviewCount - a.reviewCount);
        break;
      case 'addedDate':
      default:
        filtered.sort((a, b) => b.addedDate.getTime() - a.addedDate.getTime());
        break;
    }

    this.filteredVocabulary = filtered;
    this.currentPage = 1;
    this.updateDisplay();
  }

  private updateDisplay(): void {
    this.updateVocabularyList();
    this.updatePagination();
    this.updateWordCount();
    this.updateEmptyState();
  }

  private updateVocabularyList(): void {
    const vocabularyList = document.getElementById('vocabularyList');
    if (!vocabularyList) return;

    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    const pageItems = this.filteredVocabulary.slice(startIndex, endIndex);

    vocabularyList.innerHTML = '';

    pageItems.forEach(item => {
      const itemElement = this.createVocabularyItemElement(item);
      vocabularyList.appendChild(itemElement);
    });
  }

  private createVocabularyItemElement(item: VocabularyItem): HTMLElement {
    const div = document.createElement('div');
    div.className = 'vocabulary-item';
    div.addEventListener('click', () => this.showWordDetails(item));

    const masteryPercentage = Math.round(item.masteryLevel * 100);
    const masteryClass = item.masteryLevel < 0.3 ? 'low' : 
                        item.masteryLevel < 0.7 ? 'medium' : 'high';
    const masteryText = item.masteryLevel === 0 ? '新词汇' :
                       item.masteryLevel < 0.3 ? '困难' :
                       item.masteryLevel < 0.7 ? '学习中' : '已掌握';

    div.innerHTML = `
      <div class="word-header">
        <div>
          <div class="word-text">${this.escapeHtml(item.word)}</div>
          <div class="word-translation">${this.escapeHtml(item.translation)}</div>
        </div>
        <div class="word-actions">
          <button class="action-btn" title="播放发音">🔊</button>
          <button class="action-btn" title="编辑">✏️</button>
        </div>
      </div>
      ${item.context ? `<div class="word-context">"${this.escapeHtml(item.context)}"</div>` : ''}
      <div class="word-meta">
        <div>
          <a href="${item.sourceUrl}" class="word-source" target="_blank" onclick="event.stopPropagation()">
            ${this.getDomainFromUrl(item.sourceUrl)}
          </a>
          <span> • ${this.formatDate(item.addedDate)}</span>
        </div>
        <div class="mastery-indicator">
          <div class="mastery-bar">
            <div class="mastery-fill ${masteryClass}" style="width: ${masteryPercentage}%"></div>
          </div>
          <span>${masteryText}</span>
        </div>
      </div>
    `;

    return div;
  }

  private showWordDetails(item: VocabularyItem): void {
    const modal = document.getElementById('wordModal');
    if (!modal) return;

    // 填充模态框内容
    const modalWord = document.getElementById('modalWord');
    const modalTranslation = document.getElementById('modalTranslation');
    const modalContext = document.getElementById('modalContext');
    const modalSource = document.getElementById('modalSource') as HTMLAnchorElement;
    const modalAddedDate = document.getElementById('modalAddedDate');
    const modalReviewCount = document.getElementById('modalReviewCount');
    const modalMasteryLevel = document.getElementById('modalMasteryLevel');
    const modalMasteryText = document.getElementById('modalMasteryText');
    const modalNextReview = document.getElementById('modalNextReview');

    if (modalWord) modalWord.textContent = item.word;
    if (modalTranslation) modalTranslation.textContent = item.translation;
    if (modalContext) modalContext.textContent = item.context || '无语境信息';
    if (modalSource) {
      modalSource.href = item.sourceUrl;
      modalSource.textContent = this.getDomainFromUrl(item.sourceUrl);
    }
    if (modalAddedDate) modalAddedDate.textContent = this.formatDateTime(item.addedDate);
    if (modalReviewCount) modalReviewCount.textContent = item.reviewCount.toString();
    if (modalNextReview) modalNextReview.textContent = this.formatDateTime(item.nextReviewDate);

    // 更新掌握程度显示
    if (modalMasteryLevel && modalMasteryText) {
      const masteryPercentage = Math.round(item.masteryLevel * 100);
      const masteryClass = item.masteryLevel < 0.3 ? 'low' : 
                          item.masteryLevel < 0.7 ? 'medium' : 'high';
      const masteryText = item.masteryLevel === 0 ? '新词汇' :
                         item.masteryLevel < 0.3 ? '困难' :
                         item.masteryLevel < 0.7 ? '学习中' : '已掌握';

      const masteryFill = modalMasteryLevel.querySelector('.mastery-fill') as HTMLElement;
      if (masteryFill) {
        masteryFill.className = `mastery-fill ${masteryClass}`;
        masteryFill.style.width = `${masteryPercentage}%`;
      }
      modalMasteryText.textContent = masteryText;
    }

    // 存储当前词汇用于操作
    (modal as any).currentWord = item;

    // 显示模态框
    modal.style.display = 'flex';
  }

  private closeModal(): void {
    const modal = document.getElementById('wordModal');
    if (modal) {
      modal.style.display = 'none';
      (modal as any).currentWord = null;
    }
  }

  private async deleteCurrentWord(): Promise<void> {
    const modal = document.getElementById('wordModal');
    const currentWord = (modal as any)?.currentWord;
    
    if (!currentWord) return;

    if (confirm(`确定要删除单词"${currentWord.word}"吗？`)) {
      try {
        const response = await this.sendMessage({
          action: 'removeVocabulary',
          data: { word: currentWord.word }
        });

        if (response.success) {
          await this.loadVocabulary();
          this.closeModal();
          this.showSuccess('单词删除成功');
        } else {
          this.showError('删除单词失败: ' + response.error);
        }
      } catch (error) {
        console.error('删除单词失败:', error);
        this.showError('删除单词失败');
      }
    }
  }

  private async markCurrentWordAsMastered(): Promise<void> {
    const modal = document.getElementById('wordModal');
    const currentWord = (modal as any)?.currentWord;
    
    if (!currentWord) return;

    try {
      const response = await this.sendMessage({
        action: 'updateVocabularyMastery',
        data: { 
          word: currentWord.word,
          masteryLevel: 1.0
        }
      });

      if (response.success) {
        await this.loadVocabulary();
        this.closeModal();
        this.showSuccess('单词已标记为已掌握');
      } else {
        this.showError('更新掌握程度失败: ' + response.error);
      }
    } catch (error) {
      console.error('更新掌握程度失败:', error);
      this.showError('更新掌握程度失败');
    }
  }

  private reviewCurrentWord(): void {
    const modal = document.getElementById('wordModal');
    const currentWord = (modal as any)?.currentWord;
    
    if (!currentWord) return;

    // 跳转到复习页面，并传递特定单词
    const reviewUrl = chrome.runtime.getURL('review.html');
    const url = new URL(reviewUrl);
    url.searchParams.set('word', currentWord.word);
    
    chrome.tabs.create({ url: url.toString() });
  }

  private updatePagination(): void {
    const totalPages = Math.ceil(this.filteredVocabulary.length / this.itemsPerPage);
    
    const currentPageElement = document.getElementById('currentPage');
    const totalPagesElement = document.getElementById('totalPages');
    const prevPageBtn = document.getElementById('prevPage') as HTMLButtonElement;
    const nextPageBtn = document.getElementById('nextPage') as HTMLButtonElement;

    if (currentPageElement) currentPageElement.textContent = this.currentPage.toString();
    if (totalPagesElement) totalPagesElement.textContent = totalPages.toString();

    if (prevPageBtn) prevPageBtn.disabled = this.currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = this.currentPage >= totalPages;
  }

  private updateWordCount(): void {
    const totalCount = document.getElementById('totalCount');
    if (totalCount) {
      totalCount.textContent = this.filteredVocabulary.length.toString();
    }
  }

  private updateEmptyState(): void {
    const emptyState = document.getElementById('emptyState');
    const vocabularyList = document.getElementById('vocabularyList');
    
    if (this.filteredVocabulary.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      if (vocabularyList) vocabularyList.style.display = 'none';
    } else {
      if (emptyState) emptyState.style.display = 'none';
      if (vocabularyList) vocabularyList.style.display = 'grid';
    }
  }

  private goToPreviousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updateDisplay();
    }
  }

  private goToNextPage(): void {
    const totalPages = Math.ceil(this.filteredVocabulary.length / this.itemsPerPage);
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.updateDisplay();
    }
  }

  private async exportVocabulary(): Promise<void> {
    try {
      const dataStr = JSON.stringify(this.vocabulary, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = `vocabulary-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      
      this.showSuccess('生词本导出成功');
    } catch (error) {
      console.error('导出生词本失败:', error);
      this.showError('导出生词本失败');
    }
  }

  private startReview(): void {
    // 跳转到复习页面
    chrome.tabs.create({
      url: chrome.runtime.getURL('review.html')
    });
  }

  // 工具方法
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private getDomainFromUrl(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  private formatDate(date: Date): string {
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}个月前`;
    return `${Math.floor(diffDays / 365)}年前`;
  }

  private formatDateTime(date: Date): string {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private showSuccess(message: string): void {
    this.showMessage(message, 'success');
  }

  private showError(message: string): void {
    this.showMessage(message, 'error');
  }

  private showMessage(message: string, type: 'success' | 'error' = 'success'): void {
    // 创建消息元素
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      color: white;
      font-weight: 500;
      z-index: 1001;
      background-color: ${type === 'success' ? '#28a745' : '#dc3545'};
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    document.body.appendChild(messageDiv);

    // 3秒后自动移除
    setTimeout(() => {
      messageDiv.remove();
    }, 3000);
  }

  private sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
}

// 初始化生词本页面
document.addEventListener('DOMContentLoaded', () => {
  new VocabularyController();
});