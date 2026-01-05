declare const mockChrome: {
    runtime: {
        sendMessage: jest.Mock<any, any, any>;
        onMessage: {
            addListener: jest.Mock<any, any, any>;
        };
        getURL: jest.Mock<string, [path: string], any>;
    };
    storage: {
        local: {
            get: jest.Mock<any, any, any>;
            set: jest.Mock<any, any, any>;
            clear: jest.Mock<any, any, any>;
            getBytesInUse: jest.Mock<any, any, any>;
        };
        sync: {
            get: jest.Mock<any, any, any>;
            set: jest.Mock<any, any, any>;
            clear: jest.Mock<any, any, any>;
            getBytesInUse: jest.Mock<any, any, any>;
        };
        onChanged: {
            addListener: jest.Mock<any, any, any>;
        };
    };
    tabs: {
        query: jest.Mock<any, any, any>;
        sendMessage: jest.Mock<any, any, any>;
        create: jest.Mock<any, any, any>;
    };
};
//# sourceMappingURL=setup.d.ts.map