@echo off
setlocal enabledelayedexpansion

echo Building CLI-only CryptoScanner for Windows AMD64 (MinGW)...

REM Clean previous build
if exist *.o del /q *.o
if exist CryptoScannerCLI_amd64.exe del /q CryptoScannerCLI_amd64.exe

REM Detect architecture
set ARCH=%PROCESSOR_ARCHITECTURE%
echo Detected architecture: %ARCH%

REM MinGW detection and setup
set MINGW_FOUND=0
set MINGW_DIR=

REM Check common MinGW installation paths
for %%i in (
    "C:\Qt\5.15.2\mingw81_64\bin"
    "C:\Qt\6.9.2\mingw_64\bin"
    "C:\Qt\Tools\mingw810_64\bin"
    "C:\Qt\Tools\mingw1120_64\bin"
    "C:\mingw64\bin"
    "C:\msys64\mingw64\bin"
) do (
    if exist "%%~i\gcc.exe" (
        set MINGW_DIR=%%~i
        set MINGW_FOUND=1
        goto :mingw_found
    )
)

:mingw_found
if %MINGW_FOUND%==0 (
    echo Error: MinGW compiler not found.
    echo Please install Qt with MinGW or install MinGW separately.
    echo Expected locations:
    echo   C:\Qt\5.15.2\mingw81_64\bin
    echo   C:\Qt\6.9.2\mingw_64\bin
    echo   C:\Qt\Tools\mingw810_64\bin
    exit /b 1
)

echo Found MinGW at: %MINGW_DIR%

REM Add MinGW to PATH
set PATH=%MINGW_DIR%;%PATH%

REM Qt detection for Windows
set QT_FOUND=0
set QT_DIR=

REM Check common Qt installation paths (prioritize mingw for available versions)
for %%i in (
    "C:\Qt\5.15.2\mingw81_64"
    "C:\Qt\6.9.2\mingw_64"
    "C:\Qt\Qt5.15.2\5.15.2\mingw81_64"
) do (
    if exist "%%~i\include\QtCore" (
        set QT_DIR=%%~i
        set QT_FOUND=1
        goto :qt_found
    )
)

:qt_found
if %QT_FOUND%==0 (
    echo Error: Qt development libraries not found.
    echo Please install Qt 5.15.x or Qt 6.x with MinGW from https://www.qt.io/download-qt-installer
    echo Expected locations:
    echo   C:\Qt\5.15.2\mingw81_64
    echo   C:\Qt\6.9.2\mingw_64
    exit /b 1
)

echo Found Qt at: %QT_DIR%

REM Qt includes and libs
set QT_INCLUDES=-I"%QT_DIR%\include" -I"%QT_DIR%\include\QtCore"
set QT_LIBS="%QT_DIR%\lib\libQt5Core.a"

REM Check if Qt6
echo %QT_DIR% | findstr /C:"Qt6" >nul && (
    set QT_LIBS="%QT_DIR%\lib\libQt6Core.a"
)
echo %QT_DIR% | findstr /C:"6.9" >nul && (
    set QT_LIBS="%QT_DIR%\lib\libQt6Core.a"
)

REM OpenSSL detection (try vcpkg first, then manual)
set OPENSSL_INCLUDES=
set OPENSSL_LIBS=

if exist "C:\vcpkg\installed\x64-mingw-static\include\openssl" (
    set OPENSSL_INCLUDES=-I"C:\vcpkg\installed\x64-mingw-static\include"
    set OPENSSL_LIBS="-LC:\vcpkg\installed\x64-mingw-static\lib" -lssl -lcrypto
    echo Found OpenSSL via vcpkg (mingw-static)
) else if exist "C:\vcpkg\installed\x64-mingw-dynamic\include\openssl" (
    set OPENSSL_INCLUDES=-I"C:\vcpkg\installed\x64-mingw-dynamic\include"
    set OPENSSL_LIBS="-LC:\vcpkg\installed\x64-mingw-dynamic\lib" -lssl -lcrypto
    echo Found OpenSSL via vcpkg (mingw-dynamic)
) else if exist "C:\OpenSSL-Win64\include\openssl" (
    set OPENSSL_INCLUDES=-I"C:\OpenSSL-Win64\include"
    set OPENSSL_LIBS="-LC:\OpenSSL-Win64\lib" -lssl -lcrypto
    echo Found OpenSSL at C:\OpenSSL-Win64
) else (
    echo Warning: OpenSSL not found. Some features may not work.
    echo Install OpenSSL via: choco install openssl
)

REM Common flags for MinGW
set COMMON_CFLAGS=-O2 -DUSE_MINIZ -DMINIZ_STATIC_DEFINE -DQT_CORE_LIB -DWIN32 -D_WINDOWS -std=c++17

REM All includes
set ALL_INCLUDES=-I"." -I"third_party\miniz" -I"third_party\tree-sitter\lib\include" -I"third_party\tree-sitter\lib\src" %QT_INCLUDES% %OPENSSL_INCLUDES%

echo Step 1: Compiling C files...
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\miniz\miniz.c -o third_party\miniz\miniz.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\miniz\miniz_zip.c -o third_party\miniz\miniz_zip.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\miniz\miniz_tinfl.c -o third_party\miniz\miniz_tinfl.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\miniz\miniz_tdef.c -o third_party\miniz\miniz_tdef.o

gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\tree-sitter\lib\src\lib.c -o third_party\tree-sitter\lib\src\lib.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\tree-sitter-cpp\src\parser.c -o third_party\tree-sitter-cpp\src\parser.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\tree-sitter-cpp\src\scanner.c -o third_party\tree-sitter-cpp\src\scanner.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\tree-sitter-java\src\parser.c -o third_party\tree-sitter-java\src\parser.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\tree-sitter-python\src\parser.c -o third_party\tree-sitter-python\src\parser.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\tree-sitter-python\src\scanner.c -o third_party\tree-sitter-python\src\scanner.o

echo Step 2: Compiling C++ files...
g++ %COMMON_CFLAGS% %ALL_INCLUDES% -c main_gui_cli.cpp -o main_gui_cli.o
g++ %COMMON_CFLAGS% %ALL_INCLUDES% -c CryptoScanner.cpp -o CryptoScanner.o
g++ %COMMON_CFLAGS% %ALL_INCLUDES% -c FileScanner.cpp -o FileScanner.o
g++ %COMMON_CFLAGS% %ALL_INCLUDES% -c PatternLoader.cpp -o PatternLoader.o
g++ %COMMON_CFLAGS% %ALL_INCLUDES% -c PatternDefinitions.cpp -o PatternDefinitions.o
g++ %COMMON_CFLAGS% %ALL_INCLUDES% -c JavaBytecodeScanner.cpp -o JavaBytecodeScanner.o
g++ %COMMON_CFLAGS% %ALL_INCLUDES% -c JavaASTScanner.cpp -o JavaASTScanner.o
g++ %COMMON_CFLAGS% %ALL_INCLUDES% -c PythonASTScanner.cpp -o PythonASTScanner.o
g++ %COMMON_CFLAGS% %ALL_INCLUDES% -c CppASTScanner.cpp -o CppASTScanner.o
g++ %COMMON_CFLAGS% %ALL_INCLUDES% -c DynLinkParser.cpp -o DynLinkParser.o

echo Step 3: Linking...
g++ -o CryptoScannerCLI_amd64.exe ^
    main_gui_cli.o CryptoScanner.o FileScanner.o PatternLoader.o PatternDefinitions.o ^
    JavaBytecodeScanner.o JavaASTScanner.o PythonASTScanner.o CppASTScanner.o DynLinkParser.o ^
    third_party\miniz\miniz.o third_party\miniz\miniz_zip.o third_party\miniz\miniz_tinfl.o third_party\miniz\miniz_tdef.o ^
    third_party\tree-sitter\lib\src\lib.o ^
    third_party\tree-sitter-cpp\src\parser.o third_party\tree-sitter-cpp\src\scanner.o ^
    third_party\tree-sitter-java\src\parser.o ^
    third_party\tree-sitter-python\src\parser.o third_party\tree-sitter-python\src\scanner.o ^
    %QT_LIBS% %OPENSSL_LIBS% -lkernel32 -luser32 -ladvapi32 -static-libgcc -static-libstdc++

if exist CryptoScannerCLI_amd64.exe (
    echo Build completed successfully: CryptoScannerCLI_amd64.exe
    dir CryptoScannerCLI_amd64.exe | findstr /C:"CryptoScannerCLI_amd64.exe"
) else (
    echo Build failed!
    exit /b 1
)