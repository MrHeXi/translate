import {
  SENSITIVE_DATA_MAX_FIELD_LENGTH,
  SENSITIVE_DATA_MAX_FIELDS,
  SENSITIVE_DATA_MAX_MATCHES,
  SensitiveDataMaskingSession,
  createSensitiveDataMaskingSession
} from '../SensitiveDataMasker';

const PLACEHOLDER_PATTERN = /\[\[LEXIBRIDGE_MASK_[A-Z0-9]+_[A-Z0-9]+\]\]/g;

function maskSingle(
  text: string,
  requireRestoration = true,
  id = 'source'
): { session: SensitiveDataMaskingSession; masked: string } {
  const session = createSensitiveDataMaskingSession();
  const result = session.maskFields([{ id, text, requireRestoration }]);
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') throw new Error(result.message);
  return { session, masked: result.fields[0].text };
}

function placeholders(text: string): string[] {
  return text.match(PLACEHOLDER_PATTERN) || [];
}

function credentialBody(
  length: number,
  seed = 0,
  alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
): string {
  return Array.from(
    { length },
    (_, index) => alphabet[(index * 17 + seed * 11) % alphabet.length]
  ).join('');
}

function wrapPrivateKeyPem(label: string, bytes: Buffer, lineEnding = '\n'): string {
  const encoded = bytes.toString('base64');
  const lines = encoded.match(/.{1,64}/g) || [];
  return [
    `-----BEGIN ${label}-----`,
    ...lines,
    `-----END ${label}-----`
  ].join(lineEnding);
}

function derPrivateKeyPem(label: string, lineEnding = '\n'): string {
  const contentLength = 157;
  const bytes = Buffer.alloc(contentLength + 3);
  bytes[0] = 0x30;
  bytes[1] = 0x81;
  bytes[2] = contentLength;
  for (let index = 3; index < bytes.length; index += 1) {
    bytes[index] = (index * 37 + 11) % 256;
  }
  return wrapPrivateKeyPem(label, bytes, lineEnding);
}

function openSshPrivateKeyPem(lineEnding = '\n'): string {
  const bytes = Buffer.alloc(180);
  Buffer.from('openssh-key-v1\0', 'ascii').copy(bytes);
  for (let index = 15; index < bytes.length; index += 1) {
    bytes[index] = (index * 29 + 7) % 256;
  }
  return wrapPrivateKeyPem('OPENSSH PRIVATE KEY', bytes, lineEnding);
}

function azureStorageAccountKey(seed = 0): string {
  const bytes = Buffer.alloc(64);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (index * 43 + seed * 31 + 17) % 256;
  }
  return bytes.toString('base64');
}

describe('SensitiveDataMasker', () => {
  it('masks supported sensitive values but leaves ordinary short numbers intact', () => {
    const original = [
      'email alice@example.com',
      'phone +1 (415) 555-2671',
      'card 4111 1111 1111 1111',
      'ip 192.168.10.24',
      'iban GB82 WEST 1234 5698 7654 32',
      'url https://example.test/callback?token=top-secret&safe=1234&api_key=key%2042',
      'camel https://example.test/?accessToken=camel-secret&clientSecret=second-secret',
      'short 1234 and invalid-card 4111 1111 1111 1112'
    ].join('\n');

    const { session, masked } = maskSingle(original);

    expect(placeholders(masked)).toHaveLength(9);
    expect(masked).not.toContain('alice@example.com');
    expect(masked).not.toContain('+1 (415) 555-2671');
    expect(masked).not.toContain('4111 1111 1111 1111');
    expect(masked).not.toContain('192.168.10.24');
    expect(masked).not.toContain('GB82 WEST 1234 5698 7654 32');
    expect(masked).not.toContain('top-secret');
    expect(masked).not.toContain('key%2042');
    expect(masked).not.toContain('camel-secret');
    expect(masked).not.toContain('second-secret');
    expect(masked).toContain('safe=1234');
    expect(masked).toContain('short 1234');
    expect(masked).toContain('invalid-card 4111 1111 1111 1112');

    const restored = session.restoreFields([{ id: 'source', text: masked }]);
    expect(restored).toEqual({ status: 'ok', fields: [{ id: 'source', text: original }] });
  });

  it('masks strictly valid IPv6 addresses and JWTs while leaving lookalikes intact', () => {
    const ipv6 = '2001:db8:85a3::8a2e:370:7334';
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImFkbWluIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const original = [
      `IPv6 ${ipv6}`,
      `JWT ${jwt}`,
      'invalid IPv6 2001:db8:::1 and 1:2:3',
      'not-a-JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnopqrstuvwxyz'
    ].join('\n');
    const { session, masked } = maskSingle(original);

    expect(placeholders(masked)).toHaveLength(2);
    expect(masked).not.toContain(ipv6);
    expect(masked).not.toContain(jwt);
    expect(masked).toContain('2001:db8:::1');
    expect(masked).toContain('1:2:3');
    expect(masked).toContain('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnopqrstuvwxyz');
    expect(session.restoreFields([{ id: 'source', text: masked }])).toEqual({
      status: 'ok', fields: [{ id: 'source', text: original }]
    });
  });

  it('fails closed for duplicated, transformed, unknown, and cross-field IPv6/JWT placeholders', () => {
    const ipv6 = '2001:db8::42';
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiIsInNjb3BlIjoid3JpdGUifQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const session = createSensitiveDataMaskingSession();
    const masked = session.maskFields([
      { id: 'source', text: `Endpoint ${ipv6}`, requireRestoration: true },
      { id: 'other', text: `Credential ${jwt}`, requireRestoration: true },
      { id: 'context', text: `Repeated endpoint ${ipv6}`, requireRestoration: false }
    ]);
    expect(masked.status).toBe('ok');
    if (masked.status !== 'ok') return;

    const ipv6Token = placeholders(masked.fields[0].text)[0];
    const jwtToken = placeholders(masked.fields[1].text)[0];
    expect(placeholders(masked.fields[2].text)).toEqual([ipv6Token]);
    expect(session.restoreFields([
      { id: 'source', text: `Translated ${ipv6Token}` },
      { id: 'other', text: `Translated ${jwtToken}` }
    ])).toEqual({
      status: 'ok',
      fields: [
        { id: 'source', text: `Translated ${ipv6}` },
        { id: 'other', text: `Translated ${jwt}` }
      ]
    });

    const duplicate = session.restoreFields([
      { id: 'source', text: `${ipv6Token} ${ipv6Token}` },
      { id: 'other', text: jwtToken }
    ]);
    expect(duplicate).toEqual(expect.objectContaining({
      status: 'ambiguous', reason: 'duplicate-placeholder'
    }));

    const transformed = session.restoreFields([
      { id: 'source', text: ipv6Token.toLowerCase() },
      { id: 'other', text: jwtToken }
    ]);
    expect(transformed).toEqual(expect.objectContaining({
      status: 'ambiguous', reason: 'transformed-placeholder'
    }));

    const unknown = session.restoreFields([
      { id: 'source', text: '[[LEXIBRIDGE_MASK_UNKNOWN_1]]' },
      { id: 'other', text: jwtToken }
    ]);
    expect(unknown).toEqual(expect.objectContaining({
      status: 'ambiguous', reason: 'unknown-placeholder'
    }));

    const crossField = session.restoreFields([
      { id: 'source', text: `${ipv6Token} ${jwtToken}` },
      { id: 'other', text: jwtToken }
    ]);
    expect(crossField).toEqual(expect.objectContaining({
      status: 'ambiguous', reason: 'unexpected-placeholder'
    }));
    for (const result of [duplicate, transformed, unknown, crossField]) {
      expect(result).not.toHaveProperty('fields');
    }
  });

  it('masks each supported private-key PEM format as one complete block', () => {
    const privateKeys = [
      derPrivateKeyPem('PRIVATE KEY'),
      derPrivateKeyPem('ENCRYPTED PRIVATE KEY'),
      derPrivateKeyPem('RSA PRIVATE KEY', '\r\n'),
      derPrivateKeyPem('DSA PRIVATE KEY'),
      derPrivateKeyPem('EC PRIVATE KEY'),
      openSshPrivateKeyPem('\r\n')
    ];
    const original = `before\n${privateKeys.join('\nseparator\n')}\nafter`;
    const session = createSensitiveDataMaskingSession();
    const result = session.maskFields([{ id: 'source', text: original, requireRestoration: true }]);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.maskedMatchCount).toBe(6);
    expect(placeholders(result.fields[0].text)).toHaveLength(6);
    expect(result.fields[0].text).not.toContain('BEGIN PRIVATE KEY');
    expect(result.fields[0].text).not.toContain('BEGIN ENCRYPTED PRIVATE KEY');
    expect(result.fields[0].text).not.toContain('BEGIN DSA PRIVATE KEY');
    expect(result.fields[0].text).not.toContain('BEGIN OPENSSH PRIVATE KEY');
    expect(session.restoreFields([{ id: 'source', text: result.fields[0].text }])).toEqual({
      status: 'ok',
      fields: [{ id: 'source', text: original }]
    });
  });

  it('rejects malformed, mismatched, short, and non-key base64 PEM lookalikes', () => {
    const valid = derPrivateKeyPem('PRIVATE KEY');
    const mismatched = valid.replace('END PRIVATE KEY', 'END RSA PRIVATE KEY');
    const malformed = valid.replace(/\n([A-Za-z0-9+/])/, '\n!$1');
    const shortDer = wrapPrivateKeyPem('PRIVATE KEY', Buffer.from([0x30, 0x02, 0x01, 0x00]));
    const randomBytes = Buffer.alloc(160);
    for (let index = 0; index < randomBytes.length; index += 1) randomBytes[index] = (index * 19 + 5) % 256;
    const nonDerPem = wrapPrivateKeyPem('RSA PRIVATE KEY', randomBytes);
    const ordinaryBase64 = randomBytes.toString('base64');
    const original = [mismatched, malformed, shortDer, nonDerPem, ordinaryBase64].join('\n---\n');
    const { masked } = maskSingle(original);

    expect({ masked, placeholders: placeholders(masked) }).toEqual({
      masked: original,
      placeholders: []
    });
  });

  it('masks strict AWS, GitHub, and scoped OpenAI credential structures', () => {
    const credentials = [
      `AKIA${credentialBody(16, 1, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}`,
      `ASIA${credentialBody(16, 2, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}`,
      `ghp_${credentialBody(36, 3)}`,
      `gho_${credentialBody(36, 4)}`,
      `ghu_${credentialBody(36, 5)}`,
      `ghs_${credentialBody(36, 6)}`,
      `ghs_${credentialBody(12, 30)}_${credentialBody(80, 31)}.${credentialBody(120, 32)}.${credentialBody(86, 33)}`,
      `ghr_${credentialBody(76, 7)}`,
      `github_pat_${credentialBody(22, 8)}_${credentialBody(59, 9)}`,
      `sk-proj-${credentialBody(64, 10)}`,
      `sk-svcacct-${credentialBody(72, 11)}`,
      `sk-admin-${credentialBody(48, 12)}`
    ];
    const original = credentials.map((credential, index) => `credential-${index}=${credential}`).join('\n');
    const { session, masked } = maskSingle(original);

    expect(placeholders(masked)).toHaveLength(credentials.length);
    for (const credential of credentials) expect(masked).not.toContain(credential);
    expect(session.restoreFields([{ id: 'source', text: masked }])).toEqual({
      status: 'ok',
      fields: [{ id: 'source', text: original }]
    });
  });

  it('leaves credential placeholders, bad boundaries, bad lengths, and illegal structures intact', () => {
    const aws = `AKIA${credentialBody(16, 13, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}`;
    const github = `ghp_${credentialBody(36, 14)}`;
    const openAiBody = credentialBody(64, 15);
    const ordinaryBase64 = Buffer.from(credentialBody(120, 16)).toString('base64');
    const lookalikes = [
      'AKIAIOSFODNN7EXAMPLE',
      'AKIA1234567890123456',
      `x${aws}`,
      `${aws}Z`,
      `akia${credentialBody(16, 17, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}`,
      `_${github}`,
      `${github}_suffix`,
      `ghs_${credentialBody(80, 34)}.${credentialBody(80, 35)}`,
      `ghp_${credentialBody(35, 18)}`,
      `gho_${'A'.repeat(36)}`,
      `github_pat_${credentialBody(21, 19)}_${credentialBody(60, 20)}`,
      'sk-ordinary-product-name',
      `sk-proj-${credentialBody(39, 21)}`,
      `sk-proj-${'A'.repeat(64)}`,
      `sk-svcacct-EXAMPLE_${credentialBody(64, 22)}`,
      `sk-proj-${openAiBody.slice(0, 20)}!${openAiBody.slice(20)}`,
      ordinaryBase64
    ];
    const original = lookalikes.join('\n');
    for (const value of lookalikes) {
      const maskedValue = maskSingle(value).masked;
      expect({ value, placeholders: placeholders(maskedValue) }).toEqual({
        value,
        placeholders: []
      });
    }
    const { masked } = maskSingle(original);

    expect(placeholders(masked)).toHaveLength(0);
    expect(masked).toBe(original);
  });

  it('preserves repeated and cross-field credential restoration semantics and rejects tampering', () => {
    const github = `ghp_${credentialBody(36, 23)}`;
    const aws = `ASIA${credentialBody(16, 24, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}`;
    const privateKey = derPrivateKeyPem('EC PRIVATE KEY');
    const session = createSensitiveDataMaskingSession();
    const masked = session.maskFields([
      { id: 'source', text: `GitHub ${github}\n${privateKey}`, requireRestoration: true },
      { id: 'other', text: `Again ${github} and AWS ${aws}`, requireRestoration: true },
      { id: 'context', text: `Context ${github}\n${privateKey}`, requireRestoration: false }
    ]);
    expect(masked.status).toBe('ok');
    if (masked.status !== 'ok') return;

    const [githubToken, privateKeyToken] = placeholders(masked.fields[0].text);
    const [sharedGithubToken, awsToken] = placeholders(masked.fields[1].text);
    expect(sharedGithubToken).toBe(githubToken);
    expect(placeholders(masked.fields[2].text)).toEqual([githubToken, privateKeyToken]);
    expect(session.restoreFields([
      { id: 'source', text: `Translated ${githubToken}\n${privateKeyToken}` },
      { id: 'other', text: `Translated ${sharedGithubToken} ${awsToken}` }
    ])).toEqual({
      status: 'ok',
      fields: [
        { id: 'source', text: `Translated ${github}\n${privateKey}` },
        { id: 'other', text: `Translated ${github} ${aws}` }
      ]
    });

    const duplicate = session.restoreFields([
      { id: 'source', text: `${githubToken} ${githubToken} ${privateKeyToken}` },
      { id: 'other', text: `${sharedGithubToken} ${awsToken}` }
    ]);
    expect(duplicate).toEqual(expect.objectContaining({
      status: 'ambiguous', reason: 'duplicate-placeholder'
    }));

    const transformed = session.restoreFields([
      { id: 'source', text: `${githubToken.toLowerCase()} ${privateKeyToken}` },
      { id: 'other', text: `${sharedGithubToken} ${awsToken}` }
    ]);
    expect(transformed).toEqual(expect.objectContaining({
      status: 'ambiguous', reason: 'transformed-placeholder'
    }));

    const crossField = session.restoreFields([
      { id: 'source', text: `${githubToken} ${privateKeyToken} ${awsToken}` },
      { id: 'other', text: `${sharedGithubToken} ${awsToken}` }
    ]);
    expect(crossField).toEqual(expect.objectContaining({
      status: 'ambiguous', reason: 'unexpected-placeholder'
    }));
    for (const result of [duplicate, transformed, crossField]) expect(result).not.toHaveProperty('fields');
  });

  it('masks strict GitLab, Slack, Stripe, Google, Azure, and database credentials', () => {
    const gitlab = `glpat-${credentialBody(28, 40)}`;
    const slackBot = `xoxb-123456789012-987654321098-${credentialBody(24, 41)}`;
    const slackUser = `xoxp-123456789012-987654321098-${credentialBody(24, 42)}`;
    const slackApp = `xapp-1-${credentialBody(28, 43)}-${credentialBody(32, 44)}`;
    const stripeSecret = `sk_live_${credentialBody(32, 45)}`;
    const stripeTest = `sk_test_${credentialBody(32, 46)}`;
    const stripeRestricted = `rk_test_${credentialBody(32, 61)}`;
    const stripeRestrictedLive = `rk_live_${credentialBody(32, 62)}`;
    const google = `AIza${credentialBody(35, 47, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-')}`;
    const azureKey = azureStorageAccountKey(48);
    const azure = `DefaultEndpointsProtocol=https;AccountName=lexibridge123;AccountKey=${azureKey};EndpointSuffix=core.windows.net`;
    const databasePasswords = ['P%40ssw0rd!42', 'm0Ng0%2FK8vQ', 'mY5ql-X7vQ9', 'mY5ql-K8qV7'];
    const databaseUris = [
      `postgresql://translator:${databasePasswords[0]}@db.example.test:5432/app`,
      `mongodb+srv://reader:${databasePasswords[1]}@cluster.example.test/app?retryWrites=true`,
      `mysqlx://worker:${databasePasswords[2]}@db.example.test:33060/app`,
      `mysql://worker:${databasePasswords[3]}@db.example.test:3306/app`
    ];
    const credentials = [
      gitlab, slackBot, slackUser, slackApp,
      stripeSecret, stripeTest, stripeRestricted, stripeRestrictedLive, google, azureKey,
      ...databasePasswords
    ];
    const original = [
      `gitlab=${gitlab}`,
      `slack-bot=${slackBot}`,
      `slack-user=${slackUser}`,
      `slack-app=${slackApp}`,
      `stripe-secret=${stripeSecret}`,
      `stripe-test=${stripeTest}`,
      `stripe-restricted=${stripeRestricted}`,
      `stripe-restricted-live=${stripeRestrictedLive}`,
      `google=${google}`,
      azure,
      ...databaseUris
    ].join('\n');
    const { session, masked } = maskSingle(original);

    expect(placeholders(masked)).toHaveLength(credentials.length);
    for (const credential of credentials) expect(masked).not.toContain(credential);
    expect(masked).toContain('DefaultEndpointsProtocol=https;AccountName=lexibridge123;AccountKey=');
    expect(masked).toContain(';EndpointSuffix=core.windows.net');
    expect(masked).toContain('postgresql://translator:');
    expect(masked).toContain('@db.example.test:5432/app');
    expect(session.restoreFields([{ id: 'source', text: masked }])).toEqual({
      status: 'ok',
      fields: [{ id: 'source', text: original }]
    });
  });

  it('masks the database password occurrence when it repeats in the URI prefix', () => {
    const original = 'postgresql://postgresql:postgresql@db.example.test/app';
    const { session, masked } = maskSingle(original);

    expect(masked).toMatch(/^postgresql:\/\/postgresql:\[\[LEXIBRIDGE_MASK_/);
    expect(masked).toContain(']]@db.example.test/app');
    expect(session.restoreFields([{ id: 'source', text: masked }])).toEqual({
      status: 'ok', fields: [{ id: 'source', text: original }]
    });
  });

  it('leaves provider and connection-string lookalikes or public identifiers intact', () => {
    const validGitLab = `glpat-${credentialBody(28, 49)}`;
    const validGoogle = `AIza${credentialBody(35, 50, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-')}`;
    const validAzureKey = azureStorageAccountKey(51);
    const shortAzureKey = Buffer.alloc(63, 37).toString('base64');
    const lookalikes = [
      'glpat-EXAMPLE_TOKEN_FOR_DOCUMENTATION',
      `glpat-${credentialBody(19, 52)}`,
      `prefix_${validGitLab}`,
      `xoxb-${'1'.repeat(40)}`,
      `xoxa-${credentialBody(40, 53)}`,
      `prefix_xoxb-${credentialBody(32, 58)}`,
      `xoxb-${credentialBody(32, 59)}_suffix`,
      `sk_live_${'A'.repeat(32)}`,
      `pk_live_${credentialBody(32, 54)}`,
      `sk_live_${credentialBody(23, 55)}`,
      `sk_live_${credentialBody(32, 60)}_suffix`,
      `AIza${credentialBody(34, 56)}`,
      `prefix-${validGoogle}`,
      `DefaultEndpointsProtocol=https;AccountName=UpperCase;AccountKey=${validAzureKey}`,
      `DefaultEndpointsProtocol=https;AccountName=validaccount;AccountKey=${shortAzureKey}`,
      `AccountKey=${validAzureKey}`,
      'UseDevelopmentStorage=true',
      'postgresql://translator@db.example.test/app',
      'postgresql://translator:@db.example.test/app',
      'postgresql://translator:password@localhost/app',
      'postgresql://translator:test@localhost/app',
      'postgresql://translator:bad%value@localhost/app'
    ];
    const original = lookalikes.join('\n');
    const { masked } = maskSingle(original);

    expect({ masked, placeholders: placeholders(masked) }).toEqual({
      masked: original,
      placeholders: []
    });
  });

  it('masks checksum-valid Chinese resident IDs and rejects malformed lookalikes', () => {
    const residentId = '11010519491231002X';
    const original = [
      `resident=${residentId}`,
      'wrong-checksum=110105194912310021',
      'impossible-date=110105199902300026',
      'unknown-region=990105194912310025',
      'empty-sequence=11010519491231000X',
      'ordinary-number=123456789012345678'
    ].join('\n');
    const { session, masked } = maskSingle(original);

    expect(placeholders(masked)).toHaveLength(1);
    expect(masked).not.toContain(residentId);
    expect(masked).not.toMatch(/\]\]X/);
    expect(masked).toContain('110105194912310021');
    expect(masked).toContain('110105199902300026');
    expect(masked).toContain('990105194912310025');
    expect(masked).toContain('11010519491231000X');
    expect(masked).toContain('123456789012345678');
    expect(session.restoreFields([{ id: 'source', text: masked }])).toEqual({
      status: 'ok', fields: [{ id: 'source', text: original }]
    });
  });

  it('keeps fail-closed restoration for new credentials across repeated and crossed fields', () => {
    const gitlab = `glpat-${credentialBody(28, 57)}`;
    const databasePassword = 'R3al%40DbK8vQ!';
    const sourceText = `GitLab ${gitlab}; postgres://user:${databasePassword}@db.example.test/app`;
    const session = createSensitiveDataMaskingSession();
    const result = session.maskFields([
      { id: 'source', text: sourceText, requireRestoration: true },
      { id: 'other', text: `Again ${gitlab}`, requireRestoration: true },
      { id: 'context', text: `Context ${gitlab}`, requireRestoration: false }
    ]);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const [gitlabToken, passwordToken] = placeholders(result.fields[0].text);
    const sharedGitlabToken = placeholders(result.fields[1].text)[0];
    expect(sharedGitlabToken).toBe(gitlabToken);
    expect(placeholders(result.fields[2].text)).toEqual([gitlabToken]);
    expect(session.restoreFields([
      { id: 'source', text: `${gitlabToken} ${passwordToken}` },
      { id: 'other', text: sharedGitlabToken }
    ])).toEqual({
      status: 'ok',
      fields: [
        { id: 'source', text: `${gitlab} ${databasePassword}` },
        { id: 'other', text: gitlab }
      ]
    });

    const duplicate = session.restoreFields([
      { id: 'source', text: `${gitlabToken} ${passwordToken} ${passwordToken}` },
      { id: 'other', text: sharedGitlabToken }
    ]);
    const transformed = session.restoreFields([
      { id: 'source', text: `${gitlabToken.toLowerCase()} ${passwordToken}` },
      { id: 'other', text: sharedGitlabToken }
    ]);
    const crossField = session.restoreFields([
      { id: 'source', text: `${gitlabToken} ${passwordToken}` },
      { id: 'other', text: `${sharedGitlabToken} ${passwordToken}` }
    ]);

    expect(duplicate).toEqual(expect.objectContaining({ status: 'ambiguous', reason: 'duplicate-placeholder' }));
    expect(transformed).toEqual(expect.objectContaining({ status: 'ambiguous', reason: 'transformed-placeholder' }));
    expect(crossField).toEqual(expect.objectContaining({ status: 'ambiguous', reason: 'unexpected-placeholder' }));
    for (const ambiguous of [duplicate, transformed, crossField]) {
      expect(ambiguous).not.toHaveProperty('fields');
      expect(JSON.stringify(ambiguous)).not.toContain(gitlab);
      expect(JSON.stringify(ambiguous)).not.toContain(databasePassword);
    }
  });

  it('allocates distinct restorable placeholders for a credential repeated in one field', () => {
    const credential = `sk-proj-${credentialBody(64, 26)}`;
    const original = `${credential}\nagain ${credential}`;
    const { session, masked } = maskSingle(original);
    const tokens = placeholders(masked);

    expect(tokens).toHaveLength(2);
    expect(new Set(tokens).size).toBe(2);
    expect(session.restoreFields([{ id: 'source', text: masked }])).toEqual({
      status: 'ok',
      fields: [{ id: 'source', text: original }]
    });
  });

  it('fails closed when credential matches exceed the shared match limit', () => {
    const credential = `ghp_${credentialBody(36, 25)}`;
    const repeatedCredentials = Array.from(
      { length: SENSITIVE_DATA_MAX_MATCHES + 1 },
      () => credential
    ).join(' ');

    expect(createSensitiveDataMaskingSession().maskFields([{
      id: 'source', text: repeatedCredentials, requireRestoration: true
    }])).toEqual(expect.objectContaining({ status: 'rejected', reason: 'too-many-matches' }));
  });

  it('uses a shared primary placeholder for the same secret across fields', () => {
    const session = createSensitiveDataMaskingSession();
    const result = session.maskFields([
      { id: 'source-a', text: 'Email alice@example.com', requireRestoration: true },
      { id: 'source-b', text: 'Again alice@example.com', requireRestoration: true },
      { id: 'context', text: 'Context alice@example.com', requireRestoration: false }
    ]);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const sourceAPlaceholder = placeholders(result.fields[0].text)[0];
    expect(placeholders(result.fields[1].text)).toEqual([sourceAPlaceholder]);
    expect(placeholders(result.fields[2].text)).toEqual([sourceAPlaceholder]);

    expect(session.restoreFields([
      { id: 'source-a', text: `Translated ${sourceAPlaceholder}` },
      { id: 'source-b', text: `Other ${sourceAPlaceholder}` }
    ])).toEqual({
      status: 'ok',
      fields: [
        { id: 'source-a', text: 'Translated alice@example.com' },
        { id: 'source-b', text: 'Other alice@example.com' }
      ]
    });
  });

  it('fails closed when any required field is omitted from a multi-field restoration', () => {
    const session = createSensitiveDataMaskingSession();
    const masked = session.maskFields([
      { id: 'title', text: 'Owner alice@example.com', requireRestoration: true },
      { id: 'body', text: 'Call +1 415-555-2671', requireRestoration: true },
      { id: 'context', text: 'Host 192.168.1.10', requireRestoration: false }
    ]);
    expect(masked.status).toBe('ok');
    if (masked.status !== 'ok') return;

    const titleToken = placeholders(masked.fields[0].text)[0];
    const result = session.restoreFields([
      { id: 'title', text: `Translated ${titleToken}` }
    ]);

    expect(result).toEqual(expect.objectContaining({
      status: 'ambiguous',
      reason: 'missing-placeholder',
      reasons: expect.arrayContaining(['missing-placeholder']),
      fieldIds: ['body']
    }));
    expect(result).not.toHaveProperty('fields');
  });

  it('allocates distinct placeholders when one secret occurs multiple times in one field', () => {
    const original = 'alice@example.com and alice@example.com';
    const { session, masked } = maskSingle(original);
    const tokens = placeholders(masked);

    expect(tokens).toHaveLength(2);
    expect(new Set(tokens).size).toBe(2);
    expect(session.restoreFields([{ id: 'source', text: masked }])).toEqual({
      status: 'ok',
      fields: [{ id: 'source', text: original }]
    });
  });

  it('does not require context or prompt placeholders in translated output', () => {
    const session = createSensitiveDataMaskingSession();
    const result = session.maskFields([
      { id: 'source', text: 'Hello alice@example.com', requireRestoration: true },
      { id: 'context', text: 'Account 4111 1111 1111 1111', requireRestoration: false },
      { id: 'prompt', text: 'Call +1 415-555-2671', requireRestoration: false }
    ]);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const sourceToken = placeholders(result.fields[0].text)[0];
    const contextToken = placeholders(result.fields[1].text)[0];
    expect(session.restoreFields([{ id: 'source', text: `Bonjour ${sourceToken}` }])).toEqual({
      status: 'ok',
      fields: [{ id: 'source', text: 'Bonjour alice@example.com' }]
    });

    const leakedContextToken = session.restoreFields([{
      id: 'source',
      text: `Bonjour ${sourceToken} ${contextToken}`
    }]);
    expect(leakedContextToken).toEqual(expect.objectContaining({
      status: 'ambiguous',
      reason: 'unexpected-placeholder'
    }));
    expect(leakedContextToken).not.toHaveProperty('fields');
  });

  it.each([
    ['missing-placeholder', () => 'translated without token'],
    ['duplicate-placeholder', (token: string) => `${token} and ${token}`],
    ['transformed-placeholder', (token: string) => token.toLowerCase()],
    ['transformed-placeholder', (token: string) => token.replace('LEXIBRIDGE', 'LEXI\u200BBRIDGE')],
    ['transformed-placeholder', (token: string) => token.replace(/_/g, '-')],
    ['transformed-placeholder', (token: string) => token.replace('LEXIBRIDGE', 'LEXLBRIDGE')]
  ])('returns ambiguous for %s output and never returns partial text', (reason, mutate) => {
    const secret = 'leak-check@example.com';
    const { session, masked } = maskSingle(secret);
    const token = placeholders(masked)[0];

    const result = session.restoreFields([{ id: 'source', text: mutate(token) }]);

    expect(result.status).toBe('ambiguous');
    if (result.status !== 'ambiguous') return;
    expect(result.reason).toBe(reason);
    expect(result.reasons).toContain(reason);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result).not.toHaveProperty('fields');
  });

  it('rejects unknown session tokens and known tokens from another field as ambiguous', () => {
    const first = maskSingle('first@example.com', true, 'first');
    const second = maskSingle('second@example.com', true, 'second');
    const foreignToken = placeholders(second.masked)[0];
    const unknown = first.session.restoreFields([{ id: 'first', text: foreignToken }]);

    expect(unknown.status).toBe('ambiguous');
    if (unknown.status === 'ambiguous') {
      expect(unknown.reasons).toEqual(expect.arrayContaining([
        'missing-placeholder',
        'unknown-placeholder'
      ]));
    }

    const sharedSession = createSensitiveDataMaskingSession();
    const masked = sharedSession.maskFields([
      { id: 'a', text: 'a@example.com', requireRestoration: true },
      { id: 'b', text: 'b@example.com', requireRestoration: true }
    ]);
    expect(masked.status).toBe('ok');
    if (masked.status !== 'ok') return;
    const tokenB = placeholders(masked.fields[1].text)[0];
    const unexpected = sharedSession.restoreFields([{ id: 'a', text: tokenB }]);
    expect(unexpected.status).toBe('ambiguous');
    if (unexpected.status === 'ambiguous') {
      expect(unexpected.reasons).toEqual(expect.arrayContaining([
        'missing-placeholder',
        'unexpected-placeholder'
      ]));
    }
  });

  it('prevents placeholder collisions and creates distinct ASCII namespaces per session', () => {
    const collision = createSensitiveDataMaskingSession().maskFields([{
      id: 'source',
      text: 'Do not trust [[LEXIBRIDGE_MASK_ATTACK_1]] here',
      requireRestoration: true
    }]);
    expect(collision).toEqual(expect.objectContaining({
      status: 'rejected',
      reason: 'reserved-placeholder-input'
    }));

    const firstToken = placeholders(maskSingle('first@example.com').masked)[0];
    const secondToken = placeholders(maskSingle('second@example.com').masked)[0];
    expect(firstToken).not.toBe(secondToken);
    expect(firstToken).toMatch(/^[\x20-\x7E]+$/);
    expect(secondToken).toMatch(/^[\x20-\x7E]+$/);
  });

  it('enforces request, field, and match limits without retaining a rejected request', () => {
    const tooManyFields = createSensitiveDataMaskingSession().maskFields(
      Array.from({ length: SENSITIVE_DATA_MAX_FIELDS + 1 }, (_, index) => ({
        id: String(index), text: '', requireRestoration: true
      }))
    );
    expect(tooManyFields).toEqual(expect.objectContaining({ status: 'rejected', reason: 'too-many-fields' }));

    const oversizedSession = createSensitiveDataMaskingSession();
    expect(oversizedSession.maskFields([{
      id: 'source', text: 'x'.repeat(SENSITIVE_DATA_MAX_FIELD_LENGTH + 1), requireRestoration: true
    }])).toEqual(expect.objectContaining({ status: 'rejected', reason: 'field-too-long' }));
    expect(oversizedSession.maskFields([{
      id: 'source', text: 'safe', requireRestoration: true
    }]).status).toBe('ok');

    expect(createSensitiveDataMaskingSession().maskFields(
      Array.from({ length: 5 }, (_, index) => ({
        id: String(index), text: 'x'.repeat(40_001), requireRestoration: true
      }))
    )).toEqual(expect.objectContaining({ status: 'rejected', reason: 'total-input-too-large' }));

    const repeatedEmails = Array.from(
      { length: SENSITIVE_DATA_MAX_MATCHES + 1 },
      (_, index) => `user${index}@example.com`
    ).join(' ');
    expect(createSensitiveDataMaskingSession().maskFields([{
      id: 'source', text: repeatedEmails, requireRestoration: true
    }])).toEqual(expect.objectContaining({ status: 'rejected', reason: 'too-many-matches' }));
  });

  it('is one-shot, validates restoration limits, and returns detached result objects', () => {
    expect(createSensitiveDataMaskingSession().restoreFields([{
      id: 'source', text: 'not initialized'
    }])).toEqual(expect.objectContaining({ status: 'rejected', reason: 'session-not-masked' }));

    const session = createSensitiveDataMaskingSession();
    const masked = session.maskFields([{
      id: 'source', text: 'alice@example.com', requireRestoration: true
    }]);
    expect(masked.status).toBe('ok');
    if (masked.status !== 'ok') return;
    const token = placeholders(masked.fields[0].text)[0];

    masked.fields[0].text = 'caller mutation';
    expect(session.restoreFields([{ id: 'source', text: token }])).toEqual({
      status: 'ok',
      fields: [{ id: 'source', text: 'alice@example.com' }]
    });
    expect(session.maskFields([{
      id: 'other', text: 'other@example.com', requireRestoration: true
    }])).toEqual(expect.objectContaining({ status: 'rejected', reason: 'session-already-used' }));
    expect(session.restoreFields([{
      id: 'source', text: 'x'.repeat(SENSITIVE_DATA_MAX_FIELD_LENGTH + 1)
    }])).toEqual(expect.objectContaining({ status: 'rejected', reason: 'field-too-long' }));
  });

  it('does not expose mappings or log source data through success and error APIs', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const secret = 'private.person@example.com';
    const session = createSensitiveDataMaskingSession();
    const masked = session.maskFields([{ id: 'source', text: secret, requireRestoration: true }]);
    expect(masked.status).toBe('ok');
    if (masked.status !== 'ok') return;

    expect(JSON.stringify(session)).toBe('{}');
    expect(Object.keys(session)).toEqual([]);
    expect(JSON.stringify(masked)).not.toContain(secret);
    const token = placeholders(masked.fields[0].text)[0];
    const ambiguous = session.restoreFields([{ id: 'source', text: `${token}${token}` }]);
    expect(JSON.stringify(ambiguous)).not.toContain(secret);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
