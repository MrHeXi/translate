import fs from 'fs';
import path from 'path';

interface HistoryEntryFixture {
  id: string;
  createdAt: string;
  sessionStartedAt: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceHost: string;
  cueCount: number;
  durationMs: number;
  cues: Array<{
    id: number;
    startTimeMs: number;
    endTimeMs: number;
    source: string;
    speaker?: string;
    originalText: string;
    translatedText: string;
  }>;
}

const createEntry = (
  id: string,
  createdAt: string,
  title: string,
  originalText = 'Hello',
  translatedText = 'Bonjour'
): HistoryEntryFixture => ({
  id,
  createdAt,
  sessionStartedAt: '2026-08-10T08:00:00.000Z',
  sourceUrl: 'https://meet.example.com',
  sourceTitle: title,
  sourceHost: 'meet.example.com',
  cueCount: 1,
  durationMs: 2500,
  cues: [{
    id: 1,
    startTimeMs: 500,
    endTimeMs: 2500,
    source: 'site-caption',
    speaker: 'Ada',
    originalText,
    translatedText
  }]
});

const loadPageHtml = (): void => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'live-caption-history.html'),
    'utf8'
  );
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)?.[1] || '';
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};

const getActions = (sendMessage: jest.Mock): string[] => (
  sendMessage.mock.calls.map(([message]) => message.action)
);

describe('live caption history page', () => {
  const olderEntry = createEntry(
    'older',
    '2026-08-10T08:10:00.000Z',
    'Morning meeting'
  );
  const newerEntry = createEntry(
    'newer',
    '2026-08-10T09:10:00.000Z',
    'Later meeting'
  );
  let createObjectUrl: jest.Mock;
  let revokeObjectUrl: jest.Mock;
  let anchorClick: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    loadPageHtml();
    createObjectUrl = jest.fn().mockReturnValue('blob:history-export');
    revokeObjectUrl = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl
    });
    anchorClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    (global as any).confirm = jest.fn().mockReturnValue(true);
  });

  afterEach(() => {
    anchorClick.mockRestore();
  });

  it('loads only local history during initialization and renders newest first', async () => {
    const sendMessage = jest.fn((message, callback) => {
      callback({
        success: true,
        data: { entries: [olderEntry, newerEntry], retention: 25 }
      });
    });
    (global as any).chrome = { runtime: { sendMessage, lastError: null } };

    require('../live-caption-history');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      { action: 'getLiveCaptionHistory' },
      expect.any(Function)
    );
    expect(getActions(sendMessage)).toEqual(['getLiveCaptionHistory']);
    expect(getActions(sendMessage)).not.toEqual(expect.arrayContaining([
      'translate',
      'toggleLiveCaptionTranslation',
      'getTabAudioCaptureStreamId',
      'transcribeAudio'
    ]));
    expect(Array.from(document.querySelectorAll('.entry-title')).map(element => element.textContent))
      .toEqual(['Later meeting', 'Morning meeting']);
    expect((document.getElementById('liveCaptionHistoryRetention') as HTMLSelectElement).value)
      .toBe('25');
    expect(document.getElementById('historyCount')?.textContent).toBe('2');
  });

  it('opens a transcript preview with untrusted source and translated text rendered as text', async () => {
    const unsafeEntry = createEntry(
      'unsafe',
      '2026-08-10T09:10:00.000Z',
      '<img src=x onerror=alert(1)>',
      '<strong>Hello</strong>',
      '<em>Bonjour</em>'
    );
    const sendMessage = jest.fn((_message, callback) => {
      callback({ success: true, data: { entries: [unsafeEntry], retention: 10 } });
    });
    (global as any).chrome = { runtime: { sendMessage, lastError: null } };

    require('../live-caption-history');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    (document.querySelector('.entry-open') as HTMLButtonElement).click();

    expect(document.getElementById('previewTitle')?.textContent)
      .toBe('<img src=x onerror=alert(1)>');
    expect(document.querySelector('.cue-original')?.textContent).toBe('<strong>Hello</strong>');
    expect(document.querySelector('.cue-translation')?.textContent).toBe('<em>Bonjour</em>');
    expect(document.getElementById('previewContent')?.hidden).toBe(false);
    expect(document.querySelector('#previewContent img')).toBeNull();
    expect(document.querySelector('#previewContent strong')).toBeNull();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('exports an explicitly opened transcript and revokes its object URL', async () => {
    const sendMessage = jest.fn((_message, callback) => {
      callback({ success: true, data: { entries: [newerEntry], retention: 10 } });
    });
    (global as any).chrome = { runtime: { sendMessage, lastError: null } };

    require('../live-caption-history');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    (document.querySelector('.entry-open') as HTMLButtonElement).click();
    (document.getElementById('historyExportFormat') as HTMLSelectElement).value = 'srt';
    (document.getElementById('exportLiveCaptionHistory') as HTMLButtonElement).click();

    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(anchorClick.mock.contexts[0]).toEqual(expect.objectContaining({
      download: 'Later-meeting-lexibridge-live-captions.srt',
      href: 'blob:history-export'
    }));
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:history-export');
    expect(getActions(sendMessage)).toEqual(['getLiveCaptionHistory']);
  });

  it('deletes one entry and applies an explicit retention change', async () => {
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getLiveCaptionHistory') {
        callback({ success: true, data: { entries: [newerEntry, olderEntry], retention: 10 } });
        return;
      }
      if (message.action === 'deleteLiveCaptionHistory') {
        callback({ success: true, data: { deleted: true } });
        return;
      }
      if (message.action === 'setLiveCaptionHistoryRetention') {
        callback({ success: true, data: { entries: [olderEntry], retention: 25 } });
      }
    });
    (global as any).chrome = { runtime: { sendMessage, lastError: null } };

    require('../live-caption-history');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    (document.querySelector('.entry-delete') as HTMLButtonElement).click();
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith({
      action: 'deleteLiveCaptionHistory',
      data: { id: 'newer' }
    }, expect.any(Function));
    expect(Array.from(document.querySelectorAll('.entry-title')).map(element => element.textContent))
      .toEqual(['Morning meeting']);

    const retention = document.getElementById('liveCaptionHistoryRetention') as HTMLSelectElement;
    retention.value = '25';
    retention.dispatchEvent(new Event('change'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith({
      action: 'setLiveCaptionHistoryRetention',
      data: { retention: 25 }
    }, expect.any(Function));
    expect(retention.value).toBe('25');
    expect(getActions(sendMessage)).not.toEqual(expect.arrayContaining([
      'translate',
      'toggleLiveCaptionTranslation',
      'getTabAudioCaptureStreamId'
    ]));
  });

  it('clears all history only after the explicit clear action', async () => {
    const sendMessage = jest.fn((message, callback) => {
      if (message.action === 'getLiveCaptionHistory') {
        callback({ success: true, data: { entries: [newerEntry], retention: 10 } });
        return;
      }
      callback({ success: true });
    });
    (global as any).chrome = { runtime: { sendMessage, lastError: null } };

    require('../live-caption-history');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();
    expect(getActions(sendMessage)).toEqual(['getLiveCaptionHistory']);

    (document.getElementById('clearLiveCaptionHistory') as HTMLButtonElement).click();
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith(
      { action: 'clearLiveCaptionHistory' },
      expect.any(Function)
    );
    expect(document.getElementById('historyCount')?.textContent).toBe('0');
    expect(document.getElementById('historyListState')?.textContent)
      .toBe('No saved live caption sessions.');
    expect((document.getElementById('clearLiveCaptionHistory') as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it('shows an error state and retries with the same local-only history message', async () => {
    const sendMessage = jest.fn((_message, callback) => {
      if (sendMessage.mock.calls.length === 1) {
        callback({ success: false, error: 'Storage unavailable' });
        return;
      }
      callback({ success: true, data: { entries: [], retention: 10 } });
    });
    (global as any).chrome = { runtime: { sendMessage, lastError: null } };

    require('../live-caption-history');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushPromises();

    expect(document.getElementById('historyListState')?.textContent)
      .toBe('Could not load saved live caption history.');
    expect(document.getElementById('retryLiveCaptionHistory')?.hidden).toBe(false);

    (document.getElementById('retryLiveCaptionHistory') as HTMLButtonElement).click();
    await flushPromises();

    expect(getActions(sendMessage)).toEqual(['getLiveCaptionHistory', 'getLiveCaptionHistory']);
    expect(document.getElementById('historyListState')?.textContent)
      .toBe('No saved live caption sessions.');
  });
});
