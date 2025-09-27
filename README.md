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



# **📋 시스템 요구사항**


## **📋** 공통 요구사항

1. **Node.js**(v16 이상)
2. **npm**


## **🍎** macOS 추가 요구사항

1. **Xcode Command Line Tools**
2. **Homebrew**
3. **LLVM**


## 💻 Linux 추가 요구사항

1. **build-essential** (Ubuntu/Debian) 또는 **gcc-c++** (CentOS/RHEL)
2. **Qt5 개발 패키지**
3. **OpenSSL 개발 패키지**


## 💻 Windows 추가 요구사항

1. 추후 작성 예정



# **🚀 설치 및 실행 가이드**


## 1️⃣ 저장소 복제

```bash
git clone https://github.com/BOB14th-project/CryptoScanner_GUI.git
cd CryptoScanner_GUI
```


## 2️⃣ 시스템별 의존성 설치


### **🍎 macOS**

```bash
# Homebrew 설치 (없는 경우)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 필요한 패키지 설치
brew install qt@5 openssl llvm

# LLVM objdump 심볼릭 링크 생성
sudo ln -sf /opt/homebrew/bin/llvm-objdump /opt/homebrew/bin/objdump
```


### **💻 Linux (Debian/Ubuntu)**

```bash
# 시스템 패키지 업데이트
sudo apt update

# 필요한 패키지 설치
sudo apt install -y build-essential qt5-qmake qtbase5-dev qtbase5-dev-tools libssl-dev nodejs npm git

# Node.js 최신 버전 설치 (필요한 경우)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```


### **💻 Windows**

```bash
추후 작성 예정
```


## 3️⃣ 프로젝트 빌드


### **✅ CryptoScanner CLI 빌드**

```bash
cd CryptoScanner
./build_cli_only.sh
```


### **✅ Electron GUI 빌드**

```bash
cd ../crypto-scanner-gui
npm install
npm run build
```


## 4️⃣ 실행 방법


### 🍎 macOS

```bash
cd ../CryptoScanner_GUI/mac-arm64
./CryptoScanner.app
```


### **💻 Linux (Debian/Ubuntu - ARM)**

```bash
cd ../CryptoScanner_GUI/linux-arm64-unpacked/
./crypto-scanner-gui
```


### **💻 Linux (Debian/Ubuntu - AMD)**

```bash
cd ../CryptoScanner_GUI/linux-unpacked/
./crypto-scanner-gui
```


### **💻 Windows**

```bash
추후 작성 예정
```



# 🖥️ 주요 기능


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
