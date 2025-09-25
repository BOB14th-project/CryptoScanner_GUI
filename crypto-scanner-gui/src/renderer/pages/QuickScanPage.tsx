import React, { useState } from 'react';
import { PageType, ScanResult, ScanType } from '../types';
import { generateId } from '../utils/storage';
import Header from '../components/Header';

interface QuickScanPageProps {
  onNavigate: (page: PageType) => void;
  onStartScan: (isScanning: boolean, scanType?: ScanType) => void;
  onScanComplete: (result: ScanResult) => void;
}

const QuickScanPage: React.FC<QuickScanPageProps> = ({
  onNavigate,
  onStartScan,
  onScanComplete
}) => {
  const [scanType, setScanType] = useState<ScanType>('folder');
  const [selectedPath, setSelectedPath] = useState<string>('');

  const handleSelectPath = async () => {
    if (!window.electronAPI) return;

    try {
      const path = scanType === 'folder'
        ? await window.electronAPI.selectFolder()
        : await window.electronAPI.selectFile();

      if (path) {
        setSelectedPath(path);
      }
    } catch (error) {
      console.error('Failed to select path:', error);
    }
  };

  const handleStartScan = async () => {
    if (!selectedPath || !window.electronAPI) return;

    try {
      onStartScan(true, scanType);
      onNavigate('loading');

      // Add minimum delay to show loading screen
      const [scanResult] = await Promise.all([
        window.electronAPI.startScan({
          path: selectedPath,
          type: scanType
        }),
        new Promise(resolve => setTimeout(resolve, 2000)) // 2 second minimum delay
      ]);

      const now = new Date();
      const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
      const result: ScanResult = {
        id: generateId(),
        date: localDate.toISOString().split('T')[0],
        time: now.toISOString(),
        type: 'QUICK_SCAN',
        filePath: selectedPath,
        nonPqcCount: scanResult.nonPqcCount || 0,
        fileCount: scanResult.fileCount || (scanType === 'file' ? 1 : 0),
        riskLevel: scanResult.nonPqcCount > 50 ? 'High' : scanResult.nonPqcCount > 10 ? 'Medium' : 'Low',
        detections: scanResult.detections || []
      };

      onScanComplete(result);
      onStartScan(false, undefined);
      onNavigate('result');
    } catch (error) {
      console.error('Scan failed:', error);
      onStartScan(false, undefined);
      onNavigate('quick-scan');
      // Show error to user
      alert(`Scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      {/* Navigation and Header Container */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: 'calc(3 * clamp(300px, 22vw, 371px) + 2 * clamp(20px, 2vw, 40px))',
        maxWidth: '1400px',
        marginBottom: '8vh'
      }}>
        {/* Back Button */}
        <button
          onClick={() => onNavigate('main')}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '22px',
            background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
            backgroundBlendMode: 'normal, overlay',
            boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            flexShrink: 0
          }}
        >
          <span style={{
            fontSize: '27px',
            color: '#FFFFFF'
          }}>‹</span>
        </button>

        {/* Home Button */}
        <button
          onClick={() => onNavigate('main')}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '22px',
            background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
            backgroundBlendMode: 'normal, overlay',
            boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            flexShrink: 0
          }}
        >
          <span style={{
            fontSize: '22px',
            color: '#FFFFFF'
          }}>⌂</span>
        </button>

        {/* QUICK SCAN Header */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '16px',
          flex: 1,
          height: '56px',
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
          }}>QUICK SCAN</span>
        </div>
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
        {/* Left Sidebar - Scan Type Selection */}
        <div style={{
          width: 'clamp(300px, 22vw, 371px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(15px, 2vh, 34px)'
        }}>
          {/* Folder Scan Option */}
          <div style={{
            position: 'relative',
            height: '100px',
            background: scanType === 'folder' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '18px',
            backdropFilter: 'blur(16px)',
            cursor: 'pointer'
          }} onClick={() => setScanType('folder')}>
            <div style={{
              position: 'absolute',
              width: '24px',
              height: '24px',
              left: '20px',
              top: '16px'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" stroke="#FFFFFF" strokeWidth="2"/>
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
            }}>Folder Scan</div>
            {scanType === 'folder' && (
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
            )}
          </div>

          {/* File Scan Option */}
          <div style={{
            position: 'relative',
            height: '100px',
            background: scanType === 'file' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '18px',
            backdropFilter: 'blur(16px)',
            cursor: 'pointer'
          }} onClick={() => setScanType('file')}>
            <div style={{
              position: 'absolute',
              width: '24px',
              height: '24px',
              left: '20px',
              top: '16px'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="#FFFFFF" strokeWidth="2"/>
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
            }}>File Scan</div>
            {scanType === 'file' && (
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
            )}
          </div>
        </div>

        {/* Right Content - Main Scan Area */}
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
          {/* Circular Icon */}
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

          {/* Title */}
          <h2 style={{
            fontFamily: 'SF Pro',
            fontWeight: 590,
            fontSize: 'clamp(32px, 4vw, 40px)',
            color: '#FFFFFF',
            margin: 0,
            textAlign: 'center'
          }}>
            {scanType === 'folder' ? 'FOLDER SCAN' : 'FILE SCAN'}
          </h2>

          {/* Description */}
          <p style={{
            fontFamily: 'SF Pro Rounded',
            fontWeight: 600,
            fontSize: 'clamp(16px, 1.5vw, 20px)',
            color: '#FFFFFF',
            margin: 0,
            textAlign: 'center',
            maxWidth: '400px',
            whiteSpace: 'nowrap'
          }}>
            {scanType === 'folder' ? 'Scan all files in the folder.' : 'It scans only the selected single file.'}
          </p>

          {/* File Path Display */}
          {selectedPath && (
            <div style={{
              width: '100%',
              maxWidth: '522px',
              height: '36px',
              borderRadius: '18px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              gap: '8px'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" stroke="#8C8C8C" strokeWidth="2"/>
              </svg>
              <span style={{
                fontFamily: 'SF Pro',
                fontSize: '15px',
                color: '#FFFFFF',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                File Path: {selectedPath}
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            gap: 'clamp(15px, 2vw, 23px)'
          }}>
            <button
              onClick={handleSelectPath}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                gap: '8px',
                width: 'clamp(240px, 18vw, 291px)',
                height: '56px',
                background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
                backgroundBlendMode: 'normal, overlay',
                boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
                backdropFilter: 'blur(10px)',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" stroke="#FFFFFF" strokeWidth="2"/>
              </svg>
              <span style={{
                fontFamily: 'SF Pro Rounded',
                fontWeight: 600,
                fontSize: 'clamp(16px, 1.2vw, 20px)',
                color: '#FFFFFF'
              }}>Select {scanType === 'folder' ? 'Folder' : 'File'}</span>
            </button>

            <button
              onClick={handleStartScan}
              disabled={!selectedPath}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                gap: '8px',
                width: 'clamp(240px, 18vw, 291px)',
                height: '56px',
                background: selectedPath
                  ? 'linear-gradient(0deg, rgba(87, 90, 123, 0.3), rgba(87, 90, 123, 0.3)), rgba(136, 128, 148, 0.5)'
                  : 'rgba(100, 100, 100, 0.3)',
                backgroundBlendMode: 'normal, overlay',
                boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
                backdropFilter: 'blur(10px)',
                borderRadius: '999px',
                border: 'none',
                cursor: selectedPath ? 'pointer' : 'not-allowed',
                opacity: selectedPath ? 1 : 0.5
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="#FFFFFF" strokeWidth="2"/>
              </svg>
              <span style={{
                fontFamily: 'SF Pro Rounded',
                fontWeight: 600,
                fontSize: 'clamp(16px, 1.2vw, 20px)',
                color: '#FFFFFF'
              }}>Scan Start</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickScanPage;