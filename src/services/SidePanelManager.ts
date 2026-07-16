interface SidePanelOpenOptions {
  tabId?: number;
  windowId?: number;
}

interface SidePanelOpenApi {
  open(options: SidePanelOpenOptions): Promise<void>;
}

export const openTranslationSidePanel = async (): Promise<boolean> => {
  const sidePanel = (chrome as unknown as { sidePanel?: SidePanelOpenApi }).sidePanel;
  if (!sidePanel?.open) return false;

  await sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  return true;
};
