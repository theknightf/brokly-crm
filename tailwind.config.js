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
        // Lime & white brand palette
        teal: { soft: '#ecf5df', DEFAULT: '#65a30d', ink: '#3f6212' },
        gold: { soft: '#f0fcd8', DEFAULT: '#84cc16', dark: '#4d7c0f' },
        sage: { soft: '#d9f99d', DEFAULT: '#4d7c0f', dark: '#365314' },
        clay: { soft: '#f4f4f5', DEFAULT: '#52525b', dark: '#27272a' },
        dusk: { soft: '#e8f9ee', DEFAULT: '#22c55e', dark: '#15803d' },
        stone: { soft: '#f6f6f7', DEFAULT: '#e5e7eb' },
      },
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
        display: ['var(--font-display)', 'Fraunces', 'serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 20px rgba(0,0,0,0.08)',
        modal: '0 20px 60px rgba(0,0,0,0.15)',
        sidebar: '2px 0 12px rgba(0,0,0,0.06)',
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