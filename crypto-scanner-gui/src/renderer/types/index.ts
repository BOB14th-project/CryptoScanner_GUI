export interface ScanResult {
  id: string;
  date: string;
  time: string;
  type: 'QUICK_SCAN' | 'FULL_SCAN';
  filePath: string;
  nonPqcCount: number;
  fileCount: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  detections: Detection[];
}

export interface Detection {
  filePath: string;
  offset: number;
  algorithm: string;
  matchString: string;
  evidenceType: string;
  severity: string;
  fileSize?: number;
}

export interface ScanProgress {
  currentFile: string;
  filesDone?: number;
  filesTotal?: number;
  percentage?: number;
  timeElapsed?: number;
  timeRemaining?: number;
  detectionCount?: number;
}

export interface AlgorithmStats {
  name: string;
  count: number;
  color: string;
}

export type PageType =
  | 'start'
  | 'main'
  | 'result'
  | 'analyze'
  | 'quick-scan'
  | 'full-scan'
  | 'loading';

export type ScanType = 'folder' | 'file' | 'full';

export type TabType = 'overview' | 'algorithm' | 'details' | 'llm';

export interface AppState {
  currentPage: PageType;
  currentTab?: TabType;
  scanResults: ScanResult[];
  selectedResult?: ScanResult;
  scanProgress?: ScanProgress;
  isScanning: boolean;
}