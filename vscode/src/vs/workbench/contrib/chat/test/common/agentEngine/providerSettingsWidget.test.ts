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
	getModelsForProviderAndAuthVariant,
	getDefaultModelForAuthVariant,
	providerSupportsCustomModels,
} from '../../../common/agentEngine/modelCatalog.js';
import { SUPPORTED_PROVIDERS, BUILTIN_PROVIDERS, type ProviderName } from '../../../common/agentEngine/apiKeyService.js';
import { PendingConfigurationWrites } from '../../../common/agentEngine/settingsWriteQueue.js';
import { DEFAULT_AUTH_VARIANT, OPENAI_CODEX_AUTH_VARIANT } from '../../../common/agentEngine/providers/providerTypes.js';
import { OPENAI_CODEX_OAUTH_LABEL } from '../../../common/agentEngine/oauthService.js';

suite("AgentEngine - ProviderSettingsWidget (Logic)", () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite("MODEL_CATALOG", () => {

		test("has expected model count", () => {
			assert.ok(MODEL_CATALOG.length >= 13, "expected at least 13 models, got " + MODEL_CATALOG.length);
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

		test("has 4 OpenAI native models", () => {
			const models = MODEL_CATALOG.filter(m => m.provider === "openai");
			assert.strictEqual(models.length, 4);
		});

		test("has 2 Gemini models", () => {
			const models = MODEL_CATALOG.filter(m => m.provider === "gemini");
			assert.strictEqual(models.length, 2);
		});

		test("has openai-compatible preset models", () => {
			const models = MODEL_CATALOG.filter(m => m.provider === "openai-compatible");
			assert.ok(models.length >= 2, "expected at least 2 openai-compatible presets");
		});
	});

	suite("getModelsForProvider", () => {

		test("returns only Anthropic models for anthropic", () => {
			const models = getModelsForProvider("anthropic");
			assert.strictEqual(models.length, 3);
			assert.ok(models.every(m => m.provider === "anthropic"));
		});

		test("returns only OpenAI models for openai", () => {
			const models = getModelsForProvider("openai");
			assert.strictEqual(models.length, 4);
			assert.ok(models.every(m => m.provider === "openai"));
		});

		test("returns only Gemini models for gemini", () => {
			const models = getModelsForProvider("gemini");
			assert.strictEqual(models.length, 2);
			assert.ok(models.every(m => m.provider === "gemini"));
		});

		test("returns preset models for openai-compatible", () => {
			const models = getModelsForProvider("openai-compatible");
			assert.ok(models.length >= 2);
			assert.ok(models.every(m => m.provider === "openai-compatible"));
		});

		test("returns empty for anthropic-compatible (custom models only)", () => {
			const models = getModelsForProvider("anthropic-compatible");
			assert.strictEqual(models.length, 0);
		});

		test("returns empty for unknown provider", () => {
			const models = getModelsForProvider("unknown" as ProviderName);
			assert.strictEqual(models.length, 0);
		});
	});

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

		test("returns deepseek-chat for openai-compatible", () => {
			assert.strictEqual(getDefaultModel("openai-compatible"), "deepseek-chat");
		});

		test("returns empty string for anthropic-compatible", () => {
			assert.strictEqual(getDefaultModel("anthropic-compatible"), "");
		});
	});

	suite("Auth Variant Models", () => {

		test("OpenAI Codex auth variant has isolated models", () => {
			const defaultModels = getModelsForProviderAndAuthVariant("openai", DEFAULT_AUTH_VARIANT);
			const codexModels = getModelsForProviderAndAuthVariant("openai", OPENAI_CODEX_AUTH_VARIANT);

			assert.ok(defaultModels.length > 0);
			assert.ok(codexModels.length > 0);
			assert.notDeepStrictEqual(codexModels.map(m => m.id), defaultModels.map(m => m.id));
		});

		test("OpenAI Codex OAuth label stays explicit", () => {
			assert.strictEqual(OPENAI_CODEX_OAUTH_LABEL, "OpenAI (ChatGPT/Codex OAuth)");
		});

		test("anthropic-compatible does not provide an empty model default as a value to force-save", () => {
			assert.strictEqual(getDefaultModelForAuthVariant("anthropic-compatible", DEFAULT_AUTH_VARIANT), "");
		});
	});

	suite("PendingConfigurationWrites", () => {

		test("debounces repeated writes and flushes latest values", async () => {
			const writes: Array<{ key: string; value: unknown }> = [];
			const queue = new PendingConfigurationWrites((key, value) => {
				writes.push({ key, value });
			}, 10);

			queue.queue("directorCode.ai.model", "old");
			queue.queue("directorCode.ai.model", "new");
			queue.queue("directorCode.ai.maxTurns", 42);
			await queue.flush();

			assert.deepStrictEqual(writes, [
				{ key: "directorCode.ai.model", value: "new" },
				{ key: "directorCode.ai.maxTurns", value: 42 },
			]);
		});

		test("dispose flushes pending writes", async () => {
			const writes: Array<{ key: string; value: unknown }> = [];
			const queue = new PendingConfigurationWrites((key, value) => {
				writes.push({ key, value });
			}, 1000);

			queue.queue("directorCode.ai.baseURL", "https://example.test");
			queue.dispose(true);
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(writes, [
				{ key: "directorCode.ai.baseURL", value: "https://example.test" },
			]);
		});
	});

	suite("providerSupportsCustomModels", () => {

		test("compatible providers support custom models", () => {
			assert.strictEqual(providerSupportsCustomModels("openai-compatible"), true);
			assert.strictEqual(providerSupportsCustomModels("anthropic-compatible"), true);
		});

		test("native providers do not support custom models", () => {
			assert.strictEqual(providerSupportsCustomModels("anthropic"), false);
			assert.strictEqual(providerSupportsCustomModels("openai"), false);
			assert.strictEqual(providerSupportsCustomModels("gemini"), false);
		});
	});

	suite("Config Keys", () => {

		test("built-in providers have models in catalog", () => {
			for (const provider of BUILTIN_PROVIDERS) {
				const models = getModelsForProvider(provider);
				assert.ok(models.length > 0, "no models for provider: " + provider);
			}
		});

		test("default model for built-in providers exists in catalog", () => {
			for (const provider of BUILTIN_PROVIDERS) {
				const defaultModel = getDefaultModel(provider);
				const found = MODEL_CATALOG.find(m => m.id === defaultModel);
				assert.ok(found, "default model not in catalog: " + defaultModel);
				assert.strictEqual(found!.provider, provider);
			}
		});
	});
});
