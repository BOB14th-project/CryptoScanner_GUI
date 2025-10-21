@echo off
REM 통합 빌드 스크립트 - 정적 탐지 + 동적 탐지
REM 지원 플랫폼: Windows (AMD64)

echo ==================================================
echo 통합 빌드 스크립트 시작 (Windows)
echo ==================================================
echo.

REM 1. CryptoScanner (정적 탐지) 빌드
echo ==================================================
echo 1. CryptoScanner (정적 탐지) 빌드 중...
echo ==================================================
cd CryptoScanner

REM Qt 경로 설정
set QT_DIR=C:\Qt\5.15.2\mingw81_64
set PATH=%QT_DIR%\bin;%PATH%

REM MinGW 경로 설정
set PATH=C:\Qt\Tools\mingw810_64\bin;%PATH%

REM 빌드 디렉토리 생성 및 빌드
if exist build-windows rmdir /s /q build-windows
mkdir build-windows
cd build-windows

REM qmake로 프로젝트 생성
qmake ..

REM mingw32-make로 빌드
mingw32-make -j%NUMBER_OF_PROCESSORS%

REM CLI 바이너리 이름 변경
if exist release\CryptoScanner.exe (
    copy release\CryptoScanner.exe release\CryptoScannerCLI.exe
    echo ✅ CryptoScannerCLI.exe 빌드 완료
) else (
    echo ❌ CryptoScanner 빌드 실패
    exit /b 1
)

cd ..\..

REM 2. DynamicAnalysis (동적 탐지) 빌드
echo.
echo ==================================================
echo 2. DynamicAnalysis (동적 탐지) 빌드 중...
echo ==================================================
cd DynamicAnalysis

REM 빌드 디렉토리 제거 및 생성
if exist build-windows rmdir /s /q build-windows

REM CMake 구성
echo CMake 구성 중...
cmake -S . -B build-windows ^
    -G "Visual Studio 17 2022" -A x64 ^
    -DCMAKE_BUILD_TYPE=Release ^
    -DCMAKE_TOOLCHAIN_FILE="C:/vcpkg/scripts/buildsystems/vcpkg.cmake" ^
    -DVCPKG_TARGET_TRIPLET=x64-windows ^
    -DCMAKE_PREFIX_PATH="C:/dev/detours" ^
    -DENABLE_AF_ALG=OFF ^
    -DENABLE_CRYPTODEV=OFF ^
    -DENABLE_LIBSODIUM=OFF ^
    -DENABLE_MBEDTLS=OFF ^
    -DENABLE_WOLFSSL=OFF ^
    -DENABLE_GNUTLS=OFF ^
    -DENABLE_NSS=OFF

if errorlevel 1 (
    echo ❌ CMake 구성 실패
    exit /b 1
)

echo 빌드 중...
cmake --build build-windows --config Release -j

if errorlevel 1 (
    echo ❌ DynamicAnalysis 빌드 실패
    exit /b 1
)

echo ✅ DynamicAnalysis 빌드 완료
echo   - 후킹 DLL: build-windows\bin\Release\hook.dll
echo   - CLI 도구: build-windows\bin\Release\dynamic_analysis_cli.exe

cd ..

REM 3. 빌드된 파일들을 Electron 앱에 복사
echo.
echo ==================================================
echo 3. 빌드된 파일들을 Electron 앱에 복사 중...
echo ==================================================

set DEST_DIR=crypto-scanner-gui\src\main
if not exist %DEST_DIR% mkdir %DEST_DIR%

REM 정적 탐지 바이너리 복사
if exist CryptoScanner\build-windows\release\CryptoScannerCLI.exe (
    copy CryptoScanner\build-windows\release\CryptoScannerCLI.exe %DEST_DIR%\
    echo ✅ CryptoScannerCLI.exe 복사 완료
)

REM 필요한 Qt DLL들 복사
copy %QT_DIR%\bin\Qt5Core.dll %DEST_DIR%\
copy %QT_DIR%\bin\Qt5Gui.dll %DEST_DIR%\
copy %QT_DIR%\bin\Qt5Widgets.dll %DEST_DIR%\

REM patterns.json 복사
if exist CryptoScanner\patterns.json (
    copy CryptoScanner\patterns.json %DEST_DIR%\
    echo ✅ patterns.json 복사 완료
)

REM 동적 탐지 바이너리 및 DLL 복사
if exist DynamicAnalysis\build-windows\bin\Release\dynamic_analysis_cli.exe (
    copy DynamicAnalysis\build-windows\bin\Release\dynamic_analysis_cli.exe %DEST_DIR%\
    echo ✅ dynamic_analysis_cli.exe 복사 완료
)

if exist DynamicAnalysis\build-windows\bin\Release\hook.dll (
    copy DynamicAnalysis\build-windows\bin\Release\hook.dll %DEST_DIR%\
    echo ✅ hook.dll 복사 완료
)

echo.
echo ==================================================
echo 통합 빌드 완료!
echo ==================================================
echo.
echo 다음 단계:
echo 1. cd crypto-scanner-gui
echo 2. npm install
echo 3. npm run build
echo 4. npm run dist:win-amd
echo.

pause
