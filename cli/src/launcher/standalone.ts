import { createLogger } from '../logger-utils.js';
import { run } from '../index.js';
import { StandaloneConfig } from '../config.js';

const config = new StandaloneConfig();
const logger = await createLogger(config.logDir);
const testEnvironment = config.getEnvironment(logger);
await run(config, testEnvironment, logger);
