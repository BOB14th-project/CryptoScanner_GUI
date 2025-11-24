import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

interface LLMScanResult {
  isScanned: boolean;
  isPqcVulnerable: boolean;
  detectedAlgorithms: string[];
  confidenceScore: number;
  evidence: string;
  recommendations: string;
  reportId?: string;
  scannedAt: string;
  fileResults?: Record<string, any>;
}

interface ScanResult {
  id: string;
  date: string;
  time: string;
  type: string;
  filePath: string;
  nonPqcCount: number;
  detections: Detection[];
  dbFileId?: number;
  dbFileIds?: Record<string, number>;
  dbScanId?: number;
  llmScanResult?: LLMScanResult;
}

interface Detection {
  filePath: string;
  algorithm: string;
  evidenceType: string;
  severity: string;
  matchString: string;
  offset: number;
  detectionMethod: string;
  dynamicMatchString?: string;
  dynamicApi?: string;
  dynamicKey?: string;
  dynamicKeyLength?: number;
  dynamicIv?: string;
  dynamicIvLength?: number;
  dynamicTag?: string;
  dynamicTagLength?: number;
}

/**
 * Gemini API 클라이언트 가져오기 (lazy initialization)
 */
function getGeminiClient() {
  const apiKey = process.env.GOOGLE_API_KEY || '';
  if (!apiKey) {
    console.warn('[Gemini] GOOGLE_API_KEY not found in environment');
    return null;
  }
  console.log('[Gemini] Using API key:', apiKey.substring(0, 10) + '...');
  return new GoogleGenerativeAI(apiKey);
}

// DB API 설정
const DB_API_BASE_URL = process.env.DB_API_URL || 'https://harper-abler-agape.ngrok-free.dev';

/**
 * CSV 형식으로 데이터 변환
 */
function convertToCSV(detections: Detection[]): string {
  const headers = ['File Path', 'Algorithm', 'Evidence Type', 'Severity', 'Match String', 'Offset', 'Detection Method'];
  const rows: string[][] = [];

  detections.forEach(detection => {
    const baseRow = [
      detection.filePath || '',
      detection.algorithm || '',
      detection.evidenceType || '',
      detection.severity || '',
      detection.matchString || '',
      (detection.offset ?? 0).toString(),
      detection.detectionMethod || 'static'
    ];
    rows.push(baseRow);

    if (detection.detectionMethod === 'dynamic' || detection.detectionMethod === 'static+dynamic') {
      if (detection.dynamicApi || detection.dynamicMatchString) {
        rows.push([
          detection.filePath || '',
          detection.algorithm || '',
          'dynamic',
          detection.severity || '',
          `Dynamic API: ${detection.dynamicMatchString || detection.dynamicApi || detection.matchString || 'N/A'}`,
          (detection.offset ?? 0).toString(),
          'dynamic'
        ]);
      }
      if (detection.dynamicKey) {
        rows.push([
          detection.filePath || '',
          detection.algorithm || '',
          'dynamic',
          detection.severity || '',
          `Dynamic Key: ${detection.dynamicKey}`,
          (detection.offset ?? 0).toString(),
          'dynamic'
        ]);
      }
    }
  });

  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
  ].join('\n');
}

/**
 * DB에서 추가 데이터 가져오기
 */
async function fetchDatabaseData(scanResult: ScanResult): Promise<any> {
  try {
    // Use the database file ID if available, otherwise fall back to scan result ID
    let fileId: string | number = scanResult.id;

    // Check if we have database file IDs stored
    if (scanResult.dbFileIds && Object.keys(scanResult.dbFileIds).length > 0) {
      // For single file scans, use dbFileId if available
      if (scanResult.dbFileId) {
        fileId = scanResult.dbFileId;
      } else {
        // For folder scans, use the first file's database ID
        const firstFilePath = Object.keys(scanResult.dbFileIds)[0];
        fileId = scanResult.dbFileIds[firstFilePath];
      }
    } else if (scanResult.dbFileId) {
      fileId = scanResult.dbFileId;
    }

    console.log(`[DB] Fetching data for file ID: ${fileId} (type: ${typeof fileId})`);

    // 파일 정보 조회 (Static/Dynamic 분석 결과 포함)
    const fileResponse = await axios.get(`${DB_API_BASE_URL}/files/${fileId}`, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
    });

    console.log('[DB] File data retrieved successfully');

    // LLM 데이터 조회 (어셈블리 파일, 코드, 로그)
    let llmData: any = {};

    // Get scan_id from scanResult
    const scanId = scanResult.dbScanId;
    if (!scanId) {
      console.log('[DB] No scan_id available, skipping LLM data retrieval');
      return {
        file: fileResponse.data,
        llm: null,
      };
    }

    console.log(`[DB] Using scan_id: ${scanId} for LLM data retrieval`);

    try {
      const asmResponse = await axios.get(`${DB_API_BASE_URL}/files/${fileId}/llm/`, {
        params: { scan_id: scanId },
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });
      llmData.assembly = asmResponse.data;
      console.log('[DB] Assembly data retrieved');
    } catch (error: any) {
      console.log('[DB] No assembly file found:', error.response?.status || error.message);
    }

    try {
      const codeResponse = await axios.get(`${DB_API_BASE_URL}/files/${fileId}/llm_code/`, {
        params: { scan_id: scanId },
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });
      llmData.code = codeResponse.data;
      console.log('[DB] Code data retrieved');
    } catch (error: any) {
      console.log('[DB] No code file found:', error.response?.status || error.message);
    }

    try {
      const logResponse = await axios.get(`${DB_API_BASE_URL}/files/${fileId}/llm_log/`, {
        params: { scan_id: scanId },
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });
      llmData.log = logResponse.data;
      console.log('[DB] Log data retrieved');
    } catch (error: any) {
      console.log('[DB] No log file found:', error.response?.status || error.message);
    }

    return {
      file: fileResponse.data,
      llm: Object.keys(llmData).length > 0 ? llmData : null,
    };
  } catch (error: any) {
    console.error('[DB] Error fetching database data:', error.message);
    console.log('[DB] Using CSV data only');
    return null;
  }
}

/**
 * 날짜 포맷팅 함수
 */
function formatScanDate(date: string, time: string): string {
  try {
    // date는 "YYYY-MM-DD" 형식, time은 ISO 형식
    const dateObj = new Date(time);

    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');

    const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const weekday = weekdays[dateObj.getDay()];

    return `${year}.${month}.${day}. ${weekday} ${hours}:${minutes}`;
  } catch (error) {
    console.error('Error formatting date:', error);
    return `${date} ${time}`;
  }
}

/**
 * 파일 경로에서 파일명만 추출
 */
function getFileName(filePath: string): string {
  if (!filePath) return '';

  // Windows와 Unix 경로 모두 처리
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

/**
 * 탐지 결과를 표 형식으로 변환 (LLM 결과 포함)
 */
function convertDetectionsToTableRows(detections: Detection[], llmScanResult?: LLMScanResult): any[] {
  const rows: any[] = [];

  // 기존 탐지 결과 추가
  detections.forEach(detection => {
    rows.push({
      filePath: getFileName(detection.filePath || ''),
      algorithm: detection.algorithm || '',
      evidenceType: detection.evidenceType || '',
      severity: detection.severity || '',
      matchString: detection.matchString || '',
      offset: (detection.offset ?? 0).toString(),
      detectionMethod: detection.detectionMethod || 'static'
    });
  });

  // LLM 스캔 결과가 있고, 취약점이 발견된 경우 추가
  if (llmScanResult?.isScanned && llmScanResult.isPqcVulnerable && llmScanResult.detectedAlgorithms?.length > 0) {
    llmScanResult.detectedAlgorithms.forEach(algorithm => {
      // 이미 탐지된 알고리즘이 아닌 경우만 추가
      const alreadyDetected = detections.some(d =>
        d.algorithm.toLowerCase().includes(algorithm.toLowerCase()) ||
        algorithm.toLowerCase().includes(d.algorithm.toLowerCase())
      );

      if (!alreadyDetected) {
        rows.push({
          filePath: 'LLM Analysis',
          algorithm: algorithm,
          evidenceType: 'LLM Deep Analysis',
          severity: 'High',
          matchString: 'ASM/Code/Log 분석을 통해 탐지',
          offset: '-',
          detectionMethod: 'llm'
        });
      }
    });
  }

  return rows;
}

/**
 * 알고리즘별 권장 PQC 매핑
 */
function getRecommendedPQC(algorithm: string): string {
  const algo = algorithm.toLowerCase();

  // RSA 계열
  if (algo.includes('rsa')) {
    return 'CRYSTALS-Kyber (키 교환)\nCRYSTALS-Dilithium (서명)';
  }
  // ECDSA, ECDH 등 타원곡선 암호
  if (algo.includes('ecc') || algo.includes('ecdsa') || algo.includes('ecdh') ||
      algo.includes('curve') || algo.includes('secp') || algo.includes('prime256')) {
    return 'CRYSTALS-Kyber (키 교환)\nFALCON (서명)';
  }
  // DH, DHE
  if (algo.includes('dh') || algo.includes('diffie')) {
    return 'CRYSTALS-Kyber';
  }
  // DSA
  if (algo.includes('dsa')) {
    return 'CRYSTALS-Dilithium\nFALCON';
  }
  // SHA-1, MD5 등 해시
  if (algo.includes('sha') || algo.includes('md5') || algo.includes('md4') || algo.includes('rmd')) {
    return 'SHA-256/SHA-384\nSHA-3';
  }
  // AES, DES 등 대칭키 (보안 강도 2배 필요)
  if (algo.includes('aes') || algo.includes('des')) {
    return 'AES-256 (키 길이 증가)\nChaCha20-Poly1305';
  }

  // 기본값
  return 'NIST PQC 표준 알고리즘';
}

/**
 * 알고리즘별 마이그레이션 단계
 */
function getMigrationSteps(algorithm: string): string {
  const algo = algorithm.toLowerCase();

  // 공개키 암호 (RSA, ECC 등)
  if (algo.includes('rsa') || algo.includes('ecc') || algo.includes('ecdsa') ||
      algo.includes('ecdh') || algo.includes('curve') || algo.includes('dh')) {
    return '1) PQC 라이브러리 선정\n2) 하이브리드 모드 구현\n3) 테스트 환경 검증\n4) 단계적 배포';
  }

  // 해시 함수
  if (algo.includes('sha-1') || algo.includes('md5') || algo.includes('md4')) {
    return '1) SHA-256 이상으로 교체\n2) 코드 내 호출 부분 수정\n3) 테스트 수행\n4) 배포';
  }

  // 대칭키
  if (algo.includes('aes') || algo.includes('des')) {
    return '1) 키 길이 확인/증가\n2) 안전한 모드 사용\n3) 성능 테스트\n4) 배포';
  }

  // 기본값
  return '1) 현황 분석\n2) PQC 알고리즘 선정\n3) 테스트\n4) 배포';
}

/**
 * 전환 가이드 표 데이터 생성 (LLM 결과 포함)
 */
function generateMigrationTableRows(detections: Detection[], llmScanResult?: LLMScanResult): any[] {
  const algorithmMap = new Map<string, { severity: string; count: number; files: Set<string> }>();

  // 기존 탐지 결과 추가
  detections.forEach(detection => {
    const algo = detection.algorithm;
    if (!algorithmMap.has(algo)) {
      algorithmMap.set(algo, {
        severity: detection.severity,
        count: 0,
        files: new Set()
      });
    }
    const entry = algorithmMap.get(algo)!;
    entry.count++;
    entry.files.add(detection.filePath);
  });

  // LLM이 추가로 탐지한 알고리즘 추가
  if (llmScanResult?.isScanned && llmScanResult.isPqcVulnerable && llmScanResult.detectedAlgorithms?.length > 0) {
    llmScanResult.detectedAlgorithms.forEach(algorithm => {
      // 이미 탐지된 알고리즘이 아닌 경우만 추가
      const alreadyDetected = detections.some(d =>
        d.algorithm.toLowerCase().includes(algorithm.toLowerCase()) ||
        algorithm.toLowerCase().includes(d.algorithm.toLowerCase())
      );

      if (!alreadyDetected) {
        algorithmMap.set(algorithm, {
          severity: 'High',
          count: 1,
          files: new Set(['LLM Analysis'])
        });
      }
    });
  }

  const rows: any[] = [];
  algorithmMap.forEach((info, algorithm) => {
    rows.push({
      currentAlgorithm: algorithm,
      severity: info.severity,
      detectionCount: info.count.toString(),
      affectedFiles: info.files.size.toString(),
      recommendedPQC: getRecommendedPQC(algorithm),
      migrationSteps: getMigrationSteps(algorithm)
    });
  });

  return rows;
}

/**
 * 탐지 수치 계산 (LLM 결과 포함)
 */
function calculateDetectionCounts(detections: Detection[], llmScanResult?: LLMScanResult): {
  findHighNum: number;
  findMidNum: number;
  findLowNum: number;
  findAllNum: number;
} {
  let findHighNum = 0;
  let findMidNum = 0;
  let findLowNum = 0;

  // 기존 탐지 결과 카운팅
  detections.forEach(detection => {
    const severity = (detection.severity || '').toLowerCase();

    if (severity.includes('high') || severity.includes('심각')) {
      findHighNum++;
    } else if (severity.includes('medium') || severity.includes('med') || severity.includes('경고')) {
      findMidNum++;
    } else if (severity.includes('low') || severity.includes('낮음')) {
      findLowNum++;
    }
  });

  // LLM이 추가로 탐지한 알고리즘 카운팅
  if (llmScanResult?.isScanned && llmScanResult.isPqcVulnerable && llmScanResult.detectedAlgorithms?.length > 0) {
    llmScanResult.detectedAlgorithms.forEach(algorithm => {
      // 이미 탐지된 알고리즘이 아닌 경우만 카운팅
      const alreadyDetected = detections.some(d =>
        d.algorithm.toLowerCase().includes(algorithm.toLowerCase()) ||
        algorithm.toLowerCase().includes(d.algorithm.toLowerCase())
      );

      if (!alreadyDetected) {
        // LLM이 탐지한 알고리즘은 기본적으로 High로 카운팅
        findHighNum++;
      }
    });
  }

  return {
    findHighNum,
    findMidNum,
    findLowNum,
    findAllNum: detections.length + (llmScanResult?.isScanned && llmScanResult.isPqcVulnerable ?
      llmScanResult.detectedAlgorithms.filter(algo =>
        !detections.some(d =>
          d.algorithm.toLowerCase().includes(algo.toLowerCase()) ||
          algo.toLowerCase().includes(d.algorithm.toLowerCase())
        )
      ).length : 0)
  };
}

/**
 * Gemini API를 사용하여 보고서 내용 생성
 */
async function generateReportContent(
  scanResult: ScanResult,
  csvData: string,
  dbData: any
): Promise<{
  scanDate: string;
  scanTarget: string;
  detectionSummary: string;
  asisContent: string;
  tobeContent: string;
  detailContent: string;
  migrationGuide: string;
  detectionTableRows: any[];
  migrationTableRows: any[];
  findHighNum: number;
  findMidNum: number;
  findLowNum: number;
  findAllNum: number;
}> {
  // 탐지 수치 계산 (LLM 결과 포함)
  const detectionCounts = calculateDetectionCounts(scanResult.detections, scanResult.llmScanResult);

  // 표 데이터 생성 (LLM 스캔 결과 포함)
  const detectionTableRows = convertDetectionsToTableRows(scanResult.detections, scanResult.llmScanResult);
  const migrationTableRows = generateMigrationTableRows(scanResult.detections, scanResult.llmScanResult);

  // Gemini API 클라이언트 가져오기
  const genAI = getGeminiClient();

  if (!genAI) {
    console.warn('[Gemini] API not available. Using fallback content.');

    const algorithms = [...new Set(scanResult.detections.map(d => d.algorithm))];

    return {
      scanDate: formatScanDate(scanResult.date, scanResult.time),
      scanTarget: scanResult.filePath,
      detectionSummary: `총 ${scanResult.nonPqcCount}개의 Non-PQC 알고리즘이 발견되었습니다.\n심각도: High ${detectionCounts.findHighNum}건, Medium ${detectionCounts.findMidNum}건, Low ${detectionCounts.findLowNum}건\n주요 발견 알고리즘: ${algorithms.slice(0, 3).join(', ')}\n양자 컴퓨터 시대에 대비한 PQC 전환이 시급합니다.`,
      asisContent: `현재 시스템에서는 ${algorithms.slice(0, 2).join(', ')} 등 기존 암호 알고리즘이 사용되고 있습니다.\n이러한 알고리즘은 양자 컴퓨터의 Shor 알고리즘 공격에 취약합니다.\n특히 공개키 암호 시스템은 대규모 양자 컴퓨터가 실용화되면 수 시간 내에 해독될 수 있습니다.\n대칭키 암호의 경우에도 Grover 알고리즘으로 인해 보안 강도가 절반으로 감소합니다.\n현재 상태로는 향후 5-10년 내 심각한 보안 위협에 직면할 수 있습니다.\n즉각적인 PQC 전환 계획 수립이 필요합니다.`,
      tobeContent: `NIST 표준 PQC 알고리즘으로 전환하여 양자내성 보안 체계를 구축해야 합니다.\n키 교환에는 CRYSTALS-Kyber, 디지털 서명에는 CRYSTALS-Dilithium 또는 FALCON을 적용할 것을 권장합니다.\n이를 통해 양자 컴퓨터 공격에도 안전한 128비트 이상의 보안 강도를 확보할 수 있습니다.\n하이브리드 암호 방식을 도입하여 기존 시스템과의 호환성을 유지하면서 단계적으로 전환할 수 있습니다.\nNIST 표준을 준수함으로써 국제 규정 및 보안 인증 요구사항을 충족할 수 있습니다.\n장기적으로 안전한 암호 시스템 운영이 가능합니다.`,
      detailContent: `스캔 개요:\n총 ${scanResult.nonPqcCount}개의 비양자내성 암호 알고리즘이 탐지되었습니다.\n심각도별 분포는 High ${detectionCounts.findHighNum}건, Medium ${detectionCounts.findMidNum}건, Low ${detectionCounts.findLowNum}건입니다.\n\n주요 탐지 알고리즘:\n${algorithms.slice(0, 4).map(algo => {
        const count = scanResult.detections.filter(d => d.algorithm === algo).length;
        return `- ${algo}: ${count}건 탐지\n  양자 컴퓨터 공격에 취약하며 즉각적인 전환이 필요합니다.`;
      }).join('\n')}\n\n위험도 평가:\n전체적으로 ${detectionCounts.findHighNum > 0 ? '높은' : detectionCounts.findMidNum > 0 ? '중간' : '낮은'} 수준의 양자 위협이 존재합니다.\n조속한 PQC 전환 계획 수립 및 실행이 권장됩니다.`,
      migrationGuide: `PQC 전환 가이드\n\n개요:\n양자 컴퓨터의 발전으로 기존 암호 체계가 위협받고 있습니다. NIST는 2024년부터 PQC 표준을 공식 채택하였으며, 산업계 전반의 전환이 진행 중입니다. 본 시스템도 즉각적인 전환 계획 수립이 필요합니다.\n\n주요 알고리즘 전환 방안:\n${algorithms.slice(0, 3).map((algo, i) => `\n${i+1}. ${algo} 전환:\n   - 권장 PQC: CRYSTALS-Kyber (키 교환) 또는 CRYSTALS-Dilithium (서명)\n   - 단계: ① 라이브러리 선정 → ② 테스트 환경 구축 → ③ 호환성 검증 → ④ 단계적 배포\n   - 고려사항: 기존 시스템과의 호환성, 성능 영향 평가`).join('\n')}\n\n전환 우선순위:\nHigh 심각도 항목부터 우선 전환을 시작하고, 단계적으로 전체 시스템에 적용합니다.\n\n테스트 방법:\n- PQC 라이브러리 정상 동작 확인\n- 기존 데이터 호환성 테스트\n- 성능 벤치마크 수행\n- 보안 감사 실시\n\n참고 자료:\n- NIST PQC 표준: csrc.nist.gov/projects/post-quantum-cryptography\n- CRYSTALS 라이브러리: pq-crystals.org`,
      detectionTableRows,
      migrationTableRows,
      ...detectionCounts
    };
  }

  try {
    console.log('[Gemini] Starting content generation...');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    // 알고리즘별 탐지 정보 정리
    const algorithmSummary = scanResult.detections.reduce((acc: any, detection) => {
      if (!acc[detection.algorithm]) {
        acc[detection.algorithm] = {
          count: 0,
          files: new Set(),
          methods: new Set(),
          evidences: []
        };
      }
      acc[detection.algorithm].count++;
      acc[detection.algorithm].files.add(detection.filePath);
      acc[detection.algorithm].methods.add(detection.detectionMethod);
      if (detection.matchString) {
        acc[detection.algorithm].evidences.push(detection.matchString);
      }
      return acc;
    }, {});

    const algorithmInfo = Object.entries(algorithmSummary).map(([algo, info]: [string, any]) =>
      `- ${algo}: ${info.count}회 탐지 (${Array.from(info.methods).join(', ')} 분석)`
    ).join('\n');

    // Include LLM scan results if available
    const llmScanInfo = scanResult.llmScanResult?.isScanned
      ? `\n**LLM Deep Analysis Results:**
- Vulnerability Status: ${scanResult.llmScanResult.isPqcVulnerable ? 'VULNERABLE (High Risk)' : 'SAFE'}
- Confidence Score: ${(scanResult.llmScanResult.confidenceScore * 100).toFixed(1)}%
- Additional Algorithms Detected by LLM: ${scanResult.llmScanResult.detectedAlgorithms.join(', ') || 'None'}
- Analysis Date: ${scanResult.llmScanResult.scannedAt}
- Analysis Methods: ASM code analysis, Source code analysis, Execution logs analysis

**LLM Evidence (ASM/Code/Log Analysis):**
${scanResult.llmScanResult.evidence.substring(0, 2000)}${scanResult.llmScanResult.evidence.length > 2000 ? '\n... (truncated)' : ''}

**LLM Expert Recommendations:**
${scanResult.llmScanResult.recommendations.substring(0, 2000)}${scanResult.llmScanResult.recommendations.length > 2000 ? '\n... (truncated)' : ''}

**IMPORTANT:** Include LLM-detected algorithms in your detailed content analysis!`
      : '';

    const prompt = `You are an expert cryptography security analyst specializing in post-quantum cryptography (PQC) migration. Analyze the following scan results and generate a DETAILED, COMPREHENSIVE security report in Korean.

**Scan Information:**
- Scan Type: ${scanResult.type}
- Target Path: ${scanResult.filePath}
- Total Non-PQC Detections: ${scanResult.nonPqcCount}
- High Severity: ${detectionCounts.findHighNum}
- Medium Severity: ${detectionCounts.findMidNum}
- Low Severity: ${detectionCounts.findLowNum}
${scanResult.llmScanResult?.isScanned ? `- LLM Scan Performed: Yes\n- Overall Vulnerability: ${scanResult.llmScanResult.isPqcVulnerable ? 'High Risk' : 'Low Risk'}` : ''}

**Detected Algorithms Summary:**
${algorithmInfo}

**Detailed Detection Data (CSV):**
${csvData.split('\n').slice(0, 50).join('\n')}
${csvData.split('\n').length > 50 ? '\n... (truncated for brevity)' : ''}

${dbData?.file ? `\n**Database File Information:**\n${JSON.stringify(dbData.file, null, 2).substring(0, 1500)}` : ''}
${dbData?.llm?.assembly ? `\n**Assembly Code Available:** Yes (${typeof dbData.llm.assembly === 'string' ? dbData.llm.assembly.length : 'available'} bytes)` : ''}
${dbData?.llm?.code ? `\n**Source Code Available:** Yes` : ''}
${dbData?.llm?.log ? `\n**Analysis Logs Available:** Yes` : ''}
${llmScanInfo}

**IMPORTANT INSTRUCTIONS:**

1. **스캔 대상 (Scan Target):**
   - Return ONLY the file path: "${scanResult.filePath}"
   - Do NOT add any additional text or descriptions

2. **탐지 요약 (Detection Summary):**
   - Create a concise 10-line summary of the scan results
   - Focus on: total detections, severity distribution, main vulnerabilities, and overall risk assessment
   - Be clear and actionable
   - Maximum 10 lines in Korean

3. **AS-IS 내용 (Current State):**
   - Describe the current cryptographic implementation status like a security consultant
   - Analyze what non-PQC algorithms are being used and their vulnerabilities
   - Explain the security risks in the current quantum computing era
   - **IMPORTANT: Write EXACTLY 5-6 sentences in Korean**
   - **FORMAT: Add a newline (\\n) after each sentence (after each period)**
   - Be professional, concise, and impactful
   - Each sentence should be meaningful and complete

4. **TO-BE 내용 (Target State):**
   - Describe the recommended PQC security architecture like a security consultant
   - Explain how the system should look after PQC migration
   - Include security benefits and compliance with NIST standards
   - **IMPORTANT: Write EXACTLY 5-6 sentences in Korean**
   - **FORMAT: Add a newline (\\n) after each sentence (after each period)**
   - Be professional, concise, and impactful
   - Each sentence should be meaningful and complete

5. **상세 내용 (Detailed Content):**
   Create a CONCISE, FOCUSED analysis with:
   - **개요 (Overview)**: Brief summary of scan findings (2-3 sentences)
   - **주요 탐지 알고리즘 (Main Detected Algorithms)**: For top 3-4 algorithms only:
     * 알고리즘 설명 (Brief description)
     * 보안 위험성 (Security risks against quantum computers)
     * 탐지 현황 (Detection summary)
   - **위험도 평가 (Risk Assessment)**: Overall security risk level (2-3 sentences)
   - **IMPORTANT: Write EXACTLY 20-25 lines in Korean**
   - Format: Use bullet points and clear, concise statements
   - Be specific but brief

6. **전환 가이드 (Migration Guide):**
   Create a FOCUSED, ACTIONABLE migration plan with:
   - **개요 (Overview)**: Why PQC migration is necessary (3-4 sentences)
   - **주요 알고리즘 전환 방안 (Key Algorithm Migration)**: For top 3-4 detected algorithms only:
     * 권장 PQC 대안 (Recommended PQC alternatives)
     * 마이그레이션 단계 (Step-by-step migration - 3-5 steps per algorithm)
     * 주요 고려사항 (Key considerations)
   - **전환 우선순위 (Migration Priority)**: Brief priority ranking (2-3 sentences)
   - **테스트 방법 (Testing)**: Quick testing checklist (3-5 items)
   - **참고 자료 (References)**: Essential NIST standards and documentation only
   - **IMPORTANT: Total content should fit within 1.5 pages (approximately 800-1000 words in Korean)**
   - Format: Use numbered lists and bullet points for readability
   - Be practical and concise

**Output Format:**
Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "scanTarget": "exact file path only",
  "detectionSummary": "10-line Korean summary",
  "asisContent": "detailed Korean AS-IS analysis",
  "tobeContent": "detailed Korean TO-BE recommendations",
  "detailContent": "detailed Korean content with proper formatting",
  "migrationGuide": "detailed Korean content with proper formatting"
}

Remember: Be THOROUGH, SPECIFIC, and TECHNICAL. This report will be used by developers to actually migrate their code.`;

    console.log('[Gemini] Sending request to API...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log('[Gemini] Response received, length:', text.length);
    console.log('[Gemini] Response preview:', text.substring(0, 500));

    // JSON 파싱 (마크다운 코드 블록 제거)
    let jsonText = text.trim();

    // Remove markdown code blocks
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    // Try to find and extract JSON object using a more robust regex
    // Match from first { to last }
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      let jsonStr = jsonText.substring(firstBrace, lastBrace + 1);

      // Remove control characters (0x00-0x1F except \n, \r, \t) that break JSON parsing
      // Also normalize line breaks and remove any other problematic characters
      jsonStr = jsonStr
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // Remove control chars
        .replace(/\r\n/g, '\\n') // Normalize Windows line breaks
        .replace(/\r/g, '\\n')   // Normalize Mac line breaks
        .replace(/\n/g, '\\n')   // Escape remaining newlines
        .replace(/\t/g, '\\t');  // Escape tabs

      try {
        // First attempt: parse as-is
        const parsedResponse = JSON.parse(jsonStr);
        console.log('[Gemini] Successfully parsed response');

        return {
          scanDate: formatScanDate(scanResult.date, scanResult.time),
          scanTarget: parsedResponse.scanTarget || scanResult.filePath,
          detectionSummary: parsedResponse.detectionSummary || '스캔 결과 요약을 생성할 수 없습니다.',
          asisContent: parsedResponse.asisContent || '현재 상태 분석을 생성할 수 없습니다.',
          tobeContent: parsedResponse.tobeContent || '목표 상태 분석을 생성할 수 없습니다.',
          detailContent: parsedResponse.detailContent || '분석 결과를 생성할 수 없습니다.',
          migrationGuide: parsedResponse.migrationGuide || '마이그레이션 가이드를 생성할 수 없습니다.',
          detectionTableRows,
          migrationTableRows,
          ...detectionCounts
        };
      } catch (firstError) {
        console.log('[Gemini] First parse attempt failed, trying to save raw response');
        console.error('[Gemini] Parse error:', firstError);

        // Write the raw response to a temp file for debugging
        const tempFile = process.platform === 'win32'
          ? path.join(process.env.TEMP || 'C:\\Temp', 'gemini_response.json')
          : '/tmp/gemini_response.json';
        try {
          fs.writeFileSync(tempFile, jsonStr);
          console.log(`[Gemini] Saved raw response to ${tempFile} for debugging`);
        } catch (writeErr) {
          console.error('[Gemini] Could not save debug file:', writeErr);
        }

        // Improved fallback: manually extract fields with better handling of escaped content
        try {
          // Helper function to extract a field value, handling escaped quotes
          const extractField = (fieldName: string, jsonString: string): string | null => {
            const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"`, 'i');
            const startMatch = jsonString.match(pattern);

            if (!startMatch || startMatch.index === undefined) {
              return null;
            }

            const startIndex = startMatch.index + startMatch[0].length;
            let endIndex = startIndex;
            let inEscape = false;

            // Find the closing quote, accounting for escaped quotes
            while (endIndex < jsonString.length) {
              const char = jsonString[endIndex];

              if (inEscape) {
                inEscape = false;
                endIndex++;
                continue;
              }

              if (char === '\\') {
                inEscape = true;
                endIndex++;
                continue;
              }

              if (char === '"') {
                break;
              }

              endIndex++;
            }

            if (endIndex >= jsonString.length) {
              return null;
            }

            const rawValue = jsonString.substring(startIndex, endIndex);

            // Decode escaped sequences using JSON.parse for proper handling
            try {
              return JSON.parse(`"${rawValue}"`);
            } catch {
              // Fallback: manual unescape
              return rawValue
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t')
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\');
            }
          };

          const scanTarget = extractField('scanTarget', jsonStr);
          const detectionSummary = extractField('detectionSummary', jsonStr);
          const asisContent = extractField('asisContent', jsonStr);
          const tobeContent = extractField('tobeContent', jsonStr);
          const detailContent = extractField('detailContent', jsonStr);
          const migrationGuide = extractField('migrationGuide', jsonStr);

          if (scanTarget && detectionSummary && asisContent && tobeContent && detailContent && migrationGuide) {
            console.log('[Gemini] Successfully extracted fields using improved manual extraction');
            return {
              scanDate: formatScanDate(scanResult.date, scanResult.time),
              scanTarget: scanTarget,
              detectionSummary: detectionSummary,
              asisContent: asisContent,
              tobeContent: tobeContent,
              detailContent: detailContent,
              migrationGuide: migrationGuide,
              detectionTableRows,
              migrationTableRows,
              ...detectionCounts
            };
          } else {
            console.error('[Gemini] Manual extraction failed - missing fields:', {
              scanTarget: !!scanTarget,
              detectionSummary: !!detectionSummary,
              asisContent: !!asisContent,
              tobeContent: !!tobeContent,
              detailContent: !!detailContent,
              migrationGuide: !!migrationGuide
            });
          }
        } catch (extractError) {
          console.error('[Gemini] Manual extraction error:', extractError);
        }

        // If all attempts fail, throw error
        throw new Error(`Failed to parse Gemini response - JSON malformed: ${firstError}`);
      }
    } else {
      console.error('[Gemini] No JSON object found in response');
      throw new Error('Failed to parse Gemini response - no JSON found');
    }
  } catch (error) {
    console.error('[Gemini] Error generating report content:', error);

    // Fallback: 기본 내용 반환
    const algorithms = [...new Set(scanResult.detections.map(d => d.algorithm))];

    return {
      scanDate: formatScanDate(scanResult.date, scanResult.time),
      scanTarget: scanResult.filePath,
      detectionSummary: `총 ${scanResult.nonPqcCount}개의 Non-PQC 알고리즘이 발견되었습니다.\n심각도: High ${detectionCounts.findHighNum}건, Medium ${detectionCounts.findMidNum}건, Low ${detectionCounts.findLowNum}건\n주요 발견 알고리즘: ${algorithms.slice(0, 3).join(', ')}\n양자 컴퓨터 시대에 대비한 PQC 전환이 시급합니다.`,
      asisContent: `현재 시스템에서는 ${algorithms.slice(0, 2).join(', ')} 등 기존 암호 알고리즘이 사용되고 있습니다.\n이러한 알고리즘은 양자 컴퓨터의 Shor 알고리즘 공격에 취약합니다.\n특히 공개키 암호 시스템은 대규모 양자 컴퓨터가 실용화되면 수 시간 내에 해독될 수 있습니다.\n대칭키 암호의 경우에도 Grover 알고리즘으로 인해 보안 강도가 절반으로 감소합니다.\n현재 상태로는 향후 5-10년 내 심각한 보안 위협에 직면할 수 있습니다.\n즉각적인 PQC 전환 계획 수립이 필요합니다.`,
      tobeContent: `NIST 표준 PQC 알고리즘으로 전환하여 양자내성 보안 체계를 구축해야 합니다.\n키 교환에는 CRYSTALS-Kyber, 디지털 서명에는 CRYSTALS-Dilithium 또는 FALCON을 적용할 것을 권장합니다.\n이를 통해 양자 컴퓨터 공격에도 안전한 128비트 이상의 보안 강도를 확보할 수 있습니다.\n하이브리드 암호 방식을 도입하여 기존 시스템과의 호환성을 유지하면서 단계적으로 전환할 수 있습니다.\nNIST 표준을 준수함으로써 국제 규정 및 보안 인증 요구사항을 충족할 수 있습니다.\n장기적으로 안전한 암호 시스템 운영이 가능합니다.`,
      detailContent: `스캔 개요:\n총 ${scanResult.nonPqcCount}개의 비양자내성 암호 알고리즘이 탐지되었습니다.\n심각도별 분포는 High ${detectionCounts.findHighNum}건, Medium ${detectionCounts.findMidNum}건, Low ${detectionCounts.findLowNum}건입니다.\n\n주요 탐지 알고리즘:\n${algorithms.slice(0, 4).map(algo => {
        const count = scanResult.detections.filter(d => d.algorithm === algo).length;
        return `- ${algo}: ${count}건 탐지\n  양자 컴퓨터 공격에 취약하며 즉각적인 전환이 필요합니다.`;
      }).join('\n')}\n\n위험도 평가:\n전체적으로 ${detectionCounts.findHighNum > 0 ? '높은' : detectionCounts.findMidNum > 0 ? '중간' : '낮은'} 수준의 양자 위협이 존재합니다.\n조속한 PQC 전환 계획 수립 및 실행이 권장됩니다.`,
      migrationGuide: `PQC 전환 가이드\n\n개요:\n양자 컴퓨터의 발전으로 기존 암호 체계가 위협받고 있습니다. NIST는 2024년부터 PQC 표준을 공식 채택하였으며, 산업계 전반의 전환이 진행 중입니다. 본 시스템도 즉각적인 전환 계획 수립이 필요합니다.\n\n주요 알고리즘 전환 방안:\n${algorithms.slice(0, 3).map((algo, i) => `\n${i+1}. ${algo} 전환:\n   - 권장 PQC: CRYSTALS-Kyber (키 교환) 또는 CRYSTALS-Dilithium (서명)\n   - 단계: ① 라이브러리 선정 → ② 테스트 환경 구축 → ③ 호환성 검증 → ④ 단계적 배포\n   - 고려사항: 기존 시스템과의 호환성, 성능 영향 평가`).join('\n')}\n\n전환 우선순위:\nHigh 심각도 항목부터 우선 전환을 시작하고, 단계적으로 전체 시스템에 적용합니다.\n\n테스트 방법:\n- PQC 라이브러리 정상 동작 확인\n- 기존 데이터 호환성 테스트\n- 성능 벤치마크 수행\n- 보안 감사 실시\n\n참고 자료:\n- NIST PQC 표준: csrc.nist.gov/projects/post-quantum-cryptography\n- CRYSTALS 라이브러리: pq-crystals.org`,
      detectionTableRows,
      migrationTableRows,
      ...detectionCounts
    };
  }
}

/**
 * DOCX 보고서 생성 (템플릿 기반)
 */
export async function generateReport(scanResult: ScanResult, outputPath: string): Promise<string> {
  try {
    // 1. CSV 데이터 생성
    const csvData = convertToCSV(scanResult.detections);

    // 2. DB에서 추가 데이터 가져오기 (선택적)
    let dbData = null;
    try {
      dbData = await fetchDatabaseData(scanResult);
    } catch (error) {
      console.log('Using CSV data only (DB not available)');
    }

    // 3. Gemini API로 보고서 내용 생성
    const reportContent = await generateReportContent(scanResult, csvData, dbData);

    // 4. 템플릿 파일 경로 (dist/main/LLM-Report에서 찾기)
    const templatePath = path.join(__dirname, 'LLM-Report', 'CryptoScanner_Report.docx');

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    // 5. 템플릿 파일 읽기
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);

    // 6. Docxtemplater로 템플릿 처리
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // 7. 템플릿 렌더링 (업데이트된 API)
    try {
      doc.render({
        scanDate: reportContent.scanDate,
        scanTarget: reportContent.scanTarget,
        detectionSummary: reportContent.detectionSummary,
        asisContent: reportContent.asisContent,
        tobeContent: reportContent.tobeContent,
        findHighNum: reportContent.findHighNum,
        findMidNum: reportContent.findMidNum,
        findLowNum: reportContent.findLowNum,
        findAllNum: reportContent.findAllNum,
        detectionRows: reportContent.detectionTableRows,
        migrationRows: reportContent.migrationTableRows,
        detailContent: reportContent.detailContent,
        migrationGuide: reportContent.migrationGuide,
      });
    } catch (error: any) {
      console.error('Template rendering error:', error);
      const e = {
        message: error.message,
        name: error.name,
        stack: error.stack,
        properties: error.properties,
      };
      console.error('Error details:', JSON.stringify(e, null, 2));
      throw error;
    }

    // 9. 결과 파일 생성
    const buf = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    // 10. 파일로 저장
    fs.writeFileSync(outputPath, buf);

    console.log('Report generated successfully:', outputPath);

    // 11. DB에 LLM_analysis 저장 (보고서 생성 성공 후)
    try {
      await saveLLMAnalysisToDatabase(scanResult, reportContent);
    } catch (dbError) {
      console.error('[DB] Failed to save LLM analysis to database:', dbError);
      // DB 저장 실패는 보고서 생성 자체를 막지 않음
    }

    return outputPath;
  } catch (error) {
    console.error('Error generating report:', error);
    throw error;
  }
}

/**
 * DB에 LLM 분석 결과 저장
 */
async function saveLLMAnalysisToDatabase(
  scanResult: ScanResult,
  reportContent: {
    scanDate: string;
    scanTarget: string;
    detailContent: string;
    migrationGuide: string;
  }
): Promise<void> {
  try {
    // Determine file ID
    let fileId: string | number = scanResult.id;

    if (scanResult.dbFileIds && Object.keys(scanResult.dbFileIds).length > 0) {
      if (scanResult.dbFileId) {
        fileId = scanResult.dbFileId;
      } else {
        const firstFilePath = Object.keys(scanResult.dbFileIds)[0];
        fileId = scanResult.dbFileIds[firstFilePath];
      }
    } else if (scanResult.dbFileId) {
      fileId = scanResult.dbFileId;
    }

    // Determine scan ID - DB Scan ID가 없으면 파일에서 조회
    let scanId = scanResult.dbScanId;

    if (!scanId) {
      console.warn('[DB] No dbScanId found in scanResult, fetching from file data...');
      try {
        // 파일 정보를 조회하여 기존 Scan ID를 가져옴
        const fileResponse = await axios.get(
          `${DB_API_BASE_URL}/files/${fileId}`,
          {
            headers: {
              'ngrok-skip-browser-warning': 'true',
            },
          }
        );

        // 파일에 연결된 스캔이 있으면 첫 번째 스캔 ID 사용
        if (fileResponse.data.scans && fileResponse.data.scans.length > 0) {
          scanId = fileResponse.data.scans[0].Scan_id;
          console.log('[DB] Found existing scan ID from file:', scanId);
        } else {
          // 스캔이 없으면 새로 생성
          console.log('[DB] No existing scan found, creating new scan...');
          const scanResponse = await axios.post(
            `${DB_API_BASE_URL}/scans/`,
            {},
            {
              headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true',
              },
            }
          );
          scanId = scanResponse.data.Scan_id;
          console.log('[DB] Created new scan with ID:', scanId);
        }
      } catch (error) {
        console.error('[DB] Failed to get/create scan:', error);
        throw new Error('Failed to determine scan ID for LLM analysis');
      }
    }

    console.log(`[DB] Saving LLM analysis for file ID: ${fileId}, scan ID: ${scanId}`);

    // LLM_analysis 데이터 생성 (전체 리포트 내용을 JSON으로 저장)
    const llmAnalysisData = JSON.stringify({
      scanDate: reportContent.scanDate,
      scanTarget: reportContent.scanTarget,
      detailContent: reportContent.detailContent,
      migrationGuide: reportContent.migrationGuide,
      generatedAt: new Date().toISOString(),
    });

    // DB API 호출 - scanId(정수) 사용
    const response = await axios.post(
      `${DB_API_BASE_URL}/files/${fileId}/llm_analysis/`,
      {
        File_id: fileId,
        Scan_id: scanId,
        LLM_analysis: llmAnalysisData,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
      }
    );

    console.log('[DB] LLM analysis saved successfully:', response.data);
  } catch (error: any) {
    console.error('[DB] Error saving LLM analysis:', error.message);
    if (error.response) {
      console.error('[DB] Error response:', error.response.data);
      console.error('[DB] Error status:', error.response.status);
    }
    throw error;
  }
}
