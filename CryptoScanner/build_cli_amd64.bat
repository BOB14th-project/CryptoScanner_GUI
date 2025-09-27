@echo off
setlocal enabledelayedexpansion

echo Building CLI-only CryptoScanner for Windows AMD64...

REM Clean previous build
if exist *.o del /q *.o
if exist CryptoScannerCLI.exe del /q CryptoScannerCLI.exe

REM Set Qt and MinGW paths
set QT_DIR=C:\Qt\5.15.2\mingw81_64
set MINGW_DIR=C:\Qt\Tools\mingw1310_64

REM Add to PATH
set PATH=%QT_DIR%\bin;%MINGW_DIR%\bin;%PATH%

echo Found MinGW at: %MINGW_DIR%\bin
echo Found Qt at: %QT_DIR%

REM Common flags for MinGW
set COMMON_CFLAGS=-O2 -DUSE_MINIZ -DMINIZ_STATIC_DEFINE -DQT_CORE_LIB -DUSE_OPENSSL -DWIN32 -D_WINDOWS -std=c++17

REM All includes
set ALL_INCLUDES=-I"." -I"third_party\miniz" -I"third_party\tree-sitter\lib\include" -I"third_party\tree-sitter\lib\src" -I"C:\msys64\mingw64\include" -I"%QT_DIR%\include" -I"%QT_DIR%\include\QtCore"

REM Library paths
set ALL_LIBS=-L"%QT_DIR%\lib" -lQt5Core -L"C:\msys64\mingw64\lib" -lssl -lcrypto -lkernel32 -luser32 -ladvapi32

echo Step 1: Compiling C files...
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\miniz\miniz.c -o miniz.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\miniz\miniz_zip.c -o miniz_zip.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\miniz\miniz_tinfl.c -o miniz_tinfl.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\miniz\miniz_tdef.c -o miniz_tdef.o

gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\tree-sitter\lib\src\lib.c -o tree_sitter_lib.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\tree-sitter-cpp\src\parser.c -o tree_sitter_cpp_parser.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\tree-sitter-cpp\src\scanner.c -o tree_sitter_cpp_scanner.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\tree-sitter-java\src\parser.c -o tree_sitter_java_parser.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\tree-sitter-python\src\parser.c -o tree_sitter_python_parser.o
gcc %COMMON_CFLAGS% %ALL_INCLUDES% -c third_party\tree-sitter-python\src\scanner.c -o tree_sitter_python_scanner.o

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
g++ -o CryptoScannerCLI.exe ^
    main_gui_cli.o CryptoScanner.o FileScanner.o PatternLoader.o PatternDefinitions.o ^
    JavaBytecodeScanner.o JavaASTScanner.o PythonASTScanner.o CppASTScanner.o DynLinkParser.o ^
    miniz.o miniz_zip.o miniz_tinfl.o miniz_tdef.o ^
    tree_sitter_lib.o tree_sitter_cpp_parser.o tree_sitter_cpp_scanner.o ^
    tree_sitter_java_parser.o tree_sitter_python_parser.o tree_sitter_python_scanner.o ^
    %ALL_LIBS% -static-libgcc -static-libstdc++

if exist CryptoScannerCLI.exe (
    echo Build completed successfully: CryptoScannerCLI.exe
    dir CryptoScannerCLI.exe | findstr /C:"CryptoScannerCLI.exe"
) else (
    echo Build failed!
    exit /b 1
)

pause