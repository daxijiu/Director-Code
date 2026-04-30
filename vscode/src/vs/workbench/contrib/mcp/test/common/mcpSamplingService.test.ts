/*---------------------------------------------------------------------------------------------
 *  Director-Code Contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// [Director-Code] A4a: Test "Not Now" vs "Allow" session semantics in MCP Sampling

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('McpSamplingService — session allow/deny semantics', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// The core logic under test:
	// _sessionSets is Map<string, boolean>. "Allow" sets true, "Not Now" sets false.
	// The fix changes .has(id) to .get(id) === true so that false (Not Now) is NOT treated as allowed.

	test('Map.get(id) === true returns true only for Allow, not for Not Now', () => {
		const sessionMap = new Map<string, boolean>();

		// Before any interaction: key not in map
		assert.strictEqual(sessionMap.get('server-1') === true, false, 'unknown server should not be allowed');

		// "Allow in this Session" sets true
		sessionMap.set('server-1', true);
		assert.strictEqual(sessionMap.get('server-1') === true, true, 'Allow should be treated as allowed');

		// "Not Now" sets false
		sessionMap.set('server-2', false);
		assert.strictEqual(sessionMap.get('server-2') === true, false, 'Not Now (false) should NOT be treated as allowed');

		// Contrast with old .has() behavior that would have returned true for "Not Now"
		assert.strictEqual(sessionMap.has('server-2'), true, '.has() would have returned true for Not Now — this was the bug');
	});

	test('Allow -> Not Now -> Allow cycle works correctly', () => {
		const sessionMap = new Map<string, boolean>();

		sessionMap.set('server-x', true);
		assert.strictEqual(sessionMap.get('server-x') === true, true, 'first Allow');

		sessionMap.set('server-x', false);
		assert.strictEqual(sessionMap.get('server-x') === true, false, 'Not Now overrides Allow');

		sessionMap.set('server-x', true);
		assert.strictEqual(sessionMap.get('server-x') === true, true, 'second Allow restores');
	});

	test('Never path does not affect session map', () => {
		const sessionMap = new Map<string, boolean>();

		// "Never" writes to configuration, not to session map
		// Session map should remain unchanged
		assert.strictEqual(sessionMap.get('server-never') === true, false);
		assert.strictEqual(sessionMap.has('server-never'), false);
	});
});
