const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BUILD_TARGETS = Object.freeze({
  chrome: Object.freeze({ manifest: 'manifest.json', outputDirectory: 'dist' }),
  firefox: Object.freeze({ manifest: 'manifest.firefox.json', outputDirectory: 'dist-firefox' })
});

const STATIC_BUILD_INPUTS = [
  'package.json',
  'package-lock.json',
  'webpack.config.js'
];

const compareNames = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const normalizePath = value => value.replace(/\\/g, '/');

const normalizeBuildTarget = target => {
  const normalized = String(target || 'chrome').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(BUILD_TARGETS, normalized)) {
    throw new Error(`Unsupported build target: ${target}`);
  }
  return normalized;
};

const getBuildTarget = target => BUILD_TARGETS[normalizeBuildTarget(target)];

const walkFiles = directory => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareNames(left.name, right.name))
    .flatMap(entry => {
      const absolutePath = path.join(directory, entry.name);
      return entry.isDirectory() ? walkFiles(absolutePath) : [absolutePath];
    });
};

const isRuntimeSource = (rootDir, absolutePath) => {
  const relativePath = normalizePath(path.relative(rootDir, absolutePath));
  return !relativePath.startsWith('src/test/')
    && !relativePath.includes('/__tests__/')
    && !/\.test\.[cm]?[jt]sx?$/.test(relativePath);
};

const collectBuildInputFiles = (rootDir, target = 'chrome') => {
  const targetConfiguration = getBuildTarget(target);
  const sourceFiles = walkFiles(path.join(rootDir, 'src'))
    .filter(filePath => isRuntimeSource(rootDir, filePath));
  const iconFiles = walkFiles(path.join(rootDir, 'icons'));
  const scriptFiles = walkFiles(path.join(rootDir, 'scripts'));
  const staticFiles = [...STATIC_BUILD_INPUTS, targetConfiguration.manifest]
    .map(relativePath => path.join(rootDir, relativePath))
    .filter(fs.existsSync);

  return [...new Set([...staticFiles, ...scriptFiles, ...sourceFiles, ...iconFiles])]
    .sort((left, right) => compareNames(
      normalizePath(path.relative(rootDir, left)),
      normalizePath(path.relative(rootDir, right))
    ));
};

const calculateSha256 = contents => crypto.createHash('sha256')
  .update(contents)
  .digest('hex')
  .toUpperCase();

const calculateNamedEntryDigest = entries => {
  const hash = crypto.createHash('sha256');
  const normalizedEntries = entries.map(entry => ({
    name: normalizePath(entry.name),
    contents: Buffer.isBuffer(entry.contents) ? entry.contents : Buffer.from(entry.contents)
  })).sort((left, right) => compareNames(left.name, right.name));

  for (const entry of normalizedEntries) {
    hash.update(entry.name, 'utf8');
    hash.update('\0');
    hash.update(entry.contents);
    hash.update('\0');
  }
  return hash.digest('hex').toUpperCase();
};

const calculateBuildInputDigest = (rootDir, target = 'chrome') =>
  calculateNamedEntryDigest(collectBuildInputFiles(rootDir, target).map(absolutePath => ({
    name: path.relative(rootDir, absolutePath),
    contents: fs.readFileSync(absolutePath)
  })));

const calculateManifestDigest = (rootDir, target = 'chrome') => {
  const manifestPath = path.join(rootDir, getBuildTarget(target).manifest);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing ${path.basename(manifestPath)} for ${target} build`);
  }
  return calculateSha256(fs.readFileSync(manifestPath));
};

const collectPayloadEntries = outputDirectory => walkFiles(outputDirectory)
  .map(absolutePath => ({
    name: normalizePath(path.relative(outputDirectory, absolutePath)),
    contents: fs.readFileSync(absolutePath)
  }))
  .filter(entry => entry.name !== 'build-meta.json');

const calculatePayloadTreeDigest = outputDirectory =>
  calculateNamedEntryDigest(collectPayloadEntries(outputDirectory));

module.exports = {
  BUILD_TARGETS,
  calculateBuildInputDigest,
  calculateManifestDigest,
  calculateNamedEntryDigest,
  calculatePayloadTreeDigest,
  calculateSha256,
  collectBuildInputFiles,
  collectPayloadEntries,
  compareNames,
  getBuildTarget,
  normalizeBuildTarget,
  normalizePath,
  walkFiles
};
