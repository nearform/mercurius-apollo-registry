import js from '@eslint/js'
import neostandard from 'neostandard'
import importX from 'eslint-plugin-import-x'
import prettierRecommended from 'eslint-plugin-prettier/recommended'

export default [
  ...neostandard({
    ignores: neostandard.resolveIgnoresFromGitignore()
  }),
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs'
    },
    plugins: {
      import: importX
    },
    rules: {
      strict: 'error',
      'import/order': ['error', { 'newlines-between': 'always' }]
    }
  },
  prettierRecommended
]
