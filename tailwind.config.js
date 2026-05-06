/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}'
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Surface tokens — kept in sync with the desktop theme so the same
        // visual identity holds on phone. Values are dark-first; mobile does
        // not currently support a light theme switch (see Settings screen).
        bg:        '#08070d',
        bgElev:    '#101018',
        surface:   '#15151f',
        surfaceHi: '#1c1c28',
        border:    '#26263b',
        text:      '#f3f4f6',
        textMuted: '#9ca3af',
        textDim:   '#6b7280'
      },
      fontFamily: {
        sans: ['DMSans_400Regular', 'System'],
        medium: ['DMSans_500Medium', 'System'],
        semibold: ['DMSans_600SemiBold', 'System'],
        bold: ['DMSans_700Bold', 'System']
      }
    }
  },
  plugins: []
};
