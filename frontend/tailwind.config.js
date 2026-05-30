/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── Legacy (Compras / Dashboard) ─────────────────────────────────
        gold: {
          50:  '#fdf8ec',
          100: '#f9edcc',
          200: '#f2d999',
          300: '#e8bf5f',
          400: '#dea832',
          500: '#9B7200',
          600: '#7d5c00',
          700: '#5f4500',
          800: '#402f00',
          900: '#201800',
        },
        forest: {
          50:  '#f0f2ee',
          100: '#d8ddd4',
          200: '#b1bba9',
          300: '#8a997e',
          400: '#637753',
          500: '#4A5240',
          600: '#3b4233',
          700: '#2c3126',
          800: '#1e211a',
          900: '#0f110d',
        },
        // ─── Blueprint palette (módulo Producción) ────────────────────────
        bp: {
          paper:        '#F2EEE4',  // fondo del panel del mapa
          line:         '#C9C0AC',  // grid lines, corner ticks, borders
          ink:          '#1F1B14',  // texto principal
          'ink-muted':  '#7A6F58',  // labels técnicas mono
          'ink-subtle': '#9C9384',  // texto secundario italic
        },
        // ─── App chrome (sidebar oscuro estilo handoff) ───────────────────
        ink: {
          DEFAULT:  '#1C1A17',  // sidebar bg
          2:        '#2A2520',  // hover items sidebar
          text:     '#C9C3B8',  // texto sidebar
          muted:    '#7A736A',  // muted sidebar
          'app-bg': '#F6F4EE',  // background general de la app
        },
        'card-border':        '#ECE7DC',
        'card-border-strong': '#D8D1C0',
        'brand-orange':       '#E5732E',
        // ─── Status (compartido Producción) ───────────────────────────────
        status: {
          active:  '#16A34A',
          warn:    '#D89412',
          idle:    '#9C9384',
          overdue: '#B53A3A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        'glass-shine-light': 'inset 1px 1.5px 1px rgba(255,255,255,0.45), inset -1px -1px 1px rgba(255,255,255,0.10)',
        'glass-shine-dark':  'inset 1px 1.5px 1px rgba(255,255,255,0.18), inset -1px -1px 1px rgba(0,0,0,0.10)',
        'glass-card':        'inset 1px 1.5px 1px rgba(255,255,255,0.45), 0 8px 22px -8px rgba(0,0,0,0.35)',
        'glass-overlay':     '0 30px 60px -20px rgba(0,0,0,0.6)',
      },
      backdropBlur: {
        'xl3': '32px',
        'xl4': '48px',
      },
    },
  },
  plugins: [],
}
