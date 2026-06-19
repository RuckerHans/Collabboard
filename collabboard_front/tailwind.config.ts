import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#172033',
        muted: '#64748b',
        board: '#f8fafc',
        line: '#e2e8f0',
        brand: { 50: '#eff6ff', 500: '#2563eb', 600: '#1d4ed8', 700: '#1e40af' },
      },
      boxShadow: {
        note: '0 12px 28px rgba(15, 23, 42, 0.16)',
        panel: '0 18px 50px rgba(15, 23, 42, 0.12)',
      },
      backgroundImage: {
        'dot-grid': 'radial-gradient(circle at 1px 1px, rgba(100,116,139,0.24) 1px, transparent 0)',
      },
    },
  },
  plugins: [],
};

export default config;
