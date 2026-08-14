/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        background: { DEFAULT: 'var(--background)' },
        foreground: { DEFAULT: 'var(--foreground)' },
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        border: { DEFAULT: 'var(--border)' },
        input: { DEFAULT: 'var(--input)' },
        ring: { DEFAULT: 'var(--ring)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        // Citron Noir surface scale
        'surface-1': { DEFAULT: 'var(--surface-1)' },
        'surface-2': { DEFAULT: 'var(--surface-2)' },
        'surface-3': { DEFAULT: 'var(--surface-3)' },
        // Lime & white brand palette (dark-tuned)
        lime: { soft: 'rgba(212,225,87,0.14)', DEFAULT: '#d4e157', ink: '#c2cf47', dark: '#a3e635' },
        teal: { soft: 'rgba(134,239,172,0.14)', DEFAULT: '#86efac', ink: '#a3e635', dark: '#4ade80' },
        gold: { soft: 'rgba(251,191,36,0.14)', DEFAULT: '#fbbf24', dark: '#f59e0b' },
        sage: { soft: 'rgba(134,239,172,0.14)', DEFAULT: '#86efac', dark: '#4ade80' },
        clay: { soft: 'rgba(240,168,152,0.14)', DEFAULT: '#f0a898', dark: '#e07b6a' },
        dusk: { soft: 'rgba(125,211,252,0.14)', DEFAULT: '#7dd3fc', dark: '#38bdf8' },
        stone: { soft: 'rgba(255,255,255,0.06)', DEFAULT: '#c8c8b1' },
      },
      // Dynamic brand-glow tokens (lemon-lime highlights behind key metrics)
      backgroundColor: (theme) => ({
        'brand-glow': 'var(--brand-glow)',
        'brand-glow-strong': 'var(--brand-glow-strong)',
        ...theme('colors'),
      }),
      textColor: (theme) => ({
        ...theme('colors'),
      }),
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'calc(var(--radius) - 4px)',
        md: 'var(--radius)',
        lg: 'calc(var(--radius) + 2px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        display: ['var(--font-display)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.04) inset',
        'card-hover': '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3), 0 0 0 1px rgba(212,225,87,0.06) inset',
        modal: '0 24px 80px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset',
        sidebar: '2px 0 24px rgba(0,0,0,0.45)',
        glow: '0 0 0 1px rgba(212,225,87,0.2), 0 8px 32px rgba(212,225,87,0.15)',
      },
      animation: {
        'slide-up': 'slideUp 200ms ease forwards',
        'fade-in': 'fadeIn 200ms ease forwards',
        shimmer: 'shimmer 1.5s infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};