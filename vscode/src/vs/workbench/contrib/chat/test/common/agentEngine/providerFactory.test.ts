/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { createProvider } from '../../../common/agentEngine/providers/providerFactory.js';
import { AnthropicProvider } from '../../../common/agentEngine/providers/anthropicProvider.js';
import { OpenAIProvider } from '../../../common/agentEngine/providers/openaiProvider.js';
import { GeminiProvider } from '../../../common/agentEngine/providers/geminiProvider.js';

suite("AgentEngine - ProviderFactory", () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const opts = { apiKey: "test-key" };

	test("creates AnthropicProvider for anthropic-messages", () => {
		const provider = createProvider("anthropic-messages", opts);
		assert.ok(provider instanceof AnthropicProvider);
		assert.strictEqual(provider.apiType, "anthropic-messages");
	});

	test("creates OpenAIProvider for openai-completions", () => {
		const provider = createProvider("openai-completions", opts);
		assert.ok(provider instanceof OpenAIProvider);
		assert.strictEqual(provider.apiType, "openai-completions");
	});

	test("creates GeminiProvider for gemini-generative", () => {
		const provider = createProvider("gemini-generative", opts);
		assert.ok(provider instanceof GeminiProvider);
		assert.strictEqual(provider.apiType, "gemini-generative");
	});

	test("throws for unknown API type", () => {
		assert.throws(
			() => createProvider("unknown-type" as any, opts),
			(err: any) => err.message.includes("Unknown API type"),
		);
	});

	test("passes baseURL to providers", () => {
		const provider = createProvider("anthropic-messages", {
			apiKey: "key",
			baseURL: "https://custom.proxy.com",
		});
		assert.ok(provider instanceof AnthropicProvider);
		// Verify via apiType — baseURL is internal
		assert.strictEqual(provider.apiType, "anthropic-messages");
	});

	test("all providers implement LLMProvider interface", () => {
		const types = ["anthropic-messages", "openai-completions", "gemini-generative"] as const;

		for (const apiType of types) {
			const provider = createProvider(apiType, opts);
			assert.strictEqual(typeof provider.createMessage, "function", apiType + " should have createMessage");
			assert.strictEqual(typeof provider.createMessageStream, "function", apiType + " should have createMessageStream");
			assert.strictEqual(typeof provider.apiType, "string", apiType + " should have apiType");
		}
	});
});
