import type {
  LiveCaptionHistoryEntry,
  LiveCaptionHistoryRetention
} from '../services/LiveCaptionHistoryService';
import {
  createLiveCaptionTranscriptFilename,
  getLiveCaptionTranscriptMimeType,
  LiveCaptionTranscriptFormat,
  renderLiveCaptionTranscript
} from '../services/LiveCaptionTranscript';

interface HistoryPayload {
  entries: LiveCaptionHistoryEntry[];
  retention: LiveCaptionHistoryRetention;
}

interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const RETENTION_VALUES = new Set<LiveCaptionHistoryRetention>([10, 25, 50]);
const EXPORT_FORMATS = new Set<LiveCaptionTranscriptFormat>(['txt', 'srt', 'vtt', 'json']);

class LiveCaptionHistoryController {
  private entries: LiveCaptionHistoryEntry[] = [];
  private selectedEntryId: string | null = null;
  private isBusy = false;
  private hasLoaded = false;

  private readonly retentionSelect = this.getElement<HTMLSelectElement>('liveCaptionHistoryRetention');
  private readonly clearButton = this.getElement<HTMLButtonElement>('clearLiveCaptionHistory');
  private readonly retryButton = this.getElement<HTMLButtonElement>('retryLiveCaptionHistory');
  private readonly historyCount = this.getElement<HTMLElement>('historyCount');
  private readonly listState = this.getElement<HTMLElement>('historyListState');
  private readonly historyList = this.getElement<HTMLElement>('liveCaptionHistoryList');
  private readonly exportFormat = this.getElement<HTMLSelectElement>('historyExportFormat');
  private readonly exportButton = this.getElement<HTMLButtonElement>('exportLiveCaptionHistory');
  private readonly previewTitle = this.getElement<HTMLElement>('previewTitle');
  private readonly previewEmpty = this.getElement<HTMLElement>('previewEmpty');
  private readonly previewContent = this.getElement<HTMLElement>('previewContent');
  private readonly previewSavedAt = this.getElement<HTMLElement>('previewSavedAt');
  private readonly previewSource = this.getElement<HTMLElement>('previewSource');
  private readonly previewDuration = this.getElement<HTMLElement>('previewDuration');
  private readonly previewCueCount = this.getElement<HTMLElement>('previewCueCount');
  private readonly previewCueList = this.getElement<HTMLElement>('previewCueList');
  private readonly pageStatus = this.getElement<HTMLElement>('historyPageStatus');

  constructor() {
    this.bindEventListeners();
    void this.loadHistory();
  }

  private bindEventListeners(): void {
    this.retentionSelect.addEventListener('change', () => {
      void this.updateRetention();
    });
    this.clearButton.addEventListener('click', () => {
      void this.clearHistory();
    });
    this.retryButton.addEventListener('click', () => {
      void this.loadHistory();
    });
    this.exportButton.addEventListener('click', () => this.exportSelectedEntry());
  }

  private async loadHistory(): Promise<void> {
    if (this.isBusy) return;
    this.isBusy = true;
    this.hasLoaded = false;
    this.showListState('Loading history...');
    this.showStatus('');
    this.updateControls();

    try {
      const response = await this.sendMessage<HistoryPayload>({ action: 'getLiveCaptionHistory' });
      const payload = this.readHistoryPayload(response);
      this.applyHistoryPayload(payload);
      this.hasLoaded = true;
      this.retryButton.hidden = true;
    } catch (error) {
      this.entries = [];
      this.selectedEntryId = null;
      this.renderHistoryList();
      this.renderPreview();
      this.showListState('Could not load saved live caption history.', true);
      this.retryButton.hidden = false;
      this.showStatus(this.getErrorMessage(error, 'Could not load history.'), true);
    } finally {
      this.isBusy = false;
      this.renderHistoryList();
      this.renderPreview();
      this.updateControls();
    }
  }

  private async updateRetention(): Promise<void> {
    if (this.isBusy || !this.hasLoaded) return;
    const requestedRetention = Number(this.retentionSelect.value) as LiveCaptionHistoryRetention;
    if (!RETENTION_VALUES.has(requestedRetention)) {
      this.retentionSelect.value = '10';
      this.showStatus('Choose a retention limit of 10, 25, or 50 sessions.', true);
      return;
    }

    this.isBusy = true;
    this.showStatus('Updating retention...');
    this.updateControls();
    try {
      const response = await this.sendMessage<HistoryPayload>({
        action: 'setLiveCaptionHistoryRetention',
        data: { retention: requestedRetention }
      });
      this.applyHistoryPayload(this.readHistoryPayload(response));
      this.showStatus(`Keeping up to ${requestedRetention} saved sessions.`);
    } catch (error) {
      this.showStatus(this.getErrorMessage(error, 'Could not update retention.'), true);
      await this.reloadAfterMutationFailure();
    } finally {
      this.isBusy = false;
      this.updateControls();
    }
  }

  private async deleteEntry(id: string): Promise<void> {
    if (this.isBusy) return;
    const entry = this.entries.find(candidate => candidate.id === id);
    if (!entry) return;
    if (!window.confirm(`Delete "${entry.sourceTitle || 'Untitled session'}"?`)) return;

    this.isBusy = true;
    this.showStatus('Deleting session...');
    this.updateControls();
    this.renderHistoryList();
    try {
      const response = await this.sendMessage<{ deleted: boolean }>({
        action: 'deleteLiveCaptionHistory',
        data: { id }
      });
      if (!response.success || response.data?.deleted !== true) {
        throw new Error(response.error || 'The saved session no longer exists.');
      }

      this.entries = this.entries.filter(candidate => candidate.id !== id);
      if (this.selectedEntryId === id) this.selectedEntryId = null;
      this.renderHistoryList();
      this.renderPreview();
      this.showStatus('Saved session deleted.');
    } catch (error) {
      this.showStatus(this.getErrorMessage(error, 'Could not delete the saved session.'), true);
    } finally {
      this.isBusy = false;
      this.updateControls();
      this.renderHistoryList();
    }
  }

  private async clearHistory(): Promise<void> {
    if (this.isBusy || this.entries.length === 0) return;
    if (!window.confirm('Clear all saved live caption sessions?')) return;

    this.isBusy = true;
    this.showStatus('Clearing history...');
    this.updateControls();
    this.renderHistoryList();
    try {
      const response = await this.sendMessage({ action: 'clearLiveCaptionHistory' });
      if (!response.success) throw new Error(response.error || 'Could not clear history.');
      this.entries = [];
      this.selectedEntryId = null;
      this.renderHistoryList();
      this.renderPreview();
      this.showStatus('Live caption history cleared.');
    } catch (error) {
      this.showStatus(this.getErrorMessage(error, 'Could not clear history.'), true);
    } finally {
      this.isBusy = false;
      this.updateControls();
      this.renderHistoryList();
    }
  }

  private selectEntry(id: string): void {
    if (!this.entries.some(entry => entry.id === id)) return;
    this.selectedEntryId = id;
    this.renderHistoryList();
    this.renderPreview();
    this.showStatus('');
  }

  private exportSelectedEntry(): void {
    const entry = this.getSelectedEntry();
    const format = this.exportFormat.value as LiveCaptionTranscriptFormat;
    if (!entry || !EXPORT_FORMATS.has(format)) return;

    const content = renderLiveCaptionTranscript({
      sessionStartedAt: entry.sessionStartedAt,
      cues: entry.cues
    }, format);
    if (!content) {
      this.showStatus('This saved session has no transcript to export.', true);
      return;
    }

    const blob = new Blob([content], { type: getLiveCaptionTranscriptMimeType(format) });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    try {
      link.href = objectUrl;
      link.download = createLiveCaptionTranscriptFilename(entry.sourceTitle, format);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      this.showStatus(`Exported ${format.toUpperCase()} transcript.`);
    } finally {
      link.remove();
      URL.revokeObjectURL(objectUrl);
    }
  }

  private applyHistoryPayload(payload: HistoryPayload): void {
    const retainedSelection = this.selectedEntryId;
    this.entries = [...payload.entries].sort((left, right) => {
      const timeDifference = this.parseTimestamp(right.createdAt) - this.parseTimestamp(left.createdAt);
      return timeDifference || left.id.localeCompare(right.id);
    });
    this.retentionSelect.value = String(payload.retention);
    this.selectedEntryId = retainedSelection && this.entries.some(entry => entry.id === retainedSelection)
      ? retainedSelection
      : null;
    this.renderHistoryList();
    this.renderPreview();
  }

  private renderHistoryList(): void {
    this.historyList.replaceChildren();
    this.historyCount.textContent = String(this.entries.length);

    if (this.entries.length === 0) {
      if (this.hasLoaded) this.showListState('No saved live caption sessions.');
      return;
    }

    this.listState.hidden = true;
    this.historyList.hidden = false;
    for (const entry of this.entries) {
      const row = document.createElement('article');
      row.className = 'history-entry';
      if (entry.id === this.selectedEntryId) row.classList.add('selected');

      const title = document.createElement('h3');
      title.className = 'entry-title';
      title.textContent = entry.sourceTitle || 'Untitled session';

      const metadata = document.createElement('p');
      metadata.className = 'entry-meta';
      metadata.textContent = `${this.formatDate(entry.createdAt)} | ${entry.sourceHost || 'Unknown source'}`;

      const stats = document.createElement('p');
      stats.className = 'entry-stats';
      stats.textContent = `${entry.cueCount} ${entry.cueCount === 1 ? 'cue' : 'cues'} | ${this.formatDuration(entry.durationMs)}`;

      const actions = document.createElement('div');
      actions.className = 'entry-actions';

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'entry-open';
      openButton.textContent = 'Open';
      openButton.disabled = this.isBusy;
      openButton.setAttribute('aria-pressed', String(entry.id === this.selectedEntryId));
      openButton.addEventListener('click', () => this.selectEntry(entry.id));

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'entry-delete';
      deleteButton.textContent = 'Delete';
      deleteButton.disabled = this.isBusy;
      deleteButton.addEventListener('click', () => {
        void this.deleteEntry(entry.id);
      });

      actions.append(openButton, deleteButton);
      row.append(title, metadata, stats, actions);
      this.historyList.appendChild(row);
    }
  }

  private renderPreview(): void {
    const entry = this.getSelectedEntry();
    this.previewCueList.replaceChildren();
    this.previewEmpty.hidden = Boolean(entry);
    this.previewContent.hidden = !entry;
    this.previewTitle.textContent = entry?.sourceTitle || 'No session open';

    if (!entry) {
      this.previewSavedAt.textContent = '';
      this.previewSource.textContent = '';
      this.previewDuration.textContent = '';
      this.previewCueCount.textContent = '';
      this.updateControls();
      return;
    }

    this.previewSavedAt.textContent = this.formatDate(entry.createdAt);
    this.previewSource.textContent = entry.sourceHost || 'Unknown source';
    this.previewDuration.textContent = this.formatDuration(entry.durationMs);
    this.previewCueCount.textContent = String(entry.cueCount);

    for (const cue of entry.cues) {
      const cueRow = document.createElement('section');
      cueRow.className = 'transcript-cue';

      const time = document.createElement('div');
      time.className = 'cue-time';
      time.textContent = this.formatCueTime(cue.startTimeMs);

      const text = document.createElement('div');
      const source = document.createElement('p');
      source.className = 'cue-source';
      source.textContent = [cue.speaker, cue.source].filter(Boolean).join(' | ') || 'Unknown source';

      const original = document.createElement('p');
      original.className = 'cue-original';
      original.textContent = cue.originalText;

      const translation = document.createElement('p');
      translation.className = 'cue-translation';
      translation.textContent = cue.translatedText || 'Translation unavailable';
      if (!cue.translatedText) translation.classList.add('unavailable');

      text.append(source, original, translation);
      cueRow.append(time, text);
      this.previewCueList.appendChild(cueRow);
    }
    this.updateControls();
  }

  private showListState(message: string, isError = false): void {
    this.historyList.hidden = true;
    this.listState.hidden = false;
    this.listState.textContent = message;
    this.listState.classList.toggle('error', isError);
  }

  private showStatus(message: string, isError = false): void {
    this.pageStatus.textContent = message;
    this.pageStatus.classList.toggle('error', isError);
  }

  private updateControls(): void {
    this.retentionSelect.disabled = this.isBusy || !this.hasLoaded;
    this.clearButton.disabled = this.isBusy || !this.hasLoaded || this.entries.length === 0;
    this.retryButton.disabled = this.isBusy;
    this.exportButton.disabled = this.isBusy || this.getSelectedEntry() === undefined;
  }

  private readHistoryPayload(response: MessageResponse<HistoryPayload>): HistoryPayload {
    if (!response?.success || !response.data) {
      throw new Error(response?.error || 'The history service returned an error.');
    }
    if (!RETENTION_VALUES.has(response.data.retention) || !Array.isArray(response.data.entries)) {
      throw new Error('The history service returned invalid data.');
    }

    const entries = response.data.entries.filter(this.isHistoryEntry);
    return { entries, retention: response.data.retention };
  }

  private readonly isHistoryEntry = (value: unknown): value is LiveCaptionHistoryEntry => {
    if (!value || typeof value !== 'object') return false;
    const entry = value as Partial<LiveCaptionHistoryEntry>;
    return typeof entry.id === 'string'
      && typeof entry.createdAt === 'string'
      && (entry.sessionStartedAt === null || typeof entry.sessionStartedAt === 'string')
      && typeof entry.sourceUrl === 'string'
      && typeof entry.sourceTitle === 'string'
      && typeof entry.sourceHost === 'string'
      && typeof entry.cueCount === 'number'
      && typeof entry.durationMs === 'number'
      && Array.isArray(entry.cues)
      && entry.cues.every(cue => Boolean(cue)
        && typeof cue.id === 'number'
        && typeof cue.startTimeMs === 'number'
        && typeof cue.endTimeMs === 'number'
        && typeof cue.source === 'string'
        && typeof cue.originalText === 'string'
        && typeof cue.translatedText === 'string');
  };

  private async reloadAfterMutationFailure(): Promise<void> {
    try {
      const response = await this.sendMessage<HistoryPayload>({ action: 'getLiveCaptionHistory' });
      this.applyHistoryPayload(this.readHistoryPayload(response));
    } catch {
      // Preserve the last successfully rendered state when recovery also fails.
    }
  }

  private getSelectedEntry(): LiveCaptionHistoryEntry | undefined {
    return this.entries.find(entry => entry.id === this.selectedEntryId);
  }

  private formatDate(value: string): string {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return 'Unknown date';
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  }

  private formatDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  private formatCueTime(timeMs: number): string {
    const safeTimeMs = Math.max(0, Math.round(timeMs));
    const totalSeconds = Math.floor(safeTimeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  private parseTimestamp(value: string): number {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  private getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing live caption history element: ${id}`);
    return element as T;
  }

  private sendMessage<T = unknown>(message: Record<string, unknown>): Promise<MessageResponse<T>> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: MessageResponse<T>) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Extension messaging failed.'));
          return;
        }
        resolve(response);
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new LiveCaptionHistoryController();
}, { once: true });
