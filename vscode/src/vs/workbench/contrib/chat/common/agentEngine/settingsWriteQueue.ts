/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Director-Code Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Debounced configuration writes for the Director Code settings editor.
 */

export type ConfigurationWriteFn = (key: string, value: unknown) => Promise<void> | void;

export class PendingConfigurationWrites {
	private readonly pending = new Map<string, unknown>();
	private timer: ReturnType<typeof setTimeout> | undefined;
	private flushing: Promise<void> | undefined;

	constructor(
		private readonly write: ConfigurationWriteFn,
		private readonly debounceDelayMs: number = 500,
	) { }

	queue(key: string, value: unknown): void {
		this.pending.set(key, value);
		this.schedule();
	}

	async flush(): Promise<void> {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}

		if (this.flushing) {
			await this.flushing;
		}

		while (this.pending.size > 0) {
			const batch = Array.from(this.pending.entries());
			this.pending.clear();
			this.flushing = this.flushBatch(batch);
			try {
				await this.flushing;
			} finally {
				this.flushing = undefined;
			}
		}
	}

	dispose(flush: boolean = true): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		if (flush) {
			void this.flush();
		} else {
			this.pending.clear();
		}
	}

	private schedule(): void {
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.flush();
		}, this.debounceDelayMs);
	}

	private async flushBatch(batch: readonly (readonly [string, unknown])[]): Promise<void> {
		for (const [key, value] of batch) {
			await this.write(key, value);
		}
	}
}
