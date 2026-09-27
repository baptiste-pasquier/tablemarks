// Flat config, loaded as TypeScript through `jiti`.
//
// Deliberately NOT type-aware: `projectService` is off, so linting needs no TypeScript program
// and stays fast. Type errors are the type check's job (`npm run type-check`), not ESLint's.
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import pluginVitest from '@vitest/eslint-plugin'
import pluginPlaywright from 'eslint-plugin-playwright'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import pluginReactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default defineConfig([
  // Gitignore-style bare names would match at any depth; these are minimatch patterns, so
  // `pb_data` only ever matched a root-level directory and left `pocketbase/pb_data*/types.d.ts`
  // — 1386 errors' worth of generated definitions — in the lint. `**/` is what makes a nested
  // path match, and `.claude` keeps the agent worktrees (full checkouts of this repo) out.
  globalIgnores(['dist', 'dist-e2e', '**/pb_data*', '**/pb_migrations', '.claude']),

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
    files: ['src/**/*.{ts,tsx}'],
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

  // End-to-end specs and their helpers. `flat/recommended` also turns `no-empty-pattern` off, for
  // the `async ({}, use) =>` shape Playwright fixtures take.
  {
    name: 'e2e/playwright',
    files: ['e2e/**/*.ts'],
    extends: [pluginPlaywright.configs['flat/recommended']],
  },
])
