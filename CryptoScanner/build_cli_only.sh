#!/bin/bash
set -e

echo "Building CLI-only CryptoScanner without Qt GUI..."

# Clean previous build
make clean 2>/dev/null || true
rm -f *.o third_party/*/*.o third_party/*/*/*.o 2>/dev/null || true

# Common flags
COMMON_CFLAGS="-O2 -DUSE_MINIZ -DQT_CORE_LIB"
COMMON_INCLUDES="-I. -I./third_party/miniz -I./third_party/tree-sitter/lib/include -I./third_party/tree-sitter/lib/src"

# Qt includes (Core only)
QT_INCLUDES="-I/opt/homebrew/include -I/opt/homebrew/lib/QtCore.framework/Headers -F/opt/homebrew/lib"

# OpenSSL includes
OPENSSL_INCLUDES="-I/opt/homebrew/include"

# All includes
ALL_INCLUDES="$COMMON_INCLUDES $QT_INCLUDES $OPENSSL_INCLUDES"

# Library paths and libraries (OpenSSL + Qt Core for JSON parsing)
LIBS="-L/opt/homebrew/lib -F/opt/homebrew/lib -framework QtCore -lssl -lcrypto"

echo "Step 1: Compiling C files..."
# Compile C files with clang
clang -std=c11 $COMMON_CFLAGS $ALL_INCLUDES -c third_party/miniz/miniz.c -o third_party/miniz/miniz.o
clang -std=c11 $COMMON_CFLAGS $ALL_INCLUDES -c third_party/miniz/miniz_zip.c -o third_party/miniz/miniz_zip.o
clang -std=c11 $COMMON_CFLAGS $ALL_INCLUDES -c third_party/miniz/miniz_tinfl.c -o third_party/miniz/miniz_tinfl.o
clang -std=c11 $COMMON_CFLAGS $ALL_INCLUDES -c third_party/miniz/miniz_tdef.c -o third_party/miniz/miniz_tdef.o

clang -std=c11 $COMMON_CFLAGS $ALL_INCLUDES -c third_party/tree-sitter/lib/src/lib.c -o third_party/tree-sitter/lib/src/lib.o
clang -std=c11 $COMMON_CFLAGS $ALL_INCLUDES -c third_party/tree-sitter-cpp/src/parser.c -o third_party/tree-sitter-cpp/src/parser.o
clang -std=c11 $COMMON_CFLAGS $ALL_INCLUDES -c third_party/tree-sitter-cpp/src/scanner.c -o third_party/tree-sitter-cpp/src/scanner.o
clang -std=c11 $COMMON_CFLAGS $ALL_INCLUDES -c third_party/tree-sitter-java/src/parser.c -o third_party/tree-sitter-java/src/parser.o
clang -std=c11 $COMMON_CFLAGS $ALL_INCLUDES -c third_party/tree-sitter-python/src/parser.c -o third_party/tree-sitter-python/src/parser.o
clang -std=c11 $COMMON_CFLAGS $ALL_INCLUDES -c third_party/tree-sitter-python/src/scanner.c -o third_party/tree-sitter-python/src/scanner.o

echo "Step 2: Compiling C++ files without Qt..."
# Compile C++ files without Qt support
clang++ -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c main_gui_cli.cpp -o main_gui_cli.o
clang++ -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c CryptoScanner.cpp -o CryptoScanner.o
clang++ -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c FileScanner.cpp -o FileScanner.o
clang++ -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c PatternLoader.cpp -o PatternLoader.o
clang++ -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c PatternDefinitions.cpp -o PatternDefinitions.o
clang++ -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c JavaBytecodeScanner.cpp -o JavaBytecodeScanner.o
clang++ -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c JavaASTScanner.cpp -o JavaASTScanner.o
clang++ -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c PythonASTScanner.cpp -o PythonASTScanner.o
clang++ -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c CppASTScanner.cpp -o CppASTScanner.o
clang++ -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c DynLinkParser.cpp -o DynLinkParser.o

echo "Step 3: Linking without Qt frameworks..."
# Link everything without Qt
clang++ -std=c++17 -O2 $LIBS -o CryptoScannerCLI \
    main_gui_cli.o CryptoScanner.o FileScanner.o PatternLoader.o PatternDefinitions.o \
    JavaBytecodeScanner.o JavaASTScanner.o PythonASTScanner.o CppASTScanner.o DynLinkParser.o \
    third_party/miniz/miniz.o third_party/miniz/miniz_zip.o third_party/miniz/miniz_tinfl.o third_party/miniz/miniz_tdef.o \
    third_party/tree-sitter/lib/src/lib.o \
    third_party/tree-sitter-cpp/src/parser.o third_party/tree-sitter-cpp/src/scanner.o \
    third_party/tree-sitter-java/src/parser.o \
    third_party/tree-sitter-python/src/parser.o third_party/tree-sitter-python/src/scanner.o

echo "Build completed successfully: CryptoScannerCLI"
echo "Binary size: $(ls -lh CryptoScannerCLI | awk '{print $5}')"