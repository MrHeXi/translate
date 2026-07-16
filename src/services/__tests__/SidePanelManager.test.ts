import { openTranslationSidePanel } from '../SidePanelManager';

describe('SidePanelManager', () => {
  it('opens the extension side panel in the current window', async () => {
    const open = jest.fn().mockResolvedValue(undefined);
    (global as any).chrome = {
      sidePanel: { open },
      windows: { WINDOW_ID_CURRENT: -2 }
    };

    await expect(openTranslationSidePanel()).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith({ windowId: -2 });
  });

  it('reports unsupported browsers without throwing', async () => {
    (global as any).chrome = {
      windows: { WINDOW_ID_CURRENT: -2 }
    };

    await expect(openTranslationSidePanel()).resolves.toBe(false);
  });
});
