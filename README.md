# 📂 프로그램 구조

```bash
CryptoScanner_GUI/
├── CryptoScanner/           # C++ 백엔드 스캐너
│
└── crypto-scanner-gui/      # React + Electron GUI
    └── src/
        ├── main/            # Electron 메인 프로세스
        │   ├── main.ts      # 메인 프로세스 로직
        │   └── preload.ts   # 프리로드 스크립트
        └── renderer/        # React 렌더러 프로세스
            ├── assets/      # 페이지 컴포넌트들
            │   ├── fonts/   # SF Pro 폰트
            |   └── images/  # 배경 이미지
            ├── components/  # 공통 컴포넌트들
            ├── hooks/       # 빈 폴더(대비용)
            ├── pages/       # 페이지 컴포넌트들
            ├── types/       # TypeScript 타입 정의
            └── utils/       # 스토리지
```

<br />

# ⚙️ 설치 과정

### 💻 Linux (Debian/Ubuntu)

### 1️⃣ 의존성 설치

```bash
# 시스템 패키지 업데이트
sudo apt-get update

# 필요한 패키지 설치
sudo apt-get install build-essential qtbase5-dev libssl-dev pkg-config
```

### 2️⃣ 저장소 복제

```bash
# 저장소 설치
git clone https://github.com/BOB14th-project/CryptoScanner_GUI.git
```

### 3️⃣ npm 설치

```bash
cd CryptoScanner/crypto-scanner-gui

# npm 명령어
npm install
```

### 4️⃣ GUI 설치 및 실행 - **AMD**

```bash
npm run dist:linux-amd

cd ../linux-amd
./crypto-scanner-gui
```

### 5️⃣ GUI 설치 및 실행 - **ARM**

```bash
npm run dist:linux-arm

cd ../linux-arm
./crypto-scanner-gui
```

<br />

## 💻 Windows

### 1️⃣ …

```bash

```

<br />

## **🍎** MacOS (Apple Silicon)

### 1️⃣ 의존성 설치

```bash
# Homebrew 설치
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 필요한 패키지 설치
brew install node qt@5 openssl llvm

# LLVM objdump 심볼릭 링크 생성
sudo ln -sf /opt/homebrew/bin/llvm-objdump /opt/homebrew/bin/objdump
```

### 2️⃣ 저장소 복제

```bash
# 저장소 설치
git clone https://github.com/BOB14th-project/CryptoScanner_GUI.git
```

### 3️⃣ npm 설치

```bash
cd CryptoScanner/crypto-scanner-gui

# npm 명령어
npm install
```

### 4️⃣ GUI 설치 및 실행

```bash
npm run dist

cd ../mac-arm64
open CryptoScanner.app
```

<br />

# 📄 주요 기능

### **1️⃣ Start Page**

- 앱 시작 화면
- "Get Started" 버튼으로 메인 페이지 이동

### **2️⃣ Main Page**

- **RESULT**: 이전 스캔 기록 조회 (날짜별 정리, CSV 다운로드 가능)
- **QUICK SCAN**: 개별 파일/폴더 스캔 (최대 5분 소요)
- **FULL SCAN**: 전체 시스템 스캔 (최소 20분 소요) **[⚠️ 기능 사용 일시정지]**

### **3️⃣ Result Page**

- 좌측: 날짜별 스캔 기록 목록 (내림차순)
- 우측: 선택된 날짜의 스캔 결과들
- 각 결과마다 "View Detailed Results" 제공

### **4️⃣ Analyze Pages**

- **Overview**: 원형 차트로 알고리즘별 통계 표시
- **Algorithm Type**: 막대 그래프로 알고리즘 타입별 개수 표시
- **Details**: 파일별 상세 탐지 결과
- **LLM Orchestration**: 준비중

### **5️⃣ Quick Scan Pages**

- 좌측: Folder Scan / File Scan 선택
- 우측: 선택된 스캔 타입별 인터페이스
- 파일/폴더 선택 후 스캔 시작

### **6️⃣ Full Scan Page [⚠️ 기능 사용 일시정지]**

- 전체 시스템 스캔 인터페이스
- 스캔 시작 버튼만 제공

### **7️⃣ Loading Pages**

- 실시간 스캔 진행률 표시
- 현재 스캔 중인 파일명 표시
- 진행률 바 및 시간 정보 (경과/예상 시간)