import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.config({
    extends: ['next/core-web-vitals', 'next/typescript'],
    ignorePatterns: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  }),
  {
    rules: {
      // Zákaz console.log; povoleny pouze console.warn a console.error.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // Musí být POSLEDNÍ: vypne ESLint formátovací pravidla kolidující s Prettierem.
  ...compat.extends('prettier'),
];

export default eslintConfig;
