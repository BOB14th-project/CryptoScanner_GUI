@echo off
setlocal enabledelayedexpansion

echo Perfect CryptoScanner CLI Builder
echo ===============================

REM Clean previous build
echo Cleaning previous build files...
if exist *.o del /q *.o
if exist CryptoScannerCLI.exe del /q CryptoScannerCLI.exe
if exist Makefile del /q Makefile
if exist release rmdir /s /q release
if exist debug rmdir /s /q debug

REM Set Qt and MinGW paths (adjust these paths according to your system)
set QT_DIR=C:\Qt\5.15.2\mingw81_64
set MINGW_DIR=C:\Qt\Tools\mingw1310_64

REM Verify paths exist
if not exist "%QT_DIR%" (
    echo Error: Qt directory not found at %QT_DIR%
    echo Please adjust QT_DIR in the script
    pause
    exit /b 1
)

if not exist "%MINGW_DIR%" (
    echo Error: MinGW directory not found at %MINGW_DIR%
    echo Please adjust MINGW_DIR in the script
    pause
    exit /b 1
)

REM Clean PATH and set only Qt and MinGW paths
set PATH=%QT_DIR%\bin;%MINGW_DIR%\bin;C:\Windows\System32;C:\Windows

echo Found qmake at: %QT_DIR%\bin\qmake.exe
echo Found mingw32-make at: %MINGW_DIR%\bin\mingw32-make.exe

REM Create perfect .pro file
echo Creating CryptoScannerCLI.pro...
(
echo TARGET = CryptoScannerCLI
echo CONFIG += console c++17 staticlib
echo CONFIG -= app_bundle qt
echo.
echo QMAKE_CXXFLAGS += -Wno-unused-function -Wno-unused-parameter -Wno-unused-but-set-variable -Wno-unused-variable -Wno-type-limits
echo QMAKE_CFLAGS += -Wno-unused-function -Wno-unused-parameter -Wno-unused-but-set-variable -Wno-unused-variable -Wno-type-limits
echo.
echo QT += core
echo QT -= gui
echo.
echo DEFINES += USE_MINIZ MINIZ_STATIC_DEFINE QT_CORE_LIB USE_OPENSSL
echo.
echo INCLUDEPATH += . \
echo     third_party/miniz \
echo     third_party/tree-sitter/lib/include \
echo     third_party/tree-sitter/lib/src \
echo     third_party/tree-sitter-java/bindings/c \
echo     third_party/tree-sitter-python/bindings/c \
echo     third_party/tree-sitter-cpp/bindings/c \
echo     %QT_DIR%/include \
echo     %QT_DIR%/include/QtCore \
echo     %MINGW_DIR%/opt/include
echo.
echo LIBS += "%QT_DIR%/lib/libQt5Core.a" "%MINGW_DIR%/opt/lib/libssl.a" "%MINGW_DIR%/opt/lib/libcrypto.a" "%MINGW_DIR%/x86_64-w64-mingw32/lib/libz.a" -lws2_32 -lmswsock
echo.
echo SOURCES += \
echo     main_gui_cli.cpp \
echo     CryptoScanner.cpp \
echo     FileScanner.cpp \
echo     PatternLoader.cpp \
echo     PatternDefinitions.cpp \
echo     JavaBytecodeScanner.cpp \
echo     JavaASTScanner.cpp \
echo     PythonASTScanner.cpp \
echo     CppASTScanner.cpp \
echo     DynLinkParser.cpp \
echo     third_party/miniz/miniz.c \
echo     third_party/miniz/miniz_zip.c \
echo     third_party/miniz/miniz_tinfl.c \
echo     third_party/miniz/miniz_tdef.c \
echo     third_party/tree-sitter/lib/src/lib.c
echo.
echo HEADERS += \
echo     CryptoScanner.h \
echo     FileScanner.h \
echo     PatternLoader.h \
echo     PatternDefinitions.h \
echo     JavaBytecodeScanner.h \
echo     JavaASTScanner.h \
echo     PythonASTScanner.h \
echo     CppASTScanner.h \
echo     DynLinkParser.h
) > CryptoScannerCLI.pro

echo.
echo Step 1: Running qmake...
"%QT_DIR%\bin\qmake.exe" CryptoScannerCLI.pro

if not exist Makefile (
    echo Error: qmake failed to generate Makefile
    pause
    exit /b 1
)

echo.
echo Step 2: Creating release directory and compiling language parsers...
if not exist release mkdir release

echo Compiling Java parser...
"%MINGW_DIR%\bin\gcc.exe" -c -fno-keep-inline-dllexport -O2 -w -DUNICODE -D_UNICODE -DWIN32 -DMINGW_HAS_SECURE_API=1 -DUSE_MINIZ -DMINIZ_STATIC_DEFINE -DQT_CORE_LIB -DUSE_OPENSSL -I. -Ithird_party\miniz -Ithird_party\tree-sitter\lib\include -Ithird_party\tree-sitter\lib\src -Ithird_party\tree-sitter-java\bindings\c -Ithird_party\tree-sitter-python\bindings\c -Ithird_party\tree-sitter-cpp\bindings\c -I"%QT_DIR%\include" -I"%QT_DIR%\include\QtCore" -I"%MINGW_DIR%\opt\include" -o release\java_parser.o third_party\tree-sitter-java\src\parser.c >nul 2>&1

echo Compiling Python parser...
"%MINGW_DIR%\bin\gcc.exe" -c -fno-keep-inline-dllexport -O2 -w -DUNICODE -D_UNICODE -DWIN32 -DMINGW_HAS_SECURE_API=1 -DUSE_MINIZ -DMINIZ_STATIC_DEFINE -DQT_CORE_LIB -DUSE_OPENSSL -I. -Ithird_party\miniz -Ithird_party\tree-sitter\lib\include -Ithird_party\tree-sitter\lib\src -Ithird_party\tree-sitter-java\bindings\c -Ithird_party\tree-sitter-python\bindings\c -Ithird_party\tree-sitter-cpp\bindings\c -I"%QT_DIR%\include" -I"%QT_DIR%\include\QtCore" -I"%MINGW_DIR%\opt\include" -o release\python_parser.o third_party\tree-sitter-python\src\parser.c >nul 2>&1

echo Compiling C++ parser...
"%MINGW_DIR%\bin\gcc.exe" -c -fno-keep-inline-dllexport -O2 -w -DUNICODE -D_UNICODE -DWIN32 -DMINGW_HAS_SECURE_API=1 -DUSE_MINIZ -DMINIZ_STATIC_DEFINE -DQT_CORE_LIB -DUSE_OPENSSL -I. -Ithird_party\miniz -Ithird_party\tree-sitter\lib\include -Ithird_party\tree-sitter\lib\src -Ithird_party\tree-sitter-java\bindings\c -Ithird_party\tree-sitter-python\bindings\c -Ithird_party\tree-sitter-cpp\bindings\c -I"%QT_DIR%\include" -I"%QT_DIR%\include\QtCore" -I"%MINGW_DIR%\opt\include" -o release\cpp_parser.o third_party\tree-sitter-cpp\src\parser.c >nul 2>&1

echo Compiling Python scanner...
"%MINGW_DIR%\bin\gcc.exe" -c -fno-keep-inline-dllexport -O2 -w -DUNICODE -D_UNICODE -DWIN32 -DMINGW_HAS_SECURE_API=1 -DUSE_MINIZ -DMINIZ_STATIC_DEFINE -DQT_CORE_LIB -DUSE_OPENSSL -I. -Ithird_party\miniz -Ithird_party\tree-sitter\lib\include -Ithird_party\tree-sitter\lib\src -Ithird_party\tree-sitter-java\bindings\c -Ithird_party\tree-sitter-python\bindings\c -Ithird_party\tree-sitter-cpp\bindings\c -I"%QT_DIR%\include" -I"%QT_DIR%\include\QtCore" -I"%MINGW_DIR%\opt\include" -o release\python_scanner.o third_party\tree-sitter-python\src\scanner.c >nul 2>&1

echo Compiling C++ scanner...
"%MINGW_DIR%\bin\gcc.exe" -c -fno-keep-inline-dllexport -O2 -w -DUNICODE -D_UNICODE -DWIN32 -DMINGW_HAS_SECURE_API=1 -DUSE_MINIZ -DMINIZ_STATIC_DEFINE -DQT_CORE_LIB -DUSE_OPENSSL -I. -Ithird_party\miniz -Ithird_party\tree-sitter\lib\include -Ithird_party\tree-sitter\lib\src -Ithird_party\tree-sitter-java\bindings\c -Ithird_party\tree-sitter-python\bindings\c -Ithird_party\tree-sitter-cpp\bindings\c -I"%QT_DIR%\include" -I"%QT_DIR%\include\QtCore" -I"%MINGW_DIR%\opt\include" -o release\cpp_scanner.o third_party\tree-sitter-cpp\src\scanner.c >nul 2>&1

echo.
echo Step 3: Running mingw32-make...
"%MINGW_DIR%\bin\mingw32-make.exe" -j4 >nul 2>&1
echo qmake build completed (errors expected for language parsers)

echo.
echo Step 4: Manual linking with language parsers...
if exist release\CryptoScannerCLI.exe del /q release\CryptoScannerCLI.exe

echo Linking final executable...
"%MINGW_DIR%\bin\g++.exe" -Wl,-s -Wl,-subsystem,console -mthreads -o release/CryptoScannerCLI.exe ^
  release/main_gui_cli.o release/CryptoScanner.o release/FileScanner.o release/PatternLoader.o ^
  release/PatternDefinitions.o release/JavaBytecodeScanner.o release/JavaASTScanner.o ^
  release/PythonASTScanner.o release/CppASTScanner.o release/DynLinkParser.o ^
  release/miniz.o release/miniz_zip.o release/miniz_tinfl.o release/miniz_tdef.o release/lib.o ^
  release/java_parser.o release/python_parser.o release/cpp_parser.o ^
  release/python_scanner.o release/cpp_scanner.o ^
  "%QT_DIR%\lib\libQt5Core.a" "%MINGW_DIR%\opt\lib\libssl.a" "%MINGW_DIR%\opt\lib\libcrypto.a" "%MINGW_DIR%\x86_64-w64-mingw32\lib\libz.a" -lws2_32 -lmswsock >nul 2>&1

if exist release\CryptoScannerCLI.exe (
    echo.
    echo ========================================
    echo BUILD SUCCESSFUL!
    echo ========================================
    echo Created: release\CryptoScannerCLI.exe
    dir release\CryptoScannerCLI.exe | findstr /C:"CryptoScannerCLI.exe"

    REM Copy to GUI project
    echo.
    echo Copying to GUI project...
    if not exist "..\crypto-scanner-gui\dist\main" mkdir "..\crypto-scanner-gui\dist\main"
    copy /Y release\CryptoScannerCLI.exe "..\crypto-scanner-gui\dist\main\CryptoScanner.exe"
    if exist "..\crypto-scanner-gui\dist\main\CryptoScanner.exe" (
        echo Successfully copied to GUI project!
    )

) else (
    echo.
    echo ========================================
    echo BUILD FAILED!
    echo ========================================
    echo Check the error messages above.
    pause
    exit /b 1
)

echo.
echo Build completed successfully!
pause