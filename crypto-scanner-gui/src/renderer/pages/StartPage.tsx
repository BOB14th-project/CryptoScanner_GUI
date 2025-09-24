import React from 'react';
import { PageType } from '../types';
import cryptoScannerStartImage from '../assets/images/CryptoScanner_start.png';

interface StartPageProps {
  onNavigate: (page: PageType) => void;
}

const StartPage: React.FC<StartPageProps> = ({ onNavigate }) => {
  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      minWidth: '1200px',
      minHeight: '800px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'clamp(80px, 10vh, 120px)'
    }}>
      {/* CryptoScanner_start.png */}
      <div style={{
        width: 'min(70vw, 1221px)',
        height: 'clamp(140px, 18vh, 191px)',
        backgroundImage: `url(${cryptoScannerStartImage})`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center'
      }} />

      {/* Get Started Button */}
      <button
        onClick={() => onNavigate('main')}
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '16px',
          gap: '8px',
          width: 'clamp(250px, 17vw, 291px)',
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
        <span style={{
          fontFamily: 'SF Pro Rounded',
          fontStyle: 'normal',
          fontWeight: 600,
          fontSize: 'clamp(18px, 1.5vw, 20px)',
          lineHeight: '24px',
          color: '#FFFFFF'
        }}>Get Started</span>
      </button>
    </div>
  );
};

export default StartPage;