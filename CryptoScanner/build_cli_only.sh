#!/bin/bash
set -e

echo "Building CLI-only CryptoScanner without Qt GUI..."

# Clean previous build
make clean 2>/dev/null || true
rm -f *.o third_party/*/*.o third_party/*/*/*.o 2>/dev/null || true

# Detect platform and architecture
OS=$(uname -s)
ARCH=$(uname -m)
echo "Detected platform: $OS $ARCH"

# Common flags
COMMON_CFLAGS="-O2 -DUSE_MINIZ -DQT_CORE_LIB -fPIC"
COMMON_INCLUDES="-I. -I./third_party/miniz -I./third_party/tree-sitter/lib/include -I./third_party/tree-sitter/lib/src"

# Initialize variables
QT_INCLUDES=""
OPENSSL_INCLUDES=""
LIBS=""

# Platform-specific Qt and OpenSSL detection
if [[ "$OS" == "Darwin" ]]; then
    # macOS
    if [[ "$ARCH" == "arm64" ]]; then
        # Apple Silicon (M1/M2)
        QT_BASE="/opt/homebrew"
    else
        # Intel Mac
        QT_BASE="/usr/local"
    fi

    # Check if Qt is installed via Homebrew
    if [ -d "$QT_BASE/lib/QtCore.framework" ]; then
        QT_INCLUDES="-I$QT_BASE/include -I$QT_BASE/lib/QtCore.framework/Headers -F$QT_BASE/lib"
        LIBS="-L$QT_BASE/lib -F$QT_BASE/lib -framework QtCore"
    elif [ -d "/usr/local/Qt" ]; then
        # Qt installed from official installer
        QT_DIR=$(find /usr/local/Qt -name "QtCore" -type d | head -1)
        if [ ! -z "$QT_DIR" ]; then
            QT_VERSION_DIR=$(dirname "$QT_DIR")
            QT_INCLUDES="-I$QT_VERSION_DIR/include -I$QT_VERSION_DIR/include/QtCore"
            LIBS="-L$QT_VERSION_DIR/lib -lQt5Core"
        fi
    fi

    # OpenSSL for macOS
    OPENSSL_INCLUDES="-I$QT_BASE/include"
    LIBS="$LIBS -L$QT_BASE/lib -lssl -lcrypto"

elif [[ "$OS" == "Linux" ]]; then
    # Linux

    # Try to find Qt5 or Qt6
    QT_FOUND=""

    # Check for Qt6 first
    if pkg-config --exists Qt6Core 2>/dev/null; then
        QT_INCLUDES=$(pkg-config --cflags Qt6Core)
        QT_LIBS=$(pkg-config --libs Qt6Core)
        QT_FOUND="Qt6"
    elif pkg-config --exists Qt5Core 2>/dev/null; then
        QT_INCLUDES=$(pkg-config --cflags Qt5Core)
        QT_LIBS=$(pkg-config --libs Qt5Core)
        QT_FOUND="Qt5"
    else
        # Manual Qt detection for common locations
        QT_PATHS=(
            "/usr/include/qt5"
            "/usr/include/qt6"
            "/usr/local/include/qt5"
            "/usr/local/include/qt6"
            "/opt/qt5/include"
            "/opt/qt6/include"
        )

        for QT_PATH in "${QT_PATHS[@]}"; do
            if [ -d "$QT_PATH/QtCore" ]; then
                QT_INCLUDES="-I$QT_PATH -I$QT_PATH/QtCore"
                if [[ "$QT_PATH" == *"qt6"* ]]; then
                    QT_LIBS="-lQt6Core"
                    QT_FOUND="Qt6"
                else
                    QT_LIBS="-lQt5Core"
                    QT_FOUND="Qt5"
                fi
                break
            fi
        done
    fi

    if [ -z "$QT_FOUND" ]; then
        echo "Error: Qt development packages not found."
        echo "Please install Qt development packages:"
        echo "  Ubuntu/Debian: sudo apt-get install qtbase5-dev or qt6-base-dev"
        echo "  CentOS/RHEL/Fedora: sudo yum install qt5-qtbase-devel or qt6-qtbase-devel"
        echo "  Arch Linux: sudo pacman -S qt5-base or qt6-base"
        exit 1
    fi

    echo "Found $QT_FOUND"

    # OpenSSL for Linux (usually in standard locations)
    OPENSSL_INCLUDES=""

    # Library setup
    LIBS="$QT_LIBS -lssl -lcrypto"

fi

# All includes
ALL_INCLUDES="$COMMON_INCLUDES $QT_INCLUDES $OPENSSL_INCLUDES"

echo "Using Qt includes: $QT_INCLUDES"
echo "Using libraries: $LIBS"

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

echo "Step 2: Compiling C++ files..."

# Select appropriate C++ compiler
if [[ "$OS" == "Darwin" ]]; then
    CXX_COMPILER="clang++"
elif [[ "$OS" == "Linux" ]]; then
    if command -v g++ &> /dev/null; then
        CXX_COMPILER="g++"
    elif command -v clang++ &> /dev/null; then
        CXX_COMPILER="clang++"
    else
        echo "Error: No C++ compiler found (g++ or clang++)"
        exit 1
    fi
fi

echo "Using C++ compiler: $CXX_COMPILER"

# Compile C++ files
$CXX_COMPILER -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c main_gui_cli.cpp -o main_gui_cli.o
$CXX_COMPILER -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c CryptoScanner.cpp -o CryptoScanner.o
$CXX_COMPILER -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c FileScanner.cpp -o FileScanner.o
$CXX_COMPILER -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c PatternLoader.cpp -o PatternLoader.o
$CXX_COMPILER -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c PatternDefinitions.cpp -o PatternDefinitions.o
$CXX_COMPILER -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c JavaBytecodeScanner.cpp -o JavaBytecodeScanner.o
$CXX_COMPILER -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c JavaASTScanner.cpp -o JavaASTScanner.o
$CXX_COMPILER -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c PythonASTScanner.cpp -o PythonASTScanner.o
$CXX_COMPILER -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c CppASTScanner.cpp -o CppASTScanner.o
$CXX_COMPILER -std=c++17 $COMMON_CFLAGS $ALL_INCLUDES -c DynLinkParser.cpp -o DynLinkParser.o

echo "Step 3: Linking..."
# Select appropriate compiler and flags based on platform
if [[ "$OS" == "Darwin" ]]; then
    COMPILER="clang++"
elif [[ "$OS" == "Linux" ]]; then
    # Use g++ on Linux as it's more commonly available and works better with Qt
    if command -v g++ &> /dev/null; then
        COMPILER="g++"
    elif command -v clang++ &> /dev/null; then
        COMPILER="clang++"
    else
        echo "Error: No C++ compiler found (g++ or clang++)"
        exit 1
    fi
fi

echo "Using compiler: $COMPILER"

# Link everything
$COMPILER -std=c++17 -O2 -o CryptoScannerCLI \
    main_gui_cli.o CryptoScanner.o FileScanner.o PatternLoader.o PatternDefinitions.o \
    JavaBytecodeScanner.o JavaASTScanner.o PythonASTScanner.o CppASTScanner.o DynLinkParser.o \
    third_party/miniz/miniz.o third_party/miniz/miniz_zip.o third_party/miniz/miniz_tinfl.o third_party/miniz/miniz_tdef.o \
    third_party/tree-sitter/lib/src/lib.o \
    third_party/tree-sitter-cpp/src/parser.o third_party/tree-sitter-cpp/src/scanner.o \
    third_party/tree-sitter-java/src/parser.o \
    third_party/tree-sitter-python/src/parser.o third_party/tree-sitter-python/src/scanner.o \
    $LIBS

echo "Build completed successfully: CryptoScannerCLI"
echo "Binary size: $(ls -lh CryptoScannerCLI | awk '{print $5}')"