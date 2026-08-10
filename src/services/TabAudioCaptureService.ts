export interface TabAudioCaptureStreamRequest {
  targetTabId: number;
  consumerTabId: number;
}

interface TabCaptureApi {
  getMediaStreamId(
    options: chrome.tabCapture.GetMediaStreamOptions,
    callback: (streamId: string) => void
  ): void;
}

const getTabCaptureApi = (): TabCaptureApi | null => {
  const tabCapture = (chrome as unknown as { tabCapture?: Partial<TabCaptureApi> }).tabCapture;
  return typeof tabCapture?.getMediaStreamId === 'function'
    ? tabCapture as TabCaptureApi
    : null;
};

export const isTabAudioCaptureSupported = (): boolean => getTabCaptureApi() !== null;

export const isTabAudioCaptureUrl = (url: string | undefined): boolean => (
  typeof url === 'string' && /^(https?:|file:)/i.test(url)
);

export const isTrustedTabAudioCaptureSender = (
  sender: chrome.runtime.MessageSender,
  extensionId: string,
  subtitlePageUrl: string
): boolean => {
  const senderUrl = sender.url || sender.tab?.url || '';
  if (sender.id !== extensionId) return false;
  try {
    const actual = new URL(senderUrl);
    const expected = new URL(subtitlePageUrl);
    return actual.origin === expected.origin && actual.pathname === expected.pathname;
  } catch {
    return false;
  }
};

export class TabAudioCaptureService {
  async createStreamId(request: TabAudioCaptureStreamRequest): Promise<string> {
    const tabCapture = getTabCaptureApi();
    if (!tabCapture) {
      throw new Error(
        'Current-tab audio capture is not supported in this browser. Choose a local media file instead.'
      );
    }

    const { targetTabId, consumerTabId } = request;
    if (!Number.isInteger(targetTabId) || targetTabId <= 0) {
      throw new Error('Open the subtitle generator from a regular media page.');
    }
    if (!Number.isInteger(consumerTabId) || consumerTabId <= 0 || consumerTabId === targetTabId) {
      throw new Error('The subtitle generator tab is not available for audio capture.');
    }

    const targetTab = await chrome.tabs.get(targetTabId);
    if (!isTabAudioCaptureUrl(targetTab.url)) {
      throw new Error('This page does not allow tab audio capture.');
    }

    return new Promise((resolve, reject) => {
      tabCapture.getMediaStreamId({ targetTabId, consumerTabId }, streamId => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        if (!streamId) {
          reject(new Error('Chrome did not provide a tab audio stream.'));
          return;
        }
        resolve(streamId);
      });
    });
  }
}

export const tabAudioCaptureService = new TabAudioCaptureService();
