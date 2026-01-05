export interface UserSettings {
    defaultTargetLanguage: string;
    translationProvider: string;
    floatingIconPosition: {
        x: number;
        y: number;
    };
    learningModeEnabled: boolean;
    activeDictionaries: string[];
    highlightColors: {
        [key: string]: string;
    };
    autoTranslate: boolean;
    showFloatingIcon: boolean;
}
export interface UserData {
    settings: UserSettings;
    vocabulary: any[];
    learningStats: any;
    dictionaryProgress: {
        [key: string]: any;
    };
}
export declare class StorageManager {
    private defaultSettings;
    saveUserData(data: Partial<UserData>): Promise<void>;
    loadUserData(): Promise<UserData>;
    saveSettings(settings: Partial<UserSettings>): Promise<void>;
    getSettings(): Promise<UserSettings>;
    exportData(): Promise<string>;
    importData(jsonData: string): Promise<void>;
    clearAllData(): Promise<void>;
    getStorageUsage(): Promise<{
        sync: number;
        local: number;
    }>;
    syncData(): Promise<void>;
    onStorageChanged(callback: (changes: {
        [key: string]: chrome.storage.StorageChange;
    }) => void): void;
    getValue(key: string): Promise<any>;
    setValue(key: string, value: any): Promise<void>;
}
//# sourceMappingURL=StorageManager.d.ts.map