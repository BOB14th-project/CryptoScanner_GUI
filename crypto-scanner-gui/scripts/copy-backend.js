const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', '..', 'CryptoScanner');
const destDir = path.join(__dirname, '..', 'dist', 'main');

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// Files to copy
const filesToCopy = [
  { src: path.join(sourceDir, 'CryptoScanner'), dest: path.join(destDir, 'CryptoScanner'), optional: true },
  { src: path.join(sourceDir, 'CryptoScannerCLI'), dest: path.join(destDir, 'CryptoScannerCLI'), optional: true },
  { src: path.join(sourceDir, 'CryptoScanner.exe'), dest: path.join(destDir, 'CryptoScanner.exe'), optional: true },
  { src: path.join(sourceDir, 'patterns.json'), dest: path.join(destDir, 'patterns.json'), optional: false },
];

// Copy dynamic analysis binaries
const dynamicAnalysisSourceDir = path.join(__dirname, '..', '..', 'DynamicAnalysis', 'build-macos', 'bin');
const dynamicAnalysisLibDir = path.join(__dirname, '..', '..', 'DynamicAnalysis', 'build-macos', 'lib');

if (fs.existsSync(dynamicAnalysisSourceDir)) {
  filesToCopy.push(
    { src: path.join(dynamicAnalysisSourceDir, 'dynamic_analysis_cli'), dest: path.join(destDir, 'dynamic_analysis_cli'), optional: true }
  );
}

if (fs.existsSync(dynamicAnalysisLibDir)) {
  filesToCopy.push(
    { src: path.join(dynamicAnalysisLibDir, 'libhook.dylib'), dest: path.join(destDir, 'libhook.dylib'), optional: true }
  );
}

// Copy Windows dynamic analysis binaries if they exist
const dynamicAnalysisWindowsDir = path.join(__dirname, '..', '..', 'DynamicAnalysis', 'build-windows', 'bin');
if (fs.existsSync(dynamicAnalysisWindowsDir)) {
  filesToCopy.push(
    { src: path.join(dynamicAnalysisWindowsDir, 'dynamic_analysis_cli.exe'), dest: path.join(destDir, 'dynamic_analysis_cli.exe'), optional: true },
    { src: path.join(dynamicAnalysisWindowsDir, 'hook.dll'), dest: path.join(destDir, 'hook.dll'), optional: true }
  );
}

// Copy Linux dynamic analysis binaries if they exist
const dynamicAnalysisLinuxDir = path.join(__dirname, '..', '..', 'DynamicAnalysis', 'build-linux', 'bin');
if (fs.existsSync(dynamicAnalysisLinuxDir)) {
  filesToCopy.push(
    { src: path.join(dynamicAnalysisLinuxDir, 'dynamic_analysis_cli'), dest: path.join(destDir, 'dynamic_analysis_cli'), optional: true }
  );
}

const dynamicAnalysisLinuxLibDir = path.join(__dirname, '..', '..', 'DynamicAnalysis', 'build-linux', 'lib');
if (fs.existsSync(dynamicAnalysisLinuxLibDir)) {
  filesToCopy.push(
    { src: path.join(dynamicAnalysisLinuxLibDir, 'libhook.so'), dest: path.join(destDir, 'libhook.so'), optional: true }
  );
}

console.log('Copying backend files...');

for (const file of filesToCopy) {
  if (fs.existsSync(file.src)) {
    try {
      fs.copyFileSync(file.src, file.dest);
      console.log(`✓ Copied: ${path.basename(file.src)}`);

      // Make executable files executable on Unix-like systems
      if (process.platform !== 'win32' && !file.src.endsWith('.json') && !file.src.endsWith('.dll')) {
        fs.chmodSync(file.dest, 0o755);
      }
    } catch (error) {
      console.error(`✗ Failed to copy ${path.basename(file.src)}:`, error.message);
      if (!file.optional) {
        process.exit(1);
      }
    }
  } else if (!file.optional) {
    console.error(`✗ Required file not found: ${file.src}`);
    process.exit(1);
  } else {
    console.log(`- Skipped (not found): ${path.basename(file.src)}`);
  }
}

console.log('Backend files copied successfully!');
