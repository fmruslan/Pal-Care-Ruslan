import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const required = [
  'README.md', 'LICENSE', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md',
  '.env.example', '.gitignore',
  'docs/PRODUCT.md', 'docs/ARCHITECTURE.md', 'docs/INTEGRATIONS.md',
  'docs/JUDGING.md', 'docs/SECURITY.md', 'docs/STATUS.md',
  'docs/adr/0001-modular-monolith.md',
  'docs/adr/0002-public-render-demo.md', 'docs/SETUP.md', 'docs/API.md',
  'docs/adr/0003-sandbox-checkout.md', 'docs/PAYPAL.md',
  'docs/adr/0004-premium-appearance.md', 'docs/DESIGN.md',
  'docs/PAYPAL-WEBHOOKS.md',
  'docs/adr/0005-single-immediate-sandbox-test.md',
  'docs/evidence/STAGE2-VERIFICATION.md',
  'docs/CAREOS.md', 'docs/CARE-SOURCES.md', 'docs/adr/0006-careos-assistant.md',
  'postman/PalCare-Sandbox.postman_collection.json',
  'package.json', 'pnpm-lock.yaml', 'render.yaml', 'src/db/schema.ts',
];
const errors = required.filter(path => !existsSync(join(process.cwd(), path))).map(path => 'Missing: ' + path);
if (existsSync('README.md')) {
  const text = readFileSync('README.md', 'utf8').toLowerCase();
  for (const phrase of ['Pal Care', 'PayPal', 'Purchase Twin', 'CareOS', 'not yet implemented']) {
    if (!text.includes(phrase.toLowerCase())) errors.push('README missing: ' + phrase);
  }
}
if (existsSync('LICENSE') && !readFileSync('LICENSE', 'utf8').includes('MIT License')) {
  errors.push('Expected visible MIT license');
}
if (errors.length) {
  console.error('Repository baseline verification failed:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('Repository baseline OK: ' + required.length + ' required files present.');
console.log('This is not an application build, sandbox payment test, or security audit.');
