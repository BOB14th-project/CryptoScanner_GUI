#!/bin/bash

# 통합 빌드 스크립트 - 정적 탐지 + 동적 탐지
# 지원 플랫폼: macOS (Apple Silicon/Intel), Linux (AMD64/ARM64)

set -e

echo "=================================================="
echo "통합 빌드 스크립트 시작"
echo "=================================================="

# OS 및 아키텍처 탐지
OS=$(uname -s)
ARCH=$(uname -m)

echo "OS: $OS"
echo "Architecture: $ARCH"
echo ""

# 1. CryptoScanner (정적 탐지) 확인
echo "=================================================="
echo "1. CryptoScanner (정적 탐지) 확인 중..."
echo "=================================================="
cd CryptoScanner

# 기존 바이너리가 있는지 확인
if [ -f "CryptoScannerCLI" ]; then
    echo "✅ 기존 CryptoScannerCLI 바이너리 발견, 사용합니다"
else
    echo "⚠️  CryptoScannerCLI 바이너리가 없습니다. 빌드를 시도합니다..."

    if [ "$OS" = "Darwin" ]; then
        # macOS - Qt 없이 빌드 시도
        make clean 2>/dev/null || true
        make -j$(sysctl -n hw.ncpu) || {
            echo "❌ Makefile 빌드 실패. qmake를 사용해 빌드합니다..."
            qmake CryptoScannerCLI.pro
            make -j$(sysctl -n hw.ncpu)
        }

        # CLI 바이너리 이름 변경
        if [ -f "CryptoScannerGUI" ]; then
            mv CryptoScannerGUI CryptoScannerCLI
        fi
    elif [ "$OS" = "Linux" ]; then
        # Linux
        make clean 2>/dev/null || true
        make -j$(nproc)

        # CLI 바이너리 이름 변경
        if [ -f "CryptoScannerGUI" ]; then
            mv CryptoScannerGUI CryptoScannerCLI
        fi
    else
        echo "❌ 지원하지 않는 OS: $OS"
        exit 1
    fi

    if [ -f "CryptoScannerCLI" ]; then
        echo "✅ CryptoScannerCLI 빌드 완료"
    else
        echo "❌ CryptoScannerCLI 빌드 실패"
        echo "기존 빌드된 바이너리를 사용하거나, 수동으로 빌드해주세요:"
        echo "  cd CryptoScanner && qmake CryptoScannerCLI.pro && make"
        exit 1
    fi
fi

cd ..

# 2. DynamicAnalysis (동적 탐지) 빌드
echo ""
echo "=================================================="
echo "2. DynamicAnalysis (동적 탐지) 빌드 중..."
echo "=================================================="
cd DynamicAnalysis

# 빌드 디렉토리 이름 설정
if [ "$OS" = "Darwin" ]; then
    BUILD_DIR="build-macos"
elif [ "$OS" = "Linux" ]; then
    BUILD_DIR="build-linux"
fi

# 기존 빌드 디렉토리 제거
rm -rf "$BUILD_DIR"

# CMake 빌드 (OpenSSL만 사용)
echo "CMake 구성 중..."
ENABLE_NSS_FLAG="-DENABLE_NSS=OFF"
if [ "$OS" = "Linux" ]; then
    ENABLE_NSS_FLAG="-DENABLE_NSS=ON"
fi

cmake -S . -B "$BUILD_DIR" \
    -DCMAKE_BUILD_TYPE=Release \
    -DENABLE_AF_ALG=OFF \
    -DENABLE_CRYPTODEV=OFF \
    -DENABLE_LIBSODIUM=OFF \
    -DENABLE_MBEDTLS=OFF \
    -DENABLE_WOLFSSL=OFF \
    -DENABLE_GNUTLS=OFF \
    "$ENABLE_NSS_FLAG" \
    -DCMAKE_CXX_FLAGS="-Wno-deprecated-declarations"

echo "빌드 중..."
cmake --build "$BUILD_DIR" -j

echo "✅ DynamicAnalysis 빌드 완료"
echo "  - 후킹 라이브러리: $BUILD_DIR/lib/"
echo "  - CLI 도구: $BUILD_DIR/bin/dynamic_analysis_cli"

cd ..

# 3. 빌드된 파일들을 Electron 앱에 복사
echo ""
echo "=================================================="
echo "3. 빌드된 파일들을 Electron 앱에 복사 중..."
echo "=================================================="

# crypto-scanner-gui/src/main 디렉토리에 바이너리 복사
DEST_DIR="crypto-scanner-gui/src/main"
mkdir -p "$DEST_DIR"

# 정적 탐지 바이너리 복사
if [ -f "CryptoScanner/CryptoScannerCLI" ]; then
    cp "CryptoScanner/CryptoScannerCLI" "$DEST_DIR/"
    chmod +x "$DEST_DIR/CryptoScannerCLI"
    echo "✅ CryptoScannerCLI 복사 완료"
fi

# patterns.json 복사
if [ -f "CryptoScanner/patterns.json" ]; then
    cp "CryptoScanner/patterns.json" "$DEST_DIR/"
    echo "✅ patterns.json 복사 완료"
fi

# 동적 탐지 바이너리 및 라이브러리 복사
if [ -f "DynamicAnalysis/$BUILD_DIR/bin/dynamic_analysis_cli" ]; then
    cp "DynamicAnalysis/$BUILD_DIR/bin/dynamic_analysis_cli" "$DEST_DIR/"
    chmod +x "$DEST_DIR/dynamic_analysis_cli"
    echo "✅ dynamic_analysis_cli 복사 완료"
fi

# 후킹 라이브러리 복사
if [ "$OS" = "Darwin" ]; then
    if [ -f "DynamicAnalysis/$BUILD_DIR/lib/libhook.dylib" ]; then
        cp "DynamicAnalysis/$BUILD_DIR/lib/libhook.dylib" "$DEST_DIR/"
        echo "✅ libhook.dylib 복사 완료"
    fi
elif [ "$OS" = "Linux" ]; then
    if [ -f "DynamicAnalysis/$BUILD_DIR/lib/libhook.so" ]; then
        cp "DynamicAnalysis/$BUILD_DIR/lib/libhook.so" "$DEST_DIR/"
        echo "✅ libhook.so 복사 완료"
    fi
fi

echo ""
echo "=================================================="
echo "통합 빌드 완료!"
echo "=================================================="
echo ""
echo "다음 단계:"
echo "1. cd crypto-scanner-gui"
echo "2. npm install"
echo "3. npm run build"
if [ "$OS" = "Darwin" ]; then
    echo "4. npm run dist"
elif [ "$OS" = "Linux" ]; then
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
        echo "4. npm run dist:linux-arm"
    else
        echo "4. npm run dist:linux-amd"
    fi
fi
echo ""
