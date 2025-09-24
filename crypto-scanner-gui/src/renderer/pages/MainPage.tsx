import React from 'react';
import { PageType } from '../types';

interface MainPageProps {
  onNavigate: (page: PageType) => void;
  onGoBack?: () => void;
}

const MainPage: React.FC<MainPageProps> = ({ onNavigate, onGoBack }) => {
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
      {/* Crypto Scanner 상단 */}
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
        }}>Crypto Scanner</span>
      </div>

      {/* Main Content Container */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 'clamp(20px, 2vw, 40px)',
        width: '100%',
        maxWidth: '1400px',
        padding: '0 2vw',
        flexWrap: 'wrap'
      }}>

        {/* RESULT 박스 */}
        <div style={{
          position: 'relative',
          height: 'clamp(400px, 46vh, 503px)',
          width: 'clamp(300px, 22vw, 371px)',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '18px',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'clamp(30px, 4vh, 40px) clamp(15px, 2vw, 20px)'
        }}>
          {/* Circular Icon Background */}
          <div style={{
            width: 'clamp(60px, 8vw, 80px)',
            height: 'clamp(60px, 8vw, 80px)',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'clamp(30px, 4vw, 40px)',
            marginBottom: 'clamp(15px, 2vh, 20px)'
          }}>🕐</div>

          {/* RESULT */}
          <h2 style={{
            fontFamily: 'SF Pro',
            fontStyle: 'normal',
            fontWeight: 590,
            fontSize: 'clamp(24px, 3vw, 32px)',
            lineHeight: '24px',
            textAlign: 'center',
            color: '#FFFFFF',
            margin: '0 0 clamp(15px, 2vh, 20px) 0'
          }}>RESULT</h2>

          {/* Description */}
          <p style={{
            fontFamily: 'SF Pro Rounded',
            fontStyle: 'normal',
            fontWeight: 600,
            fontSize: 'clamp(14px, 1.2vw, 16px)',
            lineHeight: '24px',
            textAlign: 'center',
            color: '#FFFFFF',
            margin: '0 0 clamp(20px, 3vh, 30px) 0',
            opacity: 0.9
          }}>You can view past scan records by day of the week. Available for download as a CSV file.</p>

          {/* Glass-button */}
          <button onClick={() => onNavigate('result')} style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px',
            gap: '8px',
            width: 'clamp(240px, 18vw, 260px)',
            height: '56px',
            background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
            backgroundBlendMode: 'normal, overlay',
            boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
            backdropFilter: 'blur(10px)',
            borderRadius: '999px',
            border: 'none',
            cursor: 'pointer'
          }}>
            <span style={{
              fontFamily: 'SF Pro Rounded',
              fontStyle: 'normal',
              fontWeight: 600,
              fontSize: 'clamp(14px, 1.2vw, 16px)',
              lineHeight: '24px',
              color: '#FFFFFF'
            }}>Previous Record</span>
          </button>
        </div>

        {/* QUICK SCAN 박스 */}
        <div style={{
          position: 'relative',
          height: 'clamp(400px, 46vh, 503px)',
          width: 'clamp(300px, 22vw, 371px)',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '18px',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'clamp(30px, 4vh, 40px) clamp(15px, 2vw, 20px)'
        }}>
          {/* Circular Icon Background */}
          <div style={{
            width: 'clamp(60px, 8vw, 80px)',
            height: 'clamp(60px, 8vw, 80px)',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'clamp(30px, 4vw, 40px)',
            marginBottom: 'clamp(15px, 2vh, 20px)'
          }}>🔍</div>

          {/* QUICK SCAN */}
          <h2 style={{
            fontFamily: 'SF Pro',
            fontStyle: 'normal',
            fontWeight: 590,
            fontSize: 'clamp(24px, 3vw, 32px)',
            lineHeight: '24px',
            textAlign: 'center',
            color: '#FFFFFF',
            margin: '0 0 clamp(15px, 2vh, 20px) 0'
          }}>QUICK SCAN</h2>

          {/* Description */}
          <p style={{
            fontFamily: 'SF Pro Rounded',
            fontStyle: 'normal',
            fontWeight: 600,
            fontSize: 'clamp(14px, 1.2vw, 16px)',
            lineHeight: '24px',
            textAlign: 'center',
            color: '#FFFFFF',
            margin: '0 0 clamp(20px, 3vh, 30px) 0',
            opacity: 0.9
          }}>You can quickly scan individual folders and files. It may take up to 5 minutes.</p>

          {/* Glass-button */}
          <button onClick={() => onNavigate('quick-scan')} style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px',
            gap: '8px',
            width: 'clamp(240px, 18vw, 260px)',
            height: '56px',
            background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
            backgroundBlendMode: 'normal, overlay',
            boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
            backdropFilter: 'blur(10px)',
            borderRadius: '999px',
            border: 'none',
            cursor: 'pointer'
          }}>
            <span style={{
              fontFamily: 'SF Pro Rounded',
              fontStyle: 'normal',
              fontWeight: 600,
              fontSize: 'clamp(14px, 1.2vw, 16px)',
              lineHeight: '24px',
              color: '#FFFFFF'
            }}>File & Folder Scan</span>
          </button>
        </div>

        {/* FULL SCAN 박스 */}
        <div style={{
          position: 'relative',
          height: 'clamp(400px, 46vh, 503px)',
          width: 'clamp(300px, 22vw, 371px)',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '18px',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'clamp(30px, 4vh, 40px) clamp(15px, 2vw, 20px)'
        }}>
          {/* Circular Icon Background */}
          <div style={{
            width: 'clamp(60px, 8vw, 80px)',
            height: 'clamp(60px, 8vw, 80px)',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'clamp(30px, 4vw, 40px)',
            marginBottom: 'clamp(15px, 2vh, 20px)'
          }}>💾</div>

          {/* FULL SCAN */}
          <h2 style={{
            fontFamily: 'SF Pro',
            fontStyle: 'normal',
            fontWeight: 590,
            fontSize: 'clamp(24px, 3vw, 32px)',
            lineHeight: '24px',
            textAlign: 'center',
            color: '#FFFFFF',
            margin: '0 0 clamp(15px, 2vh, 20px) 0'
          }}>FULL SCAN</h2>

          {/* Description */}
          <p style={{
            fontFamily: 'SF Pro Rounded',
            fontStyle: 'normal',
            fontWeight: 600,
            fontSize: 'clamp(14px, 1.2vw, 16px)',
            lineHeight: '24px',
            textAlign: 'center',
            color: '#FFFFFF',
            margin: '0 0 clamp(20px, 3vh, 30px) 0',
            opacity: 0.9
          }}>Scan all files and folders on the entire device. It takes at least 20 minutes.</p>

          {/* Glass-button */}
          <button onClick={() => onNavigate('full-scan')} style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px',
            gap: '8px',
            width: 'clamp(240px, 18vw, 260px)',
            height: '56px',
            background: 'linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)), rgba(255, 255, 255, 0.5)',
            backgroundBlendMode: 'normal, overlay',
            boxShadow: '0px 8px 12px rgba(0, 0, 0, 0.08), inset 2px 2px 2px -2px #FFFFFF, inset -2px -2px 2px -2px #FFFFFF',
            backdropFilter: 'blur(10px)',
            borderRadius: '999px',
            border: 'none',
            cursor: 'pointer'
          }}>
            <span style={{
              fontFamily: 'SF Pro Rounded',
              fontStyle: 'normal',
              fontWeight: 600,
              fontSize: 'clamp(14px, 1.2vw, 16px)',
              lineHeight: '24px',
              color: '#FFFFFF'
            }}>Full Scan</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MainPage;