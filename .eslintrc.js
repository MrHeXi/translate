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
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
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