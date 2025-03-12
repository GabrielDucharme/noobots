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
    rules: {
      'no-unused-vars': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }]
    }
  }
];
