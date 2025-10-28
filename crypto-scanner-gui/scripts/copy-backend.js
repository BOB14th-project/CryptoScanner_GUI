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
  { src: path.join(sourceDir, 'CryptoScannerCLI.exe'), dest: path.join(destDir, 'CryptoScannerCLI.exe'), optional: true },
  { src: path.join(sourceDir, 'CryptoScanner.exe'), dest: path.join(destDir, 'CryptoScanner.exe'), optional: true },
  { src: path.join(sourceDir, 'Qt5Core.dll'), dest: path.join(destDir, 'Qt5Core.dll'), optional: true },
  { src: path.join(sourceDir, 'libgcc_s_seh-1.dll'), dest: path.join(destDir, 'libgcc_s_seh-1.dll'), optional: true },
  { src: path.join(sourceDir, 'libstdc++-6.dll'), dest: path.join(destDir, 'libstdc++-6.dll'), optional: true },
  { src: path.join(sourceDir, 'libwinpthread-1.dll'), dest: path.join(destDir, 'libwinpthread-1.dll'), optional: true },
  { src: path.join(sourceDir, 'libatomic-1.dll'), dest: path.join(destDir, 'libatomic-1.dll'), optional: true },
  { src: path.join(sourceDir, 'patterns.json'), dest: path.join(destDir, 'patterns.json'), optional: false },
];

// Copy dynamic analysis binaries
// Priority: build (development) > build-macos (release) > build-linux/build-windows
const dynamicAnalysisBuildDir = path.join(__dirname, '..', '..', 'DynamicAnalysis', 'build', 'bin');
const dynamicAnalysisBuildLibDir = path.join(__dirname, '..', '..', 'DynamicAnalysis', 'build', 'lib');
const dynamicAnalysisSourceDir = path.join(__dirname, '..', '..', 'DynamicAnalysis', 'build-macos', 'bin');
const dynamicAnalysisLibDir = path.join(__dirname, '..', '..', 'DynamicAnalysis', 'build-macos', 'lib');

// DTrace scripts source directory
const dtraceScriptsDir = path.join(__dirname, '..', '..', 'DynamicAnalysis', 'scripts');

// Check 'build' directory first (for development builds)
if (fs.existsSync(dynamicAnalysisBuildDir)) {
  console.log('Using DynamicAnalysis from build/ directory (development)');
  filesToCopy.push(
    { src: path.join(dynamicAnalysisBuildDir, 'dynamic_analysis_cli'), dest: path.join(destDir, 'dynamic_analysis_cli'), optional: true },
    { src: path.join(dtraceScriptsDir, 'macos_crypto_trace.d'), dest: path.join(destDir, 'macos_crypto_trace.d'), optional: true },
    { src: path.join(dtraceScriptsDir, 'macos_crypto_trace_sandbox.d'), dest: path.join(destDir, 'macos_crypto_trace_sandbox.d'), optional: true }
  );
} else if (fs.existsSync(dynamicAnalysisSourceDir)) {
  console.log('Using DynamicAnalysis from build-macos/ directory (release)');
  filesToCopy.push(
    { src: path.join(dynamicAnalysisSourceDir, 'dynamic_analysis_cli'), dest: path.join(destDir, 'dynamic_analysis_cli'), optional: true },
    { src: path.join(dtraceScriptsDir, 'macos_crypto_trace.d'), dest: path.join(destDir, 'macos_crypto_trace.d'), optional: true },
    { src: path.join(dtraceScriptsDir, 'macos_crypto_trace_sandbox.d'), dest: path.join(destDir, 'macos_crypto_trace_sandbox.d'), optional: true }
  );
}

if (fs.existsSync(dynamicAnalysisBuildLibDir)) {
  filesToCopy.push(
    { src: path.join(dynamicAnalysisBuildLibDir, 'libhook.dylib'), dest: path.join(destDir, 'libhook.dylib'), optional: true }
  );
} else if (fs.existsSync(dynamicAnalysisLibDir)) {
  filesToCopy.push(
    { src: path.join(dynamicAnalysisLibDir, 'libhook.dylib'), dest: path.join(destDir, 'libhook.dylib'), optional: true }
  );
}

// Copy Windows dynamic analysis binaries if they exist
const dynamicAnalysisWindowsDir = path.join(__dirname, '..', '..', 'DynamicAnalysis', 'build-windows', 'bin', 'Release');
if (fs.existsSync(dynamicAnalysisWindowsDir)) {
  filesToCopy.push(
    { src: path.join(dynamicAnalysisWindowsDir, 'dynamic_analysis_cli.exe'), dest: path.join(destDir, 'dynamic_analysis_cli.exe'), optional: true },
    { src: path.join(dynamicAnalysisWindowsDir, 'hook.dll'), dest: path.join(destDir, 'hook.dll'), optional: true },
    { src: path.join(dynamicAnalysisWindowsDir, 'libcrypto-3-x64.dll'), dest: path.join(destDir, 'libcrypto-3-x64.dll'), optional: true },
    { src: path.join(dynamicAnalysisWindowsDir, 'libssl-3-x64.dll'), dest: path.join(destDir, 'libssl-3-x64.dll'), optional: true },
    { src: path.join(dynamicAnalysisWindowsDir, 'libgcc_s_seh-1.dll'), dest: path.join(destDir, 'libgcc_s_seh-1.dll'), optional: true },
    { src: path.join(dynamicAnalysisWindowsDir, 'libstdc++-6.dll'), dest: path.join(destDir, 'libstdc++-6.dll'), optional: true },
    { src: path.join(dynamicAnalysisWindowsDir, 'libwinpthread-1.dll'), dest: path.join(destDir, 'libwinpthread-1.dll'), optional: true },
    { src: path.join(dynamicAnalysisWindowsDir, 'libatomic-1.dll'), dest: path.join(destDir, 'libatomic-1.dll'), optional: true },
    { src: path.join(dynamicAnalysisWindowsDir, 'msvcp140.dll'), dest: path.join(destDir, 'msvcp140.dll'), optional: true },
    { src: path.join(dynamicAnalysisWindowsDir, 'vcruntime140.dll'), dest: path.join(destDir, 'vcruntime140.dll'), optional: true },
    { src: path.join(dynamicAnalysisWindowsDir, 'vcruntime140_1.dll'), dest: path.join(destDir, 'vcruntime140_1.dll'), optional: true }
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
