import { ScanResult } from '../types';

const STORAGE_KEY = 'crypto-scanner-results';

export const loadScanResults = (): ScanResult[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    console.log('Loading scan results from localStorage:', saved);
    const results = saved ? JSON.parse(saved) : [];
    console.log('Parsed scan results:', results);
    return results;
  } catch (error) {
    console.error('Failed to load scan results:', error);
    return [];
  }
};

export const saveScanResults = (results: ScanResult[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
  } catch (error) {
    console.error('Failed to save scan results:', error);
  }
};

export const formatDate = (date: string): string => {
  const d = new Date(date);
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });
};

export const formatTime = (time: string): string => {
  const d = new Date(time);
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};