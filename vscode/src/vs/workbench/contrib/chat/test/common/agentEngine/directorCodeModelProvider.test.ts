/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit Tests — DirectorCodeModelProvider (Logic Layer)
 *
 * Tests the model provider's logic through its common-layer dependencies:
 * - Model catalog filtering by provider
 * - Model metadata generation
 * - Token estimation
 * - Provider creation for each model
 *
 * Note: The actual DirectorCodeModelProvider class is in browser/ and
 * requires DOM/CSS imports. Here we test the logic it depends on.
 */

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	MODEL_CATALOG,
	getModelsForProvider,
	findModelById,
} from '../../../common/agentEngine/modelCatalog.js';
import { createProvider } from '../../../common/agentEngine/providers/providerFactory.js';
import { estimateTokens } from '../../../common/agentEngine/tokens.js';

suite("AgentEngine - DirectorCodeModelProvider (Logic)", () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ====================================================================
	// Model metadata generation (what provideLanguageModelChatInfo returns)
	// ====================================================================

	suite("Model Metadata", () => {

		test("each model has all required fields", () => {
			for (const model of MODEL_CATALOG) {
				assert.ok(model.id, "missing id");
				assert.ok(model.name, "missing name");
				assert.ok(model.family, "missing family");
				assert.ok(model.apiType, "missing apiType");
				assert.ok(model.provider, "missing provider");
				assert.ok(model.maxInputTokens > 0, "bad maxInputTokens");
				assert.ok(model.maxOutputTokens > 0, "bad maxOutputTokens");
			}
		});

		test("vendor prefix format for model identifiers", () => {
			const VENDOR = "director-code";
			for (const model of MODEL_CATALOG) {
				const identifier = `${VENDOR}/${model.id}`;
				assert.ok(identifier.startsWith("director-code/"));
				assert.ok(identifier.length > "director-code/".length);
			}
		});

		test("provideLanguageModelChatInfo filters by active provider", () => {
			// Simulates what the provider does: filter catalog by active provider
			const activeProvider = "anthropic";
			const models = MODEL_CATALOG.filter(m => m.provider === activeProvider);

			assert.strictEqual(models.length, 3);
			assert.ok(models.every(m => m.provider === "anthropic"));
		});

		test("switching active provider changes model list", () => {
			const providers = ["anthropic", "openai", "gemini"] as const;
			const modelCounts = providers.map(p => getModelsForProvider(p).length);

			assert.deepStrictEqual(modelCounts, [3, 5, 2]);
		});
	});

	// ====================================================================
	// Token estimation (what provideTokenCount uses)
	// ====================================================================

	suite("Token Estimation", () => {

		test("estimateTokens returns positive number for non-empty text", () => {
			const tokens = estimateTokens("Hello, world!");
			assert.ok(tokens > 0);
		});

		test("estimateTokens returns 0 for empty string", () => {
			const tokens = estimateTokens("");
			assert.strictEqual(tokens, 0);
		});

		test("longer text produces more tokens", () => {
			const short = estimateTokens("hi");
			const long = estimateTokens("This is a much longer sentence with many more words.");
			assert.ok(long > short);
		});

		test("estimateTokens handles multiline text", () => {
			const text = "Line 1\nLine 2\nLine 3";
			const tokens = estimateTokens(text);
			assert.ok(tokens > 0);
		});
	});

	// ====================================================================
	// sendChatRequest model resolution
	// ====================================================================

	suite("Model Resolution", () => {

		test("findModelById resolves all catalog models", () => {
			for (const model of MODEL_CATALOG) {
				const found = findModelById(model.id);
				assert.ok(found, `could not find model ${model.id}`);
				assert.strictEqual(found!.apiType, model.apiType);
			}
		});

		test("shortId extraction from qualified identifier", () => {
			const VENDOR = "director-code";
			for (const model of MODEL_CATALOG) {
				const qualifiedId = `${VENDOR}/${model.id}`;
				const shortId = qualifiedId.replace(`${VENDOR}/`, "");
				assert.strictEqual(shortId, model.id);

				const resolved = findModelById(shortId);
				assert.ok(resolved);
			}
		});

		test("unknown model returns undefined", () => {
			assert.strictEqual(findModelById("unknown-model-xyz"), undefined);
		});

		test("each model can create its provider", () => {
			for (const model of MODEL_CATALOG) {
				const provider = createProvider(model.apiType, { apiKey: "test" });
				assert.strictEqual(provider.apiType, model.apiType);
				assert.ok(typeof provider.createMessage === "function");
				assert.ok(typeof provider.createMessageStream === "function");
			}
		});
	});

	// ====================================================================
	// Model families
	// ====================================================================

	suite("Model Families", () => {

		test("Anthropic models are in claude-4 family", () => {
			const models = getModelsForProvider("anthropic");
			for (const m of models) {
				assert.strictEqual(m.family, "claude-4");
			}
		});

		test("OpenAI models have expected families", () => {
			const models = getModelsForProvider("openai");
			const families = new Set(models.map(m => m.family));
			assert.ok(families.has("gpt-4"));
			assert.ok(families.has("o-series"));
		});

		test("Gemini models are in gemini-2 family", () => {
			const models = getModelsForProvider("gemini");
			for (const m of models) {
				assert.strictEqual(m.family, "gemini-2");
			}
		});
	});

	// ====================================================================
	// Model token limits
	// ====================================================================

	suite("Token Limits", () => {

		test("Anthropic models have 200K input context", () => {
			const models = getModelsForProvider("anthropic");
			for (const m of models) {
				assert.strictEqual(m.maxInputTokens, 200_000);
			}
		});

		test("Gemini models have 1M input context", () => {
			const models = getModelsForProvider("gemini");
			for (const m of models) {
				assert.strictEqual(m.maxInputTokens, 1_000_000);
			}
		});

		test("o3 has 200K input and 100K output", () => {
			const o3 = findModelById("o3");
			assert.ok(o3);
			assert.strictEqual(o3!.maxInputTokens, 200_000);
			assert.strictEqual(o3!.maxOutputTokens, 100_000);
		});
	});
});
