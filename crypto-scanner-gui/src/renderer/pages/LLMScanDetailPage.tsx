import React, { useState } from 'react';
import { FaChevronLeft, FaHome, FaRobot, FaCheckCircle, FaExclamationTriangle, FaDownload } from 'react-icons/fa';
import { ScanResult, LLMScanResult, FileLLMResult, PageType } from '../types';

interface LLMScanDetailPageProps {
  scanResult: ScanResult;
  onNavigate: (page: PageType) => void;
  onBack: () => void;
  onUpdateScanResult: (result: ScanResult) => void;
}

const LLMScanDetailPage: React.FC<LLMScanDetailPageProps> = ({
  scanResult,
  onNavigate,
  onBack,
  onUpdateScanResult,
}) => {
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const llmResult = scanResult.llmScanResult;

  if (!llmResult || !llmResult.isScanned) {
    return (
      <div style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFFFFF',
      }}>
        <p>No LLM scan results available.</p>
      </div>
    );
  }

  const handleGenerateComprehensiveReport = async () => {
    setIsGeneratingReport(true);
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const reportResult = await window.electronAPI.generateComprehensiveReport(scanResult);
      if (reportResult.success) {
        alert(`Comprehensive report generated successfully!\nSaved to: ${reportResult.path}`);
      } else {
        alert(`Failed to generate report: ${reportResult.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert(`Error generating report: ${error}`);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Check if it's a folder scan with multiple files
  const hasMultipleFiles = llmResult.fileResults && Object.keys(llmResult.fileResults).length > 0;

  return (
    <>
      <style>{`
        .llm-detail-main-scroll::-webkit-scrollbar {
          width: 8px;
        }

        .llm-detail-main-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .llm-detail-main-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
        }

        .llm-detail-main-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }

        .llm-detail-scroll::-webkit-scrollbar {
          width: 8px;
        }

        .llm-detail-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }

        .llm-detail-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
        }

        .llm-detail-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

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
            onClick={() => onNavigate('analyze')}
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
            <FaChevronLeft size={20} color="#FFFFFF" />
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
            <FaHome size={18} color="#FFFFFF" />
          </button>

          {/* LLM SCAN RESULT Header */}
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
            }}>LLM SCAN RESULT</span>
          </div>
        </div>

        {/* Main Content Container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(15px, 1.5vh, 20px)',
            width: 'calc(3 * clamp(300px, 22vw, 371px) + 2 * clamp(20px, 2vw, 40px))',
            maxWidth: '1400px',
            height: 'clamp(400px, 46vh, 503px)',
            overflow: 'hidden'
          }}>
          {/* Scan Summary Box - Full Width */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '18px',
            backdropFilter: 'blur(16px)',
            padding: 'clamp(15px, 2vh, 20px)',
            width: '100%',
            flexShrink: 0
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}>
              <FaRobot size={20} color="#FFFFFF" />
              <h2 style={{
                fontFamily: 'SF Pro Rounded',
                fontWeight: 600,
                fontSize: '20px',
                color: '#FFFFFF',
                margin: 0,
              }}>
                Scan Summary
              </h2>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '15px',
            }}>
              <div>
                <p style={{
                  fontFamily: 'SF Pro',
                  fontSize: '14px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  margin: '0 0 8px 0',
                }}>
                  Vulnerability Status
                </p>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  {llmResult.isPqcVulnerable ? (
                    <>
                      <FaExclamationTriangle size={20} color="#FF3B30" />
                      <span style={{
                        fontFamily: 'SF Pro Rounded',
                        fontSize: '18px',
                        fontWeight: 600,
                        color: '#FF3B30',
                      }}>
                        Vulnerable
                      </span>
                    </>
                  ) : (
                    <>
                      <FaCheckCircle size={20} color="#34C759" />
                      <span style={{
                        fontFamily: 'SF Pro Rounded',
                        fontSize: '18px',
                        fontWeight: 600,
                        color: '#34C759',
                      }}>
                        Safe
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div>
                <p style={{
                  fontFamily: 'SF Pro',
                  fontSize: '14px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  margin: '0 0 8px 0',
                }}>
                  Confidence Score
                </p>
                <span style={{
                  fontFamily: 'SF Pro Rounded',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                }}>
                  {(llmResult.confidenceScore * 100).toFixed(1)}%
                </span>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{
                  fontFamily: 'SF Pro',
                  fontSize: '14px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  margin: '0 0 8px 0',
                }}>
                  Detected Algorithms
                </p>
                <div>
                  {llmResult.detectedAlgorithms && llmResult.detectedAlgorithms.length > 0 ? (
                    llmResult.detectedAlgorithms.map((algo, idx) => (
                      <span key={idx} style={{
                        display: 'inline-block',
                        padding: '6px 12px',
                        margin: '4px',
                        background: 'rgba(255, 59, 48, 0.2)',
                        border: '1px solid rgba(255, 59, 48, 0.4)',
                        borderRadius: '12px',
                        fontFamily: 'SF Pro Rounded',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#FF3B30'
                      }}>
                        {algo}
                      </span>
                    ))
                  ) : (
                    <span style={{
                      fontFamily: 'SF Pro',
                      fontSize: '14px',
                      color: 'rgba(255, 255, 255, 0.6)',
                    }}>
                      No algorithms detected
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Evidence and Recommendations - Two Box Layout */}
          <div style={{
            display: 'flex',
            gap: 'clamp(20px, 2vw, 40px)',
            width: '100%',
            flex: 1,
            minHeight: 0
          }}>
            {/* Evidence Box - Left */}
            <div style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '18px',
              backdropFilter: 'blur(16px)',
              padding: 'clamp(15px, 2vh, 20px)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <h3 style={{
                fontFamily: 'SF Pro Rounded',
                fontWeight: 600,
                fontSize: '18px',
                color: '#FFFFFF',
                margin: '0 0 12px 0',
                flexShrink: 0
              }}>
                Evidence
              </h3>
              <div className="llm-detail-scroll" style={{
                flex: 1,
                overflowY: 'auto',
                paddingRight: '10px'
              }}>
                <pre style={{
                  fontFamily: 'SF Mono, Menlo, monospace',
                  fontSize: '12px',
                  color: 'rgba(255, 255, 255, 0.9)',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  margin: 0,
                  lineHeight: '1.5',
                }}>
                  {llmResult.evidence || 'No evidence available'}
                </pre>
              </div>
            </div>

            {/* Recommendations Box - Right */}
            <div style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '18px',
              backdropFilter: 'blur(16px)',
              padding: 'clamp(15px, 2vh, 20px)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <h3 style={{
                fontFamily: 'SF Pro Rounded',
                fontWeight: 600,
                fontSize: '18px',
                color: '#FFFFFF',
                margin: '0 0 12px 0',
                flexShrink: 0
              }}>
                Recommendations
              </h3>
              <div className="llm-detail-scroll" style={{
                flex: 1,
                overflowY: 'auto',
                paddingRight: '10px'
              }}>
                <p style={{
                  fontFamily: 'SF Pro',
                  fontSize: '13px',
                  color: 'rgba(255, 255, 255, 0.9)',
                  margin: 0,
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                }}>
                  {llmResult.recommendations || 'No recommendations available'}
                </p>
              </div>
            </div>
          </div>

          {/* Comprehensive Report Download Button */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
            flexShrink: 0
          }}>
            <button
              onClick={handleGenerateComprehensiveReport}
              disabled={isGeneratingReport}
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                height: '44px',
                background: isGeneratingReport
                  ? 'rgba(128, 128, 128, 0.5)'
                  : 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
                backgroundBlendMode: 'normal, overlay',
                boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
                backdropFilter: 'blur(10px)',
                borderRadius: '999px',
                border: 'none',
                cursor: isGeneratingReport ? 'not-allowed' : 'pointer',
                opacity: isGeneratingReport ? 0.6 : 1,
              }}
            >
              <FaDownload size={14} color="#FFFFFF" />
              <span style={{
                fontFamily: 'SF Pro Rounded',
                fontWeight: 600,
                fontSize: '14px',
                color: '#FFFFFF',
                whiteSpace: 'nowrap'
              }}>
                {isGeneratingReport ? 'Generating...' : 'Download Report'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Loading Modal */}
      {isGeneratingReport && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '24px',
            padding: '48px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              border: '4px solid rgba(255, 255, 255, 0.2)',
              borderTop: '4px solid #FFFFFF',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{
              fontFamily: 'SF Pro Rounded',
              fontSize: '18px',
              fontWeight: 600,
              color: '#FFFFFF',
              margin: 0,
            }}>
              Generating Comprehensive Report...
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default LLMScanDetailPage;
