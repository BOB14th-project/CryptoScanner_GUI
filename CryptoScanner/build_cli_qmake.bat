@echo off
setlocal enabledelayedexpansion

echo Building CLI-only CryptoScanner using qmake + mingw32-make...

REM Clean previous build
if exist *.o del /q *.o
if exist CryptoScannerCLI.exe del /q CryptoScannerCLI.exe
if exist Makefile del /q Makefile

REM Set Qt and MinGW paths
set QT_DIR=C:\Qt\5.15.2\mingw81_64
set MINGW_DIR=C:\Qt\Tools\mingw1310_64

REM Add to PATH
set PATH=%QT_DIR%\bin;%MINGW_DIR%\bin;%PATH%

echo Found qmake at: %QT_DIR%\bin\qmake.exe
echo Found mingw32-make at: %MINGW_DIR%\bin\mingw32-make.exe

REM Create .pro file for CLI build
echo Creating CryptoScannerCLI.pro...
(
echo TARGET = CryptoScannerCLI
echo CONFIG += console c++17
echo CONFIG -= app_bundle qt
echo.
echo QT += core
echo.
echo DEFINES += USE_MINIZ MINIZ_STATIC_DEFINE QT_CORE_LIB USE_OPENSSL
echo.
echo INCLUDEPATH += . \
echo     third_party/miniz \
echo     third_party/tree-sitter/lib/include \
echo     third_party/tree-sitter/lib/src \
echo     C:/msys64/mingw64/include \
echo     C:/Qt/5.15.2/mingw81_64/include \
echo     C:/Qt/5.15.2/mingw81_64/include/QtCore
echo.
echo LIBS += -LC:/Qt/5.15.2/mingw81_64/lib -lQt5Core -LC:/msys64/mingw64/lib -lssl -lcrypto
echo.
echo SOURCES += \
echo     main_gui_cli.cpp \
echo     CryptoScanner.cpp \
echo     FileScanner.cpp \
echo     PatternLoader.cpp \
echo     PatternDefinitions.cpp \
echo     JavaBytecodeScanner.cpp \
echo     JavaASTScanner.cpp \
echo     CppASTScanner.cpp \
echo     DynLinkParser.cpp \
echo     third_party/miniz/miniz.c \
echo     third_party/miniz/miniz_zip.c \
echo     third_party/miniz/miniz_tinfl.c \
echo     third_party/miniz/miniz_tdef.c \
echo     third_party/tree-sitter/lib/src/lib.c \
echo     third_party/tree-sitter-cpp/src/parser.c \
echo     third_party/tree-sitter-cpp/src/scanner.c \
echo     third_party/tree-sitter-java/src/parser.c
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

echo Step 1: Running qmake...
"%QT_DIR%\bin\qmake.exe" CryptoScannerCLI.pro

if not exist Makefile (
    echo Error: qmake failed to generate Makefile
    exit /b 1
)

echo Step 2: Running mingw32-make...
"%MINGW_DIR%\bin\mingw32-make.exe"

if exist CryptoScannerCLI.exe (
    echo Build completed successfully: CryptoScannerCLI.exe
    dir CryptoScannerCLI.exe | findstr /C:"CryptoScannerCLI.exe"
) else (
    echo Build failed!
    exit /b 1
)

pause