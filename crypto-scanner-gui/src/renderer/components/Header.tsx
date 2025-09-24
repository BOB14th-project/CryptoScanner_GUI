import React from 'react';
import { PageType } from '../types';

interface HeaderProps {
  title: string;
  onNavigate: (page: PageType) => void;
  onGoBack?: () => void;
  showBackButton?: boolean;
  showHomeButton?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  title,
  onNavigate,
  onGoBack,
  showBackButton = true,
  showHomeButton = true
}) => {
  return (
    <div className="w-full">
      {/* Navigation buttons */}
      {(showBackButton || showHomeButton) && (
        <div className="absolute top-6 left-6 flex space-x-3">
          {showBackButton && (
            <button
              onClick={onGoBack}
              className="nav-button"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {showHomeButton && (
            <button
              onClick={() => onNavigate('main')}
              className="nav-button"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Header title */}
      <div className="w-full max-w-6xl mx-auto mt-16 mb-8 px-12">
        <div className="glassmorphism px-8 py-4 text-center rounded-2xl">
          <h1 className="text-2xl font-medium text-white">{title}</h1>
        </div>
      </div>
    </div>
  );
};

export default Header;