import React from 'react';
import { PageType, ScanResult } from '../types';
import { generateId } from '../utils/storage';
import Header from '../components/Header';

interface FullScanPageProps {
  onNavigate: (page: PageType) => void;
  onStartScan: (isScanning: boolean) => void;
  onScanComplete: (result: ScanResult) => void;
}

const FullScanPage: React.FC<FullScanPageProps> = ({
  onNavigate,
  onStartScan,
  onScanComplete
}) => {
  const [error, setError] = React.useState<string | null>(null);

  const handleStartScan = async () => {
    // Temporarily disable FULL SCAN functionality
    alert('Full scan functionality is temporarily disabled. Please use Quick Scan instead.');
    return;

    /*
    try {
      setError(null);
      onStartScan(true);
      onNavigate('loading');

      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      // Call actual scan backend for full system scan
      const scanResult = await window.electronAPI.startScan({
        path: '/',
        type: 'full'
      });

      if (scanResult.success) {
        const now = new Date();
        const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
        const result: ScanResult = {
          id: generateId(),
          date: localDate.toISOString().split('T')[0],
          time: now.toISOString(),
          type: 'FULL_SCAN',
          filePath: '/',
          nonPqcCount: scanResult.nonPqcCount || 0,
          fileCount: scanResult.fileCount || 0,
          riskLevel: scanResult.nonPqcCount > 100 ? 'High' : scanResult.nonPqcCount > 20 ? 'Medium' : 'Low',
          detections: scanResult.detections || []
        };

        onScanComplete(result);
        onStartScan(false);
        onNavigate('result');
      } else {
        throw new Error(scanResult.error || 'Scan failed');
      }
    } catch (error) {
      console.error('Scan failed:', error);
      onStartScan(false);
      onNavigate('full-scan');
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    }
    */
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

        {/* FULL SCAN Header */}
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
          }}>FULL SCAN</span>
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
        {/* Left Sidebar - Full Scan Option */}
        <div style={{
          width: 'clamp(300px, 22vw, 371px)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Full Scan Option */}
          <div style={{
            position: 'relative',
            height: '100px',
            background: 'rgba(255, 255, 255, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '18px',
            backdropFilter: 'blur(16px)',
            cursor: 'default'
          }}>
            <div style={{
              position: 'absolute',
              width: '24px',
              height: '24px',
              left: '20px',
              top: '16px'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" stroke="#FFFFFF" strokeWidth="2"/>
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
            }}>Full Scan</div>
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
            FULL SCAN
          </h2>

          {/* Description */}
          <div style={{
            textAlign: 'center'
          }}>
            <p style={{
              fontFamily: 'SF Pro Rounded',
              fontWeight: 600,
              fontSize: 'clamp(16px, 1.5vw, 20px)',
              color: '#FFFFFF',
              margin: '0 0 8px 0'
            }}>
              Scan all files and folders on the entire device.
            </p>
            <p style={{
              fontFamily: 'SF Pro Rounded',
              fontWeight: 600,
              fontSize: 'clamp(16px, 1.5vw, 20px)',
              color: '#FFFFFF',
              margin: 0
            }}>
              It takes at least 20 minutes.
            </p>
          </div>


          {/* Scan Button */}
          <button
            onClick={handleStartScan}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              gap: '8px',
              width: 'clamp(240px, 18vw, 291px)',
              height: '56px',
              background: 'linear-gradient(0deg, rgba(87, 90, 123, 0.3), rgba(87, 90, 123, 0.3)), rgba(136, 128, 148, 0.5)',
              backgroundBlendMode: 'normal, overlay',
              boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
              backdropFilter: 'blur(10px)',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer'
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
  );
};

export default FullScanPage;