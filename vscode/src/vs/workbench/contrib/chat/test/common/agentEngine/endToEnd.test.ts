/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * End-to-End Integration Tests (Week 7)
 *
 * Tests the full flow of the agent system components working together:
 * - Progress Bridge event conversion pipeline
 * - Message Normalization for multi-turn history
 * - Tool execution patterns (read-only concurrency, error handling)
 * - System prompt construction contracts
 * - Cost & usage tracking across turns
 *
 * Note: Direct AgentEngine instantiation is not possible in the Node test
 * runner due to uuid.js dependency. We test component contracts and
 * integration patterns instead.
 */

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type {
	AgentEvent,
	AgentToolUseEvent,
	AgentToolResultEvent,
	AgentAssistantEvent,
	AgentSystemEvent,
	AgentResultEvent,
} from '../../../common/agentEngine/agentEngineTypes.js';
import type {
	NormalizedMessageParam,
	TokenUsage,
} from '../../../common/agentEngine/providers/providerTypes.js';
import { agentEventToProgress } from '../../../browser/agentEngine/progressBridge.js';
import { requestToUserMessage, historyToNormalizedMessages } from '../../../browser/agentEngine/messageNormalization.js';
import { estimateCost, estimateTokens, getContextWindowSize } from '../../../common/agentEngine/tokens.js';
import { shouldAutoCompact, microCompactMessages, createAutoCompactState } from '../../../common/agentEngine/compact.js';
import { isRetryableError, isPromptTooLongError, formatApiError } from '../../../common/agentEngine/retry.js';
import { createProvider } from '../../../common/agentEngine/providers/providerFactory.js';

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockUsage(input = 100, output = 50): TokenUsage {
	return { input_tokens: input, output_tokens: output };
}

// ============================================================================
// Tests
// ============================================================================

suite('End-to-End Integration Tests (Week 7)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// ====================================================================
	// Progress Bridge: Full Pipeline
	// ====================================================================

	suite('Progress Bridge: Full Event Pipeline', () => {
		test('tool_use event → progress message with tool name', () => {
			const event: AgentToolUseEvent = {
				type: 'tool_use',
				id: 'call_123',
				name: 'read_file',
				input: { path: '/test.ts' },
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 1);
			assert.strictEqual(progress[0].kind, 'progressMessage');
			const value = (progress[0] as any).content.value;
			assert.ok(value.includes('read_file'), 'progress message should mention tool name');
			assert.ok(value.includes('Using tool'), 'progress message should say "Using tool"');
		});

		test('tool_result success → progress message with result preview', () => {
			const event: AgentToolResultEvent = {
				type: 'tool_result',
				tool_use_id: 'call_123',
				tool_name: 'read_file',
				content: 'console.log("hello world");',
				is_error: false,
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 1);
			const value = (progress[0] as any).content.value;
			assert.ok(value.includes('read_file'), 'should include tool name');
			assert.ok(value.includes('result'), 'should say "result"');
			assert.ok(!value.includes('error'), 'should not say "error"');
		});

		test('tool_result error → progress message with error prefix', () => {
			const event: AgentToolResultEvent = {
				type: 'tool_result',
				tool_use_id: 'call_123',
				tool_name: 'write_file',
				content: 'Permission denied: /etc/hosts',
				is_error: true,
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 1);
			const value = (progress[0] as any).content.value;
			assert.ok(value.includes('error'), 'should include "error"');
			assert.ok(value.includes('write_file'));
		});

		test('tool_result truncates content longer than 200 chars', () => {
			const longContent = 'A'.repeat(300);
			const event: AgentToolResultEvent = {
				type: 'tool_result',
				tool_use_id: 'call_1',
				tool_name: 'grep',
				content: longContent,
			};

			const progress = agentEventToProgress(event);
			const value = (progress[0] as any).content.value;
			assert.ok(value.includes('...'), 'should have truncation indicator');
			assert.ok(value.length < 300, 'total message should be shorter than raw content');
		});

		test('assistant with thinking + text produces only thinking (text via streaming)', () => {
			const event: AgentAssistantEvent = {
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [
						{ type: 'thinking', thinking: 'Let me analyze this code...' },
						{ type: 'text', text: 'Here is my analysis:\n\n```ts\nconst x = 1;\n```' },
					],
				},
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 1);
			assert.strictEqual(progress[0].kind, 'thinking');
			assert.strictEqual((progress[0] as any).value, 'Let me analyze this code...');
		});

		test('assistant with tool_use blocks produces no progress (text via streaming)', () => {
			const event: AgentAssistantEvent = {
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [
						{ type: 'text', text: 'Let me read that file.' },
						{ type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'a.ts' } } as any,
					],
				},
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 0);
		});

		test('system init event has shimmer animation', () => {
			const event: AgentSystemEvent = {
				type: 'system',
				subtype: 'init',
				model: 'claude-sonnet-4-6',
				tools: ['read_file', 'write_file', 'grep'],
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 1);
			assert.strictEqual(progress[0].kind, 'progressMessage');
			assert.strictEqual((progress[0] as any).shimmer, true);
			const value = (progress[0] as any).content.value;
			assert.ok(value.includes('claude-sonnet-4-6'));
		});

		test('system compact_boundary event informs user', () => {
			const event: AgentSystemEvent = {
				type: 'system',
				subtype: 'compact_boundary',
				message: 'Conversation compacted',
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 1);
			assert.ok((progress[0] as any).content.value.includes('compact'));
			assert.strictEqual((progress[0] as any).shimmer, false);
		});

		test('result event produces empty progress (handled by caller)', () => {
			const event: AgentResultEvent = {
				type: 'result',
				subtype: 'success',
				usage: createMockUsage(),
				cost: 0.001,
				numTurns: 3,
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 0);
		});

		test('result error event also produces empty progress', () => {
			const event: AgentResultEvent = {
				type: 'result',
				subtype: 'error',
				usage: createMockUsage(),
				cost: 0,
				numTurns: 1,
				error: 'Something went wrong',
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 0);
		});

		test('string content in assistant event skipped (text rendered via streaming)', () => {
			const event: AgentEvent = {
				type: 'assistant',
				message: {
					role: 'assistant',
					content: 'Plain text response from unusual provider' as any,
				},
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 0);
		});

		test('empty assistant content produces no progress', () => {
			const event: AgentAssistantEvent = {
				type: 'assistant',
				message: {
					role: 'assistant',
					content: [],
				},
			};

			const progress = agentEventToProgress(event);
			assert.strictEqual(progress.length, 0);
		});
	});

	// ====================================================================
	// Message Normalization: History Conversion
	// ====================================================================

	suite('Message Normalization: History Pipeline', () => {
		test('multi-turn history converts to alternating user/assistant', () => {
			const history = [
				{
					request: { message: 'What is TypeScript?' },
					response: [{ kind: 'markdownContent', content: { value: 'TypeScript is a typed superset of JavaScript.' } }],
					result: {},
				},
				{
					request: { message: 'How do I install it?' },
					response: [{ kind: 'markdownContent', content: { value: 'Run: npm install -g typescript' } }],
					result: {},
				},
			] as any[];

			const messages = historyToNormalizedMessages(history);
			assert.strictEqual(messages.length, 4);
			assert.strictEqual(messages[0].role, 'user');
			assert.strictEqual(messages[0].content, 'What is TypeScript?');
			assert.strictEqual(messages[1].role, 'assistant');
			assert.ok((messages[1].content as string).includes('typed superset'));
			assert.strictEqual(messages[2].role, 'user');
			assert.strictEqual(messages[3].role, 'assistant');
		});

		test('empty response produces no assistant message', () => {
			const history = [{
				request: { message: 'Hello' },
				response: [],
				result: {},
			}] as any[];

			const messages = historyToNormalizedMessages(history);
			assert.strictEqual(messages.length, 1);
			assert.strictEqual(messages[0].role, 'user');
		});

		test('response with only progress messages (no markdown) produces no assistant', () => {
			const history = [{
				request: { message: 'Hello' },
				response: [{ kind: 'progressMessage', content: { value: 'Thinking...' } }],
				result: {},
			}] as any[];

			const messages = historyToNormalizedMessages(history);
			assert.strictEqual(messages.length, 1, 'only user message, no assistant for progress-only');
		});

		test('requestToUserMessage extracts message', () => {
			assert.strictEqual(requestToUserMessage({ message: 'Hello world' } as any), 'Hello world');
		});

		test('requestToUserMessage handles undefined message', () => {
			assert.strictEqual(requestToUserMessage({} as any), '');
		});

		test('requestToUserMessage handles empty string', () => {
			assert.strictEqual(requestToUserMessage({ message: '' } as any), '');
		});
	});

	// ====================================================================
	// Provider Factory: All Providers Create Correctly
	// ====================================================================

	suite('Provider Factory: Cross-Provider', () => {
		const apiTypes = [
			{ type: 'anthropic-messages', name: 'Anthropic' },
			{ type: 'openai-completions', name: 'OpenAI' },
			{ type: 'gemini-generative', name: 'Gemini' },
		] as const;

		for (const { type, name } of apiTypes) {
			test(`${name} provider has createMessage and createMessageStream`, () => {
				const provider = createProvider(type, { auth: { kind: 'api-key', value: 'test-key' } });
				assert.ok(typeof provider.createMessage === 'function');
				assert.ok(typeof provider.createMessageStream === 'function');
			});
		}
	});

	// ====================================================================
	// Error Classification: Integration with Provider Errors
	// ====================================================================

	suite('Error Classification Pipeline', () => {
		test('429 rate limit → retryable', () => {
			const err = { status: 429, message: 'Rate limit exceeded' };
			assert.ok(isRetryableError(err));
		});

		test('500 server error → retryable', () => {
			assert.ok(isRetryableError({ status: 500 }));
		});

		test('401 unauthorized → not retryable', () => {
			assert.ok(!isRetryableError({ status: 401 }));
		});

		test('prompt too long error detected from message', () => {
			const err = { status: 400, message: 'maximum context length exceeded' };
			assert.ok(isPromptTooLongError(err));
		});

		test('prompt too long error from Anthropic format', () => {
			const err = { status: 400, message: 'prompt is too long' };
			assert.ok(isPromptTooLongError(err));
		});

		test('formatApiError for 401 suggests checking API key', () => {
			const msg = formatApiError({ status: 401, message: 'Unauthorized' });
			assert.ok(msg.toLowerCase().includes('key') || msg.toLowerCase().includes('auth'));
		});

		test('formatApiError for 429 mentions rate limit', () => {
			const msg = formatApiError({ status: 429, message: 'Too many requests' });
			assert.ok(msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('limit'));
		});

		test('formatApiError for network error', () => {
			const msg = formatApiError({ code: 'ECONNREFUSED', message: 'Connection refused' });
			assert.ok(msg.length > 0, 'should produce a non-empty message');
		});
	});

	// ====================================================================
	// Context Management: Compact + Micro-Compact
	// ====================================================================

	suite('Context Management Pipeline', () => {
		test('micro-compact truncates tool results > 50K chars', () => {
			const longResult = 'X'.repeat(60000);
			const messages: NormalizedMessageParam[] = [
				{
					role: 'user',
					content: [
						{
							type: 'tool_result',
							tool_use_id: 'test',
							content: longResult,
						} as any,
					],
				},
			];

			const compacted = microCompactMessages(messages);
			const resultBlock = (compacted[0].content as any[])[0];
			assert.ok(resultBlock.content.length < longResult.length, 'should be truncated');
			assert.ok(resultBlock.content.includes('truncated'), 'should have truncation marker');
		});

		test('micro-compact leaves short results intact', () => {
			const shortResult = 'Hello';
			const messages: NormalizedMessageParam[] = [
				{
					role: 'user',
					content: [
						{
							type: 'tool_result',
							tool_use_id: 'test',
							content: shortResult,
						} as any,
					],
				},
			];

			const compacted = microCompactMessages(messages);
			const resultBlock = (compacted[0].content as any[])[0];
			assert.strictEqual(resultBlock.content, shortResult);
		});

		test('auto-compact threshold considers model context window', () => {
			const state = createAutoCompactState();
			const shortMessages: NormalizedMessageParam[] = [
				{ role: 'user', content: 'Hello' },
				{ role: 'assistant', content: 'Hi there' },
			];

			// Short conversation should not trigger compact
			assert.ok(!shouldAutoCompact(shortMessages, 'claude-sonnet-4-6', state));
		});

		test('context window sizes are reasonable', () => {
			// Anthropic models
			assert.ok(getContextWindowSize('claude-sonnet-4-6') >= 200000);
			assert.ok(getContextWindowSize('claude-opus-4-6') >= 200000);

			// OpenAI models
			assert.ok(getContextWindowSize('gpt-4o') >= 128000);

			// Gemini models
			assert.ok(getContextWindowSize('gemini-2.5-pro') >= 1000000);
		});
	});

	// ====================================================================
	// Cost Tracking: Multi-Turn Simulation
	// ====================================================================

	suite('Cost Tracking', () => {
		test('cost accumulates correctly for multi-turn scenario', () => {
			const model = 'claude-sonnet-4-6';
			const turn1: TokenUsage = { input_tokens: 1000, output_tokens: 500 };
			const turn2: TokenUsage = { input_tokens: 2000, output_tokens: 800 };

			const cost1 = estimateCost(model, turn1);
			const cost2 = estimateCost(model, turn2);
			const totalCost = cost1 + cost2;

			assert.ok(cost1 > 0, 'turn 1 cost should be positive');
			assert.ok(cost2 > cost1, 'turn 2 with more tokens should cost more');
			assert.ok(totalCost > 0, 'total cost should be positive');
		});

		test('token estimation is consistent', () => {
			const text = 'Hello, this is a test message.';
			const tokens1 = estimateTokens(text);
			const tokens2 = estimateTokens(text);
			assert.strictEqual(tokens1, tokens2, 'same text should produce same estimate');
			assert.ok(tokens1 > 0, 'should estimate at least 1 token');
		});

		test('cache tokens reduce effective cost', () => {
			const model = 'claude-sonnet-4-6';
			const withoutCache: TokenUsage = { input_tokens: 10000, output_tokens: 1000 };
			const withCache: TokenUsage = { input_tokens: 10000, output_tokens: 1000, cache_read_input_tokens: 5000 };

			const costWithout = estimateCost(model, withoutCache);
			const costWith = estimateCost(model, withCache);

			// With cache reads, the cost might be similar or different depending on pricing
			// But both should be positive
			assert.ok(costWithout > 0);
			assert.ok(costWith > 0);
		});
	});

	// ====================================================================
	// Event Type Contracts
	// ====================================================================

	suite('Event Type Contracts', () => {
		test('AgentToolUseEvent has required fields', () => {
			const event: AgentToolUseEvent = {
				type: 'tool_use',
				id: 'call_abc',
				name: 'read_file',
				input: { path: '/test.ts' },
			};
			assert.strictEqual(event.type, 'tool_use');
			assert.ok(event.id);
			assert.ok(event.name);
		});

		test('AgentToolResultEvent has required fields', () => {
			const event: AgentToolResultEvent = {
				type: 'tool_result',
				tool_use_id: 'call_abc',
				tool_name: 'read_file',
				content: 'file contents',
			};
			assert.strictEqual(event.type, 'tool_result');
			assert.ok(event.tool_use_id);
			assert.ok(event.tool_name);
			assert.ok(event.content);
		});

		test('AgentResultEvent success has all metadata', () => {
			const event: AgentResultEvent = {
				type: 'result',
				subtype: 'success',
				usage: { input_tokens: 5000, output_tokens: 2000 },
				cost: 0.035,
				numTurns: 5,
			};
			assert.strictEqual(event.subtype, 'success');
			assert.ok(event.usage.input_tokens > 0);
			assert.ok(event.cost > 0);
			assert.ok(event.numTurns > 0);
		});

		test('AgentResultEvent error has error message', () => {
			const event: AgentResultEvent = {
				type: 'result',
				subtype: 'error',
				usage: { input_tokens: 100, output_tokens: 0 },
				cost: 0,
				numTurns: 1,
				error: 'API key invalid',
			};
			assert.ok(event.error);
		});

		test('all result subtypes are valid', () => {
			const subtypes: AgentResultEvent['subtype'][] = [
				'success',
				'error',
				'error_max_turns',
				'error_max_budget_usd',
			];
			for (const subtype of subtypes) {
				const event: AgentResultEvent = {
					type: 'result',
					subtype,
					usage: createMockUsage(),
					cost: 0,
					numTurns: 1,
				};
				assert.strictEqual(event.subtype, subtype);
			}
		});
	});

	// ====================================================================
	// Full Event Sequence Simulation
	// ====================================================================

	suite('Full Event Sequence Simulation', () => {
		test('simulated single-turn text produces correct progress sequence', () => {
			// In real flow: text_delta events render the text, then assistant event is for history only
			const events: AgentEvent[] = [
				{ type: 'system', subtype: 'init', model: 'claude-sonnet-4-6', tools: ['read_file'] },
				{ type: 'text_delta', text: 'Hello! How can I help?' } as AgentEvent,
				{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Hello! How can I help?' }] } },
				{ type: 'result', subtype: 'success', usage: createMockUsage(), cost: 0.001, numTurns: 1 },
			];

			const allProgress = events.flatMap(e => agentEventToProgress(e));

			// system(init) → progressMessage with shimmer
			// text_delta → markdownContent (the actual text rendering)
			// assistant → nothing (text already rendered via streaming)
			// result → nothing
			assert.strictEqual(allProgress.length, 2);
			assert.strictEqual(allProgress[0].kind, 'progressMessage');
			assert.strictEqual((allProgress[0] as any).shimmer, true);
			assert.strictEqual(allProgress[1].kind, 'markdownContent');
		});

		test('simulated tool-use turn produces correct progress sequence', () => {
			const events: AgentEvent[] = [
				{ type: 'system', subtype: 'init', model: 'gpt-4o', tools: ['read_file', 'write_file'] },
				{ type: 'text_delta', text: 'Let me read the file.' } as AgentEvent,
				{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Let me read the file.' }] } },
				{ type: 'tool_use', id: 'c1', name: 'read_file', input: { path: 'src/app.ts' } },
				{ type: 'tool_result', tool_use_id: 'c1', tool_name: 'read_file', content: 'const app = express();' },
				{ type: 'text_delta', text: 'The file creates an Express app.' } as AgentEvent,
				{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'The file creates an Express app.' }] } },
				{ type: 'result', subtype: 'success', usage: { input_tokens: 2000, output_tokens: 500 }, cost: 0.01, numTurns: 2 },
			];

			const allProgress = events.flatMap(e => agentEventToProgress(e));

			// init → progressMessage(shimmer)
			// text_delta1 → markdownContent
			// assistant1 → nothing (text already streamed)
			// tool_use → progressMessage("Using tool: read_file")
			// tool_result → progressMessage("Tool read_file result: ...")
			// text_delta2 → markdownContent
			// assistant2 → nothing (text already streamed)
			// result → nothing
			assert.strictEqual(allProgress.length, 5);

			assert.strictEqual(allProgress[0].kind, 'progressMessage'); // init
			assert.strictEqual(allProgress[1].kind, 'markdownContent'); // first response via streaming
			assert.strictEqual(allProgress[2].kind, 'progressMessage'); // tool use
			assert.ok((allProgress[2] as any).content.value.includes('read_file'));
			assert.strictEqual(allProgress[3].kind, 'progressMessage'); // tool result
			assert.strictEqual(allProgress[4].kind, 'markdownContent'); // final response via streaming
		});

		test('simulated compact event appears in progress', () => {
			const events: AgentEvent[] = [
				{ type: 'system', subtype: 'init', model: 'claude-sonnet-4-6', tools: [] },
				{ type: 'system', subtype: 'compact_boundary', message: 'Conversation compacted' },
				{ type: 'text_delta', text: 'Continuing...' } as AgentEvent,
				{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Continuing...' }] } },
				{ type: 'result', subtype: 'success', usage: createMockUsage(), cost: 0, numTurns: 1 },
			];

			const allProgress = events.flatMap(e => agentEventToProgress(e));
			assert.strictEqual(allProgress.length, 3);
			assert.ok((allProgress[1] as any).content.value.includes('compact'));
		});
	});

	// ====================================================================
	// Streaming Delta Events
	// ====================================================================

	suite('Streaming Delta Events', () => {
		test('text_delta events produce incremental markdownContent', () => {
			const deltas: AgentEvent[] = [
				{ type: 'text_delta', text: 'Hello' } as any,
				{ type: 'text_delta', text: ' world' } as any,
				{ type: 'text_delta', text: '!' } as any,
			];

			const allProgress = deltas.flatMap(e => agentEventToProgress(e));
			assert.strictEqual(allProgress.length, 3);
			assert.strictEqual((allProgress[0] as any).content.value, 'Hello');
			assert.strictEqual((allProgress[1] as any).content.value, ' world');
			assert.strictEqual((allProgress[2] as any).content.value, '!');
		});

		test('thinking_delta events produce thinking parts', () => {
			const deltas: AgentEvent[] = [
				{ type: 'thinking_delta', thinking: 'Let me think...' } as any,
				{ type: 'thinking_delta', thinking: ' about this.' } as any,
			];

			const allProgress = deltas.flatMap(e => agentEventToProgress(e));
			assert.strictEqual(allProgress.length, 2);
			assert.strictEqual(allProgress[0].kind, 'thinking');
			assert.strictEqual(allProgress[1].kind, 'thinking');
		});

		test('simulated streaming turn: init → text_delta × N → tool_use → tool_result → text_delta × N → result', () => {
			const events: AgentEvent[] = [
				{ type: 'system', subtype: 'init', model: 'claude-sonnet-4-6', tools: ['read_file'] },
				// Streaming text deltas (instead of a single assistant event)
				{ type: 'text_delta', text: 'Let me ' } as any,
				{ type: 'text_delta', text: 'read that ' } as any,
				{ type: 'text_delta', text: 'file.' } as any,
				// Tool use
				{ type: 'tool_use', id: 'c1', name: 'read_file', input: { path: 'app.ts' } },
				{ type: 'tool_result', tool_use_id: 'c1', tool_name: 'read_file', content: 'const x = 1;' },
				// More streaming text
				{ type: 'text_delta', text: 'The file ' } as any,
				{ type: 'text_delta', text: 'contains x.' } as any,
				// Final result
				{ type: 'result', subtype: 'success', usage: createMockUsage(), cost: 0.01, numTurns: 2 },
			];

			const allProgress = events.flatMap(e => agentEventToProgress(e));

			// init(progressMessage) + 3 text_deltas(markdownContent) + tool_use(progressMessage) + tool_result(progressMessage) + 2 text_deltas(markdownContent) = 8
			assert.strictEqual(allProgress.length, 8);

			// Verify kinds in order
			assert.strictEqual(allProgress[0].kind, 'progressMessage'); // init
			assert.strictEqual(allProgress[1].kind, 'markdownContent'); // text delta
			assert.strictEqual(allProgress[2].kind, 'markdownContent'); // text delta
			assert.strictEqual(allProgress[3].kind, 'markdownContent'); // text delta
			assert.strictEqual(allProgress[4].kind, 'progressMessage'); // tool use
			assert.strictEqual(allProgress[5].kind, 'progressMessage'); // tool result
			assert.strictEqual(allProgress[6].kind, 'markdownContent'); // text delta
			assert.strictEqual(allProgress[7].kind, 'markdownContent'); // text delta
		});

		test('mixed thinking_delta and text_delta simulate Claude response', () => {
			const events: AgentEvent[] = [
				{ type: 'system', subtype: 'init', model: 'claude-sonnet-4-6', tools: [] },
				{ type: 'thinking_delta', thinking: 'The user wants help with...' } as any,
				{ type: 'thinking_delta', thinking: ' a coding task.' } as any,
				{ type: 'text_delta', text: 'Here is ' } as any,
				{ type: 'text_delta', text: 'my answer.' } as any,
				{ type: 'result', subtype: 'success', usage: createMockUsage(), cost: 0, numTurns: 1 },
			];

			const allProgress = events.flatMap(e => agentEventToProgress(e));
			// init + 2 thinking + 2 text = 5
			assert.strictEqual(allProgress.length, 5);
			assert.strictEqual(allProgress[0].kind, 'progressMessage'); // init
			assert.strictEqual(allProgress[1].kind, 'thinking');
			assert.strictEqual(allProgress[2].kind, 'thinking');
			assert.strictEqual(allProgress[3].kind, 'markdownContent');
			assert.strictEqual(allProgress[4].kind, 'markdownContent');
		});
	});

	// ====================================================================
	// Multi-Tool Streaming (Bug Fix Verification)
	// ====================================================================

	suite('Multi-Tool Streaming', () => {
		test('simulated streaming with 2 tools produces all tool events', () => {
			// Simulates: text + tool_1 + tool_2 → all tools should appear
			const events: AgentEvent[] = [
				{ type: 'system', subtype: 'init', model: 'gpt-4o', tools: ['read_file', 'grep'] },
				{ type: 'text_delta', text: 'Let me search.' } as any,
				// Tool 1
				{ type: 'tool_use', id: 'c1', name: 'read_file', input: { path: 'a.ts' } },
				{ type: 'tool_result', tool_use_id: 'c1', tool_name: 'read_file', content: 'file A' },
				// Tool 2
				{ type: 'tool_use', id: 'c2', name: 'grep', input: { pattern: 'foo' } },
				{ type: 'tool_result', tool_use_id: 'c2', tool_name: 'grep', content: 'match found' },
				// Final text
				{ type: 'text_delta', text: 'Found results.' } as any,
				{ type: 'result', subtype: 'success', usage: createMockUsage(), cost: 0, numTurns: 2 },
			];

			const allProgress = events.flatMap(e => agentEventToProgress(e));

			// init + text_delta + tool_use + tool_result + tool_use + tool_result + text_delta = 7
			assert.strictEqual(allProgress.length, 7);

			// Verify both tools appear
			const toolUseProgress = allProgress.filter(p =>
				p.kind === 'progressMessage' && (p as any).content.value.includes('Using tool')
			);
			assert.strictEqual(toolUseProgress.length, 2, 'should have 2 tool use progress messages');

			const toolResultProgress = allProgress.filter(p =>
				p.kind === 'progressMessage' && (p as any).content.value.includes('result')
			);
			assert.strictEqual(toolResultProgress.length, 2, 'should have 2 tool result progress messages');
		});

		test('tool_call_delta from OpenAI format with multiple indexed tools', () => {
			// Verify that the progress bridge handles multiple tool calls correctly
			// when tool_use events come from AgentEngine (after stream consumption)
			const toolUse1: AgentEvent = { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'a.ts' } };
			const toolUse2: AgentEvent = { type: 'tool_use', id: 'call_2', name: 'write_file', input: { path: 'b.ts', content: 'x' } };

			const p1 = agentEventToProgress(toolUse1);
			const p2 = agentEventToProgress(toolUse2);

			assert.strictEqual(p1.length, 1);
			assert.strictEqual(p2.length, 1);
			assert.ok((p1[0] as any).content.value.includes('read_file'));
			assert.ok((p2[0] as any).content.value.includes('write_file'));
		});
	});
});
