/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// [Director-Code] B4: shared helper for built-in mode detection
export function isDirectorCodeBuiltInMode(defaultChatAgent: { chatExtensionId?: string; extensionId?: string } | undefined): boolean {
	if (!defaultChatAgent) { return false; }
	return defaultChatAgent.chatExtensionId === '' || defaultChatAgent.extensionId === 'director-code.agent';
}
