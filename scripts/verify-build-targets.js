const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  BUILD_TARGETS,
  calculateBuildInputDigest,
  calculateManifestDigest,
  calculatePayloadTreeDigest,
  calculateSha256,
  collectPayloadEntries,
  normalizePath
} = require('./build-integrity');

const rootDir = path.resolve(__dirname, '..');
const packageJson = require(path.join(rootDir, 'package.json'));
const forbiddenArtifactPattern = /(^|\/)(?:test|__tests__)(\/|$)|\.(?:d\.ts|map|ts)$/i;

const readJson = absolutePath => JSON.parse(fs.readFileSync(absolutePath, 'utf8'));

const collectManifestFileReferences = manifest => {
  const references = new Set();
  const visit = value => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') {
      Object.values(value).forEach(visit);
      return;
    }
    if (typeof value !== 'string'
      || value.includes('*')
      || /^(?:https?:|<)/i.test(value)
      || !/\.(?:css|html|js|png|svg|wasm)$/i.test(value)) {
      return;
    }
    references.add(normalizePath(value));
  };
  visit(manifest);
  return [...references].sort();
};

const verifyTarget = target => {
  const configuration = BUILD_TARGETS[target];
  const outputDirectory = path.join(rootDir, configuration.outputDirectory);
  const sourceManifestPath = path.join(rootDir, configuration.manifest);
  const artifactManifestPath = path.join(outputDirectory, 'manifest.json');
  const metadataPath = path.join(outputDirectory, 'build-meta.json');

  assert.ok(fs.existsSync(outputDirectory), `Missing ${configuration.outputDirectory}`);
  assert.ok(fs.existsSync(artifactManifestPath), `Missing ${target} manifest artifact`);
  assert.ok(fs.existsSync(metadataPath), `Missing ${target} build metadata`);
  assert.deepStrictEqual(
    fs.readFileSync(artifactManifestPath),
    fs.readFileSync(sourceManifestPath),
    `${target} artifact manifest differs from ${configuration.manifest}`
  );

  const metadata = readJson(metadataPath);
  assert.deepStrictEqual(metadata, {
    schemaVersion: 2,
    target,
    mode: 'production',
    version: packageJson.version,
    sourceSha256: calculateBuildInputDigest(rootDir, target),
    manifestSha256: calculateManifestDigest(rootDir, target),
    payloadTreeSha256: calculatePayloadTreeDigest(outputDirectory)
  }, `${target} build metadata is stale or invalid`);

  const payloadEntries = collectPayloadEntries(outputDirectory);
  const payloadNames = new Set(payloadEntries.map(entry => entry.name));
  for (const entry of payloadEntries) {
    assert.ok(!forbiddenArtifactPattern.test(entry.name), `Forbidden ${target} artifact: ${entry.name}`);
  }
  for (const reference of collectManifestFileReferences(readJson(sourceManifestPath))) {
    assert.ok(payloadNames.has(reference), `Missing ${target} manifest reference: ${reference}`);
  }

  return new Map(payloadEntries
    .filter(entry => entry.name !== 'manifest.json')
    .map(entry => [entry.name, calculateSha256(entry.contents)]));
};

const chromePayload = verifyTarget('chrome');
const firefoxPayload = verifyTarget('firefox');
assert.deepStrictEqual(
  [...firefoxPayload.keys()],
  [...chromePayload.keys()],
  'Chrome and Firefox payload file sets differ outside manifest/build metadata'
);
for (const [name, digest] of chromePayload) {
  assert.strictEqual(
    firefoxPayload.get(name),
    digest,
    `Chrome and Firefox payload bytes differ: ${name}`
  );
}

console.log(`Verified Chrome and Firefox production builds (${chromePayload.size + 2} files each).`);
