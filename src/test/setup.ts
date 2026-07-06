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

const getMockTranslatedText = (input: unknown): string => {
  try {
    const url = new URL(String(input))
    return `mock translation: ${url.searchParams.get('q') || 'text'}`
  } catch {
    return 'mock translation'
  }
}

global.fetch = jest.fn().mockImplementation((input: unknown) => Promise.resolve({
  ok: true,
  json: jest.fn().mockResolvedValue({
    responseStatus: 200,
    responseData: {
      translatedText: getMockTranslatedText(input),
      match: '0.9'
    },
    matches: []
  })
})) as any
