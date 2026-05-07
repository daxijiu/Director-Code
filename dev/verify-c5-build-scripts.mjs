import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
	return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertContains(content, needle, label) {
	if (!content.includes(needle)) {
		throw new Error(`${label}: missing ${needle}`);
	}
}

const prepare = read('prepare_vscode.sh');
const build = read('build.sh');
const gitignore = read('.gitignore');
const buildDoc = read('docs/howto-build.md');

assertContains(prepare, 'trap cleanup EXIT', 'prepare_vscode.sh');
assertContains(prepare, 'restore_backup "product.json"', 'prepare_vscode.sh');
assertContains(prepare, 'restore_backup "package.json"', 'prepare_vscode.sh');
assertContains(prepare, 'restore_backup "resources/server/manifest.json"', 'prepare_vscode.sh');
assertContains(prepare, 'restore_npmrc', 'prepare_vscode.sh');
assertContains(prepare, 'ELECTRON_CUSTOM_DIR="${REPO_ROOT}/.electron-cache"', 'prepare_vscode.sh');
assertContains(prepare, 'electron-v*.zip', 'prepare_vscode.sh');

assertContains(build, 'DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD', 'build.sh');
assertContains(build, 'npm run gulp compile-extensions-build', 'build.sh');

const gitignoreLines = gitignore.split(/\r?\n/).map(line => line.trim());
if (!gitignoreLines.includes('.electron-cache/')) {
	throw new Error('.gitignore: missing .electron-cache/');
}
if (gitignoreLines.includes('electron-v*.zip')) {
	throw new Error('.gitignore: root electron-v*.zip must remain visible as an abnormal artifact');
}

assertContains(buildDoc, 'Git Bash', 'docs/howto-build.md');
assertContains(buildDoc, 'DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD=1', 'docs/howto-build.md');
assertContains(buildDoc, '.electron-cache/', 'docs/howto-build.md');
assertContains(buildDoc, 'trap cleanup EXIT', 'docs/howto-build.md');

console.log('C5 build script checks passed');
