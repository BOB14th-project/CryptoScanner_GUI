import React, { useState, useEffect } from 'react';
import { PageType, ScanProgress } from '../types';
import { formatDuration } from '../utils/storage';
import Header from '../components/Header';

interface LoadingPageProps {
  progress?: ScanProgress;
  onNavigate: (page: PageType) => void;
  onCancel: () => void;
}

const LoadingPage: React.FC<LoadingPageProps> = ({
  progress,
  onNavigate,
  onCancel
}) => {
  const [timeElapsed, setTimeElapsed] = useState(0);

  // Real timer starting from 0
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Use real progress data if available, otherwise show scanning state
  const currentProgress = progress || {
    currentFile: 'Scanning...',
    detectionCount: 0
  };

  return (
    <div className="w-full h-full flex flex-col px-8 py-6">
      <Header title="FULL SCAN" onNavigate={onNavigate} showBackButton={false} showHomeButton={false} />

      <div className="flex-1 flex space-x-6 max-w-7xl mx-auto w-full">
        {/* Left Sidebar */}
        <div className="w-72">
          <div className="glassmorphism p-4 text-center">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 bg-blue-400/20 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <span className="text-white font-medium">Full Scan</span>
              <div className="ml-auto">
                <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Right Content - Scanning Progress */}
        <div className="flex-1 glassmorphism p-8">
          <div className="flex flex-col space-y-8">
            {/* Scanning Header */}
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-semibold text-white mb-2">Scanning</h2>
                <div className="flex justify-between text-sm">
                  <div className="text-white/80">
                    File under inspection: {currentProgress.currentFile}
                  </div>
                  <div className="text-white/80">
                    Detections found: {currentProgress.detectionCount || 0}
                  </div>
                </div>
              </div>
            </div>

            {/* Scanning Animation */}
            <div className="text-center">
              <div className="w-32 h-32 mx-auto mb-6">
                <svg className="w-full h-full animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className="text-white/60"/>
                </svg>
              </div>
              <div className="text-lg text-white/80">
                Scanning in progress...
              </div>
            </div>

            {/* Time Information */}
            <div className="flex justify-center">
              <div className="glassmorphism-dark px-6 py-3 rounded-lg">
                <div className="text-center">
                  <div className="text-white/60 text-sm mb-1">Time Elapsed</div>
                  <div className="text-white font-medium">
                    {formatDuration(timeElapsed)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Message */}
      <div className="mt-8 max-w-7xl mx-auto w-full">
        <div className="glassmorphism-dark p-4 text-center">
          <div className="flex items-center justify-center space-x-3">
            <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
            </svg>
            <span className="text-white/80 text-sm">
              Do not turn off the computer during scanning.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingPage;