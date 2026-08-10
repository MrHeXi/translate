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

  it('falls back to the Firefox sidebar while preserving the immediate open call', async () => {
    let resolveOpen: (() => void) | undefined;
    const open = jest.fn(() => new Promise<void>(resolve => {
      resolveOpen = resolve;
    }));
    (global as any).chrome = {
      sidebarAction: { open },
      windows: { WINDOW_ID_CURRENT: -2 }
    };

    const result = openTranslationSidePanel();

    expect(open).toHaveBeenCalledTimes(1);
    resolveOpen?.();
    await expect(result).resolves.toBe(true);
  });

  it('prefers the Chrome side panel when both APIs exist', async () => {
    const sidePanelOpen = jest.fn().mockResolvedValue(undefined);
    const sidebarOpen = jest.fn().mockResolvedValue(undefined);
    (global as any).chrome = {
      sidePanel: { open: sidePanelOpen },
      sidebarAction: { open: sidebarOpen },
      windows: { WINDOW_ID_CURRENT: -2 }
    };

    await expect(openTranslationSidePanel()).resolves.toBe(true);
    expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: -2 });
    expect(sidebarOpen).not.toHaveBeenCalled();
  });

  it('reports unsupported browsers without throwing', async () => {
    (global as any).chrome = {
      windows: { WINDOW_ID_CURRENT: -2 }
    };

    await expect(openTranslationSidePanel()).resolves.toBe(false);
  });
});
