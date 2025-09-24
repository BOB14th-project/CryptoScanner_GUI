import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

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
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('start-scan', async (event, scanOptions) => {
  return new Promise((resolve, reject) => {
    // Path to the compiled CryptoScanner binary
    const scannerPath = path.join(__dirname, '../CryptoScanner');

    try {
      // Check if scanner binary exists
      const fs = require('fs');
      if (!fs.existsSync(scannerPath)) {
        reject({ success: false, error: 'CryptoScanner binary not found. Please build it first using: cd CryptoScanner && make' });
        return;
      }

      scannerProcess = spawn(scannerPath, [scanOptions.path], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';
      let errorOutput = '';
      let detections: any[] = [];

      scannerProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        console.log(`Received ${lines.length} lines from scanner:`, lines);

        for (const line of lines) {
          if (line.trim()) {
            output += line + '\n';
            console.log(`Processing line: "${line}"`);

            // Parse CSV output: filePath,algorithm,severity,matchType
            const parts = line.split(',');
            console.log(`Split into ${parts.length} parts:`, parts);

            if (parts.length >= 3) {
              const detection = {
                filePath: parts[0],
                algorithm: parts[1],
                severity: parts[2],
                evidenceType: parts[3] || 'binary',
                matchString: parts[3] || '',
                offset: 0
              };
              detections.push(detection);
              console.log('Added detection:', detection);
            }

            // Send progress updates to renderer
            mainWindow.webContents.send('scan-progress', {
              type: 'progress',
              currentFile: parts[0] || 'Scanning...',
              detectionCount: detections.length
            });
          }
        }
      });

      scannerProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
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
          reject({ success: false, error: errorOutput || 'Scan failed with code ' + code });
        }
        scannerProcess = null;
      });

      scannerProcess.on('error', (error) => {
        reject({ success: false, error: error.message });
        scannerProcess = null;
      });
    } catch (error) {
      reject({ success: false, error: (error as Error).message });
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