// Flat config, loaded as TypeScript through `jiti`.
//
// Deliberately NOT type-aware: `projectService` is off, so linting needs no TypeScript program
// and stays fast. Type errors are the type check's job (`npm run type-check`), not ESLint's.
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import pluginVitest from '@vitest/eslint-plugin'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import pluginReactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'pb_data', 'pb_migrations', '--help']),

  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      // A leading underscore is how this codebase already marks a binding it must declare but
      // does not read — a placeholder parameter, a destructured field it skips.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    name: 'app/react',
    files: ['**/*.{ts,tsx}'],
    extends: [pluginReactHooks.configs.flat['recommended-latest'], pluginReactRefresh.configs.vite],
    rules: {
      // Warnings, not errors, for this first landing. Both rules are new in
      // eslint-plugin-react-hooks 7 and both are right: every site they flag is a deliberate,
      // commented pattern (a ref read during render, a setState that runs straight from an
      // effect) that needs a real refactor rather than a mechanical fix. Keeping them on keeps
      // the signal visible without holding the tooling behind the refactor.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },

  // Tests are co-located next to the code they cover, not gathered in `__tests__/`.
  {
    ...pluginVitest.configs.recommended,
    name: 'app/tests',
    files: ['src/**/*.test.{ts,tsx}'],
  },
])
