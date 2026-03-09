const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
let target = 'dev'; // default

const targetIdx = args.indexOf('--target');
if (targetIdx !== -1 && args[targetIdx + 1]) {
  target = args[targetIdx + 1];
}

if (!['dev', 'store'].includes(target)) {
  console.error(`Unknown target: ${target}. Use "dev" or "store".`);
  process.exit(1);
}

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist', target);

console.log(`Building target: ${target}`);
console.log(`Source: ${SRC}`);
console.log(`Output: ${DIST}`);

// Clean target directory
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

// Copy src/ to dist/<target>/
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(SRC, DIST);

// For store build: remove the "key" field from manifest.json
if (target === 'store') {
  const manifestPath = path.join(DIST, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  delete manifest.key;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('Removed "key" from manifest.json for store build.');

  // Create zip
  const zipName = 'novakid-gcal-ext.zip';
  const zipPath = path.join(__dirname, 'dist', zipName);

  // Remove old zip if exists
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  // Use PowerShell to create zip (available on Windows)
  const psCmd = `Compress-Archive -Path "${DIST}\\*" -DestinationPath "${zipPath}"`;
  execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'inherit' });
  console.log(`Created zip: dist/${zipName}`);
}

console.log(`\nBuild complete! Output in dist/${target}/`);
if (target === 'dev') {
  console.log('Load this folder as an unpacked extension in chrome://extensions/');
} else {
  console.log('Upload dist/novakid-gcal-ext.zip to Chrome Web Store.');
}
