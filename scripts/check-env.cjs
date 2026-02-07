#!/usr/bin/env node

/**
 * Environment variable checker for build process
 * Validates that all required VITE_* environment variables are set
 */

const requiredEnvVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY'
];

let missingVars = [];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    missingVars.push(varName);
  }
});

if (missingVars.length > 0) {
  console.error('[ENV] ❌ Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`  - ${varName}`);
  });
  console.error('\n[ENV] Please set these variables in your .env file or Netlify environment settings.');
  process.exit(1);
} else {
  console.log('[ENV] ✅ All required VITE_* variables are present.');
}
