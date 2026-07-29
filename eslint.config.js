import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import boundaries from 'eslint-plugin-boundaries';

/**
 * Phase 0 deliverable 0.2. The dependency direction in CLAUDE.md was documented
 * but unenforced; this file is what makes a violation fail rather than merely
 * disappoint.
 *
 *   app/  ──▶  modules/  ──▶  core/  ──▶  shared/
 *
 * Plus the two rules that are load-bearing for the architecture and cannot be
 * expressed as a layer: no Firebase inside a pure engine, and no direct
 * `firebase/firestore` import from a component.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.js', 'tsconfig.tsbuildinfo'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: { 'react-hooks': reactHooks, boundaries },
    settings: {
      // The plugin resolves specifiers through eslint-module-utils, so without
      // a resolver that understands tsconfig `paths` every `@app/…` import is
      // unresolvable and every boundary check silently passes. Verified by
      // confirming the rule reports the known modules→app violations.
      'import/resolver': {
        typescript: { project: './tsconfig.json', alwaysTryTypes: true },
      },
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/**' },
        { type: 'modules', pattern: 'src/modules/*/**', capture: ['module'] },
        { type: 'core', pattern: 'src/core/*/**', capture: ['engine'] },
        { type: 'shared', pattern: 'src/shared/**' },
        { type: 'config', pattern: 'src/config/**' },
        { type: 'mock', pattern: 'src/mock/**' },
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      '@typescript-eslint/no-explicit-any': 'error',   // hard rule 9: `unknown` + parse
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],

      // app ▶ modules ▶ core ▶ shared, and nothing points back up the chain.
      // `default: 'disallow'` means an element type not named here is refused,
      // so adding a new top-level directory fails loudly rather than silently
      // acquiring permission to import everything.
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        policies: [
          {
            from: { element: { type: 'app' } },
            allow: { to: { element: { types: { anyOf: ['app', 'modules', 'core', 'shared', 'config', 'mock'] } } } },
          },
          // Deliberately NOT allowed to reach 'app': that inversion is exactly
          // what the dependency rule exists to prevent.
          {
            from: { element: { type: 'modules' } },
            allow: { to: { element: { types: { anyOf: ['modules', 'core', 'shared', 'config'] } } } },
          },
          {
            from: { element: { type: 'core' } },
            allow: { to: { element: { types: { anyOf: ['core', 'shared', 'config'] } } } },
          },
          {
            from: { element: { type: 'shared' } },
            allow: { to: { element: { types: { anyOf: ['shared', 'core'] } } } },
          },
          {
            from: { element: { type: 'config' } },
            allow: { to: { element: { type: 'config' } } },
          },
          {
            from: { element: { type: 'mock' } },
            allow: { to: { element: { types: { anyOf: ['shared', 'core'] } } } },
          },
        ],
      }],

      'boundaries/no-private': 'off',
      'boundaries/entry-point': 'off',

      'no-restricted-imports': ['error', {
        paths: [
          {
            name: 'firebase/firestore',
            message:
              'Components and engines never import the Firestore SDK directly. Reads go through @core/firebase/hooks, writes through @core/sync. Only src/core/firebase/* may import it.',
          },
        ],
      }],
    },
  },

  // "No module imports another module" — the design smell CLAUDE.md calls out
  // by name. A module may import its own files freely; reaching into a sibling
  // is what is refused. Cross-feature needs go through core/ or a shared type.
  {
    files: ['src/modules/**/*.{ts,tsx}'],
    rules: {
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        policies: [
          {
            from: { element: { type: 'modules' } },
            allow: { to: { element: { types: { anyOf: ['modules', 'core', 'shared', 'config'] } } } },
          },
        ],
      }],

      /**
       * "No module imports another module" (CLAUDE.md), enforced by path.
       *
       * `boundaries/dependencies` cannot express this here: its captured-value
       * selector for "same module as the importer" silently fails to match, so
       * the policy degrades to "modules → modules, always" and the rule can
       * never fire. That was verified with a deliberate cross-module import —
       * the same trap as the missing import resolver in ADR-021, and the reason
       * this is a plain path rule instead.
       *
       * It works because the codebase already distinguishes the two cases:
       * a file imports its *own* module relatively (`./components`) and another
       * module through the alias (`@modules/challenges/components`). So
       * forbidding the alias inside `src/modules/**` forbids exactly the
       * cross-module case and nothing else.
       */
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@modules/*', '@modules/*/**'],
            message:
              'No module imports another module (CLAUDE.md). Import your own module relatively (./x), and route a cross-feature need through core/ or shared/.',
          },
        ],
        paths: [
          {
            name: 'firebase/firestore',
            message:
              'Components and engines never import the Firestore SDK directly. Reads go through @core/firebase/hooks, writes through @core/sync.',
          },
        ],
      }],
    },
  },

  // The engines are pure by contract: data in, data out, unit-testable with no
  // network and no React. Hard rule 8.
  {
    files: ['src/core/forms/**/*.ts', 'src/core/workflow/**/*.ts', 'src/core/rbac/**/*.ts', 'src/core/judging/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['firebase', 'firebase/*', '@firebase/*'], message: 'Pure engine: no Firebase (CLAUDE.md hard rule 8).' },
          { group: ['react', 'react-dom', 'react/*', '@mui/*'], message: 'Pure engine: no React (CLAUDE.md hard rule 8, ADR-012).' },
        ],
      }],
    },
  },

  // Only the data layer may touch the SDK; that is the point of the data layer.
  // Rules tests are the exception that proves it: they exist to drive the SDK
  // directly against the emulator and assert what it refuses.
  {
    files: ['src/core/firebase/**/*.ts', 'scripts/**/*.ts', 'tests/rules/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },

  {
    files: ['**/*.test.{ts,tsx}', 'tests/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'boundaries/element-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
