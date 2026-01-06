// Test setup file
// Mock Chrome APIs
global.chrome = {
  storage: {
    local: {
      get: jest.fn().mockImplementation((key) => {
        return Promise.resolve({ [key]: null })
      }),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined)
    },
    sync: {
      get: jest.fn().mockImplementation((key) => {
        return Promise.resolve({ [key]: null })
      }),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined)
    }
  },
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({}),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue({})
  }
} as any