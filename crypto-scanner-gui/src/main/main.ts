import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as https from 'https';
import * as fs from 'fs';
import { exec as sudoPromptExec } from 'sudo-prompt';
import { generateReport } from './reportGenerator';
import * as dotenv from 'dotenv';

// .env 파일 로드 (여러 경로 시도)
const getEnvPaths = () => {
  const paths = [];

  console.log('[ENV Debug] __dirname:', __dirname);
  console.log('[ENV Debug] process.resourcesPath:', process.resourcesPath);
  console.log('[ENV Debug] app.getPath(exe):', app.getPath('exe'));
  console.log('[ENV Debug] process.cwd():', process.cwd());
  console.log('[ENV Debug] app.isPackaged:', app.isPackaged);

  // Development mode (npm run dev)
  paths.push(path.join(__dirname, '../../.env'));           // crypto-scanner-gui/.env
  paths.push(path.join(__dirname, '../../../.env'));        // CryptoScanner_GUI/.env

  // Production mode (packaged app)
  if (app.isPackaged) {
    // resources/.env (included in build)
    paths.push(path.join(process.resourcesPath, '.env'));
    paths.push(path.join(process.resourcesPath, 'app', '.env'));
    paths.push(path.join(process.resourcesPath, 'app', 'dist', 'main', '.env'));

    // Windows specific: resources/app/dist/main/.env
    if (process.platform === 'win32') {
      paths.push(path.join(__dirname, '.env'));  // dist/main/.env
      paths.push(path.join(__dirname, '..', '..', '.env'));  // resources/.env
      paths.push(path.join(process.resourcesPath, 'app', 'dist', '.env'));
    }

    // Mac specific: .app/Contents/Resources/
    if (process.platform === 'darwin') {
      const appPath = app.getPath('exe');
      // CryptoScanner.app/Contents/MacOS/CryptoScanner
      // -> CryptoScanner.app/Contents/Resources/.env
      const contentsPath = path.join(path.dirname(appPath), '..');
      paths.push(path.join(contentsPath, 'Resources', '.env'));
      paths.push(path.join(contentsPath, 'Resources', 'app', 'dist', 'main', '.env'));
      paths.push(path.join(contentsPath, '.env'));

      // Also try app.asar.unpacked
      paths.push(path.join(process.resourcesPath, 'app.asar.unpacked', '.env'));
      paths.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main', '.env'));
    }

    // app directory/.env (user can place it here)
    const appPath = path.dirname(app.getPath('exe'));
    paths.push(path.join(appPath, '.env'));

    // Parent directory of app/.env
    paths.push(path.join(appPath, '../.env'));
    paths.push(path.join(appPath, '../../.env'));
    paths.push(path.join(appPath, '../../../.env'));

    // For Linux/Mac: ~/CryptoScanner_GUI/.env
    const homeDir = app.getPath('home');
    paths.push(path.join(homeDir, 'CryptoScanner_GUI', '.env'));
    paths.push(path.join(homeDir, 'Desktop', 'CryptoScanner_GUI', '.env'));
  }

  // Current working directory
  paths.push(path.join(process.cwd(), '.env'));

  return paths;
};

const envPaths = getEnvPaths();
let envLoaded = false;

console.log('[ENV Debug] Trying the following paths:');
for (const envPath of envPaths) {
  const exists = fs.existsSync(envPath);
  console.log(`  ${exists ? '✅' : '❌'} ${envPath}`);

  if (exists && !envLoaded) {
    console.log(`[ENV] Loading from: ${envPath}`);
    dotenv.config({ path: envPath });
    envLoaded = true;

    // Verify it was loaded
    console.log('[ENV] After loading - GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? `SET (${process.env.GOOGLE_API_KEY.substring(0, 20)}...)` : 'NOT SET');
    console.log('[ENV] After loading - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET');
  }
}

if (!envLoaded) {
  console.warn('[ENV] WARNING: No .env file found! Please place .env file in one of the above locations.');
}

console.log('=== MAIN PROCESS STARTED - NEW VERSION ===');
console.log('[ENV] Final check - GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? 'SET' : 'NOT SET');

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
          console.log(`[API] ${method} ${endpoint} - Status: ${res.statusCode}`);
          console.log('[API] Response preview:', data.substring(0, 200));
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          console.error(`[API Error] ${method} ${endpoint} failed:`, e);
          console.error('[API Error] Raw response:', data.substring(0, 500));
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

// Limit inline uploads to avoid exhausting the Electron main-process heap when handling large dump files.
// Also respects MySQL max_allowed_packet limit (Base64 encoding increases size by ~33%)
const MAX_INLINE_UPLOAD_BYTES = 1 * 1024 * 1024; // 1 MB (compatible with MySQL)

let mainWindow: BrowserWindow;
let scannerProcess: ChildProcess | null = null;
let dynamicAnalysisProcess: ChildProcess | null = null;
let isAdminMode = false;
let sudoPassword: string | null = null; // Store password for SUDO_ASKPASS

// Check if running with admin privileges (check if sudo cached)
async function checkAdminMode(): Promise<boolean> {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const { exec } = require('child_process');
      exec(
        'powershell.exe -NoProfile -Command "[bool]([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"',
        { windowsHide: true },
        (error: any, stdout: string) => {
          if (error) {
            resolve(false);
            return;
          }
          resolve(stdout.trim().toLowerCase() === 'true');
        }
      );
    });
  }

  // Only supported on macOS and Linux
  if (process.platform !== 'darwin' && process.platform !== 'linux') return false;

  return new Promise((resolve) => {
    const { exec } = require('child_process');
    exec('sudo -n true 2>&1', (error: any) => {
      resolve(!error);
    });
  });
}

// Interval for keeping sudo alive
let sudoKeepAliveInterval: NodeJS.Timeout | null = null;

// Request admin privileges using GUI password prompt
async function requestAdminPrivileges(): Promise<boolean> {
  if (process.platform === 'win32') {
    if (await checkAdminMode()) {
      console.log('[Admin] Windows process already elevated');
      return true;
    }

    return new Promise((resolve) => {
      const command = 'powershell.exe -NoProfile -Command "Write-Output CryptoScannerAdmin"';
      sudoPromptExec(
        command,
        { name: 'CryptoScanner' },
        (error) => {
          if (error) {
            console.error('Failed to obtain Windows admin privileges:', error);
            resolve(false);
          } else {
            console.log('[Admin] Windows admin privileges granted');
            resolve(true);
          }
        }
      );
    });
  }

  // Only supported on macOS and Linux
  if (process.platform !== 'darwin' && process.platform !== 'linux') return false;

  return new Promise((resolve) => {
    const { exec, execSync, spawn } = require('child_process');

    if (process.platform === 'darwin') {
      // macOS: Use osascript to show a GUI password dialog
      const script = 'do shell script "sudo -v" with administrator privileges';
      const command = `osascript -e '${script}'`;

      exec(command, (error: any) => {
        if (error) {
          console.error('Failed to get admin privileges:', error);
          resolve(false);
        } else {
          console.log('✅ Admin privileges granted');
          setupSudoKeepAlive(exec);
          resolve(true);
        }
      });
    } else {
      // Linux: Use Electron's own password dialog
      console.log('🔐 Requesting admin privileges on Linux (Electron dialog)...');

      // Create a modal password dialog window
      const passwordWindow = new BrowserWindow({
        width: 450,
        height: 280,
        modal: true,
        parent: mainWindow,
        show: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        frame: true,
        title: 'Administrator Authentication Required',
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      });

      // HTML content for password dialog
      const passwordDialogHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #000000;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      padding: 20px;
    }
    .dialog {
      width: 100%;
      max-width: 400px;
    }
    h2 {
      color: #ffffff;
      margin-bottom: 10px;
      font-size: 20px;
    }
    p {
      color: #ffffff;
      margin-bottom: 25px;
      line-height: 1.6;
      font-size: 14px;
    }
    .input-group {
      margin-bottom: 25px;
    }
    label {
      display: block;
      color: #ffffff;
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 500;
    }
    input[type="password"] {
      width: 100%;
      padding: 12px;
      border: 2px solid #ffffff;
      border-radius: 6px;
      font-size: 14px;
      background: #ffffff;
      color: #000000;
    }
    input[type="password"]:focus {
      outline: none;
      border-color: #ffffff;
    }
    .buttons {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    button {
      padding: 10px 24px;
      border: 2px solid #ffffff;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      background: #ffffff;
      color: #000000;
      transition: all 0.2s;
    }
    button:hover {
      background: #000000;
      color: #ffffff;
    }
    .error {
      color: #ff4444;
      font-size: 12px;
      margin-top: 8px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="dialog">
    <h2>🔒 Administrator Authentication</h2>
    <p>CryptoScanner needs administrator privileges to enable advanced dynamic analysis features.</p>
    <div class="input-group">
      <label for="password">Password:</label>
      <input type="password" id="password" placeholder="Enter your sudo password" autofocus>
      <div class="error" id="error">Incorrect password. Please try again.</div>
    </div>
    <div class="buttons">
      <button id="cancelBtn">Cancel</button>
      <button id="okBtn">OK</button>
    </div>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    const passwordInput = document.getElementById('password');
    const okBtn = document.getElementById('okBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const errorDiv = document.getElementById('error');

    okBtn.onclick = () => {
      const password = passwordInput.value;
      if (password) {
        errorDiv.style.display = 'none';
        ipcRenderer.send('password-submit', password);
      }
    };

    cancelBtn.onclick = () => {
      ipcRenderer.send('password-cancel');
    };

    passwordInput.onkeypress = (e) => {
      if (e.key === 'Enter') {
        okBtn.click();
      }
    };

    ipcRenderer.on('password-error', () => {
      errorDiv.style.display = 'block';
      passwordInput.value = '';
      passwordInput.focus();
    });
  </script>
</body>
</html>
      `;

      passwordWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(passwordDialogHTML));
      passwordWindow.once('ready-to-show', () => {
        passwordWindow.show();
      });

      // Handle password submission
      ipcMain.once('password-submit', (event: any, password: string) => {
        console.log('✓ Password received from dialog');

        // Create a temporary askpass script (more reliable for GUI apps)
        const tmpDir = require('os').tmpdir();
        const askpassScript = path.join(tmpDir, `askpass-${Date.now()}.sh`);
        const passwordFile = path.join(tmpDir, `sudopw-${Date.now()}.txt`);

        try {
          // Write password to temporary file
          fs.writeFileSync(passwordFile, password, { mode: 0o600 });

          // Create askpass script that reads the password file
          // IMPORTANT: Output password with exactly one newline for sudo
          // Use stdout explicitly and flush immediately
          const askpassLog = path.join(tmpDir, `askpass-log-${Date.now()}.txt`);
          const scriptContent = `#!/bin/bash
echo "Askpass called at $(date)" >> "${askpassLog}" 2>&1
PASSWORD=$(cat "${passwordFile}" 2>>"${askpassLog}")
echo "Password read, length: \${#PASSWORD}" >> "${askpassLog}" 2>&1
# Output to stdout with explicit newline, then flush
printf "%s\\n" "$PASSWORD" 2>>"${askpassLog}"
echo "Password printed to stdout" >> "${askpassLog}" 2>&1
exit 0
`;
          fs.writeFileSync(askpassScript, scriptContent, { mode: 0o700 });

          console.log('Created askpass script:', askpassScript);

          // Debug: Write detailed log
          const debugLog = path.join(tmpDir, `sudo-debug-${Date.now()}.log`);
          fs.writeFileSync(debugLog, `Askpass: ${askpassScript}\nPassword file: ${passwordFile}\nAskpass log: ${askpassLog}\n`, { mode: 0o600 });
          console.log('Debug log:', debugLog);
          console.log('Askpass log:', askpassLog);

          // Use SUDO_ASKPASS to provide password
          const env = {
            ...process.env,
            SUDO_ASKPASS: askpassScript,
            PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
          };

          // Use 'sudo -A true' instead of 'sudo -A -v' as -v might not work on all systems
          exec('/usr/bin/sudo -A /bin/true 2>&1', { env, shell: '/bin/bash' }, (error: any, stdout: string, stderr: string) => {
            const output = stdout + stderr;
            console.log('sudo -A /bin/true output:', output);
            console.log('sudo error object:', error);
            console.log('sudo exit code:', error?.code);

            // Append to debug log
            try {
              fs.appendFileSync(debugLog, `\nsudo -A /bin/true:\nOutput: ${output}\nError: ${JSON.stringify(error)}\n`, { mode: 0o600 });
            } catch (e) {}

            if (error && (output.toLowerCase().includes('sorry') || output.toLowerCase().includes('incorrect') || output.toLowerCase().includes('failed'))) {
              console.error('❌ Incorrect password');
              console.error('sudo output:', output);

              // Clean up temporary files (keep askpass log for debugging)
              try {
                fs.unlinkSync(passwordFile);
                fs.unlinkSync(askpassScript);
                console.log('Cleaned up temp files on error (keeping askpass log)');
                console.log('Check askpass log:', askpassLog);
              } catch (cleanupErr) {
                console.warn('Failed to clean up temp files:', cleanupErr);
              }

              passwordWindow.webContents.send('password-error');
            } else {
              console.log('✅ Password accepted (sudo -A /bin/true succeeded)');

              // Clean up temporary files (keep askpass log for debugging)
              try {
                fs.unlinkSync(passwordFile);
                fs.unlinkSync(askpassScript);
                console.log('✅ Cleaned up temp files (keeping askpass log for debugging)');
                console.log('Check askpass log:', askpassLog);
              } catch (cleanupErr) {
                console.warn('Failed to clean up temp files:', cleanupErr);
              }

              // NOTE: We skip timestamp verification because sudo timestamps are TTY-specific.
              // When running from GUI (file manager), the timestamp won't persist.
              // Instead, we'll use SUDO_ASKPASS each time we need sudo for dynamic analysis.
              console.log('✅ Admin privileges successfully granted on Linux!');
              console.log('ℹ️  Note: Will use SUDO_ASKPASS for each sudo operation (TTY-independent)');

              // Store password for future SUDO_ASKPASS use
              sudoPassword = password;
              console.log('✅ Password stored for dynamic analysis');

              passwordWindow.close();

              // Don't set up keep-alive since timestamp doesn't persist in GUI session
              // setupSudoKeepAlive(exec);

              resolve(true);
            }
          });
        } catch (err) {
          console.error('❌ Failed to create askpass script:', err);
          passwordWindow.webContents.send('password-error');
        }
      });

      // Handle password cancellation
      ipcMain.once('password-cancel', () => {
        console.log('❌ Password dialog cancelled');
        passwordWindow.close();
        resolve(false);
      });

      passwordWindow.on('closed', () => {
        ipcMain.removeAllListeners('password-submit');
        ipcMain.removeAllListeners('password-cancel');
      });
    }
  });
}

// Helper function to set up sudo keep-alive
function setupSudoKeepAlive(exec: any): void {
  if (sudoKeepAliveInterval) {
    clearInterval(sudoKeepAliveInterval);
  }

  sudoKeepAliveInterval = setInterval(() => {
    exec('/usr/bin/sudo -n -v', { shell: '/bin/bash' }, (err: any) => {
      if (err) {
        console.warn('⚠️  Sudo timestamp expired, clearing keep-alive');
        if (sudoKeepAliveInterval) {
          clearInterval(sudoKeepAliveInterval);
          sudoKeepAliveInterval = null;
        }
      } else {
        console.log('✅ Sudo timestamp refreshed');
      }
    });
  }, 4 * 60 * 1000); // Every 4 minutes
}

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

// Handle admin mode request
ipcMain.handle('enable-admin-mode', async () => {
  console.log('Admin mode requested');
  const granted = await requestAdminPrivileges();
  if (granted) {
    isAdminMode = true;
    console.log('Admin mode enabled');
  }
  return granted;
});

ipcMain.handle('check-admin-mode', async () => {
  return isAdminMode || await checkAdminMode();
});

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

    // If admin mode is enabled, use advanced tracing for dynamic analysis
    if (isAdminMode && process.platform === 'darwin') {
      spawnEnv.USE_DTRACE = '1';
      console.log('✅ Admin mode enabled - using DTrace for dynamic analysis');
    }

    // Linux: Always enable enhanced monitoring to keep long-running targets alive.
    // The monitor window is configurable via HOOK_MONITOR_SECONDS (defaults to 60s).
    if (process.platform === 'linux') {
      spawnEnv.USE_STRACE = '1';
      const monitorSeconds = process.env.HOOK_MONITOR_SECONDS || '60';
      spawnEnv.HOOK_MONITOR_SECONDS = monitorSeconds;
      spawnEnv.MOZ_DISABLE_SANDBOX = '1';
      spawnEnv.MOZ_DISABLE_CONTENT_SANDBOX = '1';
      spawnEnv.MOZ_DISABLE_RDD_SANDBOX = '1';
      spawnEnv.MOZ_DISABLE_GMP_SANDBOX = '1';
      spawnEnv.MOZ_DISABLE_GPU_SANDBOX = '1';
      spawnEnv.MOZ_FORCE_DISABLE_E10S = '1';
      console.log(`✅ Linux: Using ${monitorSeconds}-second monitoring window for dynamic analysis`);
    }

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

    // If admin mode is enabled on macOS, run with elevated privileges for DTrace
    // Linux: Always run as regular user (no sudo needed for LD_PRELOAD)
    if (isAdminMode && process.platform === 'darwin') {
      const { exec } = require('child_process');

      if (process.platform === 'darwin') {
        // macOS: Copy DTrace scripts to /tmp for accessibility (osascript sandbox restrictions)
        const dtraceScriptSource = path.join(binaryDir, 'macos_crypto_trace.d');
        const dtraceScriptSandboxSource = path.join(binaryDir, 'macos_crypto_trace_sandbox.d');
        const dtraceScriptTemp = '/tmp/macos_crypto_trace.d';
        const dtraceScriptSandboxTemp = '/tmp/macos_crypto_trace_sandbox.d';

        try {
          if (fs.existsSync(dtraceScriptSource)) {
            fs.copyFileSync(dtraceScriptSource, dtraceScriptTemp);
            fs.chmodSync(dtraceScriptTemp, 0o644);
            console.log('✅ Copied DTrace script to /tmp for elevated access');
          }
          if (fs.existsSync(dtraceScriptSandboxSource)) {
            fs.copyFileSync(dtraceScriptSandboxSource, dtraceScriptSandboxTemp);
            fs.chmodSync(dtraceScriptSandboxTemp, 0o644);
            console.log('✅ Copied sandbox DTrace script to /tmp for elevated access');
          }
        } catch (err) {
          console.warn('⚠️  Failed to copy DTrace script to /tmp:', err);
        }
      }

      // Build environment variable string for the command
      const envVarString = Object.entries(spawnEnv)
        .filter(([key]) => key.startsWith('HOOK_') || key === 'USE_DTRACE' || key === 'USE_STRACE')
        .map(([key, value]) => `export ${key}="${value}";`)
        .join(' ');

      // Build the command with absolute paths and environment variables
      const fullCommand = `${envVarString} "${dynamicAnalysisPath}" "${targetPath}"`;

      let execCommand: string;
      if (process.platform === 'darwin') {
        // macOS: Use osascript for GUI password prompt
        const script = `do shell script "${fullCommand.replace(/"/g, '\\"')}" with administrator privileges`;
        execCommand = `osascript -e '${script}'`;
        console.log('[Dynamic Analysis] Running with administrator privileges via osascript');
      } else {
        // Linux: Use sudo (GUI password prompt handled by requestAdminPrivileges earlier)
        execCommand = `sudo sh -c '${fullCommand.replace(/'/g, "'\\''")}'`;
        console.log('[Dynamic Analysis] Running with administrator privileges via sudo');
      }

      let output = '';
      let errorOutput = '';
      let actualLogFile = logFile;

      const adminProcess = exec(execCommand, (error: any, stdout: string, stderr: string) => {
        output = stdout;
        errorOutput = stderr;

        if (error) {
          console.error('[Dynamic Analysis Error]', error);
          console.error('[Dynamic Analysis Error Output]', stderr);
        }

        console.log('[Dynamic Analysis stdout]', stdout);
        if (stderr) {
          console.log('[Dynamic Analysis stderr]', stderr);
        }

        // Extract actual log file path
        const logMatch = stdout.match(/\[dynamic_analysis\] log:\s+"([^"]+)"/);
        if (logMatch) {
          actualLogFile = logMatch[1];
          console.log('Detected actual log file:', actualLogFile);
        }

        console.log(`Dynamic analysis process completed`);
        console.log('Looking for log file at:', actualLogFile);

        // Parse NDJSON log file
        const detections: any[] = [];
        if (fs.existsSync(actualLogFile)) {
          try {
            const logContent = fs.readFileSync(actualLogFile, 'utf-8');

            // Remove ALL dtrace error messages (important for sandboxed apps like KakaoTalk)
            const cleanContent = logContent
              .split('\n')
              .filter(line => !line.startsWith('dtrace:'))
              .join('\n');

            // Parse as JSON array (DTrace outputs JSON array format)
            let events: any[] = [];
            try {
              events = JSON.parse(cleanContent);
              if (!Array.isArray(events)) {
                events = [];
              }
            } catch (parseErr) {
              console.error('Failed to parse log file as JSON array:', parseErr);
              events = [];
            }

            const detectionMap = new Map<string, any>();

            for (const event of events) {
              // Skip non-crypto events (trace_end, process_exit)
              if (!event || event.event === 'trace_end' || event.event === 'process_exit') {
                continue;
              }

              // Handle both OpenSSL (cipher field) and CommonCrypto (algorithm field) formats
              let algorithmName = '';

              if (event.cipher) {
                // OpenSSL format: has cipher field directly
                algorithmName = event.cipher;
              } else if (event.algorithm !== undefined) {
                // CommonCrypto format: map numeric algorithm codes to names
                const algorithmMap: Record<number, string> = {
                  0: 'None',
                  1: 'SHA-1',     // kCCHmacAlgSHA1
                  2: 'SHA-256',   // kCCDigestSHA256
                  3: 'MD5',       // kCCDigestMD5
                  4: 'SHA-384',   // kCCDigestSHA384
                  5: 'SHA-224',   // kCCDigestSHA224
                  8: 'SHA-512',   // kCCDigestSHA512
                  10: 'RMD-160'   // kCCDigestRMD160
                };
                algorithmName = algorithmMap[event.algorithm] || `Algorithm-${event.algorithm}`;
              } else {
                // No algorithm information, skip
                continue;
              }

              // Determine the function/API being used
              const apiName = typeof event.api === 'string' ? event.api :
                             (typeof event.function === 'string' ? event.function : event.event || '');
              const surfaceName = typeof event.surface === 'string' ? event.surface : 'dynamic';
              const direction = typeof event.dir === 'string' ? event.dir : '';
              const evidenceLabel = direction ? `${surfaceName} (${direction})` : surfaceName;

              const mapKey = [
                surfaceName || 'dynamic',
                apiName || 'unknown',
                direction || 'any',
                algorithmName
              ].join('|');

              const existing = detectionMap.get(mapKey) ?? {
                filePath: targetPath,
                offset: 0,
                algorithm: algorithmName,
                matchString: apiName || algorithmName,
                evidenceType: evidenceLabel,
                severity: 'High',
                detectionMethod: 'dynamic',
                dynamicMatchString: apiName || '',
                dynamicEvidenceType: evidenceLabel,
                dynamicApi: apiName || undefined
              };

              if (apiName) {
                existing.matchString = existing.matchString || apiName;
              }

              detectionMap.set(mapKey, existing);
            }

            detections.push(...detectionMap.values());
            console.log(`Dynamic analysis found ${detections.length} detections`);
          } catch (err: any) {
            console.error('Failed to read dynamic analysis log:', err);
          }
        } else {
          console.log('Dynamic analysis log file not found');
        }

        resolve(detections);
      });

      return; // Exit early, we're using exec instead of spawn
    }

    // Non-admin mode: use regular spawn
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

              // Map to store file path to database file ID
              const dbFileIds: Record<string, number> = {};

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

                  // Store the database file ID
                  dbFileIds[filePath] = fileId;

                  // 3. 정적 및 동적 분석 결과 저장
                  console.log(`[DB Save] Processing ${fileDetections.length} detections for file ${fileId}`);
                  console.log(`[DB Save] Detection methods:`, fileDetections.map(d => d.detectionMethod).join(', '));

                  // 동적 분석 결과를 먼저 저장 (ngrok 제한 회피)
                  const dynamicDetections = fileDetections.filter(d =>
                    d.detectionMethod === 'dynamic' || d.detectionMethod === 'static+dynamic'
                  );
                  const staticDetections = fileDetections.filter(d =>
                    d.detectionMethod === 'static' || d.detectionMethod === 'static+dynamic'
                  );

                  console.log(`[DB Save] Saving ${dynamicDetections.length} dynamic detections first...`);

                  // 1️⃣ 동적 분석 먼저 저장
                  for (const detection of dynamicDetections) {
                    const keyLength = detection.dynamicKey ? detection.dynamicKey.length / 2 : 0;

                    const dynamicData: any = {
                      File_id: fileId,
                      Scan_id: scanId,
                      Algorithm_name: detection.algorithm || 'Unknown',
                    };

                    // Optional fields - only include if they have values
                    if (detection.dynamicKey) {
                      dynamicData.Parameter = detection.dynamicKey;
                      dynamicData.Key_length = keyLength;
                    } else {
                      // Send empty string instead of null to avoid FastAPI validation error
                      dynamicData.Parameter = '';
                      dynamicData.Key_length = 0;
                    }

                    if (detection.dynamicApi) {
                      dynamicData.Api = detection.dynamicApi;
                    } else {
                      dynamicData.Api = '';
                    }

                    console.log(`[Dynamic] Saving for ${detection.algorithm}:`, JSON.stringify(dynamicData));

                    try {
                      await callAPI(`/files/${fileId}/dynamic/`, 'POST', dynamicData);
                      console.log(`✅ Saved dynamic analysis for ${detection.algorithm}`);
                    } catch (err) {
                      console.error(`❌ Failed to save dynamic analysis for ${detection.algorithm}:`, err);
                    }
                  }

                  console.log(`[DB Save] Now saving ${staticDetections.length} static detections...`);

                  // 2️⃣ 정적 분석 나중에 저장
                  for (const detection of staticDetections) {
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

                    try {
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
                    } catch (err) {
                      console.error(`Failed to save static analysis:`, err);
                    }
                  }

                  // 4. 소스 코드 또는 실행 파일 처리
                  const fileExt = path.extname(filePath).toLowerCase();
                  const sourceCodeExtensions = [
                    '.c', '.cpp', '.cc', '.cxx', '.c++',
                    '.h', '.hpp', '.hh', '.hxx', '.h++',
                    '.java', '.py', '.js', '.ts', '.jsx', '.tsx',
                    '.go', '.rs', '.swift', '.kt', '.kts',
                    '.cs', '.rb', '.php', '.pl', '.sh',
                    '.scala', '.clj', '.lua', '.r', '.m', '.mm'
                  ];
                  const isSourceCode = sourceCodeExtensions.includes(fileExt);

                  // Case 1: 소스 코드 파일 - Code 필드에 저장
                  if (isSourceCode) {
                    try {
                      console.log(`[Source Code] Processing source code file: ${filePath}`);

                      const stats = fs.statSync(filePath);
                      const MAX_SOURCE_SIZE = 50 * 1024 * 1024; // 50MB limit

                      if (stats.size <= MAX_SOURCE_SIZE) {
                        const sourceCode = fs.readFileSync(filePath, 'utf-8');

                        // Save to DB - Code field
                        try {
                          const payload = {
                            File_id: fileId,
                            Scan_id: scanId,
                            File_text: '', // Required field, but empty for source code
                            Code: sourceCode,
                          };
                          console.log(`[Source Code] Sending payload to /files/${fileId}/llm_code/:`, JSON.stringify({
                            File_id: payload.File_id,
                            Scan_id: payload.Scan_id,
                            Code_length: payload.Code.length,
                            Code_preview: payload.Code.substring(0, 100)
                          }));
                          // Use llm_code endpoint instead of llm
                          await callAPI(`/files/${fileId}/llm_code/`, 'POST', {
                            File_id: fileId,
                            Scan_id: scanId,
                            Code: sourceCode,
                          });
                          console.log(`[Source Code] ✅ Saved source code to DB for file ${fileId} (${sourceCode.length} bytes)`);
                        } catch (dbErr) {
                          console.error(`[Source Code] ❌ Failed to save source code to DB:`, dbErr);
                        }
                      } else {
                        // If file is too large, read first 50MB
                        const fd = fs.openSync(filePath, 'r');
                        const buffer = Buffer.alloc(MAX_SOURCE_SIZE);
                        const bytesRead = fs.readSync(fd, buffer, 0, MAX_SOURCE_SIZE, 0);
                        fs.closeSync(fd);

                        const truncatedCode = `/* TRUNCATED - First ${bytesRead} bytes of ${stats.size} total */\n\n` +
                                            buffer.toString('utf-8', 0, bytesRead);

                        try {
                          // Use llm_code endpoint
                          await callAPI(`/files/${fileId}/llm_code/`, 'POST', {
                            File_id: fileId,
                            Scan_id: scanId,
                            Code: truncatedCode,
                          });
                          console.warn(`[Source Code] ⚠️ Saved truncated source code to DB for file ${fileId} (${stats.size} -> ${bytesRead} bytes)`);
                        } catch (dbErr) {
                          console.error(`[Source Code] ❌ Failed to save truncated source code to DB:`, dbErr);
                        }
                      }
                    } catch (sourceError) {
                      console.error(`[Source Code] Error processing source code file ${filePath}:`, sourceError);
                    }
                  }
                  // Case 2: Mac 환경 - 실행 파일 디스어셈블 생성 및 저장
                  else if (process.platform === 'darwin') {
                    try {
                      // Check if file is executable
                      const { execSync } = require('child_process');

                      // Use 'file' command to check if it's an executable
                      let isExecutable = false;
                      try {
                        const fileTypeOutput = execSync(`file "${filePath}"`, { encoding: 'utf-8', maxBuffer: 1024 * 1024 });
                        console.log(`[Mac Disasm] File type check: ${fileTypeOutput.trim()}`);

                        // Check if it's a Mach-O executable
                        isExecutable = fileTypeOutput.includes('Mach-O') &&
                                      (fileTypeOutput.includes('executable') ||
                                       fileTypeOutput.includes('dynamically linked shared library') ||
                                       fileTypeOutput.includes('universal binary'));
                      } catch (fileCheckErr) {
                        console.log(`[Mac Disasm] Could not check file type: ${fileCheckErr}`);
                      }

                      if (isExecutable) {
                        console.log(`[Mac Disasm] Generating disassembly for: ${filePath}`);

                        // Create temporary output file
                        const tmpAsmPath = path.join('/tmp', `disasm_${fileId}_${Date.now()}.asm`);

                        let disasmSuccess = false;
                        let disasmCommand = '';

                        // Try multiple disassembly tools in order of preference
                        const disasmTools = [
                          // 1. Try llvm-objdump (Homebrew)
                          `/opt/homebrew/bin/llvm-objdump -d --no-show-raw-insn --print-imm-hex "${filePath}"`,
                          // 2. Try system objdump
                          `objdump -d "${filePath}"`,
                          // 3. Try otool (macOS native)
                          `otool -tV "${filePath}"`,
                          // 4. Try llvm-objdump without path
                          `llvm-objdump -d --no-show-raw-insn --print-imm-hex "${filePath}"`,
                        ];

                        for (const tool of disasmTools) {
                          try {
                            console.log(`[Mac Disasm] Trying: ${tool.split(' ')[0]}`);
                            disasmCommand = `${tool} > "${tmpAsmPath}" 2>&1`;
                            execSync(disasmCommand, {
                              encoding: 'utf-8',
                              maxBuffer: 100 * 1024 * 1024, // 100MB buffer
                              timeout: 60000 // 60 second timeout
                            });

                            // Check if output file exists and has content
                            if (fs.existsSync(tmpAsmPath)) {
                              const stats = fs.statSync(tmpAsmPath);
                              if (stats.size > 100) { // At least 100 bytes
                                disasmSuccess = true;
                                console.log(`[Mac Disasm] Successfully generated disassembly: ${stats.size} bytes`);
                                break;
                              } else {
                                console.log(`[Mac Disasm] Output too small (${stats.size} bytes), trying next tool`);
                              }
                            }
                          } catch (toolErr) {
                            console.log(`[Mac Disasm] Tool failed, trying next...`);
                            continue;
                          }
                        }

                        if (disasmSuccess && fs.existsSync(tmpAsmPath)) {
                          const stats = fs.statSync(tmpAsmPath);
                          const MAX_ASM_SIZE = 1 * 1024 * 1024; // 1MB limit for MySQL compatibility

                          let asmContent = '';
                          if (stats.size <= MAX_ASM_SIZE) {
                            asmContent = fs.readFileSync(tmpAsmPath, 'utf-8');
                          } else {
                            // If too large, read first 1MB
                            const fd = fs.openSync(tmpAsmPath, 'r');
                            const buffer = Buffer.alloc(MAX_ASM_SIZE);
                            const bytesRead = fs.readSync(fd, buffer, 0, MAX_ASM_SIZE, 0);
                            fs.closeSync(fd);
                            asmContent = `[TRUNCATED - First ${bytesRead} bytes of ${stats.size} total]\n\n` +
                                        buffer.toString('utf-8', 0, bytesRead);
                            console.warn(`[Mac Disasm] Truncated assembly from ${stats.size} to ${bytesRead} bytes`);
                          }

                          // Save to DB
                          try {
                            await callAPI(`/files/${fileId}/llm/`, 'POST', {
                              File_id: fileId,
                              Scan_id: scanId,
                              File_text: asmContent,
                              Code: '', // Required field, but empty for disassembly
                            });
                            console.log(`[Mac Disasm] ✅ Saved disassembly to DB for file ${fileId} (${asmContent.length} bytes)`);
                          } catch (dbErr) {
                            console.error(`[Mac Disasm] ❌ Failed to save disassembly to DB:`, dbErr);
                          }

                          // Clean up temp file
                          try {
                            fs.unlinkSync(tmpAsmPath);
                            console.log(`[Mac Disasm] Cleaned up temp file: ${tmpAsmPath}`);
                          } catch (cleanupErr) {
                            console.warn(`[Mac Disasm] Could not clean up temp file:`, cleanupErr);
                          }
                        } else {
                          console.warn(`[Mac Disasm] Failed to generate disassembly for ${filePath}`);
                        }
                      } else {
                        console.log(`[Mac Disasm] File is not an executable, skipping disassembly: ${filePath}`);
                      }
                    } catch (macDisasmError) {
                      console.error(`[Mac Disasm] Error processing ${filePath}:`, macDisasmError);
                    }
                  }

                  // 5. bin/asm 파일 저장 (Base64 인코딩 방식) - 기존 result 폴더에서 읽기
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
                      // Locate bin/asm files
                      const files = fs.readdirSync(fileResultDir);

                      let asmFileBuffer: Buffer | undefined;
                      let asmFileText: string | undefined; // For text-based ASM files
                      let binFileBuffer: Buffer | undefined;
                      let asmFileName: string | undefined;
                      let binFileName: string | undefined;
                      let asmOriginalSize = 0;
                      let binOriginalSize = 0;
                      let asmWasTruncated = false;
                      let binWasTruncated = false;

                      for (const file of files) {
                        const fullPath = path.join(fileResultDir, file);
                        const stat = fs.statSync(fullPath);

                        if (stat.isFile()) {
                          const ext = path.extname(file).toLowerCase();

                          // Read .asm file (as text, like Mac objdump)
                          if (ext === '.asm') {
                            try {
                              asmOriginalSize = stat.size;
                              const MAX_ASM_SIZE = 1 * 1024 * 1024; // 1MB limit for MySQL compatibility

                              if (stat.size > MAX_ASM_SIZE) {
                                // Read first 50MB as text
                                const fd = fs.openSync(fullPath, 'r');
                                try {
                                  const bytesToRead = Math.min(MAX_ASM_SIZE, Number(stat.size));
                                  const limitedBuffer = Buffer.allocUnsafe(bytesToRead);
                                  const bytesRead = fs.readSync(fd, limitedBuffer, 0, bytesToRead, 0);
                                  asmFileText = `[TRUNCATED - First ${bytesRead} bytes of ${stat.size} total]\n\n` +
                                                limitedBuffer.toString('utf-8', 0, bytesRead);
                                  asmFileName = file;
                                  asmWasTruncated = true;
                                  console.warn(`ASM file ${file} is ${stat.size} bytes; truncated to first ${bytesRead} bytes`);
                                } finally {
                                  fs.closeSync(fd);
                                }
                              } else {
                                // Read entire file as text
                                asmFileText = fs.readFileSync(fullPath, 'utf-8');
                                asmFileName = file;
                              }

                              if (asmFileText && asmFileName) {
                                const sizeInfo = asmWasTruncated
                                  ? `${asmFileText.length} chars of ${stat.size} bytes`
                                  : `${asmFileText.length} chars`;
                                console.log(`Read ASM file: ${asmFileName} (${sizeInfo})`);
                              }
                            } catch (asmError) {
                              console.error(`Error reading ASM file ${file}:`, asmError);
                            }
                          }

                          // Read .bin file
                          else if (ext === '.bin') {
                            try {
                              binOriginalSize = stat.size;
                              if (stat.size > MAX_INLINE_UPLOAD_BYTES) {
                                const fd = fs.openSync(fullPath, 'r');
                                try {
                                  const bytesToRead = Math.min(MAX_INLINE_UPLOAD_BYTES, Number(stat.size));
                                  const limitedBuffer = Buffer.allocUnsafe(bytesToRead);
                                  const bytesRead = fs.readSync(fd, limitedBuffer, 0, bytesToRead, 0);
                                  binFileBuffer = limitedBuffer.subarray(0, bytesRead);
                                  binFileName = `${path.basename(file, ext)}_partial${ext}`;
                                  binWasTruncated = true;
                                  console.warn(`BIN file ${file} is ${stat.size} bytes; uploading first ${bytesRead} bytes only to avoid memory exhaustion`);
                                } finally {
                                  fs.closeSync(fd);
                                }
                              } else {
                                binFileBuffer = fs.readFileSync(fullPath);
                                binFileName = file;
                              }

                              if (binFileBuffer && binFileName) {
                                const sizeInfo = binWasTruncated
                                  ? `${binFileBuffer.length} bytes of ${stat.size}`
                                  : `${binFileBuffer.length} bytes`;
                                console.log(`Read BIN file: ${binFileName} (${sizeInfo})`);
                              }
                            } catch (binError) {
                              console.error(`Error reading BIN file ${file}:`, binError);
                            }
                          }
                        }
                        // Handle chunk directories (e.g., when targets are split)
                        else if (stat.isDirectory() && file.endsWith('.chunks')) {
                          try {
                            const chunkFiles = fs.readdirSync(fullPath);
                            const asmFiles = chunkFiles.filter(f => f.endsWith('.asm')).sort();

                            if (asmFiles.length === 0) {
                              continue;
                            }

                            const asmTexts: string[] = [];
                            let collectedChars = 0;
                            let totalChunkBytes = 0;
                            let truncated = false;
                            const MAX_ASM_SIZE = 1 * 1024 * 1024; // 1MB limit for MySQL compatibility

                            for (const asmFile of asmFiles) {
                              const asmPath = path.join(fullPath, asmFile);
                              let chunkStat: fs.Stats;
                              try {
                                chunkStat = fs.statSync(asmPath);
                              } catch (chunkStatErr) {
                                console.error(`Error stating ASM chunk ${asmFile}:`, chunkStatErr);
                                continue;
                              }

                              totalChunkBytes += chunkStat.size;

                              const header = `

--- ${asmFile} ---

`;
                              if (collectedChars + header.length > MAX_ASM_SIZE) {
                                truncated = true;
                                break;
                              }
                              asmTexts.push(header);
                              collectedChars += header.length;

                              if (collectedChars >= MAX_ASM_SIZE) {
                                truncated = true;
                                break;
                              }

                              const remaining = MAX_ASM_SIZE - collectedChars;
                              if (remaining <= 0) {
                                truncated = true;
                                break;
                              }

                              // Read ASM chunk as text
                              try {
                                let chunkText: string;
                                if (chunkStat.size > remaining) {
                                  // Read partial chunk
                                  const fd = fs.openSync(asmPath, 'r');
                                  try {
                                    const chunkBuffer = Buffer.allocUnsafe(remaining);
                                    const bytesRead = fs.readSync(fd, chunkBuffer, 0, remaining, 0);
                                    chunkText = chunkBuffer.toString('utf-8', 0, bytesRead);
                                    truncated = true;
                                  } finally {
                                    fs.closeSync(fd);
                                  }
                                } else {
                                  // Read full chunk
                                  chunkText = fs.readFileSync(asmPath, 'utf-8');
                                }

                                if (chunkText) {
                                  asmTexts.push(chunkText);
                                  collectedChars += chunkText.length;
                                }
                              } catch (readErr) {
                                console.error(`Error reading ASM chunk ${asmFile}:`, readErr);
                              }

                              if (collectedChars >= MAX_ASM_SIZE) {
                                truncated = true;
                                break;
                              }
                            }

                            if (asmTexts.length > 0) {
                              asmFileText = asmTexts.join('');
                              const baseName = file.replace('.chunks', '');
                              asmFileName = truncated
                                ? `${baseName}_combined_partial.asm`
                                : `${baseName}_combined.asm`;
                              asmOriginalSize = totalChunkBytes;
                              asmWasTruncated = truncated;
                              const sizeInfo = truncated
                                ? `${asmFileText.length} chars of ${totalChunkBytes} bytes`
                                : `${asmFileText.length} chars`;
                              console.log(`Read combined ASM chunks: ${asmFiles.length} files (${sizeInfo})`);
                              if (truncated) {
                                console.warn(`Truncated ASM chunk aggregate to ${asmFileText.length} chars (limit ${MAX_ASM_SIZE})`);
                              }
                            }
                          } catch (chunkError) {
                            console.error(`Error processing chunks directory ${file}:`, chunkError);
                          }
                        }
                      }

                      // Save extracted files
                      if (asmFileText || binFileBuffer) {
                        try {
                          // ASM file payload (File_text field) - Save as text like Mac objdump
                          if (asmFileText && asmFileName) {
                            await callAPI(`/files/${fileId}/llm/`, 'POST', {
                              File_id: fileId,
                              Scan_id: scanId,
                              File_text: asmFileText,
                              Code: '', // Required field, but empty for disassembly
                            });
                            if (asmWasTruncated) {
                              console.warn(`✅ Saved partial ASM file ${asmFileName} (${asmFileText.length} chars of ${asmOriginalSize} bytes)`);
                            } else {
                              console.log(`✅ Saved ASM file: ${asmFileName} (${asmFileText.length} chars)`);
                            }
                          }

                          // BIN file payload (Code field)
                          if (binFileBuffer && binFileName) {
                            const binBase64 = binFileBuffer.toString('base64');
                            await callAPI(`/files/${fileId}/llm_code/`, 'POST', {
                              File_id: fileId,
                              Scan_id: scanId,
                              Code: `[BIN_FILE:${binFileName}]${binBase64}`,
                            });
                            if (binWasTruncated) {
                              console.warn(`Saved partial BIN file ${binFileName} (${binFileBuffer.length} of ${binOriginalSize} bytes)`);
                            } else {
                              console.log(`Saved BIN file: ${binFileName} (${binFileBuffer.length} bytes)`);
                            }
                          }
                        } catch (saveError) {
                          console.error(`Error saving files for file ID ${fileId}:`, saveError);
                        } finally {
                          asmFileText = undefined;
                          binFileBuffer = undefined;
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
              return { dbFileIds, dbScanId: scanId };
            } catch (dbError) {
              console.error('Error saving to database:', dbError);
              // 데이터베이스 저장 실패 시에도 스캔 결과는 반환
              return { dbFileIds: {}, dbScanId: undefined };
            }
          };

          // 데이터베이스 저장 (비동기로 실행하되 완료를 기다림)
          const { dbFileIds, dbScanId } = await saveToDatabase();

          resolve({
            success: true,
            output,
            detections: mergedDetections,
            nonPqcCount: mergedDetections.length,
            fileCount: new Set(mergedDetections.map(d => d.filePath)).size,
            dbFileIds: dbFileIds,
            dbScanId: dbScanId
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

// 보고서 생성 IPC 핸들러
ipcMain.handle('generate-report', async (event, scanResult) => {
  try {
    console.log('[Report] Starting report generation...');
    console.log('[Report] Scan result:', JSON.stringify(scanResult, null, 2).substring(0, 500));

    // 저장 경로 선택 다이얼로그
    const saveDialog = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `CryptoScanner_Report_${scanResult.date}_${scanResult.time.replace(/:/g, '-')}.docx`,
      filters: [
        { name: 'Word Documents', extensions: ['docx'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (saveDialog.canceled || !saveDialog.filePath) {
      return { success: false, error: 'Save cancelled by user' };
    }

    console.log('[Report] Generating report to:', saveDialog.filePath);

    // 보고서 생성
    const reportPath = await generateReport(scanResult, saveDialog.filePath);

    console.log('[Report] Report generated successfully:', reportPath);

    return {
      success: true,
      path: reportPath,
      message: '보고서가 성공적으로 생성되었습니다.'
    };
  } catch (error) {
    console.error('[Report] Error generating report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});
