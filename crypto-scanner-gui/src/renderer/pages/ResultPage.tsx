import React, { useState, useMemo } from 'react';
import { PageType, ScanResult } from '../types';
import { formatDate, formatTime } from '../utils/storage';
import Header from '../components/Header';

interface ResultPageProps {
  scanResults: ScanResult[];
  onNavigate: (page: PageType) => void;
  onSelectResult: (result: ScanResult) => void;
}

const ResultPage: React.FC<ResultPageProps> = ({
  scanResults,
  onNavigate,
  onSelectResult
}) => {
  console.log('ResultPage received scanResults:', scanResults);
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Group results by date and sort by most recent
  const groupedResults = useMemo(() => {
    const groups: { [date: string]: ScanResult[] } = {};

    scanResults.forEach(result => {
      const dateKey = result.date;
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(result);
    });

    // Sort dates descending and results within each date
    Object.keys(groups).forEach(date => {
      groups[date].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    });

    return groups;
  }, [scanResults]);

  const sortedDates = Object.keys(groupedResults).sort((a, b) =>
    new Date(b).getTime() - new Date(a).getTime()
  );

  const selectedResults = selectedDate ? groupedResults[selectedDate] || [] : [];

  // Auto-select first date if none selected
  React.useEffect(() => {
    if (!selectedDate && sortedDates.length > 0) {
      setSelectedDate(sortedDates[0]);
    }
  }, [sortedDates, selectedDate]);

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
        {/* Left Sidebar - Date List */}
        <div style={{
          width: 'clamp(300px, 22vw, 371px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(15px, 2vh, 20px)',
          maxHeight: 'clamp(400px, 46vh, 503px)',
          overflowY: 'auto'
        }}>
          {sortedDates.map(date => {
            const resultsForDate = groupedResults[date];
            const isSelected = selectedDate === date;

            return (
              <div key={date}
                onClick={() => setSelectedDate(date)}
                style={{
                  position: 'relative',
                  height: '100px',
                  background: isSelected ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '18px',
                  backdropFilter: 'blur(16px)',
                  cursor: 'pointer'
                }}>
                <div style={{
                  position: 'absolute',
                  width: '24px',
                  height: '24px',
                  left: '20px',
                  top: '16px'
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="rgba(255, 255, 255, 0.8)" strokeWidth="2"/>
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
                }}>{formatDate(date)}</div>
                <div style={{
                  position: 'absolute',
                  width: '25px',
                  height: '25px',
                  right: '25px',
                  top: '62px',
                  borderRadius: '50%',
                  background: isSelected ? 'rgba(34, 43, 89, 0.63)' : 'rgba(160, 160, 160, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{
                    fontSize: '11px',
                    color: '#FFFFFF',
                    fontWeight: 400
                  }}>{resultsForDate.length}</span>
                </div>
                {isSelected && (
                  <div style={{
                    position: 'absolute',
                    width: '25px',
                    height: '25px',
                    right: '60px',
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
            );
          })}

          {sortedDates.length === 0 && (
            <div style={{
              position: 'relative',
              height: '100px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '18px',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{
                fontFamily: 'SF Pro',
                fontSize: '14px',
                color: 'rgba(255, 255, 255, 0.6)'
              }}>No scan results found</span>
            </div>
          )}
        </div>

        {/* Right Content - Scan Results Cards */}
        <div style={{
          display: 'flex',
          gap: 'clamp(20px, 2vw, 40px)',
          width: 'calc(2 * clamp(300px, 22vw, 371px) + clamp(20px, 2vw, 40px))',
          height: 'clamp(400px, 46vh, 503px)',
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingRight: '10px'
        }}>
          {selectedResults.length > 0 ? (
            <>
              {selectedResults.slice(0, 2).map((result, index) => (
                <div key={result.id} style={{
                  position: 'relative',
                  height: '100%',
                  width: 'clamp(300px, 22vw, 371px)',
                  minWidth: 'clamp(300px, 22vw, 371px)',
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
                    {result.type === 'FULL_SCAN' ? 'FULL SCAN' : 'QUICK SCAN'}
                  </h2>

                  {/* Time and Non-PQC Info */}
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    justifyContent: 'center',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{
                      padding: '6px 11px',
                      background: 'rgba(118, 118, 128, 0.12)',
                      borderRadius: '100px'
                    }}>
                      <span style={{
                        fontFamily: 'SF Pro',
                        fontSize: '17px',
                        color: '#FFFFFF'
                      }}>{formatTime(result.time)}</span>
                    </div>
                    <div style={{
                      padding: '6px 11px',
                      background: 'rgba(34, 43, 89, 0.63)',
                      borderRadius: '100px'
                    }}>
                      <span style={{
                        fontFamily: 'SF Pro',
                        fontSize: '17px',
                        color: '#FFFFFF'
                      }}>Non-PQC: {result.nonPqcCount}</span>
                    </div>
                  </div>

                  {/* File Path with Tooltip */}
                  <div
                    style={{
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
                      gap: '8px',
                      position: 'relative'
                    }}
                    title={`File Path: ${result.filePath}`}
                  >
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
                      File Path: {result.filePath}
                    </span>
                  </div>

                  {/* View Results Button */}
                  <button
                    onClick={() => onSelectResult(result)}
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
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="#FFFFFF" strokeWidth="2"/>
                    </svg>
                    <span style={{
                      fontFamily: 'SF Pro Rounded',
                      fontWeight: 600,
                      fontSize: 'clamp(16px, 1.2vw, 20px)',
                      color: '#FFFFFF'
                    }}>View Detailed Results</span>
                  </button>
                </div>
              ))}
              {selectedResults.length > 2 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '150px',
                  padding: '20px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '18px',
                  backdropFilter: 'blur(16px)'
                }}>
                  <span style={{
                    fontFamily: 'SF Pro',
                    fontSize: '16px',
                    color: 'rgba(255, 255, 255, 0.8)',
                    textAlign: 'center'
                  }}>+{selectedResults.length - 2}<br/>more results<br/>📋</span>
                </div>
              )}
            </>
          ) : selectedDate ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '18px',
              backdropFilter: 'blur(16px)'
            }}>
              <span style={{
                fontFamily: 'SF Pro',
                fontSize: '18px',
                color: 'rgba(255, 255, 255, 0.6)'
              }}>No results for selected date</span>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '18px',
              backdropFilter: 'blur(16px)'
            }}>
              <span style={{
                fontFamily: 'SF Pro',
                fontSize: '18px',
                color: 'rgba(255, 255, 255, 0.6)'
              }}>Select a date to view results</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultPage;