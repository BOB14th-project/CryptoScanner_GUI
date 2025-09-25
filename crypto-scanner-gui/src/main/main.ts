import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

console.log('=== MAIN PROCESS STARTED - NEW VERSION ===');

let mainWindow: BrowserWindow;
let scannerProcess: ChildProcess | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    height: 800,
    width: 1200,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
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
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Executable Files', extensions: ['exe', 'bin', 'out', 'app'] },
    ],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('start-scan', async (event, scanOptions) => {
  console.log('=== start-scan IPC called ===');
  return new Promise((resolve, reject) => {
    // Path to the compiled CryptoScanner binary
    let scannerPath = path.join(__dirname, 'CryptoScanner');

    // In production app, use the CLI binary from the app bundle
    if (process.resourcesPath) {
      // For packaged app, use our CLI binary from resources/app.asar.unpacked
      scannerPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main', 'CryptoScanner');
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

      // Set working directory to where patterns.json is located
      let cryptoScannerDir;

      if (process.resourcesPath) {
        // In packaged app, patterns.json is in the same directory as the CLI binary
        cryptoScannerDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main');
      } else {
        // In development, use the CryptoScanner source directory
        cryptoScannerDir = path.resolve(__dirname, '..', '..', '..', 'CryptoScanner');
      }

      // Fallback to absolute path if patterns.json not found
      if (!require('fs').existsSync(path.join(cryptoScannerDir, 'patterns.json'))) {
        cryptoScannerDir = '/Users/jungjinho/Desktop/CryptoScanner_GUI/CryptoScanner';
      }

      console.log('About to spawn process:');
      console.log('  scannerPath:', scannerPath);
      console.log('  args:', [scanOptions.path]);
      console.log('  cwd:', cryptoScannerDir);

      scannerProcess = spawn(scannerPath, [scanOptions.path], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: cryptoScannerDir, // Set working directory to CryptoScanner folder
        env: {
          ...process.env,
          DYLD_LIBRARY_PATH: '/opt/homebrew/lib',
          DYLD_FALLBACK_LIBRARY_PATH: '/opt/homebrew/lib',
          PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || ''),
          DISPLAY: ':0'
        }
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
              } else if (parts[1] === 'START') {
                currentFile = parts[2];
              } else if (parts[1] === 'COMPLETE') {
                scannedFiles = totalFiles;
              }

              // Send progress updates to renderer
              mainWindow.webContents.send('scan-progress', {
                type: 'progress',
                currentFile: currentFile || 'Scanning...',
                filesDone: scannedFiles,
                filesTotal: totalFiles,
                percentage: totalFiles > 0 ? Math.round((scannedFiles / totalFiles) * 100) : 0,
                detectionCount: detections.length
              });
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

                // Send updated detection count
                mainWindow.webContents.send('scan-progress', {
                  type: 'progress',
                  currentFile: currentFile || 'Scanning...',
                  filesDone: scannedFiles,
                  filesTotal: totalFiles,
                  percentage: totalFiles > 0 ? Math.round((scannedFiles / totalFiles) * 100) : 0,
                  detectionCount: detections.length
                });
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
              }
            }
          }
        }
      });

      scannerProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        console.error('Scanner stderr:', data.toString());
      });

      scannerProcess.on('close', (code) => {
        console.log(`Scanner process closed with code: ${code}`);
        console.log(`Output length: ${output.length}`);
        console.log(`Detections found: ${detections.length}`);
        console.log('Detections:', detections);

        if (code === 0) {
          resolve({
            success: true,
            output,
            detections,
            nonPqcCount: detections.length,
            fileCount: new Set(detections.map(d => d.filePath)).size
          });
        } else {
          reject(new Error(errorOutput || 'Scan failed with code ' + code));
        }
        scannerProcess = null;
      });

      scannerProcess.on('error', (error) => {
        console.error('Scanner process error:', error);
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
    return { success: true };
  }
  return { success: false };
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