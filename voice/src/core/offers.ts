import type { Mission } from './types';

export function currentOffer(m: Mission, taskId: string) {
  return [...m.offers]
    .reverse()
    .find(
      (o) =>
        o.taskId === taskId &&
        o.revision === m.revision &&
        o.mode === m.mode &&
        !o.stale &&
        !o.declined,
    );
}
