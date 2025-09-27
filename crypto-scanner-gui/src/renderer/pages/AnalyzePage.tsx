import React, { useState } from 'react';
import { PageType, ScanResult, TabType } from '../types';

interface AnalyzePageProps {
  result: ScanResult;
  onNavigate: (page: PageType) => void;
}

const AnalyzePage: React.FC<AnalyzePageProps> = ({ result, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Parse CSV data to extract statistics
  const parseResultData = () => {
    if (!result.detections || result.detections.length === 0) {
      return {
        nonPqcCount: 0,
        fileCount: 0,
        riskLevel: 'LOW',
        algorithmCounts: {},
        severityCounts: { low: 0, med: 0, high: 0 }
      };
    }

    const detections = result.detections;
    const nonPqcCount = detections.length;

    // Count unique files
    const uniqueFiles = new Set(detections.map(d => d.filePath));
    const fileCount = uniqueFiles.size;

    // Count algorithms
    const algorithmCounts: { [key: string]: number } = {};
    detections.forEach(detection => {
      const algo = detection.algorithm;
      algorithmCounts[algo] = (algorithmCounts[algo] || 0) + 1;
    });

    // Count severities
    const severityCounts = { low: 0, med: 0, high: 0 };
    detections.forEach(detection => {
      const severity = detection.severity.toLowerCase();
      if (severity === 'low') severityCounts.low++;
      else if (severity === 'med') severityCounts.med++;
      else if (severity === 'high') severityCounts.high++;
    });

    // Determine overall risk level
    const totalSeverity = severityCounts.low + severityCounts.med + severityCounts.high;
    let riskLevel = 'LOW';
    if (severityCounts.high / totalSeverity > 0.3) riskLevel = 'HIGH';
    else if (severityCounts.med / totalSeverity > 0.4) riskLevel = 'MED';

    return {
      nonPqcCount,
      fileCount,
      riskLevel,
      algorithmCounts,
      severityCounts,
      detections
    };
  };

  const resultData = parseResultData();

  // Filter detections based on search query
  const filteredDetections = resultData.detections.filter(detection => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    return (
      detection.filePath.toLowerCase().includes(query) ||
      detection.algorithm.toLowerCase().includes(query) ||
      detection.matchString.toLowerCase().includes(query) ||
      detection.evidenceType.toLowerCase().includes(query) ||
      detection.severity.toLowerCase().includes(query) ||
      detection.offset.toString().includes(query)
    );
  });

  // Highlight search terms in text
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (part.toLowerCase() === query.toLowerCase()) {
        return <span key={index} style={{
          background: 'rgba(255, 255, 0, 0.3)',
          padding: '1px 2px',
          borderRadius: '2px',
          fontWeight: 'bold'
        }}>{part}</span>;
      }
      return part;
    });
  };

  // CSV download function
  const downloadCSV = () => {
    console.log('Downloading CSV with detections:', resultData.detections);
    console.log('Sample detection:', resultData.detections[0]);

    const headers = ['File Path', 'Algorithm', 'Evidence Type', 'Severity', 'Match String', 'Offset'];
    const csvContent = [
      headers.join(','),
      ...resultData.detections.map(detection => {
        const row = [
          `"${detection.filePath}"`,
          `"${detection.algorithm}"`,
          `"${detection.evidenceType}"`,
          `"${detection.severity}"`,
          `"${detection.matchString}"`,
          detection.offset?.toString() || '0'
        ];
        console.log('CSV row:', row);
        return row.join(',');
      })
    ].join('\n');

    console.log('Final CSV content:', csvContent);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `CryptoScan_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate algorithm data and colors for use across components
  const totalCount = Object.values(resultData.algorithmCounts).reduce((sum, count) => sum + count, 0);

  // Generate dynamic colors for unlimited algorithms
  const generateColor = (index: number): string => {
    // Base color palette (50 predefined colors)
    const baseColors = [
      '#5856D6', '#0088FF', '#00C0E8', '#FF6B35', '#32D74B', '#FFD60A',
      '#FF453A', '#9599AB', '#007AFF', '#34C759', '#FF9500', '#AF52DE',
      '#FF2D92', '#5AC8FA', '#FFCC02', '#30D158', '#BF5AF2', '#FF3B30',
      '#FF6EC7', '#BF5AF2', '#AC8E68', '#6AC4DC', '#FF8C00', '#32CD32',
      '#FFB6C1', '#DDA0DD', '#98FB98', '#F0E68C', '#87CEEB', '#FFA07A',
      '#20B2AA', '#87CEFA', '#778899', '#B0C4DE', '#FFFFE0', '#00CED1',
      '#40E0D0', '#EE82EE', '#90EE90', '#FFB347', '#FF69B4', '#BA55D3',
      '#CD853F', '#FFA500', '#A0522D', '#C0C0C0', '#808080', '#FF4500',
      '#2E8B57', '#4682B4'
    ];

    if (index < baseColors.length) {
      return baseColors[index];
    }

    // For algorithms beyond the base palette, generate colors using HSL
    const hue = (index * 137.508) % 360; // Golden angle for good distribution
    const saturation = 65 + (index % 3) * 15; // Vary saturation: 65%, 80%, 95%
    const lightness = 50 + (index % 4) * 10; // Vary lightness: 50%, 60%, 70%, 80%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  // All algorithms data (no limit for overview and algorithm type tab)
  const algorithmData = Object.entries(resultData.algorithmCounts)
    .map(([algo, count], index) => ({
      name: algo,
      count,
      percentage: (count / totalCount) * 100,
      color: generateColor(index)
    }))
    .sort((a, b) => b.count - a.count);

  // Top 4 for circular chart only
  const topAlgorithmsForChart = algorithmData.slice(0, 4);

  const handleSaveCsv = async () => {
    if (window.electronAPI) {
      const csvData = generateCsvData(result);
      await window.electronAPI.saveCsv(csvData);
    }
  };

  const generateCsvData = (result: ScanResult): string => {
    const headers = ['File Path', 'Algorithm', 'Evidence Type', 'Severity', 'Match String', 'Offset'];
    const rows = result.detections.map(detection => [
      detection.filePath,
      detection.algorithm,
      detection.evidenceType,
      detection.severity,
      detection.matchString.replace(/"/g, '""'),
      detection.offset.toString()
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

    // Calculate stroke dash arrays for circle segments
    const circumference = 2 * Math.PI * 70; // radius = 70
    let cumulativeOffset = 0;

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
          {algorithmData.map((algo, index) => {
            const strokeLength = (algo.percentage / 100) * circumference;
            const currentOffset = cumulativeOffset;
            cumulativeOffset += strokeLength;

            return (
              <circle
                key={algo.name}
                cx="100" cy="100" r="70"
                fill="none"
                stroke={algo.color}
                strokeWidth="12"
                strokeDasharray={`${strokeLength} ${circumference}`}
                strokeDashoffset={-currentOffset}
                transform="rotate(-90 100 100)"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => handleMouseEnter(`${algo.name}: ${algo.percentage.toFixed(1)}%`)}
                onMouseLeave={handleMouseLeave}
              />
            );
          })}
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

  // Generate bar chart data based on actual algorithm counts
  const generateBarChartData = () => {
    const maxCount = Math.max(...algorithmData.map(algo => algo.count));

    return algorithmData.map(algo => ({
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
            {/* Combined container for counters and bars */}
            <div className="chart-container" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
              height: '200px',
              marginTop: '25px'
            }}>
              {/* Scrollable container */}
              <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: chartData.length <= 7 ? 'center' : 'flex-start',
                width: '100%',
                maxWidth: chartData.length <= 7 ? 'auto' : 'calc(7 * (80px + 50px) - 50px)',
                overflowX: chartData.length > 7 ? 'auto' : 'visible',
                overflowY: 'hidden',
                paddingRight: chartData.length > 7 ? '10px' : '0',
                height: '170px',
                paddingBottom: '30px'
              }}>
                {/* Inner content that scrolls together */}
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '50px',
                  minWidth: chartData.length > 7 ? `calc(${chartData.length} * (80px + 50px) - 50px)` : 'auto',
                  height: '100%'
                }}>
                  {chartData.map((algo, index) => (
                    <div key={algo.name} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      height: '100%',
                      minWidth: '80px',
                      flexShrink: 0,
                      position: 'relative'
                    }}>
                      {/* Count label positioned above bar */}
                      <div style={{
                        background: `linear-gradient(145deg, ${algo.color}CC, ${algo.color}FF)`,
                        backdropFilter: 'blur(10px)',
                        borderRadius: '50%',
                        width: '30px',
                        height: '30px',
                        minWidth: '30px',
                        minHeight: '30px',
                        maxWidth: '30px',
                        maxHeight: '30px',
                        aspectRatio: '1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#FFFFFF',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.2)',
                        marginBottom: '5px'
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
                        transition: 'all 0.3s ease',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.2), inset 2px 2px 4px rgba(255, 255, 255, 0.1), inset -2px -2px 4px rgba(0, 0, 0, 0.1)',
                        position: 'relative',
                        overflow: 'hidden',
                        marginTop: 'auto'
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
                        fontWeight: '500',
                        marginTop: '8px',
                        textAlign: 'center',
                        whiteSpace: 'nowrap'
                      }}>
                        {algo.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      case 'details':
        return (
          <div style={{
            padding: '30px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* Search bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '4px'
            }}>
              <div style={{
                position: 'relative',
                flex: 1
              }}>
                <input
                  type="text"
                  placeholder="Search detections (file path, algorithm, match string, etc.)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 16px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontFamily: 'SF Pro',
                    outline: 'none',
                    backdropFilter: 'blur(10px)'
                  }}
                />
                <div style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'rgba(255, 255, 255, 0.5)',
                  fontSize: '16px'
                }}>
                  🔍
                </div>
              </div>

              {/* Clear search button */}
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: 'SF Pro'
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Results counter */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '13px',
              fontFamily: 'SF Pro'
            }}>
              <span>
                Showing {filteredDetections.length} of {resultData.detections.length} detections
                {searchQuery && ` for "${searchQuery}"`}
              </span>
              {searchQuery && filteredDetections.length === 0 && (
                <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                  No matches found
                </span>
              )}
            </div>

            {/* Detection list */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '16px'
            }}>
              {filteredDetections.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredDetections.map((detection, index) => (
                    <div key={index} style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '12px',
                      fontFamily: 'SF Pro',
                      color: '#FFFFFF'
                    }}>
                      <div><strong>File:</strong> {highlightText(detection.filePath, searchQuery)}</div>
                      <div><strong>Algorithm:</strong> {highlightText(detection.algorithm, searchQuery)}</div>
                      <div><strong>Match:</strong> {highlightText(detection.matchString, searchQuery)}</div>
                      <div><strong>Offset:</strong> {highlightText(detection.offset.toString(), searchQuery)}</div>
                      <div><strong>Type:</strong> {highlightText(detection.evidenceType, searchQuery)}</div>
                      <div><strong>Severity:</strong> {highlightText(detection.severity, searchQuery)}</div>
                    </div>
                  ))}
                </div>
              ) : resultData.detections.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: '16px',
                  fontFamily: 'SF Pro'
                }}>
                  No detections found
                </div>
              ) : (
                <div style={{
                  textAlign: 'center',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: '16px',
                  fontFamily: 'SF Pro'
                }}>
                  No detections match your search
                </div>
              )}
            </div>
          </div>
        );
      case 'llm':
        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            padding: '30px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '60px', marginBottom: '16px' }}>🔧</div>
              <p style={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '18px',
                fontFamily: 'SF Pro',
                margin: 0
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

        @media (min-width: 1400px) {
          .chart-container {
            margin-top: 40px !important;
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
            }}>{resultData.nonPqcCount.toLocaleString()}</div>
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
            }}>{resultData.fileCount}</div>
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
            }}>{resultData.riskLevel}</div>
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
            alignItems: 'flex-start',
            justifyContent: 'center'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(max-content, 1fr))',
              gap: '15px',
              alignContent: 'flex-start',
              justifyItems: 'center',
              width: '100%',
              maxHeight: '100%',
              overflowY: 'auto',
              paddingRight: '5px'
            }}>
              {algorithmData.map((algo, index) => (
                <div key={algo.name} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: '18px',
                  gap: '12px',
                  minWidth: 'max-content',
                  width: '100%',
                  justifyContent: 'flex-start'
                }}>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    background: algo.color,
                    borderRadius: '999px',
                    flexShrink: 0
                  }} />
                  <span style={{
                    fontFamily: 'SF Pro Rounded',
                    fontWeight: 700,
                    fontSize: '14px',
                    color: '#000000',
                    whiteSpace: 'nowrap'
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