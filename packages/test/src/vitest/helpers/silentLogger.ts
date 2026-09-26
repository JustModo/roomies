import type { Logger } from '@roomies/config';

const noop = () => {};

export const silentLogger: Logger = { debug: noop, info: noop, warn: noop, error: noop };
