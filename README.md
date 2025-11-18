# 🛡️ CryptoScanner: Non-PQC Detection Tool
![Platform](https://img.shields.io/badge/Platform-MacOS(ARM)-FF0000?style=flat)
![Platform](https://img.shields.io/badge/Platform-Linux(AMD/ARM)-FFD700?style=flat)
![Platform](https://img.shields.io/badge/Platform-Windows(AMD)-0078D6?style=flat)
<br />

**CryptoScanner**은 실행파일, 소스코드, 키 / 인증서를 위주로 양자내성암호(PQC)로의 전환이 필요한 암호화 알고리즘을 탐지하고 분석하는 강력한 도구입니다.

<br />

# 📂 프로그램 구조

```bash
CryptoScanner_GUI/
├── CryptoScanner/           # C++ 정적 분석 백엔드
│   └── third_party/         # tree-sitter, miniz 등 외부 라이브러리
│
├── DynamicAnalysis/         # C++ 동적 분석 백엔드
│   ├── include/             # 공통 헤더 파일
│   ├── src/                 # 플랫폼별(MacOS, Linux, Windows) 소스 코드
│   └── scripts/             # 동적 분석 테스트 및 빌드 스크립트 파일
│
├── crypto-scanner-gui/      # React + Electron 프론트엔드
│   ├── scripts/             # 빌드 시 백엔드 파일을 복사하는 스크립트
│   └── src/
│       ├── main/            # Electron 메인 프로세스
│       │   ├── main.ts      # 메인 프로세스 로직
│       │   ├── preload.ts   # 프리로드 스크립트
│       │   └── (backend)    # 빌드된 백엔드 실행 파일
│       └── renderer/        # React 렌더 프로세스
│           ├── assets/      # 폰트, 이미지 파일
│           ├── components/  # 공통 UI 컴포넌트
│           ├── pages/       # 화면별 페이지 컴포넌트
│           ├── types/       # TypeScript 타입 정의
│           └── utils/       # 유틸리티 파일
│
└── mac-arm64 / linux-arm, linux-amd / win-amd  # 빌드 후 생성되는 CryptoScanner 실행파일
```

<br />

# ⚙️ 설치 과정

## 💻 Linux (Debian/Ubuntu)

### 1️⃣ 의존성 설치

```bash
# 시스템 패키지 업데이트
sudo apt update

# 필요한 패키지 설치
sudo apt install build-essential qtbase5-dev libssl-dev pkg-config nodejs clang cmake libnss3-dev libnspr4-dev libp11-kit-dev
```

### 2️⃣ 저장소 복제

```bash
# 저장소 설치
git clone https://github.com/BOB14th-project/CryptoScanner_GUI.git
```

### 3️⃣ 백엔드 빌드, 정적탐지 및 동적탐지 통합 빌드

```bash
# 백엔드 빌드
cd CryptoScanner_GUI/CryptoScanner
./mac_linux_amd_arm.sh

cd ../
./build_integrated.sh
```

### 4️⃣ GUI 설치

```bash
cd crypto-scanner-gui

# npm 명령어
npm install
npm run build
npm run copy-backend
```

### 5️⃣ 실행 - **AMD**

```bash
npm run dist:linux-amd

cd ../linux-amd
./crypto-scanner-gui
```

### 6️⃣ 실행 - **ARM**

```bash
npm run dist:linux-arm

cd ../linux-arm
./crypto-scanner-gui
```

<br />

## 💻 Windows (AMD)

### 1️⃣ 의존성 설치

```powershell
# PowerShell 관리자 권한 실행
# Chocolatey 설치
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Chocolatey 설치된 경우
choco upgrade chocolatey

# 필요한 패키지 설치
choco install nodejs git llvm -y
```

```powershell
# Qt 설치 01 (설치 경로: C:\Qt)
# https://www.qt.io/download-qt-installer

# 1) 회원 가입
# 2) 설치 옵선 선택 시, 하단의 사용자 지정 설치 클릭
# 3) 사용자 정의 화면에서 Qt > Qt 6.9.2 > Additional Libraries > Qt 5 Compatibility moudule 선택
```

```bash
# Qt 설치 02 (설치 경로: C:\Qt)

# 0) PowerShell 관리자 권한 실행
Remove-Item "$env:TEMP\aqt.exe" -ErrorAction SilentlyContinue

# 1) aqt.exe 최신 릴리스로 받기 (GitHub Releases의 aqt.exe)
$aqt = Join-Path $env:TEMP 'aqt.exe'
Invoke-WebRequest -Uri "https://github.com/miurahr/aqtinstall/releases/latest/download/aqt.exe" -OutFile $aqt

# 2) 파일 점검
Get-Item $aqt | Format-List Name,Length,FullName

# 3) Qt 5.15.2 (win64_mingw81) → C:\Qt\5.15.2\mingw81_64 생성
& $aqt install-qt windows desktop 5.15.2 win64_mingw81 -O C:\Qt
```

```powershell
# git for windows (설치 경로: C:\Program Files\Git)
# https://gitforwindows.org/
```

### 2️⃣ 저장소 복제

```bash
cd C:\

# 저장소 설치
git clone https://github.com/BOB14th-project/CryptoScanner_GUI.git
```

### 3️⃣ 백엔드 빌드, 정적탐지 및 동적탐지 통합 빌드

```bash
cd CryptoScanner_GUI\CryptoScanner
.\windows_amd.bat

cd ..\
.\build_integrated_windows.bat
```

### 4️⃣ GUI 설치 및 실행

```bash
cd crypto-scanner-gui

# npm 명령어
npm install
npm run build
npm run copy-backend
npm run dist:win-amd

cd ..\win-amd
.\CryptoScanner.exe
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

### 3️⃣ 백엔드 빌드, 정적탐지 및 동적탐지 통합 빌드

```bash
cd CryptoScanner_GUI/CryptoScanner
./mac_linux_amd_arm.sh

cd ../
./build_integrated.sh
```

### 4️⃣ GUI 설치 및 실행

```bash
cd crypto-scanner-gui

# npm 명령어
npm install
npm run build
npm run copy-backend
npm run dist

cd ../mac-arm64
open CryptoScanner.app
```

<br />

# 🔐 .env 파일 설정
```bash
# .env 파일 위치
# /CryptoScanner_GUI/.env
OPENAI_API_KEY=[API KEY]
Google_API_KEY=[API KEY]
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

### **6️⃣ Full Scan Page** [기능 사용 일시정지]

- 전체 시스템 스캔 인터페이스
- 스캔 시작 버튼만 제공

### **7️⃣ Loading Pages**

- 실시간 스캔 진행률 표시
- 현재 스캔 중인 파일명 표시
- 진행률 바 및 시간 정보 (경과/예상 시간)

<br />

# 🪪 라이선스
![License](https://img.shields.io/badge/License-MIT-black.svg)
<br />

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

<br />

# 🧑🏻‍💻 개발자
### 개발 기간
2025.09. ~ ING
<br />

### 개발자
🧑🏻‍💻 정진호 [(@ZINH00)](https://github.com/ZINH00) \
🧑🏻‍💻 서정민 [(@seojungmin)](https://github.com/noir1458) \
🧑🏻‍💻 하준수 [(@JunsuHa)](https://github.com/junsu0306) \
👩🏻‍💻 신찬희 [(@chan-068)](https://github.com/chan-068) \
🧑🏻‍💻 한상우 [(@Sangwoo Hahn)](https://github.com/sw-player)
<br />

### 소속
<img src="https://www.kitribob.kr/static/front/images/common/logo.gif" alt="BoB 14TH Dev" width="200px">