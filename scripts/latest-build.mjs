// Shows the newest finished iPhone development build as a QR code: scan it with the Camera app,
// tap the link, then Install. Usage: npm run phone
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import qrcode from 'qrcode-terminal';

const { owner, slug } = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;

const json = execFileSync(
  'npx',
  ['eas-cli@latest', 'build:list', '--platform', 'ios', '--profile', 'development', '--status', 'finished', '--limit', '1', '--json', '--non-interactive'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
);
const [build] = JSON.parse(json);
if (!build) {
  console.log('No finished iPhone build yet.');
  process.exit(1);
}
const url = `https://expo.dev/accounts/${owner}/projects/${slug}/builds/${build.id}`;
const when = new Date(build.completedAt ?? build.createdAt).toLocaleString();
console.log(`\nNewest build: ${when}  (${build.gitCommitMessage?.split('\n')[0] ?? build.id})\n`);
qrcode.generate(url, { small: true });
console.log(`\nScan with your iPhone camera, open the link, tap Install.\n${url}\n`);
