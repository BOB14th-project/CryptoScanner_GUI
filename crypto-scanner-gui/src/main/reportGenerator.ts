import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
  osEnvData?: string;
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

function calculateSeverityCounts(detections: Detection[]): { high: number; mid: number; low: number; total: number } {
  return detections.reduce(
    (acc, detection) => {
      const severity = (detection.severity || '').toLowerCase();

      if (severity.includes('high') || severity.includes('critical')) {
        acc.high += 1;
      } else if (severity.includes('medium') || severity.includes('mid')) {
        acc.mid += 1;
      } else {
        // Treat unknown/info/low as low severity by default
        acc.low += 1;
      }

      acc.total += 1;
      return acc;
    },
    { high: 0, mid: 0, low: 0, total: 0 }
  );
}

function buildOsEnvData(scanResult: ScanResult, dbData: any): string {
  const fromScanResult = scanResult.osEnvData;
  if (typeof fromScanResult === 'string' && fromScanResult.trim()) {
    return fromScanResult.trim();
  }

  const envParts: string[] = [];
  const fileInfo = dbData?.file;
  const metadata = fileInfo?.metadata || fileInfo?.meta || fileInfo;

  if (metadata && typeof metadata === 'object') {
    const keyMap = [
      { key: 'os', label: 'OS' },
      { key: 'os_name', label: 'OS' },
      { key: 'os_version', label: 'OS Version' },
      { key: 'osVersion', label: 'OS Version' },
      { key: 'platform', label: 'Platform' },
      { key: 'kernel', label: 'Kernel' },
      { key: 'kernel_version', label: 'Kernel Version' },
      { key: 'architecture', label: 'Architecture' },
      { key: 'arch', label: 'Architecture' },
      { key: 'environment', label: 'Environment' },
      { key: 'env', label: 'Environment' },
    ];

    keyMap.forEach(({ key, label }) => {
      const value = (metadata as any)[key];
      if (value) {
        envParts.push(`${label}: ${value}`);
      }
    });
  }

  if (!envParts.length) {
    envParts.push(`Host: ${os.type()} ${os.release()} (${os.arch()})`);
  }

  return envParts.join('\n');
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
  detailContent: string;
  migrationGuide: string;
  osEnvData: string;
  findHighNum: number;
  findMidNum: number;
  findLowNum: number;
  findAllNum: number;
}> {
  const severityCounts = calculateSeverityCounts(scanResult.detections);
  const osEnvData = buildOsEnvData(scanResult, dbData);
  const totalFindings = severityCounts.total || scanResult.nonPqcCount || 0;

  // Gemini API 클라이언트 가져오기
  const genAI = getGeminiClient();

  if (!genAI) {
    console.warn('[Gemini] API not available. Using fallback content.');
    return {
      scanDate: formatScanDate(scanResult.date, scanResult.time),
      scanTarget: scanResult.filePath,
      detailContent: `총 ${scanResult.nonPqcCount}개의 Non-PQC 알고리즘이 발견되었습니다.\n\n발견된 알고리즘:\n${[...new Set(scanResult.detections.map(d => d.algorithm))].map(algo => `- ${algo}`).join('\n')}`,
      migrationGuide: '양자 내성 암호(PQC)로의 전환을 권장합니다. NIST에서 표준화한 CRYSTALS-Kyber, CRYSTALS-Dilithium 등의 알고리즘 사용을 고려하세요.',
      osEnvData,
      findHighNum: severityCounts.high,
      findMidNum: severityCounts.mid,
      findLowNum: severityCounts.low,
      findAllNum: totalFindings
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
      ? `\n**LLM Scan Results:**
- Vulnerability Status: ${scanResult.llmScanResult.isPqcVulnerable ? 'VULNERABLE' : 'SAFE'}
- Confidence Score: ${(scanResult.llmScanResult.confidenceScore * 100).toFixed(1)}%
- Detected Algorithms: ${scanResult.llmScanResult.detectedAlgorithms.join(', ') || 'None'}
- Scanned At: ${scanResult.llmScanResult.scannedAt}

**LLM Evidence:**
${scanResult.llmScanResult.evidence.substring(0, 2000)}${scanResult.llmScanResult.evidence.length > 2000 ? '\n... (truncated)' : ''}

**LLM Recommendations:**
${scanResult.llmScanResult.recommendations.substring(0, 2000)}${scanResult.llmScanResult.recommendations.length > 2000 ? '\n... (truncated)' : ''}`
      : '';

    const prompt = `You are an expert cryptography security analyst specializing in post-quantum cryptography (PQC) migration. Analyze the following scan results and generate a DETAILED, COMPREHENSIVE security report in Korean.

**Scan Information:**
- Scan Type: ${scanResult.type}
- Target Path: ${scanResult.filePath}
- Total Non-PQC Detections: ${scanResult.nonPqcCount}
- Severity Count (H/M/L): ${severityCounts.high}/${severityCounts.mid}/${severityCounts.low}
${osEnvData ? `- OS/Env: ${osEnvData.split('\n').join(' | ')}` : ''}
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

2. **상세 내용 (Detailed Content):**
   Create a COMPREHENSIVE, DETAILED analysis with:
   - **개요 (Overview)**: Summary of what was scanned and overall findings
   - **탐지된 알고리즘 상세 (Detected Algorithms Details)**: For EACH algorithm:
     * 알고리즘 설명 (What it is and how it works)
     * 보안 위험성 (Security risks, especially against quantum computers)
     * 탐지 위치 및 사용 컨텍스트 (Where found and how used)
     * 코드 증거 (Code evidence if available)
   - **위험도 평가 (Risk Assessment)**: Overall security risk level
   - Format: Use paragraphs, bullet points, and clear sections
   - Minimum 500 words in Korean
   - Be specific and technical

3. **전환 가이드 (Migration Guide):**
   Create a DETAILED, ACTIONABLE migration plan with:
   - **개요 (Overview)**: Why PQC migration is necessary
   - **알고리즘별 전환 방안 (Per-Algorithm Migration)**: For EACH detected algorithm:
     * 권장 PQC 대안 (Recommended PQC alternatives with technical specs)
     * 구체적 마이그레이션 단계 (Step-by-step migration process)
     * 코드 예시 (Before/After code examples if applicable)
     * 고려사항 (Performance, compatibility, security considerations)
   - **전환 우선순위 (Migration Priority)**: Which algorithms to migrate first
   - **테스트 및 검증 방법 (Testing & Validation)**
   - **참고 자료 (References)**: NIST standards, libraries, documentation
   - Format: Numbered steps with detailed explanations
   - Minimum 700 words in Korean
   - Be practical and implementable

**Output Format:**
Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "scanTarget": "exact file path only",
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

        const toNumber = (value: any, fallback: number) => {
          const num = Number(value);
          return Number.isFinite(num) ? num : fallback;
        };

        return {
          scanDate: formatScanDate(scanResult.date, scanResult.time),
          scanTarget: parsedResponse.scanTarget || scanResult.filePath,
          detailContent: parsedResponse.detailContent || '분석 결과를 생성할 수 없습니다.',
          migrationGuide: parsedResponse.migrationGuide || '마이그레이션 가이드를 생성할 수 없습니다.',
          osEnvData: parsedResponse.osEnvData || osEnvData,
          findHighNum: toNumber(parsedResponse.findHighNum, severityCounts.high),
          findMidNum: toNumber(parsedResponse.findMidNum, severityCounts.mid),
          findLowNum: toNumber(parsedResponse.findLowNum, severityCounts.low),
          findAllNum: toNumber(parsedResponse.findAllNum, totalFindings)
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
          const detailContent = extractField('detailContent', jsonStr);
          const migrationGuide = extractField('migrationGuide', jsonStr);
          const parsedOsEnv = extractField('osEnvData', jsonStr);

          if (scanTarget && detailContent && migrationGuide) {
            console.log('[Gemini] Successfully extracted fields using improved manual extraction');
            return {
              scanDate: formatScanDate(scanResult.date, scanResult.time),
              scanTarget: scanTarget,
              detailContent: detailContent,
              migrationGuide: migrationGuide,
              osEnvData: parsedOsEnv || osEnvData,
              findHighNum: severityCounts.high,
              findMidNum: severityCounts.mid,
              findLowNum: severityCounts.low,
              findAllNum: totalFindings
            };
          } else {
            console.error('[Gemini] Manual extraction failed - missing fields:', {
              scanTarget: !!scanTarget,
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
    return {
      scanDate: formatScanDate(scanResult.date, scanResult.time),
      scanTarget: scanResult.filePath,
      detailContent: `총 ${scanResult.nonPqcCount}개의 Non-PQC 알고리즘이 발견되었습니다.\n\n발견된 알고리즘:\n${[...new Set(scanResult.detections.map(d => d.algorithm))].map(algo => `- ${algo}`).join('\n')}\n\n각 알고리즘은 양자 컴퓨터 공격에 취약할 수 있으므로, PQC 알고리즘으로의 전환을 고려해야 합니다.`,
      migrationGuide: `양자 내성 암호(PQC)로의 전환을 권장합니다.\n\n권장 대안:\n- 키 교환: CRYSTALS-Kyber (NIST 표준)\n- 디지털 서명: CRYSTALS-Dilithium, FALCON (NIST 표준)\n- 해시 기반 서명: SPHINCS+ (NIST 표준)\n\n전환 단계:\n1. 현재 사용 중인 암호 알고리즘 목록 작성\n2. PQC 대안 알고리즘 선택\n3. 테스트 환경에서 마이그레이션 수행\n4. 성능 및 호환성 검증\n5. 단계적 프로덕션 적용`,
      osEnvData,
      findHighNum: severityCounts.high,
      findMidNum: severityCounts.mid,
      findLowNum: severityCounts.low,
      findAllNum: totalFindings
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
        detailContent: reportContent.detailContent,
        migrationGuide: reportContent.migrationGuide,
        osEnvData: reportContent.osEnvData,
        findHighNum: reportContent.findHighNum,
        findMidNum: reportContent.findMidNum,
        findLowNum: reportContent.findLowNum,
        findAllNum: reportContent.findAllNum,
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
    osEnvData: string;
    findHighNum: number;
    findMidNum: number;
    findLowNum: number;
    findAllNum: number;
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
      osEnvData: reportContent.osEnvData,
      findHighNum: reportContent.findHighNum,
      findMidNum: reportContent.findMidNum,
      findLowNum: reportContent.findLowNum,
      findAllNum: reportContent.findAllNum,
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
