// API 클라이언트 유틸리티
// FastAPI 서버와 통신하기 위한 함수들

const API_BASE_URL = 'https://harper-abler-agape.ngrok-free.dev';

// Ngrok 관련 헤더 추가 (403 에러 방지)
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
};

// API 응답 타입 정의
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// 스캔 생성
export async function createScan(): Promise<ApiResponse<{ Scan_id: number }>> {
  try {
    const response = await fetch(`${API_BASE_URL}/scans/`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error creating scan:', error);
    return { success: false, error: (error as Error).message };
  }
}

// 파일 생성 및 스캔과 연결
export async function createFile(
  scanId: number,
  fileName: string,
  fileType: string,
  fileSize: number
): Promise<ApiResponse<{ File_id: number }>> {
  try {
    const response = await fetch(`${API_BASE_URL}/files/?scan_id=${scanId}`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        File_name: fileName,
        File_type: fileType,
        File_size: fileSize,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error creating file:', error);
    return { success: false, error: (error as Error).message };
  }
}

// 정적 분석 결과 저장
export async function saveStaticAnalysis(
  fileId: number,
  scanId: number,
  offset: number,
  algorithmName: string,
  match: string,
  detectionMethod: 'text' | 'oid' | 'parameter',
  severity: 'high' | 'medium' | 'low'
): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}/static/`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        File_id: fileId,
        Scan_id: scanId,
        Offset: offset,
        Algorithm_name: algorithmName,
        Match: match,
        Detection_method: detectionMethod,
        Severity: severity,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error saving static analysis:', error);
    return { success: false, error: (error as Error).message };
  }
}

// 동적 분석 결과 저장
export async function saveDynamicAnalysis(
  fileId: number,
  scanId: number,
  parameter: string | null,
  api: string | null,
  keyLength: number | null,
  algorithmName: string
): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}/dynamic/`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        File_id: fileId,
        Scan_id: scanId,
        Parameter: parameter,
        Api: api,
        Key_length: keyLength,
        Algorithm_name: algorithmName,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error saving dynamic analysis:', error);
    return { success: false, error: (error as Error).message };
  }
}

// LLM 어셈블리 파일 저장
export async function saveLLMAssembly(
  fileId: number,
  scanId: number,
  fileText: string
): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}/llm/`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        File_id: fileId,
        Scan_id: scanId,
        File_text: fileText,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error saving LLM assembly:', error);
    return { success: false, error: (error as Error).message };
  }
}

// LLM 분석 결과 저장
export async function saveLLMAnalysis(
  fileId: number,
  scanId: number,
  llmAnalysis: string
): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}/llm_analysis/`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        File_id: fileId,
        Scan_id: scanId,
        LLM_analysis: llmAnalysis,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error saving LLM analysis:', error);
    return { success: false, error: (error as Error).message };
  }
}

// LLM 코드 저장
export async function saveLLMCode(
  fileId: number,
  scanId: number,
  code: string
): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}/llm_code/`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        File_id: fileId,
        Scan_id: scanId,
        Code: code,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error saving LLM code:', error);
    return { success: false, error: (error as Error).message };
  }
}

// LLM 로그 저장
export async function saveLLMLog(
  fileId: number,
  scanId: number,
  log: string
): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}/llm_log/`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        File_id: fileId,
        Scan_id: scanId,
        Log: log,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error saving LLM log:', error);
    return { success: false, error: (error as Error).message };
  }
}

// 파일 상세 정보 조회
export async function getFileDetails(fileId: number): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}`, {
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error getting file details:', error);
    return { success: false, error: (error as Error).message };
  }
}

// 스캔별 파일 목록 조회
export async function getScanFiles(scanId: number): Promise<ApiResponse<any[]>> {
  try {
    const response = await fetch(`${API_BASE_URL}/scans/${scanId}/files`, {
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error getting scan files:', error);
    return { success: false, error: (error as Error).message };
  }
}

// 종합 결과 통계 조회
export async function getStats(): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/stats/`, {
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error getting stats:', error);
    return { success: false, error: (error as Error).message };
  }
}

// 스캔 ID별 종합 결과 통계 조회
export async function getStatsByScanId(scanId: number): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/stats/${scanId}/`, {
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error getting stats by scan ID:', error);
    return { success: false, error: (error as Error).message };
  }
}

// LLM 어셈블리 가져오기
export async function getLLMAssembly(fileId: number, scanId: number): Promise<ApiResponse<any[]>> {
  try {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}/llm/?scan_id=${scanId}`, {
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error getting LLM assembly:', error);
    return { success: false, error: (error as Error).message };
  }
}

// LLM 코드 가져오기
export async function getLLMCode(fileId: number, scanId: number): Promise<ApiResponse<any[]>> {
  try {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}/llm_code/?scan_id=${scanId}`, {
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error getting LLM code:', error);
    return { success: false, error: (error as Error).message };
  }
}

// LLM 로그 가져오기
export async function getLLMLog(fileId: number, scanId: number): Promise<ApiResponse<any[]>> {
  try {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}/llm_log/?scan_id=${scanId}`, {
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error getting LLM log:', error);
    return { success: false, error: (error as Error).message };
  }
}
