// @ts-check
const { defineConfig, globalIgnores } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

// Node globals for the CommonJS main process, scripts and tests. Listed here instead of importing the
// `globals` package, which is not a declared dependency of this project.
const nodeGlobals = Object.fromEntries(
  [
    'require',
    'module',
    'exports',
    '__dirname',
    '__filename',
    'process',
    'console',
    'Buffer',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'setImmediate',
    'URL',
    'URLSearchParams',
    'AbortSignal',
    'AbortController',
    'fetch',
    'structuredClone',
    'TextEncoder',
    'TextDecoder',
    'DOMException',
  ].map((name) => [name, 'readonly']),
);

module.exports = defineConfig([
  globalIgnores([
    'dist/**',
    'release/**',
    'coverage/**',
    '.angular/**',
    'out-tsc/**',
    'public/**',
    'electron/preload.bundle.cjs',
    'electron/preload.bundle.cjs.map',
  ]),

  // Renderer: Angular and TypeScript.
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.recommended, angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      // A leading underscore marks a parameter that exists only to satisfy an interface.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // The DTO files declare named aliases such as `interface AccountGetDto extends IdDto<RowId> {}`.
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
      // Known gaps that are reported but do not fail the build yet (see PLAN.md 7.4).
      '@angular-eslint/prefer-inject': 'error',
      // `app-` for the app's own components, `z-` for the vendored Zard UI set under shared/components.
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: ['app', 'z'], style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: ['app', 'z'], style: 'kebab-case' },
      ],
    },
  },

  // Vendored Zard UI set: it keeps its own selector style and uses `any` for open-ended generics.
  {
    files: ['src/app/shared/components/**/*.ts', 'src/app/shared/core/**/*.ts'],
    rules: {
      '@angular-eslint/component-selector': 'off',
      '@angular-eslint/directive-selector': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Renderer templates.
  {
    files: ['src/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      // Labels in front of custom form controls are not linked to them yet (see PLAN.md 7.4).
      '@angular-eslint/template/label-has-associated-control': 'error',
    },
  },

  // Main process and scripts: CommonJS JavaScript.
  {
    files: ['electron/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          caughtErrors: 'none',
        },
      ],
    },
  },

  // Main-process tests: ES modules run by vitest.
  {
    files: ['tests/**/*.js', 'vitest.electron.config.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          caughtErrors: 'none',
        },
      ],
    },
  },
]);
