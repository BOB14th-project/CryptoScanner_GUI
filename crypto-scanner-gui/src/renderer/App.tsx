import React, { useState, useEffect } from 'react';
import { AppState, PageType, ScanResult, ScanType } from './types';
import StartPage from './pages/StartPage';
import MainPage from './pages/MainPage';
import ResultPage from './pages/ResultPage';
import AnalyzePage from './pages/AnalyzePage';
import QuickScanPage from './pages/QuickScanPage';
import FullScanPage from './pages/FullScanPage';
import LoadingPage from './pages/LoadingPage';
import { loadScanResults, saveScanResults } from './utils/storage';
import backgroundImage from './assets/images/CryptoScanner.jpg';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    currentPage: 'start',
    scanResults: [],
    isScanning: false,
  });
  const [pageHistory, setPageHistory] = useState<PageType[]>(['start']);
  const [currentScanType, setCurrentScanType] = useState<ScanType>('full');

  useEffect(() => {
    // Load saved scan results on app start
    let savedResults = loadScanResults();

    // Add test data if no results exist (for debugging - remove this in production)
    if (savedResults.length === 0) {
      const testResult = {
        id: "test-result-demo",
        date: "2025-09-23",
        time: "2025-09-23T11:50:00.000Z",
        type: 'QUICK_SCAN' as const,
        filePath: "Demo Test Data - Previous Scan Result",
        nonPqcCount: 4,
        fileCount: 1,
        riskLevel: "High" as const,
        detections: [
          {
            filePath: "Demo Test Data",
            algorithm: "RSA",
            severity: "Medium",
            evidenceType: "binary",
            matchString: "text_pattern",
            offset: 0
          },
          {
            filePath: "Demo Test Data",
            algorithm: "DES",
            severity: "High",
            evidenceType: "binary",
            matchString: "text_pattern",
            offset: 0
          }
        ]
      };
      savedResults = [testResult];
      // Don't save test data to localStorage immediately
    }

    setAppState(prev => ({ ...prev, scanResults: savedResults }));

    // Set up scan progress listener
    if (window.electronAPI) {
      window.electronAPI.onScanProgress((event, progressData) => {
        updateScanProgress(progressData);
      });

      // Cleanup listener on unmount
      return () => {
        window.electronAPI.removeAllListeners('scan-progress');
      };
    }
  }, []);

  const navigateToPage = (page: PageType) => {
    setAppState(prev => ({ ...prev, currentPage: page }));
    setPageHistory(prev => [...prev, page]);
  };

  const goBack = () => {
    if (pageHistory.length > 1) {
      const newHistory = [...pageHistory];
      newHistory.pop(); // Remove current page
      const previousPage = newHistory[newHistory.length - 1];
      setPageHistory(newHistory);
      setAppState(prev => ({ ...prev, currentPage: previousPage }));
    }
  };

  const selectResult = (result: ScanResult) => {
    setAppState(prev => ({
      ...prev,
      selectedResult: result,
      currentPage: 'analyze'
    }));
  };

  const addScanResult = (result: ScanResult) => {
    console.log('Adding scan result:', result);
    const updatedResults = [result, ...appState.scanResults];
    console.log('Updated results:', updatedResults);
    setAppState(prev => ({
      ...prev,
      scanResults: updatedResults
    }));
    saveScanResults(updatedResults);
    console.log('Scan result saved to localStorage');
  };

  const updateScanProgress = (progress: any) => {
    setAppState(prev => ({
      ...prev,
      scanProgress: progress
    }));
  };

  const setScanning = (isScanning: boolean) => {
    setAppState(prev => ({ ...prev, isScanning }));
  };

  const renderCurrentPage = () => {
    switch (appState.currentPage) {
      case 'start':
        return <StartPage onNavigate={navigateToPage} />;
      case 'main':
        return <MainPage onNavigate={navigateToPage} onGoBack={goBack} />;
      case 'result':
        return (
          <ResultPage
            scanResults={appState.scanResults}
            onNavigate={navigateToPage}
            onSelectResult={selectResult}
          />
        );
      case 'analyze':
        return (
          <AnalyzePage
            result={appState.selectedResult!}
            onNavigate={navigateToPage}
          />
        );
      case 'quick-scan':
        return (
          <QuickScanPage
            onNavigate={navigateToPage}
            onStartScan={(isScanning, scanType) => {
              setScanning(isScanning);
              if (scanType) setCurrentScanType(scanType);
            }}
            onScanComplete={addScanResult}
          />
        );
      case 'full-scan':
        return (
          <FullScanPage
            onNavigate={navigateToPage}
            onStartScan={(isScanning) => {
              setScanning(isScanning);
              setCurrentScanType('full');
            }}
            onScanComplete={addScanResult}
          />
        );
      case 'loading':
        return (
          <LoadingPage
            progress={appState.scanProgress}
            scanType={currentScanType}
            onNavigate={navigateToPage}
            onCancel={() => {
              setScanning(false);
              navigateToPage('main');
            }}
          />
        );
      default:
        return <StartPage onNavigate={navigateToPage} />;
    }
  };

  return (
    <div
      className="w-full h-full bg-cover bg-center bg-no-repeat bg-fixed"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat',
        minHeight: '100vh'
      }}
    >
      {renderCurrentPage()}
    </div>
  );
};

export default App;