/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpCapability } from '../../common/mcpTypes.js';
import { shouldEnableMcpResourcePicker } from '../../common/mcpResourcePickerState.js';

suite('McpResourcePickerState', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('enables while capabilities are unknown', () => {
		assert.strictEqual(shouldEnableMcpResourcePicker([undefined]), true);
	});

	test('disables when known servers do not expose resources', () => {
		assert.strictEqual(shouldEnableMcpResourcePicker([0]), false);
	});

	test('enables when any known server exposes resources', () => {
		assert.strictEqual(shouldEnableMcpResourcePicker([0, McpCapability.Resources]), true);
	});
});
