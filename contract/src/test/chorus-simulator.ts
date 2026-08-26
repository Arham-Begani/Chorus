/**
 * The simulator moved to `src/simulator.ts` when the reporter agent's local
 * mode started using it too — it is library code, not test scaffolding.
 *
 * This re-export keeps the tests' import path stable.
 */

export { ChorusSimulator } from '../simulator.js';
