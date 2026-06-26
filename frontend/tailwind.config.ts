import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          blue: '#003DA5',
          'blue-dark': '#002D7A',
          'blue-light': '#1A5BC4',
          gold: '#FFB81C',
          'gold-light': '#FFCA4D',
          'light-blue': '#87CEEB',
          rose: '#FF007F',
        },
        neutral: {
          gray100: '#F5F5F5',
          gray200: '#E0E0E0',
          gray500: '#9E9E9E',
          gray600: '#757575',
          gray800: '#424242',
        },
        semantic: {
          success: '#4CAF50',
          'success-light': '#E8F5E9',
          error: '#F44336',
          'error-light': '#FFEBEE',
          warning: '#FF9800',
          'warning-light': '#FFF3E0',
        },
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
        '3xl': '64px',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      fontSize: {
        xs: ['12px', { lineHeight: '1.5' }],
        sm: ['14px', { lineHeight: '1.5' }],
        base: ['16px', { lineHeight: '1.5' }],
        lg: ['18px', { lineHeight: '1.5' }],
        xl: ['20px', { lineHeight: '1.2' }],
        '2xl': ['24px', { lineHeight: '1.2' }],
        '3xl': ['30px', { lineHeight: '1.2' }],
        '4xl': ['36px', { lineHeight: '1.2' }],
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-10px)' },
          '40%': { transform: 'translateX(10px)' },
          '60%': { transform: 'translateX(-10px)' },
          '80%': { transform: 'translateX(10px)' },
        },
        fadeSlideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        shake: 'shake 250ms ease-in-out',
        'fade-slide-up': 'fadeSlideUp 600ms ease-out forwards',
      },
      boxShadow: {
        'gold-glow': '0 0 12px rgba(255, 184, 28, 0.45)',
      },
    },
  },
  plugins: [],
};

export default config;
