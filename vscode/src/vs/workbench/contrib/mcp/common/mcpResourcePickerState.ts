/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpCapability } from './mcpTypes.js';

export function shouldEnableMcpResourcePicker(capabilities: readonly (McpCapability | undefined)[]): boolean {
	return capabilities.some(capability => capability === undefined || !!(capability & McpCapability.Resources));
}
