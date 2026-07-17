import {
  isTrustedTabAudioCaptureSender,
  TabAudioCaptureService
} from '../TabAudioCaptureService';

describe('TabAudioCaptureService', () => {
  beforeEach(() => {
    (global as any).chrome = {
      runtime: { lastError: null },
      tabs: {
        get: jest.fn().mockResolvedValue({ id: 12, url: 'https://example.com/watch' })
      },
      tabCapture: {
        getMediaStreamId: jest.fn((_options, callback) => callback('stream-id'))
      }
    };
  });

  it('creates a stream ID for a regular source tab and the generator consumer tab', async () => {
    const service = new TabAudioCaptureService();

    await expect(service.createStreamId({ targetTabId: 12, consumerTabId: 44 }))
      .resolves.toBe('stream-id');
    expect(chrome.tabs.get).toHaveBeenCalledWith(12);
    expect(chrome.tabCapture.getMediaStreamId).toHaveBeenCalledWith(
      { targetTabId: 12, consumerTabId: 44 },
      expect.any(Function)
    );
  });

  it('rejects invalid IDs and browser-owned source pages before capture', async () => {
    const service = new TabAudioCaptureService();

    await expect(service.createStreamId({ targetTabId: 0, consumerTabId: 44 }))
      .rejects.toThrow('regular media page');
    await expect(service.createStreamId({ targetTabId: 12, consumerTabId: 12 }))
      .rejects.toThrow('not available');
    (chrome.tabs.get as jest.Mock).mockResolvedValueOnce({ id: 12, url: 'chrome://settings' });
    await expect(service.createStreamId({ targetTabId: 12, consumerTabId: 44 }))
      .rejects.toThrow('does not allow');
    expect(chrome.tabCapture.getMediaStreamId).not.toHaveBeenCalled();
  });

  it('returns the Chrome capture error without exposing a false stream', async () => {
    (chrome.tabCapture.getMediaStreamId as jest.Mock).mockImplementationOnce((_options, callback) => {
      (chrome.runtime as any).lastError = { message: 'The activeTab grant expired.' };
      callback('');
      (chrome.runtime as any).lastError = null;
    });

    await expect(new TabAudioCaptureService().createStreamId({
      targetTabId: 12,
      consumerTabId: 44
    })).rejects.toThrow('activeTab grant expired');
  });

  it('trusts only this extension subtitle page as the capture requester', () => {
    const pageUrl = 'chrome-extension://extension-id/subtitles.html';
    expect(isTrustedTabAudioCaptureSender({
      id: 'extension-id',
      url: `${pageUrl}?sourceTabId=12`,
      tab: { id: 44 } as chrome.tabs.Tab
    }, 'extension-id', pageUrl)).toBe(true);
    expect(isTrustedTabAudioCaptureSender({
      id: 'extension-id',
      url: 'https://example.com/subtitles.html',
      tab: { id: 12 } as chrome.tabs.Tab
    }, 'extension-id', pageUrl)).toBe(false);
    expect(isTrustedTabAudioCaptureSender({
      id: 'another-extension',
      url: pageUrl,
      tab: { id: 44 } as chrome.tabs.Tab
    }, 'extension-id', pageUrl)).toBe(false);
    expect(isTrustedTabAudioCaptureSender({
      id: 'extension-id',
      url: `${pageUrl}-spoof?sourceTabId=12`,
      tab: { id: 44 } as chrome.tabs.Tab
    }, 'extension-id', pageUrl)).toBe(false);
  });
});
