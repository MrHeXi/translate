module.exports = {
  env: {
    browser: true,
    es6: true,
    node: true,
    jest: true,
    webextensions: true
  },
  extends: [
    'eslint:recommended'
  ],
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint'
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  rules: {
    // 通用规则
    'no-console': 'off', // 允许console.log用于调试
    'prefer-const': 'error',
    'no-var': 'error',
    'no-undef': 'off', // Chrome API在全局作用域中
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_|^request$|^root$|^whatToShow$|^filter$',
      varsIgnorePattern: '^_'
    }]
  },
  globals: {
    chrome: 'readonly'
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '*.js'
  ]
};
