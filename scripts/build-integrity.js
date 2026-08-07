const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STATIC_BUILD_INPUTS = [
  'manifest.json',
  'package.json',
  'package-lock.json',
  'webpack.config.js',
  'scripts/build-integrity.js'
];

const walkFiles = directory => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(absolutePath) : [absolutePath];
  });
};

const isRuntimeSource = (rootDir, absolutePath) => {
  const relativePath = path.relative(rootDir, absolutePath).replace(/\\/g, '/');
  return !relativePath.startsWith('src/test/')
    && !relativePath.includes('/__tests__/')
    && !/\.test\.[cm]?[jt]sx?$/.test(relativePath);
};

const collectBuildInputFiles = rootDir => {
  const sourceFiles = walkFiles(path.join(rootDir, 'src'))
    .filter(filePath => isRuntimeSource(rootDir, filePath));
  const iconFiles = walkFiles(path.join(rootDir, 'icons'));
  const staticFiles = STATIC_BUILD_INPUTS
    .map(relativePath => path.join(rootDir, relativePath))
    .filter(fs.existsSync);

  return [...staticFiles, ...sourceFiles, ...iconFiles]
    .sort((left, right) => path.relative(rootDir, left).localeCompare(path.relative(rootDir, right)));
};

const calculateBuildInputDigest = rootDir => {
  const hash = crypto.createHash('sha256');
  for (const absolutePath of collectBuildInputFiles(rootDir)) {
    hash.update(path.relative(rootDir, absolutePath).replace(/\\/g, '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(absolutePath));
    hash.update('\0');
  }
  return hash.digest('hex').toUpperCase();
};

module.exports = {
  calculateBuildInputDigest,
  collectBuildInputFiles
};
