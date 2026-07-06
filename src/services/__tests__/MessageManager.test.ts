import { MessageRequest, MessageResponse } from '../MessageManager';

type MessageListener = (
  request: MessageRequest,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
) => boolean;

const setupChromeWithCapturedListener = (): { getListener: () => MessageListener } => {
  let listener: MessageListener | null = null;

  (global as any).chrome = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener: jest.fn((handler: MessageListener) => {
          listener = handler;
        })
      },
      sendMessage: jest.fn()
    },
    tabs: {
      query: jest.fn(),
      sendMessage: jest.fn()
    }
  };

  return {
    getListener: () => {
      if (!listener) throw new Error('Message listener was not registered');
      return listener;
    }
  };
};

describe('MessageManager', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('ignores actions without a registered handler so another listener can respond', () => {
    const chromeHarness = setupChromeWithCapturedListener();

    jest.isolateModules(() => {
      require('../MessageManager');
    });

    const sendResponse = jest.fn();
    const keepChannelOpen = chromeHarness.getListener()(
      { action: 'getReviewItems' },
      {},
      sendResponse
    );

    expect(keepChannelOpen).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('responds when a handler is registered for the action', async () => {
    const chromeHarness = setupChromeWithCapturedListener();
    let moduleExports: typeof import('../MessageManager');

    jest.isolateModules(() => {
      moduleExports = require('../MessageManager');
    });

    moduleExports!.messageManager.registerHandler('ping', async () => ({
      success: true,
      data: { status: 'ok' }
    }));

    const sendResponse = jest.fn();
    const keepChannelOpen = chromeHarness.getListener()(
      { action: 'ping', requestId: 'req-1' },
      {},
      sendResponse
    );

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(keepChannelOpen).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: { status: 'ok' },
      requestId: 'req-1'
    }));
  });
});
