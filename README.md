# CryptoScanner GUI

React 기반 비양자내성 암호 알고리즘 탐지툴 GUI 애플리케이션

## 프로젝트 구조

```
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

## 주요 기능

### 1. Start Page
- 앱 시작 화면
- "Get Started" 버튼으로 메인 페이지 이동

### 2. Main Page
- **RESULT**: 이전 스캔 기록 조회 (날짜별 정리, CSV 다운로드 가능)
- **QUICK SCAN**: 개별 파일/폴더 스캔 (최대 5분 소요)
- **FULL SCAN**: 전체 시스템 스캔 (최소 20분 소요)

### 3. Result Page
- 좌측: 날짜별 스캔 기록 목록 (최신순 정렬)
- 우측: 선택된 날짜의 스캔 결과들
- 각 결과마다 "View Detailed Results" 제공

### 4. Analyze Pages (4개 탭)
- **Overview**: 원형 차트로 알고리즘별 통계 표시
- **Algorithm Type**: 막대 그래프로 알고리즘 타입별 개수 표시
- **Details**: 파일별 상세 탐지 결과 (Executable/Source Code/PEM-KEY/ETC 분류)
- **LLM Orchestration**: 준비중

### 5. Quick Scan Pages
- 좌측: Folder Scan / File Scan 선택
- 우측: 선택된 스캔 타입별 인터페이스
- 파일/폴더 선택 후 스캔 시작

### 6. Full Scan Page
- 전체 시스템 스캔 인터페이스
- 스캔 시작 버튼만 제공

### 7. Loading Pages
- 실시간 스캔 진행률 표시
- 현재 스캔 중인 파일명 표시
- 진행률 바 및 시간 정보 (경과/예상 시간)

## 설치 및 실행
- 추후 작성 예정