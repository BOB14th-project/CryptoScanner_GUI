import React from 'react';

interface ModalOverlayProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
  closeLabel?: string;
  width?: string;
  maxWidth?: string;
}

const ModalOverlay: React.FC<ModalOverlayProps> = ({
  isOpen,
  onClose,
  title,
  children,
  showCloseButton = true,
  closeLabel = 'Close',
  width = 'min(1200px, 92vw)',
  maxWidth = '1280px'
}) => {
  if (!isOpen) return null;

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && onClose) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(7, 9, 26, 0.7)',
        backdropFilter: 'blur(18px)',
        zIndex: 999500,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px'
      }}
    >
      <div style={{ width: '100%', maxWidth, pointerEvents: 'none' }}>
        <div style={{
          width,
          maxWidth: '100%',
          margin: '0 auto',
          background: 'linear-gradient(145deg, rgba(255, 255, 255, 0.12), rgba(80, 90, 140, 0.18))',
          border: '1px solid rgba(255, 255, 255, 0.24)',
          borderRadius: '22px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(16px)',
          overflow: 'hidden',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          minHeight: '60vh',
          height: '90vh'
        }}>
          {(title || (showCloseButton && onClose)) && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 18px 6px',
              color: '#FFFFFF',
              fontFamily: 'SF Pro Rounded',
              fontWeight: 600,
              fontSize: '16px'
            }}>
              {title && <span>{title}</span>}
              {showCloseButton && onClose && (
                <button
                  onClick={onClose}
                  style={{
                    padding: '8px 14px',
                    background: 'rgba(255, 255, 255, 0.16)',
                    border: '1px solid rgba(255, 255, 255, 0.28)',
                    borderRadius: '999px',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: 'SF Pro',
                    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.25)'
                  }}
                >
                  {closeLabel}
                </button>
              )}
            </div>
          )}

          <div style={{
            flex: 1,
            overflow: 'hidden',
            padding: '0 6px 6px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            height: '100%'
          }}>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModalOverlay;
