module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'sf-pro': ['SF Pro Display', 'system-ui', 'sans-serif'],
      },
      colors: {
        'crypto-blue': '#1a1f3a',
        'crypto-purple': '#6366f1',
        'crypto-dark': '#0f1419',
      },
      backgroundImage: {
        'crypto-gradient': 'linear-gradient(135deg, #1a1f3a 0%, #6366f1 100%)',
      },
    },
  },
  plugins: [],
};