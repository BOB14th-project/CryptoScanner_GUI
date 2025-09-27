import React, { useState, useEffect } from 'react';
import { PageType, ScanProgress, ScanType } from '../types';
import { formatDuration } from '../utils/storage';
import Header from '../components/Header';

interface LoadingPageProps {
  progress?: ScanProgress;
  scanType?: ScanType;
  onNavigate: (page: PageType) => void;
  onCancel: () => void;
}

const LoadingPage: React.FC<LoadingPageProps> = ({
  progress,
  scanType = 'full',
  onNavigate,
  onCancel
}) => {
  const [timeElapsed, setTimeElapsed] = useState(0);

  // Debug: Log progress updates
  useEffect(() => {
    if (progress) {
      console.log('LoadingPage received progress update:', progress);
    }
  }, [progress]);

  // Real timer starting from 0
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Use real progress data if available, otherwise show initial scanning state
  const currentProgress = progress || {
    currentFile: 'Initializing scan...',
    filesDone: 0,
    filesTotal: 0,
    percentage: 0,
    timeRemaining: 0,
    detectionCount: 0
  };

  // Calculate time remaining based on progress
  const calculateTimeRemaining = () => {
    if (!progress || !progress.percentage || progress.percentage <= 0) return 0;
    if (progress.percentage >= 100) return 0;

    const progressRate = progress.percentage / timeElapsed;
    const remainingProgress = 100 - progress.percentage;
    return Math.round(remainingProgress / progressRate);
  };

  const getScanTitle = () => {
    switch (scanType) {
      case 'folder': return 'FOLDER SCAN';
      case 'file': return 'FILE SCAN';
      case 'full': return 'FULL SCAN';
      default: return 'FULL SCAN';
    }
  };

  const getScanIcon = () => {
    switch (scanType) {
      case 'folder': return (
        <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" stroke="#FFFFFF" strokeWidth="2"/>
      );
      case 'file': return (
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="#FFFFFF" strokeWidth="2"/>
      );
      case 'full': return (
        <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" stroke="#FFFFFF" strokeWidth="2"/>
      );
      default: return (
        <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" stroke="#FFFFFF" strokeWidth="2"/>
      );
    }
  };

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      minWidth: '1200px',
      minHeight: '800px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* Scan Header */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '16px',
        gap: '8px',
        width: 'calc(3 * clamp(300px, 22vw, 371px) + 2 * clamp(20px, 2vw, 40px))',
        maxWidth: '1400px',
        height: '56px',
        marginBottom: '8vh',
        background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
        backgroundBlendMode: 'normal, overlay',
        boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
        backdropFilter: 'blur(10px)',
        borderRadius: '999px'
      }}>
        <span style={{
          fontFamily: 'SF Pro Rounded',
          fontStyle: 'normal',
          fontWeight: 600,
          fontSize: 'clamp(18px, 1.5vw, 24px)',
          lineHeight: '24px',
          color: '#FFFFFF'
        }}>{getScanTitle()}</span>
      </div>

      {/* Main Content Container */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 'clamp(20px, 2vw, 40px)',
        width: '100%',
        maxWidth: '1400px',
        padding: '0 2vw'
      }}>
        {/* Left Sidebar */}
        <div style={{
          width: 'clamp(300px, 22vw, 371px)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Scan Option */}
          <div style={{
            position: 'relative',
            height: '100px',
            background: 'rgba(255, 255, 255, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '18px',
            backdropFilter: 'blur(16px)'
          }}>
            <div style={{
              position: 'absolute',
              width: '24px',
              height: '24px',
              left: '20px',
              top: '16px'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                {getScanIcon()}
              </svg>
            </div>
            <div style={{
              position: 'absolute',
              left: '53px',
              top: '16px',
              fontFamily: 'SF Pro',
              fontWeight: 590,
              fontSize: '15px',
              color: '#FFFFFF'
            }}>{scanType === 'folder' ? 'Folder Scan' : scanType === 'file' ? 'File Scan' : 'Full Scan'}</div>
            <div style={{
              position: 'absolute',
              width: '25px',
              height: '25px',
              right: '25px',
              top: '62px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{
                fontSize: '11px',
                color: '#404040'
              }}>✓</span>
            </div>
          </div>
        </div>

        {/* Right Content - Scanning Progress */}
        <div style={{
          position: 'relative',
          height: 'clamp(400px, 46vh, 503px)',
          width: 'calc(2 * clamp(300px, 22vw, 371px) + clamp(20px, 2vw, 40px))',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '18px',
          backdropFilter: 'blur(16px)',
          padding: 'clamp(30px, 4vh, 40px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Scanning Header */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 'clamp(12px, 2vh, 16px)',
            width: '100%'
          }}>
            <div style={{
              width: 'clamp(60px, 8vw, 75px)',
              height: 'clamp(60px, 8vw, 75px)',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'clamp(24px, 3vw, 32px)'
            }}>
              🔍
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'clamp(4px, 1vh, 8px)',
              width: '100%',
              textAlign: 'left'
            }}>
              <h2 style={{
                fontFamily: 'SF Pro',
                fontWeight: 590,
                fontSize: 'clamp(24px, 3vw, 32px)',
                color: '#FFFFFF',
                margin: '0'
              }}>Scanning</h2>

              <div style={{
                fontFamily: 'SF Pro',
                fontSize: 'clamp(12px, 1.2vw, 14px)',
                color: 'rgba(255, 255, 255, 0.8)',
                wordBreak: 'break-all',
                lineHeight: '1.4'
              }}>
                File under inspection: {currentProgress.currentFile}
              </div>

              <div style={{
                fontFamily: 'SF Pro',
                fontSize: 'clamp(12px, 1.2vw, 14px)',
                color: 'rgba(255, 255, 255, 0.8)'
              }}>
                Detections found: {currentProgress.detectionCount || 0}
              </div>
            </div>
          </div>

          {/* Progress Bar and Stats */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(20px, 3vh, 30px)',
            width: '100%'
          }}>
            {/* Progress Bar */}
            <div style={{
              width: '100%',
              maxWidth: '600px',
              position: 'relative'
            }}>
              <div style={{
                width: '100%',
                height: '8px',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, currentProgress.percentage || 0))}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 100%)',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              {/* Percentage */}
              <div style={{
                position: 'absolute',
                top: '-60px',
                right: '0px',
                fontFamily: 'SF Pro',
                fontWeight: 600,
                fontSize: 'clamp(32px, 4vw, 48px)',
                color: '#FFFFFF',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
              }}>
                {Math.min(100, Math.max(0, currentProgress.percentage || 0))}%
              </div>
              {/* Time Info */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '8px',
                fontSize: 'clamp(12px, 1.2vw, 14px)',
                color: 'rgba(255, 255, 255, 0.8)'
              }}>
                <div>Time Elapsed: {formatDuration(timeElapsed)}</div>
                <div>Time remaining: {formatDuration(progress?.timeRemaining || calculateTimeRemaining())}</div>
              </div>
            </div>

            {/* File Count */}
            <div style={{
              textAlign: 'center',
              fontSize: 'clamp(14px, 1.4vw, 16px)',
              color: 'rgba(255, 255, 255, 0.9)'
            }}>
              Scanned file: {currentProgress.filesDone || 0} / {currentProgress.filesTotal || 0}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};

export default LoadingPage;