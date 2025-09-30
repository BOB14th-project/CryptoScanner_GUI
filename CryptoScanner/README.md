# 📂 정적 탐지 백엔드 구조
<img width="7585" height="4697" alt="static_flowchart" src="https://github.com/user-attachments/assets/32bbcaa7-431b-4c5a-a2c9-d2507a5d8134" />
<br />

### 🔍 `patterns.json` 정적(패턴) 탐지 로직
1. 문자열 정규식(regex) : 파일 내 추출된 ASCII 문자열에 대해 정규식을 적용
2. 바이트 시그니처(bytes) : OID DER 인코딩, 곡선 소수/파라미터, 상수(basepoint) 등 바이트열 매칭
3. AST/바이트코드: Java, Python, C/C++, JAR/CLASS

### 📁 파일 별 역할
| 경로 | 역할 |
|:---:|---|
| `test_*/` | 테스트 파일 ||
| `third_party/` | miniz 라이브러리, tree-sitter 라이브러리 |
| `result/` | CSV 결과 저장 디렉터리(실행 시 자동 생성) |
| `patterns.json` | 탐지 규칙 정의(정규식/바이트/AST), 재빌드 없이 편집 가능 |
| `CryptoScanner.pro` | GUI qmake 프로젝트 파일 |
| `CryptoScannerCLI.pro` | CLI qmake 프로젝트 파일 |
| `mac_linux_amd_arm.sh` | MacOS(Apple Silicon), Linux(Debian/Ubuntu - AMD/ARM) 빌드 설정 |
| `windows_amd.bat` | Windows(AMD) 빌드 설정 |
| `gui_main_linux.cpp` | QT 기반(MacOS/Linux) |
| `main_gui_cli.cpp` | Console 기반(Windows) |
| `CryptoScanner.h/.cpp` | 경로 단위 스캔, 결과 수집/정규화, CSV 저장 |
| `FileScanner.h/.cpp` | 파일 열기/부분 읽기, 문자열 추출, 바이트 시그니처/정규식 매칭 |
| `PatternLoader.h/.cpp` | `patterns.json` 로딩/검증, 정규식 컴파일 옵션 처리 |
| `PatternDefinitions.h/.cpp` | 아직 큰 역할 없음, 풀백으로 사용 고민(현재 AST 풀백 코드 有) |
| `ASTSymbol.h` | AST Symbol tree-sitter을 통한 함수(심볼)에서 정규식 매칭 |
| `JavaASTScanner.h/.cpp` | Java 소스 코드 정적 규칙 탐지 |
| `JavaBytecodeScanner.h/.cpp` | `JAR/CLASS` 바이트코드 분석 |
| `PythonASTScanner.h/.cpp` | Python 소스 코드 정적 규칙 탐지 |
| `CppASTScanner.h/.cpp` | C/C++ 소스 코드 정적 규칙 탐지 |
| `DynLinkParser.h/.cpp` | 실행 파일의 동적 링크 정보 파싱, 엔디안 지원 |
