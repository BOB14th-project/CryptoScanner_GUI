import React, { useState } from 'react';
import { PageType } from '../types';
import cryptoScannerStartImage from '../assets/images/CryptoScanner_start.png';

interface StartPageProps {
  onNavigate: (page: PageType) => void;
}

const StartPage: React.FC<StartPageProps> = ({ onNavigate }) => {
  const [isRequestingAdmin, setIsRequestingAdmin] = useState(false);

  const handleAdminMode = async () => {
    setIsRequestingAdmin(true);
    try {
      const { ipcRenderer } = window.require('electron');
      const granted = await ipcRenderer.invoke('enable-admin-mode');
      if (granted) {
        localStorage.setItem('adminMode', 'true');
        onNavigate('main');
      } else {
        alert('Admin privileges were not granted. Starting in normal mode.');
        localStorage.setItem('adminMode', 'false');
        onNavigate('main');
      }
    } catch (error) {
      console.error('Failed to request admin mode:', error);
      alert('Failed to request admin privileges. Starting in normal mode.');
      localStorage.setItem('adminMode', 'false');
      onNavigate('main');
    } finally {
      setIsRequestingAdmin(false);
    }
  };

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

      {/* Button Container */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '24px',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Normal Mode Button */}
        <button
          onClick={() => {
            localStorage.setItem('adminMode', 'false');
            onNavigate('main');
          }}
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

        {/* Admin Mode Button */}
        <button
          onClick={handleAdminMode}
          disabled={isRequestingAdmin}
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px',
            gap: '8px',
            width: 'clamp(250px, 17vw, 291px)',
            height: '56px',
            background: 'linear-gradient(0deg, rgba(70, 60, 150, 0.25), rgba(70, 60, 150, 0.25)), rgba(50, 40, 120, 0.7)',
            backgroundBlendMode: 'normal, overlay',
            boxShadow: '0px 8px 12px rgba(40, 30, 90, 0.35), inset 2px 2px 2px -2px rgba(255, 255, 255, 0.4), inset -2px -2px 2px -2px rgba(30, 20, 70, 0.6)',
            backdropFilter: 'blur(10px)',
            borderRadius: '999px',
            border: '1px solid rgba(90, 80, 170, 0.6)',
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
          }}>{isRequestingAdmin ? 'Requesting Privileges...' : 'Start with Admin Mode'}</span>
        </button>
      </div>
    </div>
  );
};

export default StartPage;
