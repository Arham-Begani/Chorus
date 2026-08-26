/**
 * How close a handle is to the threshold, as pips.
 *
 * The total comes from the ledger rather than a constant, so this cannot drift
 * away from the value actually sealed in the contract's constructor. If the
 * deployed threshold were four, this would draw four pips without being told.
 */

import { type JSX } from 'react';

type Props = {
  readonly count: string;
  readonly threshold: string;
};

export const Meter = ({ count, threshold }: Props): JSX.Element => {
  const total = Math.max(Number(threshold) || 0, 1);
  const filled = Math.min(Math.max(Number(count) || 0, 0), total);
  const hit = filled >= total;

  return (
    <div className={hit ? 'meter hit' : 'meter'}>
      <span className="pips">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < filled ? 'pip on' : 'pip'} />
        ))}
      </span>
      <span className="label">
        {filled} of {total} independent reporters
      </span>
    </div>
  );
};
