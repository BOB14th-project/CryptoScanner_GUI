import React, { useState } from 'react';
import { PageType, ScanResult, TabType } from '../types';

interface AnalyzePageProps {
  result: ScanResult;
  onNavigate: (page: PageType) => void;
}

const AnalyzePage: React.FC<AnalyzePageProps> = ({ result, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const handleSaveCsv = async () => {
    if (window.electronAPI) {
      const csvData = generateCsvData(result);
      await window.electronAPI.saveCsv(csvData);
    }
  };

  const generateCsvData = (result: ScanResult): string => {
    const headers = ['File Path', 'Algorithm', 'Evidence Type', 'Severity', 'Match String'];
    const rows = result.detections.map(detection => [
      detection.filePath,
      detection.algorithm,
      detection.evidenceType,
      detection.severity,
      detection.matchString.replace(/"/g, '""')
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  };

  const CircleChart = () => {
    const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

    const handleMouseEnter = (segment: string) => {
      setHoveredSegment(segment);
    };

    const handleMouseMove = (event: React.MouseEvent) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };

    const handleMouseLeave = () => {
      setHoveredSegment(null);
    };

    return (
      <div style={{
        position: 'relative',
        width: 'clamp(150px, 20vw, 200px)',
        height: 'clamp(150px, 20vw, 200px)',
        margin: '0 auto'
      }}>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 200 200"
          onMouseMove={handleMouseMove}
        >
          <circle
            cx="100" cy="100" r="80"
            fill="rgba(247, 247, 247, 0.6)"
            opacity="0.3"
          />
          <circle
            cx="100" cy="100" r="70"
            fill="none"
            stroke="#5856D6"
            strokeWidth="12"
            strokeDasharray="200 440"
            strokeDashoffset="0"
            transform="rotate(-90 100 100)"
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => handleMouseEnter('RSA: 60%')}
            onMouseLeave={handleMouseLeave}
          />
          <circle
            cx="100" cy="100" r="70"
            fill="none"
            stroke="#00C0E8"
            strokeWidth="12"
            strokeDasharray="80 440"
            strokeDashoffset="-200"
            transform="rotate(-90 100 100)"
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => handleMouseEnter('ECC: 10%')}
            onMouseLeave={handleMouseLeave}
          />
          <circle
            cx="100" cy="100" r="70"
            fill="none"
            stroke="#0088FF"
            strokeWidth="12"
            strokeDasharray="120 440"
            strokeDashoffset="-280"
            transform="rotate(-90 100 100)"
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => handleMouseEnter('AES: 30%')}
            onMouseLeave={handleMouseLeave}
          />
        </svg>

        {/* Center Text */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none'
        }}>
          <div style={{
            fontFamily: 'SF Pro',
            fontWeight: 700,
            fontSize: 'clamp(18px, 2.5vw, 24px)',
            color: '#FFFFFF',
            lineHeight: '1.2'
          }}>
            {hoveredSegment ? hoveredSegment.split(': ')[1] : '100%'}
          </div>
          <div style={{
            fontFamily: 'SF Pro',
            fontWeight: 500,
            fontSize: 'clamp(12px, 1.5vw, 14px)',
            color: 'rgba(255, 255, 255, 0.7)',
            marginTop: '2px'
          }}>
            {hoveredSegment ? hoveredSegment.split(': ')[0] : 'Total'}
          </div>
        </div>
      </div>
    );
  };

  // Generate bar chart data based on overview algorithms
  const generateBarChartData = () => {
    // Sample data based on overview - in real implementation, this would come from backend
    const algorithms = [
      { name: 'RSA', count: 23, color: '#5856D6' },
      { name: 'AES-128', count: 9, color: '#0088FF' },
      { name: 'ECC', count: 15, color: '#00C0E8' },
      { name: 'MD5', count: 21, color: '#FF6B35' },
      { name: 'DSA', count: 4, color: '#32D74B' },
      { name: '3DES', count: 14, color: '#FFD60A' },
      { name: 'SEED', count: 26, color: '#FF453A' }
    ];

    const maxCount = Math.max(...algorithms.map(algo => algo.count));

    return algorithms.map(algo => ({
      ...algo,
      percentage: (algo.count / maxCount) * 100
    }));
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'algorithm':
        const chartData = generateBarChartData();
        return (
          <div style={{
            padding: '30px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              height: '160px',
              gap: '30px',
              paddingBottom: '5px',
              width: '100%',
              maxWidth: '600px',
              marginTop: '30px'
            }}>
              {chartData.map((algo, index) => (
                <div key={algo.name} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  height: '100%'
                }}>
                  {/* Count label on top */}
                  <div style={{
                    position: 'absolute',
                    transform: 'translateY(-25px)',
                    background: `linear-gradient(145deg, ${algo.color}CC, ${algo.color}FF)`,
                    backdropFilter: 'blur(10px)',
                    borderRadius: '50%',
                    width: '30px',
                    height: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.2)'
                  }}>
                    {algo.count}
                  </div>

                  {/* Bar with liquid glass effect */}
                  <div style={{
                    width: '60px',
                    height: `${algo.percentage}%`,
                    background: `linear-gradient(145deg, ${algo.color}50, ${algo.color}90)`,
                    backdropFilter: 'blur(20px)',
                    borderRadius: '12px 12px 6px 6px',
                    marginTop: 'auto',
                    transition: 'all 0.3s ease',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.2), inset 2px 2px 4px rgba(255, 255, 255, 0.1), inset -2px -2px 4px rgba(0, 0, 0, 0.1)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    {/* Inner glow effect */}
                    <div style={{
                      position: 'absolute',
                      top: '0',
                      left: '0',
                      right: '0',
                      height: '30%',
                      background: `linear-gradient(180deg, ${algo.color}30, transparent)`,
                      borderRadius: '12px 12px 0 0'
                    }} />
                  </div>

                  {/* Algorithm name */}
                  <div style={{
                    fontFamily: 'SF Pro',
                    fontSize: '12px',
                    color: '#FFFFFF',
                    marginTop: '8px',
                    fontWeight: '500'
                  }}>
                    {algo.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'details':
        return <div style={{ padding: '20px', color: '#FFFFFF' }}>Details content - file listings</div>;
      case 'llm':
        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '300px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '60px', marginBottom: '16px' }}>🔧</div>
              <p style={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '18px',
                fontFamily: 'SF Pro'
              }}>Preparing...</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <style>{`
        .analyze-container {
          position: relative;
          width: 100vw;
          height: 100vh;
          min-width: 1200px;
          min-height: 800px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding-top: 17.5vh;
        }

        @media (min-width: 1400px) {
          .analyze-container {
            padding-top: 20.5vh;
          }
        }

        .analyze-header {
          display: flex;
          align-items: center;
          gap: 8px;
          width: calc(3 * clamp(300px, 24vw, 371px) + 2 * clamp(20px, 2vw, 40px));
          max-width: 1400px;
          margin-bottom: 6.4vh;
        }

        @media (min-width: 1400px) {
          .analyze-header {
            margin-bottom: 8vh;
          }
        }

        .overview-container {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          gap: clamp(20px, 2vw, 40px);
          width: calc(3 * clamp(304px, 24vw, 371px) + 2 * clamp(20px, 2vw, 40px));
          max-width: 1400px;
        }

        @media (min-width: 1400px) {
          .overview-container {
            width: calc(3 * clamp(304px, 24vw, 371px) + 2 * clamp(20px, 2.15vw, 40px));
          }
        }
      `}</style>
      <div className="analyze-container">
      {/* Navigation and Header Container */}
      <div className="analyze-header">
        {/* Back Button */}
        <button
          onClick={() => onNavigate('result')}
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

        {/* RESULT Header */}
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
          }}>RESULT</span>
        </div>
      </div>

      {/* Stats Bar - 4 boxes */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 'clamp(20px, 2vw, 40px)',
        width: 'calc(3 * clamp(304px, 22vw, 371px) + 2 * clamp(20px, 2vw, 40px))',
        maxWidth: '1400px',
        marginBottom: 'clamp(10px, 2.8vh, 30px)'
      }}>
        {/* Non-PQC */}
        <div style={{
          height: '100px',
          width: 'clamp(200px, 18vw, 264px)',
          background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
          backgroundBlendMode: 'normal, overlay',
          boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
          backdropFilter: 'blur(10px)',
          borderRadius: '18px',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '15px'
          }}>
            <span style={{ fontSize: '32px' }}>🛡️</span>
          </div>
          <div>
            <div style={{
              fontFamily: 'SF Pro Rounded',
              fontWeight: 600,
              fontSize: '15px',
              color: '#FFFFFF',
              marginBottom: '5px'
            }}>Non-PQC</div>
            <div style={{
              fontFamily: 'SF Pro Rounded',
              fontWeight: 700,
              fontSize: '32px',
              color: '#FFFFFF'
            }}>6,789</div>
          </div>
        </div>

        {/* File Count */}
        <div style={{
          height: '100px',
          width: 'clamp(200px, 18vw, 264px)',
          background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
          backgroundBlendMode: 'normal, overlay',
          boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
          backdropFilter: 'blur(10px)',
          borderRadius: '18px',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '15px'
          }}>
            <span style={{ fontSize: '32px' }}>📄</span>
          </div>
          <div>
            <div style={{
              fontFamily: 'SF Pro Rounded',
              fontWeight: 600,
              fontSize: '15px',
              color: '#FFFFFF',
              marginBottom: '5px'
            }}>File</div>
            <div style={{
              fontFamily: 'SF Pro Rounded',
              fontWeight: 700,
              fontSize: '32px',
              color: '#FFFFFF'
            }}>234</div>
          </div>
        </div>

        {/* Risk Level */}
        <div style={{
          height: '100px',
          width: 'clamp(200px, 18vw, 264px)',
          background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
          backgroundBlendMode: 'normal, overlay',
          boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
          backdropFilter: 'blur(10px)',
          borderRadius: '18px',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '15px'
          }}>
            <span style={{ fontSize: '32px' }}>⚠️</span>
          </div>
          <div>
            <div style={{
              fontFamily: 'SF Pro Rounded',
              fontWeight: 600,
              fontSize: '15px',
              color: '#FFFFFF',
              marginBottom: '5px'
            }}>Risk level</div>
            <div style={{
              fontFamily: 'SF Pro Rounded',
              fontWeight: 700,
              fontSize: '32px',
              color: '#FFFFFF'
            }}>High</div>
          </div>
        </div>

        {/* Date and CSV Button Container */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          width: 'clamp(200px, 18vw, 264px)'
        }}>
          {/* Date */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '8px 16px',
            height: '40px',
            background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
            backgroundBlendMode: 'normal, overlay',
            boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
            backdropFilter: 'blur(10px)',
            borderRadius: '999px'
          }}>
            <span style={{
              fontFamily: 'SF Pro Rounded',
              fontWeight: 600,
              fontSize: '15px',
              color: '#FFFFFF'
            }}>{result.date}</span>
          </div>

          {/* CSV File Save */}
          <button
            onClick={handleSaveCsv}
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '8px 16px',
              height: '40px',
              background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
              backgroundBlendMode: 'normal, overlay',
              boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
              backdropFilter: 'blur(10px)',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <span style={{
              fontFamily: 'SF Pro Rounded',
              fontWeight: 600,
              fontSize: '15px',
              color: '#FFFFFF'
            }}>CSV File Save</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        padding: '4px',
        width: 'calc(3 * clamp(304px, 22vw, 371px) + 2 * clamp(20px, 2vw, 40px))',
        maxWidth: '1400px',
        marginBottom: 'clamp(10px, 2.8vh, 30px)',
        background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
        backgroundBlendMode: 'normal, overlay',
        boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
        backdropFilter: 'blur(10px)',
        borderRadius: '999px'
      }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'algorithm', label: 'Algorithm Type' },
          { id: 'details', label: 'Details' },
          { id: 'llm', label: 'LLM Orchestration' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            style={{
              flex: 1,
              padding: '8px 18px',
              height: '36px',
              borderRadius: '100px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === tab.id ? '#EDEDED' : 'transparent',
              fontFamily: 'SF Pro',
              fontWeight: activeTab === tab.id ? 700 : 510,
              fontSize: '15px',
              color: activeTab === tab.id ? 'rgba(34, 43, 89, 0.63)' : '#404040'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' ? (
        <div className="overview-container">
          {/* Left - Algorithm Chart */}
          <div style={{
            height: 'clamp(200px, 28vh, 294px)',
            width: 'calc((100% - clamp(20px, 3vw, 40px)) / 2)',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(16px)',
            borderRadius: '18px',
            padding: 'clamp(20px, 3vh, 30px)',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <CircleChart />
          </div>

          {/* Right - Non-PQC Algorithm Tags */}
          <div style={{
            height: 'clamp(200px, 28vh, 294px)',
            width: 'calc((100% - clamp(20px, 3vw, 40px)) / 2)',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(16px)',
            borderRadius: '18px',
            padding: 'clamp(20px, 3vh, 30px)',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '15px',
              alignContent: 'center',
              justifyItems: 'center'
            }}>
              {[
                { name: 'RSA', color: '#5856D6' },
                { name: 'AES', color: '#0088FF' },
                { name: 'ECC', color: '#00C0E8' },
                { name: 'ETC', color: '#9599AB' }
              ].map(algo => (
                <div key={algo.name} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px',
                  background: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: '18px',
                  gap: '12px'
                }}>
                  <div style={{
                    width: '25px',
                    height: '25px',
                    background: algo.color,
                    borderRadius: '999px'
                  }} />
                  <span style={{
                    fontFamily: 'SF Pro Rounded',
                    fontWeight: 700,
                    fontSize: '16px',
                    color: '#000000'
                  }}>{algo.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          width: 'calc(3 * clamp(300px, 24vw, 371px) + 2 * clamp(20px, 2vw, 40px))',
          maxWidth: '1400px',
          height: 'clamp(200px, 28vh, 294px)',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '18px',
          backdropFilter: 'blur(16px)',
          overflow: 'hidden'
        }}>
          {renderTabContent()}
        </div>
      )}
      </div>
    </>
  );
};

export default AnalyzePage;