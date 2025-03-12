// This is a simplified ESLint config for Next.js without using FlatCompat
import nextPlugin from '@next/eslint-plugin-next';
import js from '@eslint/js';

export default [
  // Use ESLint's recommended rules
  js.configs.recommended,
  
  // Add Next.js specific rules
  {
    plugins: {
      '@next/next': nextPlugin
    },
    rules: {
      // Add commonly used Next.js rules
      '@next/next/no-img-element': 'warn',
      '@next/next/no-html-link-for-pages': 'warn'
    }
  },

  // Specify global settings
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      '.vercel/**',
      'public/**'
    ]
  },

  // Configurations for specific files
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.mjs'],
    languageOptions: {
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        WebSocket: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        
        // Node.js globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        
        // Next.js specific
        use: 'readonly'
      },
      sourceType: 'module',
      ecmaVersion: 2022,
      jsx: true
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-undef': 'error'
    }
  },
  
  // JSX component files
  {
    files: ['**/components/**/*.js', 'app/**/*.js', 'app/**/*.jsx'],
    rules: {
      // Disable certain rules for JSX components
      'no-undef': 'off'
    }
  }
];
