/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ILanguageModelChatSelector, ILanguageModelsService } from '../../common/languageModels.js';

const DIRECTOR_CODE_VENDOR = 'director-code';

function rankAuxiliaryModel(identifier: string): number {
	const id = identifier.toLowerCase();
	if (id.includes('spark')) { return 1; }
	if (id.includes('mini')) { return 2; }
	if (id.includes('haiku')) { return 3; }
	if (id.includes('flash')) { return 4; }
	return 100;
}

async function safeSelectLanguageModels(languageModelsService: ILanguageModelsService, selector: ILanguageModelChatSelector): Promise<string[]> {
	try {
		return await languageModelsService.selectLanguageModels(selector);
	} catch {
		return [];
	}
}

async function selectPreferredModel(languageModelsService: ILanguageModelsService, preferredModelId: string | undefined): Promise<string | undefined> {
	if (!preferredModelId) {
		return undefined;
	}

	const slashIndex = preferredModelId.indexOf('/');
	const selectors: ILanguageModelChatSelector[] = slashIndex === -1
		? [{ id: preferredModelId }]
		: [
			{ vendor: preferredModelId.slice(0, slashIndex), id: preferredModelId },
			{ vendor: preferredModelId.slice(0, slashIndex), id: preferredModelId.slice(slashIndex + 1) },
			{ id: preferredModelId },
		];

	for (const selector of selectors) {
		const models = await safeSelectLanguageModels(languageModelsService, selector);
		if (models.length) {
			return models.includes(preferredModelId) ? preferredModelId : models[0];
		}
	}
	return undefined;
}

export async function selectAuxiliaryLanguageModel(
	languageModelsService: ILanguageModelsService,
	preferredModelId?: string,
): Promise<string | undefined> {
	const preferred = await selectPreferredModel(languageModelsService, preferredModelId);
	if (preferred) {
		return preferred;
	}

	const directorCodeModels = await safeSelectLanguageModels(languageModelsService, { vendor: DIRECTOR_CODE_VENDOR });
	if (directorCodeModels.length) {
		return [...directorCodeModels].sort((a, b) => rankAuxiliaryModel(a) - rankAuxiliaryModel(b) || a.localeCompare(b))[0];
	}

	const anyModels = await safeSelectLanguageModels(languageModelsService, {});
	return anyModels[0];
}
