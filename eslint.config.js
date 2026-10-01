import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', '.claude', '.superpowers'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Node build scripts.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { URL: 'readonly', Buffer: 'readonly', console: 'readonly' } },
  },
)
