/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	MODEL_CATALOG,
	getModelsForProvider,
	getDefaultModel,
} from '../../../common/agentEngine/modelCatalog.js';
import { SUPPORTED_PROVIDERS, type ProviderName } from '../../../common/agentEngine/apiKeyService.js';

suite("AgentEngine - ProviderSettingsWidget (Logic)", () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ====================================================================
	// MODEL_CATALOG
	// ====================================================================

	suite("MODEL_CATALOG", () => {

		test("has 8 models total", () => {
			assert.strictEqual(MODEL_CATALOG.length, 8);
		});

		test("every model has id, name, and provider", () => {
			for (const model of MODEL_CATALOG) {
				assert.ok(model.id.length > 0, "model missing id");
				assert.ok(model.name.length > 0, "model missing name");
				assert.ok(SUPPORTED_PROVIDERS.includes(model.provider as any), "invalid provider: " + model.provider);
			}
		});

		test("model IDs are unique", () => {
			const ids = MODEL_CATALOG.map(m => m.id);
			const unique = new Set(ids);
			assert.strictEqual(ids.length, unique.size, "duplicate model IDs found");
		});

		test("has 3 Anthropic models", () => {
			const models = MODEL_CATALOG.filter(m => m.provider === "anthropic");
			assert.strictEqual(models.length, 3);
		});

		test("has 3 OpenAI models", () => {
			const models = MODEL_CATALOG.filter(m => m.provider === "openai");
			assert.strictEqual(models.length, 3);
		});

		test("has 2 Gemini models", () => {
			const models = MODEL_CATALOG.filter(m => m.provider === "gemini");
			assert.strictEqual(models.length, 2);
		});
	});

	// ====================================================================
	// getModelsForProvider
	// ====================================================================

	suite("getModelsForProvider", () => {

		test("returns only Anthropic models for anthropic", () => {
			const models = getModelsForProvider("anthropic");
			assert.strictEqual(models.length, 3);
			assert.ok(models.every(m => m.provider === "anthropic"));
		});

		test("returns only OpenAI models for openai", () => {
			const models = getModelsForProvider("openai");
			assert.strictEqual(models.length, 3);
			assert.ok(models.every(m => m.provider === "openai"));
		});

		test("returns only Gemini models for gemini", () => {
			const models = getModelsForProvider("gemini");
			assert.strictEqual(models.length, 2);
			assert.ok(models.every(m => m.provider === "gemini"));
		});

		test("returns empty for unknown provider", () => {
			const models = getModelsForProvider("unknown" as ProviderName);
			assert.strictEqual(models.length, 0);
		});
	});

	// ====================================================================
	// getDefaultModel
	// ====================================================================

	suite("getDefaultModel", () => {

		test("returns claude-sonnet-4-6 for anthropic", () => {
			assert.strictEqual(getDefaultModel("anthropic"), "claude-sonnet-4-6");
		});

		test("returns gpt-4o for openai", () => {
			assert.strictEqual(getDefaultModel("openai"), "gpt-4o");
		});

		test("returns gemini-2.5-pro for gemini", () => {
			assert.strictEqual(getDefaultModel("gemini"), "gemini-2.5-pro");
		});

		test("returns empty string for unknown provider", () => {
			assert.strictEqual(getDefaultModel("unknown" as ProviderName), "");
		});
	});

	// ====================================================================
	// Config keys consistency
	// ====================================================================

	suite("Config Keys", () => {

		test("all SUPPORTED_PROVIDERS have models in catalog", () => {
			for (const provider of SUPPORTED_PROVIDERS) {
				const models = getModelsForProvider(provider);
				assert.ok(models.length > 0, "no models for provider: " + provider);
			}
		});

		test("default model for each provider exists in catalog", () => {
			for (const provider of SUPPORTED_PROVIDERS) {
				const defaultModel = getDefaultModel(provider);
				const found = MODEL_CATALOG.find(m => m.id === defaultModel);
				assert.ok(found, "default model not in catalog: " + defaultModel);
				assert.strictEqual(found!.provider, provider);
			}
		});
	});
});
