@echo off
REM Integrated Build Script - Static Detection + Dynamic Detection
REM Supported Platform: Windows (AMD64/ARM64)
REM This script will automatically install required tools using winget

setlocal enabledelayedexpansion

echo ==================================================
echo Integrated Build Script Starting
echo ==================================================
echo.

REM Save the root directory
set "ROOT_DIR=%CD%"
echo Working directory: %ROOT_DIR%
echo.

REM Detect architecture
set ARCH=%PROCESSOR_ARCHITECTURE%
echo Architecture: %ARCH%
echo.

REM Check if winget is available
where winget >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] winget not found. Please install App Installer from Microsoft Store
    echo Or install tools manually: CMake, Visual Studio Build Tools, OpenSSL
    set WINGET_AVAILABLE=0
) else (
    set WINGET_AVAILABLE=1
)

echo.

REM 1. CryptoScanner (Static Detection) Check
echo ==================================================
echo 1. Checking CryptoScanner (Static Detection)...
echo ==================================================
cd CryptoScanner

REM Check if binary exists
if exist "CryptoScannerCLI.exe" (
    echo [OK] Existing CryptoScannerCLI.exe binary found, using it
    goto :static_ready
)

REM Binary not found, try to build
echo [WARNING] CryptoScannerCLI.exe binary not found. Build attempt...

REM Try to build using Qt
if exist "CryptoScannerCLI.pro" (
    qmake CryptoScannerCLI.pro
    nmake
) else (
    echo [ERROR] CryptoScannerCLI.pro not found
    echo Please build manually using Qt:
    echo   cd CryptoScanner
    echo   qmake CryptoScannerCLI.pro
    echo   nmake or mingw32-make
    cd ..
    exit /b 1
)

REM Check build results
if exist "CryptoScannerCLI.exe" (
    echo [OK] CryptoScannerCLI.exe build complete
    goto :static_ready
)
if exist "release\CryptoScannerCLI.exe" (
    copy release\CryptoScannerCLI.exe .
    echo [OK] CryptoScannerCLI.exe build complete
    goto :static_ready
)
if exist "debug\CryptoScannerCLI.exe" (
    copy debug\CryptoScannerCLI.exe .
    echo [OK] CryptoScannerCLI.exe build complete (debug)
    goto :static_ready
)

echo [ERROR] CryptoScannerCLI.exe build failed
echo Please build manually or use existing binary
cd ..
exit /b 1

:static_ready

cd ..

REM 2. DynamicAnalysis (Dynamic Detection) Build
echo.
echo ==================================================
echo 2. Building DynamicAnalysis (Dynamic Detection)...
echo ==================================================

REM Check and install required tools
echo Checking required build tools...
echo.

REM Check CMake - first check common installation paths
set "CMAKE_FOUND=0"
set "CMAKE_EXE="

REM Check if cmake is in PATH
where cmake >nul 2>&1
if %errorlevel% equ 0 (
    set "CMAKE_FOUND=1"
    echo [OK] CMake found in PATH
    goto :cmake_check_done
)

REM Check common installation paths
if exist "C:\Program Files\CMake\bin\cmake.exe" (
    set "CMAKE_FOUND=1"
    set "PATH=C:\Program Files\CMake\bin;!PATH!"
    echo [OK] CMake found at C:\Program Files\CMake\bin
    goto :cmake_check_done
)

if exist "C:\Program Files (x86)\CMake\bin\cmake.exe" (
    set "CMAKE_FOUND=1"
    set "PATH=C:\Program Files (x86)\CMake\bin;!PATH!"
    echo [OK] CMake found at C:\Program Files (x86)\CMake\bin
    goto :cmake_check_done
)

if exist "%USERPROFILE%\AppData\Local\Programs\CMake\bin\cmake.exe" (
    set "CMAKE_FOUND=1"
    set "PATH=!USERPROFILE!\AppData\Local\Programs\CMake\bin;!PATH!"
    echo [OK] CMake found at !USERPROFILE!\AppData\Local\Programs\CMake\bin
    goto :cmake_check_done
)

:cmake_check_done

REM If CMake already found, skip to next check
if !CMAKE_FOUND! equ 1 goto :cmake_ready

REM CMake not found - try to install
echo [WARNING] CMake not found in PATH or common locations

REM Check if winget is not available
if !WINGET_AVAILABLE! equ 0 (
    echo Please install CMake manually: https://cmake.org/download/
    echo Then restart your terminal and run this script again
    goto :skip_dynamic_build
)

REM winget available - install CMake
echo Installing CMake via winget...
winget install --id Kitware.CMake --silent --accept-package-agreements --accept-source-agreements

REM Check if installation succeeded
if %errorlevel% neq 0 (
    echo [WARNING] CMake installation skipped (may already be installed)
    echo Please restart your terminal to refresh PATH, then run this script again
    pause
    exit /b 0
)

echo [OK] CMake installation completed

REM Check if CMake is now available
if exist "C:\Program Files\CMake\bin\cmake.exe" (
    set "PATH=C:\Program Files\CMake\bin;!PATH!"
    set "CMAKE_FOUND=1"
    echo [OK] CMake added to PATH
    goto :cmake_ready
)

REM CMake installed but not found in expected location
echo [WARNING] Please restart terminal to use CMake
pause
exit /b 0

:cmake_ready
echo.

REM Check Visual Studio or Build Tools
where cl.exe >nul 2>&1
if %errorlevel% neq 0 (
    REM Try to find Visual Studio installation
    set "VS_PATH="
    if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" (
        set "VS_PATH=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
    ) else if exist "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
        set "VS_PATH=C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
    ) else if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
        set "VS_PATH=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
    )

    if defined VS_PATH (
        echo [OK] Visual Studio found, loading environment...
        call "!VS_PATH!"
    ) else (
        echo [WARNING] Visual Studio C++ compiler not found
        if !WINGET_AVAILABLE!==1 (
            echo Installing Visual Studio 2022 Build Tools...
            echo This will take several minutes. Please be patient...
            winget install --id Microsoft.VisualStudio.2022.BuildTools --silent --accept-package-agreements --accept-source-agreements --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
            if %errorlevel% equ 0 (
                echo [OK] Build Tools installed
                echo [INFO] Attempting to load Visual Studio environment...

                REM Try to find and load the newly installed Build Tools
                if exist "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
                    call "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
                    echo [OK] Visual Studio environment loaded
                ) else if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
                    call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
                    echo [OK] Visual Studio environment loaded
                ) else (
                    echo [WARNING] Could not find vcvars64.bat
                    echo Please restart your terminal and run this script again
                    pause
                    exit /b 0
                )
            ) else (
                echo [WARNING] Build Tools installation failed or skipped
                echo Download manually: https://visualstudio.microsoft.com/downloads/
                echo Continuing anyway...
            )
        ) else (
            echo Download manually: https://visualstudio.microsoft.com/downloads/
            echo Continuing anyway...
        )
    )
) else (
    echo [OK] Visual Studio C++ compiler found
)

REM Check OpenSSL
where openssl.exe >nul 2>&1
set OPENSSL_FOUND=0
set "OPENSSL_ROOT_DIR="
if %errorlevel% equ 0 (
    echo [OK] OpenSSL found in PATH
    set OPENSSL_FOUND=1
    goto :openssl_check_done
)

REM Check common OpenSSL installation paths
if exist "C:\Program Files\OpenSSL-Win64\bin\openssl.exe" (
    echo [OK] OpenSSL found at C:\Program Files\OpenSSL-Win64
    set "OPENSSL_ROOT_DIR=C:\Program Files\OpenSSL-Win64"
    set OPENSSL_FOUND=1
    goto :openssl_check_done
)

if exist "C:\Program Files (x86)\OpenSSL-Win32\bin\openssl.exe" (
    echo [OK] OpenSSL found at C:\Program Files (x86)\OpenSSL-Win32
    set "OPENSSL_ROOT_DIR=C:\Program Files (x86)\OpenSSL-Win32"
    set OPENSSL_FOUND=1
    goto :openssl_check_done
)

REM OpenSSL not found - try to install
echo [WARNING] OpenSSL not found

if !WINGET_AVAILABLE! equ 0 (
    echo Download manually: https://slproweb.com/products/Win32OpenSSL.html
    echo Continuing without OpenSSL (build may fail)
    goto :openssl_check_done
)

echo Installing OpenSSL via winget...
winget install --id ShiningLight.OpenSSL --silent --accept-package-agreements --accept-source-agreements

if %errorlevel% neq 0 (
    echo [WARNING] OpenSSL installation failed
    echo Download manually: https://slproweb.com/products/Win32OpenSSL.html
    echo Continuing without OpenSSL (build may fail)
    goto :openssl_check_done
)

echo [OK] OpenSSL installed

REM Check both possible installation paths
if exist "C:\Program Files\OpenSSL-Win64\bin\openssl.exe" (
    set "OPENSSL_ROOT_DIR=C:\Program Files\OpenSSL-Win64"
    set OPENSSL_FOUND=1
    goto :openssl_check_done
)

if exist "C:\Program Files\OpenSSL\bin\openssl.exe" (
    set "OPENSSL_ROOT_DIR=C:\Program Files\OpenSSL"
    set OPENSSL_FOUND=1
    goto :openssl_check_done
)

echo [WARNING] OpenSSL installed but path not found
echo Continuing anyway...

:openssl_check_done

REM Check Microsoft Detours
echo.
echo Checking Microsoft Detours...
set DETOURS_FOUND=0
set "DETOURS_ROOT="

REM Check common Detours installation paths
if exist "C:\Program Files\Microsoft Research\Detours\include\detours.h" (
    echo [OK] Detours found at C:\Program Files\Microsoft Research\Detours
    set "DETOURS_ROOT=C:\Program Files\Microsoft Research\Detours"
    set DETOURS_FOUND=1
    goto :detours_check_done
)

if exist "C:\dev\detours\include\detours.h" (
    echo [OK] Detours found at C:\dev\detours
    set "DETOURS_ROOT=C:\dev\detours"
    set DETOURS_FOUND=1
    goto :detours_check_done
)

if exist "%ROOT_DIR%\detours\include\detours.h" (
    echo [OK] Detours found at %ROOT_DIR%\detours
    set "DETOURS_ROOT=%ROOT_DIR%\detours"
    set DETOURS_FOUND=1
    goto :detours_check_done
)

REM Detours not found - download and build it
echo [WARNING] Microsoft Detours not found
echo Downloading and building Detours from GitHub...

REM Check if git is available
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] git not found. Cannot download Detours automatically
    echo Please download and build Detours manually from:
    echo https://github.com/microsoft/Detours
    echo Then set DETOURS_ROOT environment variable or place it in C:\dev\detours
    goto :skip_dynamic_build
)

REM Clone Detours
cd "%ROOT_DIR%"
if exist "detours" rmdir /s /q detours
git clone --depth 1 https://github.com/microsoft/Detours.git detours

if %errorlevel% neq 0 (
    echo [ERROR] Failed to clone Detours repository
    goto :skip_dynamic_build
)

echo [OK] Detours downloaded

REM Build Detours
cd detours\src
nmake

if %errorlevel% neq 0 (
    echo [ERROR] Failed to build Detours
    echo Please build Detours manually
    cd "%ROOT_DIR%"
    goto :skip_dynamic_build
)

echo [OK] Detours built successfully

REM Set Detours path
set "DETOURS_ROOT=%ROOT_DIR%\detours"
set DETOURS_FOUND=1
cd "%ROOT_DIR%"

:detours_check_done

echo.
echo Build tools check complete
echo.

cd DynamicAnalysis

REM Final check - ensure CMake is available
where cmake >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] CMake still not available. Skipping DynamicAnalysis build
    echo.
    echo Please restart your terminal after CMake installation
    echo.
    goto :skip_dynamic_build
)

REM Set build directory name
set BUILD_DIR=build-windows

REM Remove existing build directory
if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"

REM CMake configuration with OpenSSL and Detours paths
echo Configuring CMake...

REM Build cmake command with conditional parameters
set "CMAKE_CMD=cmake -S . -B "%BUILD_DIR%" -DCMAKE_BUILD_TYPE=Release -DENABLE_AF_ALG=OFF -DENABLE_CRYPTODEV=OFF -DENABLE_LIBSODIUM=OFF -DENABLE_MBEDTLS=OFF -DENABLE_WOLFSSL=OFF -DENABLE_GNUTLS=OFF -DENABLE_NSS=OFF"

if defined OPENSSL_ROOT_DIR (
    set "CMAKE_CMD=!CMAKE_CMD! -DOPENSSL_ROOT_DIR="%OPENSSL_ROOT_DIR%""
)

if defined DETOURS_ROOT (
    set "CMAKE_CMD=!CMAKE_CMD! -DDETOURS_ROOT="%DETOURS_ROOT%""
)

REM Execute cmake command
!CMAKE_CMD!

if %errorlevel% neq 0 (
    echo [ERROR] CMake configuration failed
    echo.
    echo Possible issues:
    echo - OpenSSL not found: Install from https://slproweb.com/products/Win32OpenSSL.html
    echo - Microsoft Detours not found: Download from https://github.com/microsoft/Detours
    echo - Visual Studio not configured: Run vcvars64.bat manually
    echo.
    cd ..
    goto :skip_dynamic_build
)

echo Building...
cmake --build "%BUILD_DIR%" --config Release

if %errorlevel% neq 0 (
    echo [ERROR] Build failed
    echo.
    echo Check the error messages above for details
    echo.
    cd ..
    goto :skip_dynamic_build
)

echo [OK] DynamicAnalysis build complete
echo   - Hook library: %BUILD_DIR%\lib\Release\hook.dll
echo   - CLI tool: %BUILD_DIR%\bin\Release\dynamic_analysis_cli.exe

REM Copy OpenSSL DLLs to Release folder (needed for dynamic analysis tests)
if defined OPENSSL_ROOT_DIR (
    if exist "%OPENSSL_ROOT_DIR%\bin\libcrypto-3-x64.dll" (
        copy "%OPENSSL_ROOT_DIR%\bin\libcrypto-3-x64.dll" "%BUILD_DIR%\bin\Release\" >nul 2>&1
        echo [OK] Copied libcrypto-3-x64.dll to Release folder
    )
    if exist "%OPENSSL_ROOT_DIR%\bin\libssl-3-x64.dll" (
        copy "%OPENSSL_ROOT_DIR%\bin\libssl-3-x64.dll" "%BUILD_DIR%\bin\Release\" >nul 2>&1
        echo [OK] Copied libssl-3-x64.dll to Release folder
    )
)

:skip_dynamic_build
cd ..

REM 3. Copy built files to Electron app
echo.
echo ==================================================
echo 3. Copying built files to Electron app...
echo ==================================================

REM Destination directory
set DEST_DIR=crypto-scanner-gui\src\main
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

REM Copy static detection binary
if exist "%ROOT_DIR%\CryptoScanner\CryptoScannerCLI.exe" (
    copy "%ROOT_DIR%\CryptoScanner\CryptoScannerCLI.exe" "%DEST_DIR%\" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] CryptoScannerCLI.exe copied
    ) else (
        echo [WARNING] Failed to copy CryptoScannerCLI.exe
    )
) else (
    echo [WARNING] CryptoScannerCLI.exe not found at %ROOT_DIR%\CryptoScanner\
)

REM Copy patterns.json
if exist "%ROOT_DIR%\CryptoScanner\patterns.json" (
    copy "%ROOT_DIR%\CryptoScanner\patterns.json" "%DEST_DIR%\" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] patterns.json copied
    ) else (
        echo [WARNING] Failed to copy patterns.json
    )
) else (
    echo [WARNING] patterns.json not found at %ROOT_DIR%\CryptoScanner\
)

REM Copy Qt and MinGW DLLs for CryptoScannerCLI.exe
if exist "C:\Qt\5.15.2\mingw81_64\bin\Qt5Core.dll" (
    copy "C:\Qt\5.15.2\mingw81_64\bin\Qt5Core.dll" "%ROOT_DIR%\CryptoScanner\" >nul 2>&1
    echo [OK] Qt5Core.dll copied to CryptoScanner folder
)

REM Copy MinGW 13.1.0 runtime DLLs (required for CryptoScannerCLI.exe)
if exist "C:\Qt\Tools\mingw1310_64\bin\libgcc_s_seh-1.dll" (
    copy "C:\Qt\Tools\mingw1310_64\bin\libgcc_s_seh-1.dll" "%ROOT_DIR%\CryptoScanner\" >nul 2>&1
    copy "C:\Qt\Tools\mingw1310_64\bin\libstdc++-6.dll" "%ROOT_DIR%\CryptoScanner\" >nul 2>&1
    copy "C:\Qt\Tools\mingw1310_64\bin\libwinpthread-1.dll" "%ROOT_DIR%\CryptoScanner\" >nul 2>&1
    copy "C:\Qt\Tools\mingw1310_64\bin\libatomic-1.dll" "%ROOT_DIR%\CryptoScanner\" >nul 2>&1
    echo [OK] MinGW 13.1.0 runtime DLLs copied to CryptoScanner folder
)

REM Copy dynamic detection binary
if exist "%ROOT_DIR%\DynamicAnalysis\build-windows\bin\Release\dynamic_analysis_cli.exe" (
    copy "%ROOT_DIR%\DynamicAnalysis\build-windows\bin\Release\dynamic_analysis_cli.exe" "%DEST_DIR%\" >nul 2>&1
    echo [OK] dynamic_analysis_cli.exe copied
    goto :cli_copy_done
)
if exist "%ROOT_DIR%\DynamicAnalysis\build-windows\bin\dynamic_analysis_cli.exe" (
    copy "%ROOT_DIR%\DynamicAnalysis\build-windows\bin\dynamic_analysis_cli.exe" "%DEST_DIR%\" >nul 2>&1
    echo [OK] dynamic_analysis_cli.exe copied
    goto :cli_copy_done
)
echo [WARNING] dynamic_analysis_cli.exe not found (not built yet)
:cli_copy_done

REM Copy hook library (Visual Studio places DLLs in bin\Release on Windows)
if exist "%ROOT_DIR%\DynamicAnalysis\build-windows\bin\Release\hook.dll" (
    copy "%ROOT_DIR%\DynamicAnalysis\build-windows\bin\Release\hook.dll" "%DEST_DIR%\" >nul 2>&1
    echo [OK] hook.dll copied
    goto :hook_copy_done
)
if exist "%ROOT_DIR%\DynamicAnalysis\build-windows\lib\Release\hook.dll" (
    copy "%ROOT_DIR%\DynamicAnalysis\build-windows\lib\Release\hook.dll" "%DEST_DIR%\" >nul 2>&1
    echo [OK] hook.dll copied
    goto :hook_copy_done
)
if exist "%ROOT_DIR%\DynamicAnalysis\build-windows\bin\hook.dll" (
    copy "%ROOT_DIR%\DynamicAnalysis\build-windows\bin\hook.dll" "%DEST_DIR%\" >nul 2>&1
    echo [OK] hook.dll copied
    goto :hook_copy_done
)
echo [WARNING] hook.dll not found (not built yet)
:hook_copy_done

echo.
echo ==================================================
echo Integrated Build Complete!
echo ==================================================
echo.
echo Next steps:
echo 1. cd crypto-scanner-gui
echo 2. npm install
echo 3. npm run build
echo 4. npm run dist
echo.

endlocal
