import { StorageManager } from '../StorageManager';

const readSelection = (state: Record<string, any>, keys: unknown): Record<string, any> => {
  if (keys === null || keys === undefined) return { ...state };
  if (typeof keys === 'string') return keys in state ? { [keys]: state[keys] } : {};
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.filter(key => typeof key === 'string' && key in state)
      .map(key => [key, state[key]]));
  }
  return {};
};

describe('StorageManager AI tool libraries', () => {
  let localState: Record<string, any>;
  let syncState: Record<string, any>;
  let localSet: jest.Mock;
  let localRemove: jest.Mock;
  let syncSet: jest.Mock;
  let manager: StorageManager;

  beforeEach(() => {
    localState = {};
    syncState = {};
    localSet = jest.fn(async (value: Record<string, any>) => {
      Object.assign(localState, value);
    });
    localRemove = jest.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete localState[key];
    });
    syncSet = jest.fn(async (value: Record<string, any>) => {
      Object.assign(syncState, value);
    });
    (global as any).chrome = {
      storage: {
        local: {
          get: jest.fn(async (keys: unknown) => readSelection(localState, keys)),
          set: localSet,
          remove: localRemove,
          clear: jest.fn(),
          getBytesInUse: jest.fn()
        },
        sync: {
          get: jest.fn(async (keys: unknown) => readSelection(syncState, keys)),
          set: syncSet,
          clear: jest.fn(),
          getBytesInUse: jest.fn()
        },
        onChanged: { addListener: jest.fn() }
      }
    };
    manager = new StorageManager();
  });

  it('uses privacy-preserving defaults without creating provider requests', async () => {
    await expect(manager.getSettings()).resolves.toEqual(expect.objectContaining({
      aiExpertId: 'general',
      aiPromptTemplateId: 'lexibridge-default',
      aiPromptVariables: {},
      sensitiveDataMaskingEnabled: false,
      dailyGoal: 20,
      reviewInterval: 'spaced',
      difficultyAdjustment: 'auto'
    }));
    expect(localSet).not.toHaveBeenCalled();
    expect(syncSet).not.toHaveBeenCalled();
  });

  it('loads a failed sync fallback over stale sync data and clears it after recovery', async () => {
    syncState.settings = {
      defaultTargetLanguage: 'en',
      autoTranslate: true
    };
    syncSet.mockImplementationOnce(async () => {
      throw new Error('sync unavailable');
    });

    await manager.saveUserData({
      settings: {
        defaultTargetLanguage: 'fr',
        autoTranslate: false
      } as any
    });

    expect(localState.userDataLocalFallbackV1).toEqual({
      settings: {
        defaultTargetLanguage: 'fr',
        autoTranslate: false
      }
    });
    await expect(manager.loadUserData()).resolves.toEqual(expect.objectContaining({
      settings: expect.objectContaining({
        defaultTargetLanguage: 'fr',
        autoTranslate: false
      })
    }));

    await manager.saveUserData({ vocabulary: [{ word: 'fallback' }] });

    expect(syncState).toEqual(expect.objectContaining({
      settings: {
        defaultTargetLanguage: 'fr',
        autoTranslate: false
      },
      vocabulary: [{ word: 'fallback' }]
    }));
    expect(localState.userDataLocalFallbackV1).toBeUndefined();
  });

  it('retains legitimate learning preferences through the settings whitelist', async () => {
    await manager.saveUserData({
      settings: {
        dailyGoal: 35,
        reviewInterval: 'fixed',
        difficultyAdjustment: 'manual'
      } as any
    });

    expect(syncState.settings).toEqual({
      dailyGoal: 35,
      reviewInterval: 'fixed',
      difficultyAdjustment: 'manual'
    });
    await expect(manager.getSettings()).resolves.toEqual(expect.objectContaining({
      dailyGoal: 35,
      reviewInterval: 'fixed',
      difficultyAdjustment: 'manual'
    }));
  });

  it('prevents stale fallback rollback when sync succeeds but fallback removal fails', async () => {
    syncState.settings = { defaultTargetLanguage: 'fr' };
    localState.userDataLocalFallbackV1 = {
      settings: { defaultTargetLanguage: 'fr' }
    };
    localRemove.mockRejectedValueOnce(new Error('local removal failed'));

    await manager.saveUserData({
      settings: { defaultTargetLanguage: 'ja' } as any
    });

    expect(syncState.settings).toEqual({ defaultTargetLanguage: 'ja' });
    expect(localState.userDataLocalFallbackV1).toEqual({
      settings: { defaultTargetLanguage: 'ja' }
    });
    await expect(manager.loadUserData()).resolves.toEqual(expect.objectContaining({
      settings: expect.objectContaining({ defaultTargetLanguage: 'ja' })
    }));
  });

  it('uses the local safety fallback when synchronized storage cannot be read', async () => {
    localState.userDataLocalFallbackV1 = {
      settings: {
        defaultTargetLanguage: 'fr',
        sensitiveDataMaskingEnabled: true
      }
    };
    (chrome.storage.sync.get as jest.Mock).mockRejectedValueOnce(new Error('sync read failed'));

    await expect(manager.loadUserData()).resolves.toEqual(expect.objectContaining({
      settings: expect.objectContaining({
        defaultTargetLanguage: 'fr',
        sensitiveDataMaskingEnabled: true
      })
    }));
  });

  it('whitelists imported UserData before sync and local fallback persistence', async () => {
    localState = {
      translationProviderConfigs: {
        openai: { apiKey: 'existing-local-secret' }
      },
      aiExpertDefinitionsV1: [{ id: 'existing-expert' }],
      aiPromptTemplatesV1: [{ id: 'existing-template' }]
    };
    syncState.settings = { defaultTargetLanguage: 'en' };
    syncSet.mockImplementationOnce(async () => {
      throw new Error('sync unavailable');
    });

    await manager.importData(JSON.stringify({
      version: '1.0.0',
      data: {
        settings: {
          defaultTargetLanguage: 'ja',
          translationProviderConfigs: {
            openai: { apiKey: 'nested-imported-provider-secret' }
          },
          arbitrarySecret: 'nested-imported-arbitrary-secret'
        },
        vocabulary: [{ word: 'allowed' }],
        learningStats: { totalWordsLearned: 1 },
        dictionaryProgress: { cet4: { learnedWords: 1 } },
        translationProviderConfigs: {
          openai: { apiKey: 'imported-provider-secret' }
        },
        aiExpertDefinitionsV1: [{ id: 'imported-expert' }],
        aiExpertDisabledIdsV1: ['medical'],
        aiPromptTemplatesV1: [{ id: 'imported-template' }],
        arbitraryPrivateKey: 'imported-arbitrary-secret'
      }
    }));

    const allowedData = {
      settings: { defaultTargetLanguage: 'ja' },
      vocabulary: [{ word: 'allowed' }],
      learningStats: { totalWordsLearned: 1 },
      dictionaryProgress: { cet4: { learnedWords: 1 } }
    };
    expect(syncSet).toHaveBeenCalledWith(allowedData);
    expect(localState.userDataLocalFallbackV1).toEqual(allowedData);
    expect(localState.translationProviderConfigs).toEqual({
      openai: { apiKey: 'existing-local-secret' }
    });
    expect(localState.aiExpertDefinitionsV1).toEqual([{ id: 'existing-expert' }]);
    expect(localState.aiPromptTemplatesV1).toEqual([{ id: 'existing-template' }]);

    const writes = JSON.stringify([
      ...syncSet.mock.calls,
      ...localSet.mock.calls
    ]);
    expect(writes).not.toContain('imported-provider-secret');
    expect(writes).not.toContain('nested-imported-provider-secret');
    expect(writes).not.toContain('nested-imported-arbitrary-secret');
    expect(writes).not.toContain('imported-expert');
    expect(writes).not.toContain('imported-template');
    expect(writes).not.toContain('imported-arbitrary-secret');
  });

  it('persists custom experts locally, protects built-ins, and safely falls back when disabled', async () => {
    const definition = {
      schemaVersion: 1,
      id: 'database-editor',
      name: 'Database editor',
      version: '1.0.0',
      description: 'Terminology for database documentation.',
      instruction: 'Preserve SQL identifiers and database terminology.',
      source: { name: 'Local test', url: 'https://example.com/database-editor' }
    };

    await manager.installAiExpert(definition);
    expect(localState.aiExpertDefinitionsV1).toEqual([definition]);
    expect(syncSet).not.toHaveBeenCalled();
    await expect(manager.getAiExperts()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        definition: expect.objectContaining({ id: 'database-editor' }),
        enabled: true,
        builtIn: false
      })
    ]));

    await expect(manager.installAiExpert({
      ...definition,
      id: 'general',
      version: '99.0.0'
    })).rejects.toThrow(/cannot be replaced/);

    syncState.settings = { aiExpertId: 'database-editor' };
    await manager.setAiExpertEnabled('database-editor', false);
    expect(localState.aiExpertDisabledIdsV1).toContain('database-editor');
    expect(syncState.settings.aiExpertId).toBe('general');
  });

  it('installs versioned prompt templates locally and resets a removed selection', async () => {
    const template = {
      schemaVersion: 1,
      id: 'formal-template',
      name: 'Formal template',
      version: 2,
      source: 'local-test',
      systemPrompt: '{{domainInstruction}}\nTone: {{tone}}',
      variables: [{ name: 'tone', description: 'Writing tone', defaultValue: 'formal' }]
    };

    await manager.installPromptTemplate(template);
    expect(localState.aiPromptTemplatesV1).toEqual([template]);
    await expect(manager.installPromptTemplate({
      ...template,
      version: 1
    })).rejects.toThrow(/downgrade/);

    syncState.settings = {
      aiPromptTemplateId: 'formal-template',
      aiPromptVariables: { tone: 'strict' }
    };
    await expect(manager.removePromptTemplate('formal-template')).resolves.toBe(true);
    expect(localState.aiPromptTemplatesV1).toEqual([]);
    expect(syncState.settings).toEqual(expect.objectContaining({
      aiPromptTemplateId: 'lexibridge-default',
      aiPromptVariables: {}
    }));
    await expect(manager.removePromptTemplate('lexibridge-default'))
      .rejects.toThrow(/cannot be removed/);
  });

  it('keeps expert and template definitions out of Chrome Sync', async () => {
    localState = {
      settings: { translationProvider: 'openai' },
      vocabulary: [{ word: 'local' }],
      translationProviderConfigs: { openai: { apiKey: 'secret' } },
      aiExpertDefinitionsV1: [{ id: 'private-expert' }],
      aiExpertDisabledIdsV1: ['medical'],
      aiPromptTemplatesV1: [{ id: 'private-template' }],
      backup: { settings: { aiCustomPrompt: 'private backup' } },
      arbitraryLocalKey: { secret: 'private arbitrary value' }
    };

    await manager.syncData();

    expect(syncSet).toHaveBeenCalledWith({
      settings: { translationProvider: 'openai' },
      vocabulary: [{ word: 'local' }]
    });
    expect(JSON.stringify(syncSet.mock.calls)).not.toContain('private-expert');
    expect(JSON.stringify(syncSet.mock.calls)).not.toContain('private-template');
    expect(JSON.stringify(syncSet.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(syncSet.mock.calls)).not.toContain('private backup');
    expect(JSON.stringify(syncSet.mock.calls)).not.toContain('private arbitrary value');
  });
});
