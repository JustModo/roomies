import type { Logger } from '@roomies/config';

const noop = () => {};

export const silentLogger: Logger = { info: noop, warn: noop, error: noop };
