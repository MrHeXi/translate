interface SidePanelOpenOptions {
  tabId?: number;
  windowId?: number;
}

interface SidePanelOpenApi {
  open(options: SidePanelOpenOptions): Promise<void>;
}

interface SidebarActionOpenApi {
  open(): Promise<void>;
}

export const openTranslationSidePanel = async (): Promise<boolean> => {
  const extensionApis = chrome as unknown as {
    sidePanel?: SidePanelOpenApi;
    sidebarAction?: SidebarActionOpenApi;
  };

  if (extensionApis.sidePanel?.open) {
    await extensionApis.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    return true;
  }

  if (extensionApis.sidebarAction?.open) {
    await extensionApis.sidebarAction.open();
    return true;
  }

  return false;
};
