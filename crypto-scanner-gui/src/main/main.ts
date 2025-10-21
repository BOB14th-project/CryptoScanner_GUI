import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

console.log('=== MAIN PROCESS STARTED - NEW VERSION ===');

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

          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              // NDJSON 이벤트를 Detection 형식으로 변환
              if (event.cipher && event.key) {
                detections.push({
                  filePath: targetPath,
                  offset: 0,
                  algorithm: event.cipher || 'Unknown',
                  matchString: event.api || '',
                  evidenceType: event.surface || 'dynamic',
                  severity: 'High',
                  detectionMethod: 'dynamic',
                  dynamicMatchString: event.api || '',
                  dynamicEvidenceType: event.surface || 'dynamic',
                  dynamicKey: event.key || undefined,
                  dynamicIv: event.iv || undefined,
                  dynamicTag: event.tag || undefined,
                  dynamicApi: event.api || undefined
                });
              }
            } catch (parseError) {
              console.error('Failed to parse NDJSON line:', parseError);
            }
          }
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
    const binaryName = process.platform === 'win32' ? 'CryptoScanner.exe' : 'CryptoScanner';

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
        if (isExecutableFile(filePath)) {
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

              // Ensure detection file paths are tracked as candidates
              for (const detection of detections) {
                trackExecutableCandidate(detection.filePath);
              }

              // 정적 탐지 결과에서 실행 파일들 추출
              const executableFiles = new Set<string>(executableCandidates);

              console.log(`Found ${executableFiles.size} executable files to analyze dynamically`);

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

        const detectionKey = (d: any) => `${d.filePath}:${d.algorithm}`;
        const staticKeys = new Set(detections.map((d: any) => detectionKey(d)));
        const dynamicKeys = new Set<string>();

        const dynamicUnique = dynamicDetections.filter((detection: any) => {
          const key = detectionKey(detection);
          if (staticKeys.has(key)) {
            console.log(`Skipping dynamic duplicate for ${key}`);
            return false;
          }
          if (dynamicKeys.has(key)) {
            console.log(`Skipping repeated dynamic detection for ${key}`);
            return false;
          }
          dynamicKeys.add(key);
          return true;
        });

        emitProgress('Finalizing scan results...', detections.length + dynamicUnique.length);

        console.log(`Total detections after merge: ${detections.length + dynamicUnique.length}`);
        console.log(`  - Static: ${detections.length}`);
        console.log(`  - Dynamic (unique): ${dynamicUnique.length}`);

        if (code === 0) {
          resolve({
            success: true,
            output,
            detections: [...detections, ...dynamicUnique],
            nonPqcCount: detections.length + dynamicUnique.length,
            fileCount: new Set([...detections, ...dynamicUnique].map(d => d.filePath)).size
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
