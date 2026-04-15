/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { agentEventToProgress } from '../../../browser/agentEngine/progressBridge.js';
import type { AgentEvent } from '../../../common/agentEngine/agentEngineTypes.js';

suite("AgentEngine - ProgressBridge", () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---------------------------------------------------------------
	// Assistant Events
	// ---------------------------------------------------------------
	suite("assistant events", () => {

		test("skips text content (already rendered via text_delta streaming)", () => {
			const event: AgentEvent = {
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [{ type: 'text', text: 'Hello world' }],
				},
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 0);
		});

		test("converts thinking content to thinking part", () => {
			const event: AgentEvent = {
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [{ type: 'thinking', thinking: 'Let me reason...' }],
				},
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 1);
			assert.strictEqual(progress[0].kind, 'thinking');
			assert.strictEqual((progress[0] as any).value, 'Let me reason...');
		});

		test("handles mixed text and thinking blocks (only thinking rendered)", () => {
			const event: AgentEvent = {
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [
						{ type: 'thinking', thinking: 'Reasoning...' },
						{ type: 'text', text: 'Answer here' },
					],
				},
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 1);
			assert.strictEqual(progress[0].kind, 'thinking');
		});

		test("skips empty text blocks", () => {
			const event: AgentEvent = {
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [{ type: 'text', text: '' }],
				},
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 0);
		});

		test("skips tool_use blocks (handled separately)", () => {
			const event: AgentEvent = {
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [{ type: 'tool_use', id: 'tool_1', name: 'search', input: {} }],
				},
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 0);
		});
	});

	// ---------------------------------------------------------------
	// System Events
	// ---------------------------------------------------------------
	suite("system events", () => {

		test("converts init event to progress message", () => {
			const event: AgentEvent = {
				type: 'system',
				subtype: 'init',
				model: 'claude-sonnet-4-6',
				tools: ['search', 'edit'],
			} as any;

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 1);
			assert.strictEqual(progress[0].kind, 'progressMessage');
			assert.ok((progress[0] as any).content.value.includes('claude-sonnet-4-6'));
		});

		test("converts compact_boundary to progress message", () => {
			const event: AgentEvent = {
				type: 'system',
				subtype: 'compact_boundary',
				message: 'Conversation compacted',
			} as any;

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 1);
			assert.strictEqual(progress[0].kind, 'progressMessage');
			assert.ok((progress[0] as any).content.value.includes('compact'));
		});
	});

	// ---------------------------------------------------------------
	// Tool Result Events
	// ---------------------------------------------------------------
	suite("tool_result events", () => {

		test("converts tool result to progress message", () => {
			const event: AgentEvent = {
				type: 'tool_result',
				tool_use_id: 'tool_1',
				tool_name: 'search',
				content: 'Found 3 results',
				is_error: false,
			} as any;

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 1);
			assert.strictEqual(progress[0].kind, 'progressMessage');
			assert.ok((progress[0] as any).content.value.includes('search'));
			assert.ok((progress[0] as any).content.value.includes('result'));
		});

		test("shows error prefix for error results", () => {
			const event: AgentEvent = {
				type: 'tool_result',
				tool_use_id: 'tool_1',
				tool_name: 'edit',
				content: 'Permission denied',
				is_error: true,
			} as any;

			const progress = agentEventToProgress(event);
			assert.ok((progress[0] as any).content.value.includes('error'));
		});

		test("truncates long content", () => {
			const longContent = 'x'.repeat(500);
			const event: AgentEvent = {
				type: 'tool_result',
				tool_use_id: 'tool_1',
				tool_name: 'read',
				content: longContent,
				is_error: false,
			} as any;

			const progress = agentEventToProgress(event);
			assert.ok((progress[0] as any).content.value.includes('...'));
			assert.ok((progress[0] as any).content.value.length < 400);
		});
	});

	// ---------------------------------------------------------------
	// Result Events
	// ---------------------------------------------------------------
	suite("result events", () => {

		test("returns empty array for result events", () => {
			const event: AgentEvent = {
				type: 'result',
				subtype: 'success',
				usage: { input_tokens: 100, output_tokens: 50 },
				cost: 0.001,
				numTurns: 3,
			} as any;

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 0);
		});
	});

	// ---------------------------------------------------------------
	// Streaming Delta Events
	// ---------------------------------------------------------------
	suite("streaming delta events", () => {

		test("text_delta converts to markdownContent", () => {
			const event: AgentEvent = {
				type: 'text_delta',
				text: 'Hello ',
			} as any;

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 1);
			assert.strictEqual(progress[0].kind, 'markdownContent');
			assert.strictEqual((progress[0] as any).content.value, 'Hello ');
		});

		test("empty text_delta produces no progress", () => {
			const event: AgentEvent = {
				type: 'text_delta',
				text: '',
			} as any;

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 0);
		});

		test("thinking_delta converts to thinking part", () => {
			const event: AgentEvent = {
				type: 'thinking_delta',
				thinking: 'Let me analyze...',
			} as any;

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 1);
			assert.strictEqual(progress[0].kind, 'thinking');
			assert.strictEqual((progress[0] as any).value, 'Let me analyze...');
		});

		test("empty thinking_delta produces no progress", () => {
			const event: AgentEvent = {
				type: 'thinking_delta',
				thinking: '',
			} as any;

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 0);
		});

		test("multiple text_delta events simulate streaming", () => {
			const deltas = ['Hello', ', ', 'world', '!'];
			const allProgress = deltas.map(text =>
				agentEventToProgress({ type: 'text_delta', text } as any)
			).flat();

			assert.strictEqual(allProgress.length, 4);
			for (const p of allProgress) {
				assert.strictEqual(p.kind, 'markdownContent');
			}
		});
	});
});
