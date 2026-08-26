import { createLogger } from '../logger-utils.js';
import { run } from '../index.js';
import { PreviewRemoteConfig } from '../config.js';

const config = new PreviewRemoteConfig();
const logger = await createLogger(config.logDir);
const testEnvironment = config.getEnvironment(logger);
await run(config, testEnvironment, logger);
