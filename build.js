const fs = require('fs');
const path = require('path');

const FILES = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'service-worker.js',
  'icon-1.png',
  'icon-2.png'
];

const destDir = path.join(__dirname, 'www');

// Create www folder if it doesn't exist
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir);
  console.log('Created directory: www');
}

// Copy files
FILES.forEach(file => {
  const srcPath = path.join(__dirname, file);
  const destPath = path.join(destDir, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} to www/`);
  } else {
    console.warn(`Warning: Source file ${file} not found`);
  }
});

console.log('Build completed successfully!');
