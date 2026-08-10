const assert = require('assert');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { BUILD_TARGETS, collectPayloadEntries, compareNames } = require('./build-integrity');

const rootDir = path.resolve(__dirname, '..');
const fixedTimestamp = new Date('1980-01-01T00:00:00.000Z');
const archives = Object.freeze({
  chrome: 'chrome-translation-extension.zip',
  firefox: 'firefox-translation-extension.zip'
});

const readBuildEntries = target => {
  const outputDirectory = path.join(rootDir, BUILD_TARGETS[target].outputDirectory);
  assert.ok(fs.existsSync(outputDirectory), `Missing ${BUILD_TARGETS[target].outputDirectory}`);
  return collectPayloadEntries(outputDirectory)
    .concat({
      name: 'build-meta.json',
      contents: fs.readFileSync(path.join(outputDirectory, 'build-meta.json'))
    })
    .sort((left, right) => compareNames(left.name, right.name));
};

const createArchive = async entries => {
  const zip = new JSZip();
  for (const entry of entries) {
    assert.ok(!entry.name.includes('\\'), `Archive path uses a backslash: ${entry.name}`);
    assert.ok(!entry.name.startsWith('/') && !entry.name.split('/').includes('..'),
      `Unsafe archive path: ${entry.name}`);
    zip.file(entry.name, entry.contents, {
      binary: true,
      createFolders: false,
      date: fixedTimestamp,
      unixPermissions: 0o100644
    });
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    streamFiles: false
  });
};

const verifyArchive = async (archiveBuffer, entries) => {
  const zip = await JSZip.loadAsync(archiveBuffer, { checkCRC32: true });
  const archiveNames = Object.keys(zip.files).sort(compareNames);
  const expectedNames = entries.map(entry => entry.name);
  assert.deepStrictEqual(archiveNames, expectedNames, 'ZIP file set differs from build output');
  for (const entry of entries) {
    const archived = zip.file(entry.name);
    assert.ok(archived && !archived.dir, `Missing ZIP file: ${entry.name}`);
    assert.deepStrictEqual(await archived.async('nodebuffer'), entry.contents,
      `ZIP content differs: ${entry.name}`);
  }
};

const packageTarget = async target => {
  const entries = readBuildEntries(target);
  const first = await createArchive(entries);
  const second = await createArchive(entries);
  assert.deepStrictEqual(second, first, `${target} ZIP generation is not deterministic`);
  await verifyArchive(first, entries);
  const archivePath = path.join(rootDir, archives[target]);
  fs.writeFileSync(archivePath, first);
  console.log(`Packaged ${target}: ${path.basename(archivePath)} (${entries.length} files, ${first.length} bytes)`);
};

(async () => {
  for (const target of Object.keys(archives)) {
    await packageTarget(target);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
