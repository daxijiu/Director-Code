/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { formatMcpResourceLinkReadFailure } from '../../common/mcpLanguageModelToolContribution.js';

suite('McpLanguageModelToolContribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('formats resource_link image read failures as explicit text', () => {
		const uri = URI.parse('mcp-resource://server/image.png');
		const message = formatMcpResourceLinkReadFailure(uri, 'image/png', new Error('missing file'));

		assert.ok(message.includes('MCP resource image could not be read'));
		assert.ok(message.includes(uri.toString()));
		assert.ok(message.includes('image/png'));
		assert.ok(message.includes('missing file'));
		assert.notStrictEqual(message.trim(), '');
	});
});
