let namespaceSequence = 0;

function createEntropy(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(12);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }

  return Math.random().toString(36).slice(2, 14).padEnd(12, '0');
}

export function createTranslationRequestNamespace(scope: string): string {
  const safeScope = scope.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'translation';
  namespaceSequence += 1;
  return [
    safeScope,
    Date.now().toString(36),
    namespaceSequence.toString(36),
    createEntropy()
  ].join(':');
}
