// postcss.config.js
export default {
  plugins: {
    'postcss-import': {}, // この行を追加
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
}
