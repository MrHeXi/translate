// Jest测试环境设置

// 模拟Chrome扩展API
const mockChrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    },
    getURL: jest.fn((path: string) => `chrome-extension://test/${path}`)
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn(),
      getBytesInUse: jest.fn()
    },
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn(),
      getBytesInUse: jest.fn()
    },
    onChanged: {
      addListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    create: jest.fn()
  }
};

// 将mock对象设置为全局变量
(global as any).chrome = mockChrome;

// 模拟DOM环境
Object.defineProperty(window, 'getSelection', {
  writable: true,
  value: jest.fn(() => ({
    toString: () => '',
    rangeCount: 0,
    getRangeAt: jest.fn()
  }))
});

// 模拟MutationObserver
(global as any).MutationObserver = class MutationObserver {
  constructor(_callback: MutationCallback) {}
  observe() {}
  disconnect() {}
  takeRecords() { return []; }
};

// 模拟TreeWalker
Object.defineProperty(document, 'createTreeWalker', {
  writable: true,
  value: jest.fn(() => ({
    nextNode: jest.fn(() => null)
  }))
});

// 设置测试超时时间
jest.setTimeout(10000);