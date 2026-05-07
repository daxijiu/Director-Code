/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const CONFIG_GEMINI_KEY_IN_URL = 'directorCode.ai.geminiKeyInUrl';

export interface GeminiAuthenticatedRequest {
	readonly url: string;
	readonly headers: Record<string, string>;
}

export function buildGeminiAuthenticatedRequest(url: string, apiKey: string, keyInUrl: boolean): GeminiAuthenticatedRequest {
	if (keyInUrl) {
		const separator = url.includes('?') ? '&' : '?';
		return {
			url: `${url}${separator}key=${encodeURIComponent(apiKey)}`,
			headers: {},
		};
	}
	return {
		url,
		headers: { 'x-goog-api-key': apiKey },
	};
}
