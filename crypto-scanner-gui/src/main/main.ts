import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as https from 'https';

console.log('=== MAIN PROCESS STARTED - NEW VERSION ===');

// FastAPI 서버 URL
const API_BASE_URL = 'https://harper-abler-agape.ngrok-free.dev';

// API 호출 헬퍼 함수
async function callAPI(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE_URL);

    const options: any = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          console.error('Failed to parse API response:', e);
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      console.error('API call error:', error);
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// 파일 업로드 API 호출 함수
async function uploadFilesToAPI(
  fileId: number,
  scanId: number,
  asmFile?: Buffer,
  binFile?: Buffer,
  asmFilename?: string,
  binFilename?: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(`/files/${fileId}/upload_files/?scan_id=${scanId}`, API_BASE_URL);

    // Multipart form data boundary
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

    const parts: Buffer[] = [];

    // ASM 파일 추가
    if (asmFile && asmFilename) {
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="asm_file"; filename="${asmFilename}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`
      ));
      parts.push(asmFile);
      parts.push(Buffer.from('\r\n'));

      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="asm_filename"\r\n\r\n` +
        `${asmFilename}\r\n`
      ));
    }

    // BIN 파일 추가
    if (binFile && binFilename) {
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="bin_file"; filename="${binFilename}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`
      ));
      parts.push(binFile);
      parts.push(Buffer.from('\r\n'));

      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="bin_filename"\r\n\r\n` +
        `${binFilename}\r\n`
      ));
    }

    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const options: any = {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'ngrok-skip-browser-warning': 'true',
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          console.error('Failed to parse API response:', e);
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      console.error('File upload error:', error);
      reject(error);
    });

    req.write(body);
    req.end();
  });
}

let mainWindow: BrowserWindow;
let scannerProcess: ChildProcess | null = null;
let dynamicAnalysisProcess: ChildProcess | null = null;

function createWindow(): void {
  let preloadPath = path.join(__dirname, 'preload.js');

  // Try different preload paths for packaged app
  const preloadPaths = [
    path.join(__dirname, 'preload.js'),
    path.join(__dirname, '..', 'preload.js'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist', 'main', 'preload.js'),
    path.join(process.resourcesPath || '', 'app', 'dist', 'main', 'preload.js'),
  ];

  for (const testPath of preloadPaths) {
    console.log('Testing preload path:', testPath);
    if (require('fs').existsSync(testPath)) {
      preloadPath = testPath;
      console.log('✅ Found preload at:', preloadPath);
      break;
    } else {
      console.log('❌ Not found:', testPath);
    }
  }

  console.log('Final preload path:', preloadPath);
  console.log('__dirname:', __dirname);
  console.log('process.resourcesPath:', process.resourcesPath);

  mainWindow = new BrowserWindow({
    height: 800,
    width: 1200,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: preloadPath,
      webSecurity: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false, // Don't show until ready
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });


  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:4000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
console.log('=== IPC Handlers Registration Started ===');
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Folder to Scan',
    buttonLabel: 'Select Folder',
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select File to Scan',
    buttonLabel: 'Select File',
  });
  return result.filePaths[0] || null;
});

// 동적 탐지 실행 함수
async function runDynamicAnalysis(targetPath: string, scannerDir: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const binaryName = process.platform === 'win32' ? 'dynamic_analysis_cli.exe' : 'dynamic_analysis_cli';
    let dynamicAnalysisPath: string;

    if (process.resourcesPath) {
      dynamicAnalysisPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main', binaryName);
    } else {
      dynamicAnalysisPath = path.join(__dirname, binaryName);
    }

    const fs = require('fs');
    const pathCandidates = [
      dynamicAnalysisPath,
      path.join(__dirname, binaryName),
      path.join(__dirname, '..', binaryName),
      path.join(scannerDir, binaryName),
    ];

    let resolvedBinaryPath = '';
    for (const candidate of pathCandidates) {
      if (fs.existsSync(candidate)) {
        resolvedBinaryPath = candidate;
        break;
      }
    }

    if (!resolvedBinaryPath) {
      console.log('Dynamic analysis not available, skipping...');
      resolve([]);
      return;
    }

    dynamicAnalysisPath = resolvedBinaryPath;
    const binaryDir = path.dirname(dynamicAnalysisPath);
    console.log('✅ Using dynamic analysis binary at:', dynamicAnalysisPath);

    // 실행 파일인지 확인
    const stat = fs.statSync(targetPath);
    if (!stat.isFile()) {
      console.log('Target is not a file, skipping dynamic analysis');
      resolve([]);
      return;
    }

    // 실행 파일 확장자 및 실행 권한 확인
    const ext = path.extname(targetPath).toLowerCase();
    const hasExecBit = (stat.mode & 0o111) !== 0;

    // file 명령어로 실제 실행 파일 타입 확인
    let isExecutableForCurrentPlatform = false;

    try {
      const { execSync } = require('child_process');
      const fileOutput = execSync(`file "${targetPath}"`, { encoding: 'utf-8' });
      console.log('File type check:', fileOutput.trim());

      if (process.platform === 'darwin') {
        // macOS: Mach-O 파일만 실행 가능
        if (fileOutput.includes('Mach-O')) {
          isExecutableForCurrentPlatform = true;
        } else {
          console.log('Skipping: Not a macOS executable (not Mach-O)');
        }
      } else if (process.platform === 'linux') {
        // Linux: ELF 파일만 실행 가능
        if (fileOutput.includes('ELF')) {
          isExecutableForCurrentPlatform = true;
        } else {
          console.log('Skipping: Not a Linux executable (not ELF)');
        }
      } else if (process.platform === 'win32') {
        // Windows: PE 파일만 실행 가능
        if (fileOutput.includes('PE32') || fileOutput.includes('MS-DOS')) {
          isExecutableForCurrentPlatform = true;
        } else {
          console.log('Skipping: Not a Windows executable (not PE32)');
        }
      }
    } catch (err) {
      // file 명령어 실패 시 확장자로 폴백
      console.log('file command failed, falling back to extension check:', err);

      if (process.platform === 'win32') {
        isExecutableForCurrentPlatform = ['.exe', '.dll', '.com'].includes(ext);
      } else {
        const isLibrary = ['.so', '.dylib'].includes(ext);
        isExecutableForCurrentPlatform = hasExecBit || isLibrary;
      }
    }

    if (!isExecutableForCurrentPlatform) {
      console.log('Target is not executable on this platform, skipping dynamic analysis');
      resolve([]);
      return;
    }

    console.log('Starting dynamic analysis for:', targetPath);

    // NDJSON 로그 파일 경로 설정
    const logsDir = path.join(scannerDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(logsDir, `dynamic_${timestamp}.ndjson`);

    // libhook.dylib의 절대 경로
    const hookLibName = process.platform === 'darwin' ? 'libhook.dylib' :
                       (process.platform === 'win32' ? 'hook.dll' : 'libhook.so');
    const hookSearchPaths = [
      path.join(binaryDir, hookLibName),
      path.join(scannerDir, hookLibName),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist', 'main', hookLibName),
      path.join(__dirname, hookLibName),
      path.join(__dirname, '..', hookLibName),
    ];

    let hookLibPath: string | null = null;
    for (const candidate of hookSearchPaths) {
      if (candidate && fs.existsSync(candidate)) {
        hookLibPath = candidate;
        console.log('✅ Using hook library at:', hookLibPath);
        break;
      }
    }

    if (!hookLibPath) {
      console.warn('⚠️  Hook library not found. Dynamic analysis will run without injection.');
    }

    const spawnEnv: Record<string, string | undefined> = {
      ...process.env,
      HOOK_NDJSON: logFile,
      HOOK_VERBOSE: '0',
    };

    if (hookLibPath) {
      if (process.platform === 'darwin') {
        spawnEnv.DYLD_INSERT_LIBRARIES = hookLibPath;
      } else if (process.platform === 'linux') {
        spawnEnv.LD_PRELOAD = hookLibPath;
      } else if (process.platform === 'win32') {
        spawnEnv.HOOK_LIBRARY = hookLibPath;

        // Windows: Add DLL search paths to PATH environment variable
        const openSslPath = 'C:\\Program Files\\OpenSSL-Win64\\bin';
        const targetDir = path.dirname(targetPath);
        const currentPath = process.env.PATH || '';
        // Add both binaryDir (for hook DLLs) and targetDir (for test exe DLLs)
        spawnEnv.PATH = `${binaryDir};${targetDir};${openSslPath};${currentPath}`;
      }
    }

    dynamicAnalysisProcess = spawn(dynamicAnalysisPath, [targetPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: binaryDir,
      env: spawnEnv
    });

    let output = '';
    let errorOutput = '';
    let actualLogFile = logFile; // dynamic_analysis_cli가 생성한 실제 로그 파일 경로

    dynamicAnalysisProcess.stdout?.on('data', (data) => {
      output += data.toString();
      console.log('[Dynamic Analysis]', data.toString());

      // stdout에서 실제 로그 파일 경로 추출
      const logMatch = data.toString().match(/\[dynamic_analysis\] log:\s+"([^"]+)"/);
      if (logMatch) {
        actualLogFile = logMatch[1];
        console.log('Detected actual log file:', actualLogFile);
      }
    });

    dynamicAnalysisProcess.stderr?.on('data', (data) => {
      errorOutput += data.toString();
      console.error('[Dynamic Analysis Error]', data.toString());
    });

    dynamicAnalysisProcess.on('close', (code) => {
      console.log(`Dynamic analysis process closed with code: ${code}`);
      console.log('Looking for log file at:', actualLogFile);

      // NDJSON 로그 파일 파싱
      const detections: any[] = [];
      if (fs.existsSync(actualLogFile)) {
        try {
          const logContent = fs.readFileSync(actualLogFile, 'utf-8');
          const lines = logContent.split('\n').filter((line: string) => line.trim());

          const detectionMap = new Map<string, any>();

          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (!event || !event.cipher) {
                continue;
              }

              const apiName = typeof event.api === 'string' ? event.api : '';
              const surfaceName = typeof event.surface === 'string' ? event.surface : 'dynamic';
              const direction = typeof event.dir === 'string' ? event.dir : '';
              const evidenceLabel = direction ? `${surfaceName} (${direction})` : surfaceName;
              const mapKey = [
                surfaceName || 'dynamic',
                apiName || 'unknown',
                direction || 'any',
                event.cipher || 'Unknown'
              ].join('|');

              const existing = detectionMap.get(mapKey) ?? {
                filePath: targetPath,
                offset: 0,
                algorithm: event.cipher || 'Unknown',
                matchString: apiName || event.cipher || 'dynamic',
                evidenceType: evidenceLabel,
                severity: 'High',
                detectionMethod: 'dynamic' as const,
                dynamicMatchString: apiName || '',
                dynamicEvidenceType: evidenceLabel,
                dynamicApi: apiName || undefined
              };

              if (apiName) {
                existing.matchString = existing.matchString || apiName;
                existing.dynamicMatchString = apiName;
                existing.dynamicApi = apiName;
              }
              if (evidenceLabel) {
                existing.evidenceType = evidenceLabel;
                existing.dynamicEvidenceType = evidenceLabel;
              }
              if (event.key && !existing.dynamicKey) {
                existing.dynamicKey = event.key;
              }
              if (event.iv && !existing.dynamicIv) {
                existing.dynamicIv = event.iv;
              }
              if (event.tag && !existing.dynamicTag) {
                existing.dynamicTag = event.tag;
              }

              detectionMap.set(mapKey, existing);
            } catch (parseError) {
              console.error('Failed to parse NDJSON line:', parseError);
            }
          }

          detections.push(
            ...Array.from(detectionMap.values()).map((entry) => {
              if (!entry.matchString) {
                entry.matchString = entry.dynamicMatchString || entry.dynamicApi || entry.algorithm || 'dynamic';
              }
              return entry;
            })
          );
        } catch (readError) {
          console.error('Failed to read log file:', readError);
        }
      }

      resolve(detections);
      dynamicAnalysisProcess = null;
    });

    dynamicAnalysisProcess.on('error', (error) => {
      console.error('Dynamic analysis process error:', error);
      resolve([]);
      dynamicAnalysisProcess = null;
    });
  });
}

ipcMain.handle('start-scan', async (event, scanOptions) => {
  console.log('=== start-scan IPC called ===');
  return new Promise((resolve, reject) => {
    // Simplified binary path handling for Windows
    const binaryName = process.platform === 'win32' ? 'CryptoScannerCLI.exe' : 'CryptoScannerCLI';

    console.log('Looking for CryptoScanner binary...');
    console.log('__dirname:', __dirname);
    console.log('process.resourcesPath:', process.resourcesPath);

    // Debug: List actual files in the expected directory
    if (process.resourcesPath) {
      try {
        const fs = require('fs');
        const expectedDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main');
        console.log('Expected directory:', expectedDir);
        if (fs.existsSync(expectedDir)) {
          const files = fs.readdirSync(expectedDir);
          console.log('Files in expected directory:', files);
        } else {
          console.log('Expected directory does not exist');

          // Check if app.asar.unpacked exists
          const unpackedDir = path.join(process.resourcesPath, 'app.asar.unpacked');
          if (fs.existsSync(unpackedDir)) {
            console.log('app.asar.unpacked exists, contents:', fs.readdirSync(unpackedDir));
          } else {
            console.log('app.asar.unpacked does not exist');
          }
        }
      } catch (error) {
        console.error('Error checking directories:', error);
      }
    }

    let scannerPath;

    // For packaged app, use app.asar.unpacked path
    if (process.resourcesPath) {
      // Use path.join for proper path handling on all platforms
      scannerPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main', binaryName);
      console.log('Packaged app path:', scannerPath);
    } else {
      // For development mode
      scannerPath = path.join(__dirname, binaryName);
      console.log('Development path:', scannerPath);
    }

    // Verify binary exists
    const fs = require('fs');
    if (!fs.existsSync(scannerPath)) {
      console.log('❌ Binary not found at:', scannerPath);
      // Try alternative locations
      const altPaths = [
        path.join(__dirname, binaryName),
        path.join(__dirname, '..', binaryName),
        path.join(__dirname, '..', '..', 'CryptoScanner', binaryName),
        path.join(__dirname, '..', '..', '..', 'CryptoScanner', binaryName),
        path.join(process.cwd(), 'CryptoScanner', binaryName),
        path.join(process.cwd(), '..', 'CryptoScanner', binaryName),
      ];

      let found = false;
      for (const altPath of altPaths) {
        if (fs.existsSync(altPath)) {
          scannerPath = altPath;
          found = true;
          console.log('✅ Found binary at alternative path:', scannerPath);
          break;
        }
      }

      if (!found) {
        reject(new Error('CryptoScanner binary not found. Please build it first using: cd CryptoScanner && make'));
        return;
      }
    } else {
      console.log('✅ Found binary at:', scannerPath);
    }

    try {
      // Check if scanner binary exists
      const fs = require('fs');
      if (!fs.existsSync(scannerPath)) {
        reject(new Error('CryptoScanner binary not found. Please build it first using: cd CryptoScanner && make'));
        return;
      }

      console.log('Starting scan with path:', scanOptions.path);
      console.log('Scanner binary path:', scannerPath);
      console.log('Binary exists:', fs.existsSync(scannerPath));
      console.log('process.resourcesPath:', process.resourcesPath);
      console.log('__dirname:', __dirname);

      const executableCandidates = new Set<string>();

      const isExecutableFile = (filePath: string): boolean => {
        if (!filePath) {
          return false;
        }
        try {
          const stats = fs.statSync(filePath);
          if (!stats.isFile()) {
            return false;
          }

          const ext = path.extname(filePath).toLowerCase();
          const hasExecBit = (stats.mode & 0o111) !== 0;

          // file 명령어로 실제 실행 파일 타입 확인
          try {
            const { execSync } = require('child_process');
            const fileOutput = execSync(`file "${filePath}"`, { encoding: 'utf-8', timeout: 5000 });

            if (process.platform === 'darwin') {
              // macOS: Mach-O 파일만 실행 가능
              return fileOutput.includes('Mach-O');
            } else if (process.platform === 'linux') {
              // Linux: ELF 파일만 실행 가능
              return fileOutput.includes('ELF');
            } else if (process.platform === 'win32') {
              // Windows: PE 파일만 실행 가능
              return fileOutput.includes('PE32') || fileOutput.includes('MS-DOS');
            }
          } catch (fileErr) {
            // file 명령어 실패 시 확장자와 권한으로 폴백
            if (process.platform === 'linux') {
              console.log(`[Linux] file command failed for ${filePath}, using fallback. hasExecBit=${hasExecBit}, ext=${ext}`);
            }
            if (process.platform === 'win32') {
              return ['.exe', '.com', '.dll'].includes(ext);
            } else if (process.platform === 'darwin') {
              return ['.dylib', '.so'].includes(ext) || hasExecBit;
            } else if (process.platform === 'linux') {
              return ['.so'].includes(ext) || hasExecBit;
            }
          }

          return false;
        } catch (err) {
          console.log(`Executable check skipped for ${filePath}:`, err);
        }
        return false;
      };

      const trackExecutableCandidate = (filePath: string) => {
        if (!filePath) {
          return;
        }
        const isExec = isExecutableFile(filePath);
        if (process.platform === 'linux') {
          console.log(`[Linux] trackExecutableCandidate: ${filePath} -> ${isExec}`);
        }
        if (isExec) {
          executableCandidates.add(filePath);
        }
      };

      // Prefetch explicit target if it is executable
      trackExecutableCandidate(scanOptions.path);

      // Set working directory to the original CryptoScanner source folder
      // This ensures result folder is created in the expected location
      // Use dynamic path resolution for cross-platform support
      let cryptoScannerDir: string;

      if (process.resourcesPath) {
        // For packaged app, try to find CryptoScanner directory relative to the app
        // Start from app location and work upwards to find CryptoScanner_GUI/CryptoScanner
        let searchPath = process.resourcesPath;
        let cryptoScannerFound = false;

        // Try to go up directories to find CryptoScanner_GUI folder
        for (let i = 0; i < 5; i++) {
          searchPath = path.dirname(searchPath);
          const testPath = path.join(searchPath, 'CryptoScanner');
          const testPath2 = path.join(searchPath, 'CryptoScanner_GUI', 'CryptoScanner');

          if (require('fs').existsSync(path.join(testPath, 'patterns.json'))) {
            cryptoScannerDir = testPath;
            cryptoScannerFound = true;
            break;
          } else if (require('fs').existsSync(path.join(testPath2, 'patterns.json'))) {
            cryptoScannerDir = testPath2;
            cryptoScannerFound = true;
            break;
          }
        }

        if (!cryptoScannerFound) {
          // Fallback to relative path from app location
          cryptoScannerDir = path.resolve(process.resourcesPath, '..', '..', '..', 'CryptoScanner');
        }

        console.log('Packaged app - Search started from:', process.resourcesPath);
        console.log('Selected CryptoScanner directory:', cryptoScannerDir);
      } else {
        // For development mode, use relative path from the project
        cryptoScannerDir = path.resolve(__dirname, '..', '..', '..', 'CryptoScanner');
        console.log('Development mode - CryptoScanner directory:', cryptoScannerDir);
      }
      let patternsPath = '';

      // Verify that the CryptoScanner directory exists and has patterns.json
      if (!require('fs').existsSync(path.join(cryptoScannerDir, 'patterns.json'))) {
        console.error('patterns.json not found in:', cryptoScannerDir);
        // For packaged app, copy patterns.json to the original location if it doesn't exist
        if (process.resourcesPath) {
          const packagedPatternsPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main', 'patterns.json');
          const targetPatternsPath = path.join(cryptoScannerDir, 'patterns.json');

          try {
            // Create the directory if it doesn't exist
            if (!require('fs').existsSync(cryptoScannerDir)) {
              require('fs').mkdirSync(cryptoScannerDir, { recursive: true });
            }
            // Copy patterns.json to the target location
            if (require('fs').existsSync(packagedPatternsPath)) {
              require('fs').copyFileSync(packagedPatternsPath, targetPatternsPath);
              console.log('Copied patterns.json to:', targetPatternsPath);
            }
          } catch (error) {
            console.error('Failed to copy patterns.json:', error);
          }
        }

        // If still not available, fall back to packaged location
        if (!require('fs').existsSync(path.join(cryptoScannerDir, 'patterns.json'))) {
          if (process.resourcesPath) {
            cryptoScannerDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main');
          } else {
            cryptoScannerDir = path.resolve(__dirname, '..', '..', '..', 'CryptoScanner');
          }
        }
      }

      console.log('About to spawn process:');
      console.log('  scannerPath:', scannerPath);
      console.log('  args:', [scanOptions.path]);
      console.log('  old cwd (not used):', cryptoScannerDir);

      console.log('  scanner path for spawn:', scannerPath);

      // Set working directory to where the scanner executable is located
      const scannerDir = path.dirname(scannerPath);
      console.log('  scanner directory for cwd:', scannerDir);

      // For packaged apps, ensure patterns.json is accessible
      let effectiveCwd = scannerDir;
      if (process.resourcesPath) {
        // Copy patterns.json to scanner directory if it doesn't exist there
        const scannerPatternsPath = path.join(scannerDir, 'patterns.json');
        const sourcePatternsPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main', 'patterns.json');

        if (!require('fs').existsSync(scannerPatternsPath) && require('fs').existsSync(sourcePatternsPath)) {
          require('fs').copyFileSync(sourcePatternsPath, scannerPatternsPath);
          console.log('Copied patterns.json to scanner directory:', scannerPatternsPath);
        }
      }

      // Set environment variables to ensure DLLs are found
      const spawnEnv = {
        ...process.env,
        PATH: `${scannerDir};${process.env.PATH || ''}`,
        QT_QPA_PLATFORM: 'minimal',
        QT_PLUGIN_PATH: scannerDir,
        QT_QPA_PLATFORM_PLUGIN_PATH: scannerDir
      };

      console.log('Spawn environment PATH:', spawnEnv.PATH);

      let lastProgressSnapshot = {
        currentFile: 'Scanning...',
        filesDone: 0,
        filesTotal: 0,
        percentage: 0,
        detectionCount: 0
      };

      scannerProcess = spawn(scannerPath, [scanOptions.path], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: effectiveCwd,
        windowsHide: false, // Show console window for debugging
        shell: false, // Don't use shell
        env: spawnEnv
      });

      let output = '';
      let errorOutput = '';
      let detections: any[] = [];
      let totalFiles = 0;
      let scannedFiles = 0;
      let currentFile = '';

      scannerProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        console.log(`Received ${lines.length} lines from scanner:`, lines);

        for (const line of lines) {
          if (line.trim()) {
            output += line + '\n';
            console.log(`Processing line: "${line}"`);

            // Parse different output types from CryptoScanner
            if (line.startsWith('PROGRESS:')) {
              const parts = line.split(':');
              if (parts[1] === 'FILE') {
                currentFile = parts[2];
                scannedFiles = parseInt(parts[3]) || 0;
                totalFiles = parseInt(parts[4]) || 1;

                // Handle Windows paths that contain colons (e.g., C:\path\file.exe)
                if (process.platform === 'win32' && parts.length > 4) {
                  // Reconstruct the full Windows path and get correct numbers
                  currentFile = parts.slice(2, -2).join(':');
                  scannedFiles = parseInt(parts[parts.length - 2]) || 0;
                  totalFiles = parseInt(parts[parts.length - 1]) || 1;
                }

                trackExecutableCandidate(currentFile);
              } else if (parts[1] === 'START') {
                currentFile = parts[2];

                // Handle Windows paths that contain colons
                if (process.platform === 'win32' && parts.length > 3) {
                  currentFile = parts.slice(2).join(':');
                }

                trackExecutableCandidate(currentFile);
              } else if (parts[1] === 'COMPLETE') {
                scannedFiles = totalFiles;
              }

              // Send progress updates to renderer
              const progressData = {
                type: 'progress',
                currentFile: currentFile || 'Scanning...',
                filesDone: scannedFiles,
                filesTotal: totalFiles,
                percentage: totalFiles > 0 ? Math.round((scannedFiles / totalFiles) * 100) : 0,
                detectionCount: detections.length
              };
              console.log('Main process sending progress:', progressData);
              mainWindow.webContents.send('scan-progress', progressData);
              lastProgressSnapshot = {
                currentFile: progressData.currentFile,
                filesDone: progressData.filesDone,
                filesTotal: progressData.filesTotal,
                percentage: progressData.percentage,
                detectionCount: progressData.detectionCount
              };
            } else if (line.startsWith('DETECTION:')) {
              // Parse detection: DETECTION:filePath,offset,algorithm,matchString,evidenceType,severity
              const detectionData = line.substring(10); // Remove 'DETECTION:' prefix
              const parts = detectionData.split(',');

              if (parts.length >= 6) {
                const detection = {
                  filePath: parts[0],
                  offset: parseInt(parts[1]) || 0,
                  algorithm: parts[2],
                  matchString: parts[3],
                  evidenceType: parts[4],
                  severity: parts[5]
                };
                detections.push(detection);
                console.log('Added detection:', detection);
                trackExecutableCandidate(detection.filePath);

                // Send updated detection count
                const progressData = {
                  type: 'progress',
                  currentFile: currentFile || 'Scanning...',
                  filesDone: scannedFiles,
                  filesTotal: totalFiles,
                  percentage: totalFiles > 0 ? Math.round((scannedFiles / totalFiles) * 100) : 0,
                  detectionCount: detections.length
                };
                console.log('Main process sending detection update:', progressData);
                mainWindow.webContents.send('scan-progress', progressData);
                lastProgressSnapshot = {
                  currentFile: progressData.currentFile,
                  filesDone: progressData.filesDone,
                  filesTotal: progressData.filesTotal,
                  percentage: progressData.percentage,
                  detectionCount: progressData.detectionCount
                };
              }
            } else if (line.startsWith('SUMMARY:')) {
              // Handle summary information
              console.log('Summary info:', line);
            } else {
              // Legacy CSV format fallback: filePath,algorithm,severity
              const parts = line.split(',');
              if (parts.length >= 3) {
                const detection = {
                  filePath: parts[0],
                  offset: 0,
                  algorithm: parts[1],
                  matchString: '',
                  evidenceType: 'binary',
                  severity: parts[2]
                };
                detections.push(detection);
                console.log('Added legacy detection:', detection);
                trackExecutableCandidate(detection.filePath);
              }
            }
          }
        }
      });

      scannerProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        console.error('Scanner stderr:', data.toString());
      });

      scannerProcess.on('close', async (code) => {
        console.log(`Scanner process closed with code: ${code}`);
        console.log(`Output length: ${output.length}`);
        console.log(`Detections found: ${detections.length}`);
        console.log('Detections:', detections);

        // 정적 탐지 결과에 detectionMethod 태그 추가
        detections.forEach((d: any) => {
          if (!d.detectionMethod) {
            d.detectionMethod = 'static';
          }
        });

        const emitProgress = (message: string, detectionCount: number) => {
          if (!mainWindow || mainWindow.isDestroyed()) {
            return;
          }
          mainWindow.webContents.send('scan-progress', {
            type: 'progress',
            currentFile: message,
            filesDone: lastProgressSnapshot.filesDone,
            filesTotal: lastProgressSnapshot.filesTotal,
            percentage: lastProgressSnapshot.percentage,
            detectionCount
          });
          lastProgressSnapshot = {
            ...lastProgressSnapshot,
            currentFile: message,
            detectionCount
          };
        };

        // For packaged apps, move result files from package location to user-accessible location
        if (process.resourcesPath && code === 0) {
          try {
            const packagedResultDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main', 'result');
            const targetResultDir = path.join(cryptoScannerDir, 'result');

            if (require('fs').existsSync(packagedResultDir)) {
              console.log('Moving result files from package to user location...');
              console.log('From:', packagedResultDir);
              console.log('To:', targetResultDir);

              // Ensure target directory exists
              if (!require('fs').existsSync(targetResultDir)) {
                require('fs').mkdirSync(targetResultDir, { recursive: true });
              }

              // Copy all files from packaged result to target result
              const fs = require('fs');
              const copyDirRecursive = (src: string, dest: string) => {
                const entries = fs.readdirSync(src, { withFileTypes: true });
                for (const entry of entries) {
                  const srcPath = path.join(src, entry.name);
                  const destPath = path.join(dest, entry.name);

                  if (entry.isDirectory()) {
                    if (!fs.existsSync(destPath)) {
                      fs.mkdirSync(destPath, { recursive: true });
                    }
                    copyDirRecursive(srcPath, destPath);
                  } else {
                    fs.copyFileSync(srcPath, destPath);
                    console.log('Copied:', entry.name);
                  }
                }
              };

              copyDirRecursive(packagedResultDir, targetResultDir);

              // Clean up packaged result directory
              fs.rmSync(packagedResultDir, { recursive: true, force: true });
              console.log('Result files moved successfully!');
            }
          } catch (error) {
            console.error('Failed to move result files:', error);
          }
        }

        // 실행 파일이 스캔 대상에 포함된 경우 동적 탐지 실행
        let dynamicDetections: any[] = [];
        if (code === 0) {
          emitProgress('Running dynamic analysis...', detections.length);
          try {
            const fs = require('fs');
            const targetPath = scanOptions.path;
            const stat = fs.statSync(targetPath);

            // 단일 실행 파일인 경우 동적 탐지 실행
            if (stat.isFile()) {
              if (isExecutableFile(targetPath)) {
                console.log('Running dynamic analysis for executable file...');
                dynamicDetections = await runDynamicAnalysis(targetPath, cryptoScannerDir);
                console.log(`Dynamic analysis found ${dynamicDetections.length} detections`);
              } else {
                console.log('Target file is not executable on this platform. Skipping dynamic analysis.');
              }
            }
            // 폴더 스캔인 경우: 정적 탐지에서 발견된 실행 파일들에 대해 동적 탐지 수행
            else if (stat.isDirectory()) {
              console.log('Folder scan detected. Analyzing executable files for dynamic analysis...');
              if (process.platform === 'linux') {
                console.log(`[Linux] Number of detections: ${detections.length}`);
                console.log(`[Linux] Executable candidates before tracking detections: ${executableCandidates.size}`);
              }

              // Ensure detection file paths are tracked as candidates
              for (const detection of detections) {
                trackExecutableCandidate(detection.filePath);
              }

              // 정적 탐지 결과에서 실행 파일들 추출
              const executableFiles = new Set<string>(executableCandidates);

              console.log(`Found ${executableFiles.size} executable files to analyze dynamically`);
              if (process.platform === 'linux') {
                console.log(`[Linux] Executable files list:`, Array.from(executableFiles));
              }

              // 각 실행 파일에 대해 동적 탐지 수행
              for (const execPath of executableFiles) {
                if (!isExecutableFile(execPath)) {
                  console.log(`Skipping ${execPath}: not executable on this platform`);
                  continue;
                }

                console.log(`Running dynamic analysis on: ${execPath}`);
                try {
                  const results = await runDynamicAnalysis(execPath, cryptoScannerDir);
                  dynamicDetections.push(...results);
                  console.log(`  → Found ${results.length} detections`);
                } catch (err) {
                  console.error(`Failed to analyze ${execPath}:`, err);
                }
              }

              console.log(`Total dynamic detections: ${dynamicDetections.length}`);
            }
          } catch (error) {
            console.error('Failed to run dynamic analysis:', error);
          }
        }

        const detectionKey = (d: any) => `${d.filePath || ''}:${d.algorithm || 'Unknown'}`;
        const mergedDetections = detections.map((det: any) => ({ ...det }));
        const detectionMap = new Map<string, any>();

        for (const det of mergedDetections) {
          detectionMap.set(detectionKey(det), det);
        }

        let mergedDynamicCount = 0;
        const dynamicOnlyDetections: any[] = [];

        for (const dynamicDetection of dynamicDetections) {
          if (!dynamicDetection) {
            continue;
          }
          const key = detectionKey(dynamicDetection);
          const existing = detectionMap.get(key);

          if (existing) {
            mergedDynamicCount += 1;
            existing.detectionMethod = existing.detectionMethod === 'dynamic' ? 'dynamic' : 'static+dynamic';
            if (dynamicDetection.dynamicMatchString) {
              existing.dynamicMatchString = dynamicDetection.dynamicMatchString;
            }
            if (dynamicDetection.dynamicEvidenceType) {
              existing.dynamicEvidenceType = dynamicDetection.dynamicEvidenceType;
            }
            if (dynamicDetection.dynamicApi) {
              existing.dynamicApi = dynamicDetection.dynamicApi;
            }
            if (dynamicDetection.dynamicKey) {
              existing.dynamicKey = dynamicDetection.dynamicKey;
            }
            if (dynamicDetection.dynamicIv) {
              existing.dynamicIv = dynamicDetection.dynamicIv;
            }
            if (dynamicDetection.dynamicTag) {
              existing.dynamicTag = dynamicDetection.dynamicTag;
            }
          } else {
            const dynamicClone = {
              ...dynamicDetection,
              detectionMethod: dynamicDetection.detectionMethod || 'dynamic'
            };
            mergedDetections.push(dynamicClone);
            detectionMap.set(key, dynamicClone);
            dynamicOnlyDetections.push(dynamicClone);
          }
        }

        emitProgress('Finalizing scan results...', mergedDetections.length);

        console.log(`Total detections after merge: ${mergedDetections.length}`);
        console.log(`  - Static: ${detections.length}`);
        console.log(`  - Dynamic merged into static: ${mergedDynamicCount}`);
        console.log(`  - Dynamic only: ${dynamicOnlyDetections.length}`);

        if (code === 0) {
          // 데이터베이스에 결과 저장
          const saveToDatabase = async () => {
            try {
              emitProgress('Saving results to database...', mergedDetections.length);

              // 1. 스캔 생성
              const scanResponse = await callAPI('/scans/', 'POST');
              const scanId = scanResponse.Scan_id;
              console.log('Created scan with ID:', scanId);

              // OS별 result 폴더 경로 결정
              const getResultDirectory = (): string => {
                const possiblePaths = [
                  // Scanner creates result folder in its working directory (dist/main/result)
                  path.resolve(__dirname, 'result'),
                  // Development mode - from crypto-scanner-gui/dist/main
                  path.resolve(__dirname, '..', '..', '..', 'CryptoScanner', 'result'),
                  // Development mode - from crypto-scanner-gui
                  path.resolve(__dirname, '..', '..', 'CryptoScanner', 'result'),
                  // Absolute path
                  '/Users/jungjinho/Desktop/CryptoScanner_GUI/CryptoScanner/result',
                ];

                // Packaged app - search upwards from resources path
                if (process.resourcesPath) {
                  let searchPath = process.resourcesPath;
                  for (let i = 0; i < 7; i++) {
                    searchPath = path.dirname(searchPath);
                    possiblePaths.push(path.join(searchPath, 'CryptoScanner', 'result'));
                    possiblePaths.push(path.join(searchPath, 'CryptoScanner_GUI', 'CryptoScanner', 'result'));
                  }
                }

                // Find first existing path
                for (const testPath of possiblePaths) {
                  if (fs.existsSync(testPath)) {
                    console.log('Found result directory:', testPath);
                    return testPath;
                  }
                }

                // Fallback - scanner working directory
                console.warn('Result directory not found, using scanner working directory');
                return path.resolve(__dirname, 'result');
              };

              const resultDir = getResultDirectory();

              // 파일별로 그룹화
              const fileGroups = new Map<string, any[]>();
              for (const detection of mergedDetections) {
                const filePath = detection.filePath;
                if (!fileGroups.has(filePath)) {
                  fileGroups.set(filePath, []);
                }
                fileGroups.get(filePath)!.push(detection);
              }

              // 각 파일에 대해 처리
              for (const [filePath, fileDetections] of fileGroups.entries()) {
                try {
                  const fs = require('fs');
                  let fileSize = 0;
                  let fileType = 'unknown';

                  try {
                    const stats = fs.statSync(filePath);
                    fileSize = stats.size;
                    fileType = path.extname(filePath) || 'unknown';
                  } catch (err) {
                    console.warn(`Could not get file stats for ${filePath}:`, err);
                  }

                  // 2. 파일 생성
                  const fileResponse = await callAPI(`/files/?scan_id=${scanId}`, 'POST', {
                    File_name: path.basename(filePath),
                    File_type: fileType,
                    File_size: fileSize,
                  });
                  const fileId = fileResponse.File_id;
                  console.log(`Created file with ID: ${fileId} for ${filePath}`);

                  // 3. 정적 및 동적 분석 결과 저장
                  for (const detection of fileDetections) {
                    // 정적 분석 결과
                    if (detection.detectionMethod === 'static' || detection.detectionMethod === 'static+dynamic') {
                      const detectionMethodMap: any = {
                        'text': 'text',
                        'oid': 'oid',
                        'parameter': 'parameter',
                        'binary': 'text',
                      };

                      const severityMap: any = {
                        'High': 'high',
                        'Medium': 'medium',
                        'Low': 'low',
                      };

                      await callAPI(`/files/${fileId}/static/`, 'POST', {
                        File_id: fileId,
                        Scan_id: scanId,
                        Offset: detection.offset || 0,
                        Algorithm_name: detection.algorithm || 'Unknown',
                        Match: detection.matchString || '',
                        Detection_method: detectionMethodMap[detection.evidenceType] || 'text',
                        Severity: severityMap[detection.severity] || 'medium',
                      });
                      console.log(`Saved static analysis for ${detection.algorithm}`);
                    }

                    // 동적 분석 결과
                    if (detection.detectionMethod === 'dynamic' || detection.detectionMethod === 'static+dynamic') {
                      const keyLength = detection.dynamicKey ? detection.dynamicKey.length / 2 : null;

                      await callAPI(`/files/${fileId}/dynamic/`, 'POST', {
                        File_id: fileId,
                        Scan_id: scanId,
                        Parameter: detection.dynamicKey || null,
                        Api: detection.dynamicApi || null,
                        Key_length: keyLength,
                        Algorithm_name: detection.algorithm || 'Unknown',
                      });
                      console.log(`Saved dynamic analysis for ${detection.algorithm}`);
                    }
                  }

                  // 4. bin/asm 파일 저장 (Base64 인코딩 방식)
                  try {
                    // 파일명 추출 (확장자 포함)
                    const fullFileName = path.basename(filePath);
                    const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));

                    // result 폴더에서 해당 파일의 디렉토리 찾기
                    // 예: putty.exe -> putty_exe
                    const possibleDirNames = [
                      fullFileName.replace(/\./g, '_'),           // putty.exe -> putty_exe
                      fileNameWithoutExt,                          // putty
                      fullFileName.toLowerCase().replace(/\./g, '_'), // PUTTY.EXE -> putty_exe
                      fileNameWithoutExt.toLowerCase(),            // putty (소문자)
                      fullFileName.replace(/\./g, '-'),           // putty.exe -> putty-exe
                    ];

                    console.log(`Looking for result directory for file: ${fullFileName}, trying: ${possibleDirNames.join(', ')}`);

                    let fileResultDir: string | null = null;
                    for (const dirName of possibleDirNames) {
                      const testDir = path.join(resultDir, dirName);
                      if (fs.existsSync(testDir)) {
                        fileResultDir = testDir;
                        console.log(`Found result directory: ${testDir}`);
                        break;
                      }
                    }

                    if (fileResultDir && fs.existsSync(fileResultDir)) {
                      // bin과 asm 파일 찾기
                      const files = fs.readdirSync(fileResultDir);

                      let asmFileBuffer: Buffer | undefined;
                      let binFileBuffer: Buffer | undefined;
                      let asmFileName: string | undefined;
                      let binFileName: string | undefined;

                      for (const file of files) {
                        const fullPath = path.join(fileResultDir, file);
                        const stat = fs.statSync(fullPath);

                        if (stat.isFile()) {
                          const ext = path.extname(file).toLowerCase();

                          // .asm 파일 읽기
                          if (ext === '.asm') {
                            try {
                              asmFileBuffer = fs.readFileSync(fullPath);
                              asmFileName = file;
                              console.log(`Read ASM file: ${file} (${asmFileBuffer.length} bytes)`);
                            } catch (asmError) {
                              console.error(`Error reading ASM file ${file}:`, asmError);
                            }
                          }

                          // .bin 파일 읽기
                          else if (ext === '.bin') {
                            try {
                              binFileBuffer = fs.readFileSync(fullPath);
                              binFileName = file;
                              console.log(`Read BIN file: ${file} (${binFileBuffer.length} bytes)`);
                            } catch (binError) {
                              console.error(`Error reading BIN file ${file}:`, binError);
                            }
                          }
                        }
                        // chunks 폴더가 있는 경우 (큰 파일이 분할된 경우)
                        else if (stat.isDirectory() && file.endsWith('.chunks')) {
                          try {
                            const chunkFiles = fs.readdirSync(fullPath);
                            let combinedAsm = Buffer.alloc(0);

                            // .asm 파일들을 정렬하여 합치기
                            const asmFiles = chunkFiles.filter(f => f.endsWith('.asm')).sort();
                            for (const asmFile of asmFiles) {
                              const asmPath = path.join(fullPath, asmFile);
                              const asmContent = fs.readFileSync(asmPath);
                              combinedAsm = Buffer.concat([combinedAsm, Buffer.from(`\n\n--- ${asmFile} ---\n\n`), asmContent]);
                            }

                            if (combinedAsm.length > 0) {
                              asmFileBuffer = combinedAsm;
                              asmFileName = `${file.replace('.chunks', '')}_combined.asm`;
                              console.log(`Read combined ASM chunks: ${asmFiles.length} files (${asmFileBuffer.length} bytes)`);
                            }
                          } catch (chunkError) {
                            console.error(`Error processing chunks directory ${file}:`, chunkError);
                          }
                        }
                      }

                      // 파일 저장 (Base64 인코딩 방식)
                      if (asmFileBuffer || binFileBuffer) {
                        try {
                          // ASM 파일 저장 (File_text 필드에)
                          if (asmFileBuffer && asmFileName) {
                            const asmBase64 = asmFileBuffer.toString('base64');
                            await callAPI(`/files/${fileId}/llm/`, 'POST', {
                              File_id: fileId,
                              Scan_id: scanId,
                              File_text: `[ASM_FILE:${asmFileName}]${asmBase64}`,
                            });
                            console.log(`Saved ASM file: ${asmFileName} (${asmFileBuffer.length} bytes)`);
                          }

                          // BIN 파일 저장 (Code 필드에)
                          if (binFileBuffer && binFileName) {
                            const binBase64 = binFileBuffer.toString('base64');
                            await callAPI(`/files/${fileId}/llm_code/`, 'POST', {
                              File_id: fileId,
                              Scan_id: scanId,
                              Code: `[BIN_FILE:${binFileName}]${binBase64}`,
                            });
                            console.log(`Saved BIN file: ${binFileName} (${binFileBuffer.length} bytes)`);
                          }
                        } catch (saveError) {
                          console.error(`Error saving files for file ID ${fileId}:`, saveError);
                        }
                      }
                    } else {
                      console.log(`No result directory found for file: ${fullFileName} (tried: ${possibleDirNames.join(', ')})`);
                    }
                  } catch (resultError) {
                    console.error(`Error processing result files for ${filePath}:`, resultError);
                  }
                } catch (fileError) {
                  console.error(`Error saving file ${filePath} to database:`, fileError);
                }
              }

              console.log('Successfully saved scan results to database');
            } catch (dbError) {
              console.error('Error saving to database:', dbError);
              // 데이터베이스 저장 실패 시에도 스캔 결과는 반환
            }
          };

          // 데이터베이스 저장 (비동기로 실행하되 완료를 기다림)
          await saveToDatabase();

          resolve({
            success: true,
            output,
            detections: mergedDetections,
            nonPqcCount: mergedDetections.length,
            fileCount: new Set(mergedDetections.map(d => d.filePath)).size
          });
        } else {
          reject(new Error(errorOutput || 'Scan failed with code ' + code));
        }
        scannerProcess = null;
      });

      scannerProcess.on('error', (error) => {
        console.error('Scanner process error:', error);
        console.error('Error code:', (error as any).code);
        console.error('Error errno:', (error as any).errno);
        console.error('Error syscall:', (error as any).syscall);
        console.error('Error path:', (error as any).path);
        reject(error);
        scannerProcess = null;
      });
    } catch (error) {
      console.error('Scan setup error:', error);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
});

ipcMain.handle('cancel-scan', async () => {
  if (scannerProcess) {
    scannerProcess.kill();
    scannerProcess = null;
  }
  if (dynamicAnalysisProcess) {
    dynamicAnalysisProcess.kill();
    dynamicAnalysisProcess = null;
  }
  return { success: true };
});

ipcMain.handle('save-csv', async (event, data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `CryptoScan_${new Date().toISOString().split('T')[0]}.csv`,
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePath) {
    try {
      const fs = require('fs');
      fs.writeFileSync(result.filePath, data);
      return { success: true, path: result.filePath };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
  return { success: false, error: 'Save cancelled' };
});
