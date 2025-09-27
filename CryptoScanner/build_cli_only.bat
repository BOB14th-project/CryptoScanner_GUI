@echo off
setlocal enabledelayedexpansion

echo Building CLI-only CryptoScanner for Windows...

REM Clean previous build
if exist *.obj del /q *.obj
if exist CryptoScannerCLI.exe del /q CryptoScannerCLI.exe

REM Detect architecture
set ARCH=%PROCESSOR_ARCHITECTURE%
echo Detected architecture: %ARCH%

REM Set up Visual Studio environment
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
if errorlevel 1 (
    call "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
)
if errorlevel 1 (
    call "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
)
if errorlevel 1 (
    call "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
)
if errorlevel 1 (
    echo Error: Visual Studio Build Tools not found.
    echo Please check if Visual Studio 2022 is installed at:
    echo   "C:\Program Files\Microsoft Visual Studio\2022\Community"
    echo   "C:\Program Files\Microsoft Visual Studio\2022\Professional"
    echo   "C:\Program Files\Microsoft Visual Studio\2022\Enterprise"
    exit /b 1
)

REM Common flags
set COMMON_CFLAGS=/O2 /DUSE_MINIZ /DQT_CORE_LIB /DWIN32 /D_WINDOWS /EHsc /std:c++17

REM Qt detection for Windows
set QT_FOUND=0
set QT_DIR=

REM Check common Qt installation paths
for %%i in (
    "C:\Qt\5.15.2\mingw81_64"
    "C:\Qt\5.15.2\msvc2019_64"
    "C:\Qt\Qt5.15.2\5.15.2\msvc2019_64"
    "C:\Qt\5.15.1\msvc2019_64"
    "C:\Qt\6.5.0\msvc2019_64"
    "C:\Qt\6.6.0\msvc2019_64"
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
    echo Please install Qt 5.15.x or Qt 6.x from https://www.qt.io/download-qt-installer
    echo Expected locations:
    echo   C:\Qt\5.15.2\mingw81_64
    echo   C:\Qt\5.15.2\msvc2019_64
    echo   C:\Qt\Qt5.15.2\5.15.2\msvc2019_64
    exit /b 1
)

echo Found Qt at: %QT_DIR%

REM Qt includes and libs
set QT_INCLUDES=/I"%QT_DIR%\include" /I"%QT_DIR%\include\QtCore"
set QT_LIBS="%QT_DIR%\lib\Qt5Core.lib"

REM Check if Qt6
echo %QT_DIR% | findstr /C:"Qt6" >nul && (
    set QT_LIBS="%QT_DIR%\lib\Qt6Core.lib"
)

REM Check if mingw
echo %QT_DIR% | findstr /C:"mingw" >nul && (
    set QT_LIBS="%QT_DIR%\lib\libQt5Core.a"
)

REM OpenSSL detection (try vcpkg first, then manual)
set OPENSSL_INCLUDES=
set OPENSSL_LIBS=

if exist "C:\vcpkg\installed\x64-windows\include\openssl" (
    set OPENSSL_INCLUDES=/I"C:\vcpkg\installed\x64-windows\include"
    set OPENSSL_LIBS="C:\vcpkg\installed\x64-windows\lib\libssl.lib" "C:\vcpkg\installed\x64-windows\lib\libcrypto.lib"
    echo Found OpenSSL via vcpkg
) else if exist "C:\OpenSSL-Win64\include\openssl" (
    set OPENSSL_INCLUDES=/I"C:\OpenSSL-Win64\include"
    set OPENSSL_LIBS="C:\OpenSSL-Win64\lib\libssl.lib" "C:\OpenSSL-Win64\lib\libcrypto.lib"
    echo Found OpenSSL at C:\OpenSSL-Win64
) else (
    echo Warning: OpenSSL not found. Some features may not work.
    echo Install OpenSSL via: choco install openssl
)

REM All includes
set ALL_INCLUDES=/I"." /I"third_party\miniz" /I"third_party\tree-sitter\lib\include" /I"third_party\tree-sitter\lib\src" %QT_INCLUDES% %OPENSSL_INCLUDES%

echo Step 1: Compiling C files...
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c third_party\miniz\miniz.c /Fo:third_party\miniz\miniz.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c third_party\miniz\miniz_zip.c /Fo:third_party\miniz\miniz_zip.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c third_party\miniz\miniz_tinfl.c /Fo:third_party\miniz\miniz_tinfl.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c third_party\miniz\miniz_tdef.c /Fo:third_party\miniz\miniz_tdef.obj

cl %COMMON_CFLAGS% %ALL_INCLUDES% /c third_party\tree-sitter\lib\src\lib.c /Fo:third_party\tree-sitter\lib\src\lib.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c third_party\tree-sitter-cpp\src\parser.c /Fo:third_party\tree-sitter-cpp\src\parser.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c third_party\tree-sitter-cpp\src\scanner.c /Fo:third_party\tree-sitter-cpp\src\scanner.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c third_party\tree-sitter-java\src\parser.c /Fo:third_party\tree-sitter-java\src\parser.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c third_party\tree-sitter-python\src\parser.c /Fo:third_party\tree-sitter-python\src\parser.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c third_party\tree-sitter-python\src\scanner.c /Fo:third_party\tree-sitter-python\src\scanner.obj

echo Step 2: Compiling C++ files...
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c main_gui_cli.cpp /Fo:main_gui_cli.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c CryptoScanner.cpp /Fo:CryptoScanner.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c FileScanner.cpp /Fo:FileScanner.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c PatternLoader.cpp /Fo:PatternLoader.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c PatternDefinitions.cpp /Fo:PatternDefinitions.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c JavaBytecodeScanner.cpp /Fo:JavaBytecodeScanner.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c JavaASTScanner.cpp /Fo:JavaASTScanner.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c PythonASTScanner.cpp /Fo:PythonASTScanner.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c CppASTScanner.cpp /Fo:CppASTScanner.obj
cl %COMMON_CFLAGS% %ALL_INCLUDES% /c DynLinkParser.cpp /Fo:DynLinkParser.obj

echo Step 3: Linking...
link /OUT:CryptoScannerCLI.exe /SUBSYSTEM:CONSOLE ^
    main_gui_cli.obj CryptoScanner.obj FileScanner.obj PatternLoader.obj PatternDefinitions.obj ^
    JavaBytecodeScanner.obj JavaASTScanner.obj PythonASTScanner.obj CppASTScanner.obj DynLinkParser.obj ^
    third_party\miniz\miniz.obj third_party\miniz\miniz_zip.obj third_party\miniz\miniz_tinfl.obj third_party\miniz\miniz_tdef.obj ^
    third_party\tree-sitter\lib\src\lib.obj ^
    third_party\tree-sitter-cpp\src\parser.obj third_party\tree-sitter-cpp\src\scanner.obj ^
    third_party\tree-sitter-java\src\parser.obj ^
    third_party\tree-sitter-python\src\parser.obj third_party\tree-sitter-python\src\scanner.obj ^
    %QT_LIBS% %OPENSSL_LIBS% kernel32.lib user32.lib advapi32.lib

if exist CryptoScannerCLI.exe (
    echo Build completed successfully: CryptoScannerCLI.exe
    dir CryptoScannerCLI.exe | findstr /C:"CryptoScannerCLI.exe"
) else (
    echo Build failed!
    exit /b 1
)