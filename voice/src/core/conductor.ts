import { constraintsSchema, type Constraints, type Mission, type TaskKind } from './types';

const ones: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const words = Object.keys(ones).join('|');
const numberPhrase = new RegExp(
  `\\b(?:${words})(?:(?:[ -]+)(?:${words}|hundred|thousand|lakh|lakhs|million|and|point))*\\b`,
  'gi',
);
export function normalizeSpeech(text: string) {
  return text
    .toLowerCase()
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(numberPhrase, (phrase) => {
      let total = 0,
        group = 0;
      const parts = phrase
        .replace(/-/g, ' ')
        .split(/\s+/)
        .filter((x) => x !== 'and');
      const point = parts.indexOf('point');
      const integer = point < 0 ? parts : parts.slice(0, point);
      for (const word of integer) {
        if (word in ones) group += ones[word];
        else if (word === 'hundred') group = Math.max(1, group) * 100;
        else {
          const scale = word.startsWith('lakh') ? 100000 : word === 'million' ? 1000000 : 1000;
          total += Math.max(1, group) * scale;
          group = 0;
        }
      }
      const fraction =
        point < 0
          ? ''
          : '.' +
            parts
              .slice(point + 1)
              .map((x) => ones[x])
              .join('');
      return String(total + group) + fraction;
    })
    .replace(/\b(a\.?\s*m\.?|p\.?\s*m\.?)\b/g, (s) => s.replace(/[.\s]/g, ''));
}
function partsAt(value: Date, zone: string) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const v = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return { date: `${v.year}-${v.month}-${v.day}`, hour: Number(v.hour), minute: Number(v.minute) };
}
function wallTime(date: string, hour: number, minute: number, zone: string) {
  const target = Date.parse(
    `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  );
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = partsAt(new Date(guess), zone);
    guess +=
      target -
      Date.parse(
        `${p.date}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:00Z`,
      );
  }
  const same = (t: number) => {
    const p = partsAt(new Date(t), zone);
    return p.date === date && p.hour === hour && p.minute === minute;
  };
  if (!same(guess) || same(guess - 3600000) || same(guess + 3600000))
    throw new Error(
      'That local time is missing or ambiguous at a daylight-saving change. Use an ISO time with its UTC offset in Revise goal.',
    );
  return new Date(guess).toISOString();
}
export function goalConstraints(text: string, base: Constraints, now = new Date()) {
  const s = normalizeSpeech(text),
    constraints = { ...base };
  const changed: string[] = [];
  if (/(?:\$|€|£|\b(?:usd|dollars?|euros?|pounds?)\b)/i.test(s))
    throw new Error('This mission currently supports INR. State the budget in rupees.');
  const budget =
    s.match(
      /(?:budget|spending(?: limit)?|under|within|up to|no more than|cap(?: it)?)(?:\s+(?:is|to|of|at|under|below|must|stay|be))*\s*(?:₹|rs\.?|inr|rupees)?\s*(\d+(?:\.\d+)?)\s*(k|lakh|lakhs)?\b/,
    ) ||
    s.match(/(?:₹|inr|rs\.?)\s*(\d+(?:\.\d+)?)\s*(k|lakh|lakhs)?\b/) ||
    s.match(/\b(\d+(?:\.\d+)?)\s*(k|lakh|lakhs)?\s+rupees\b/);
  if (budget) {
    constraints.budgetMinor = Math.round(
      Number(budget[1]) *
        (budget[2]?.startsWith('lakh') ? 100000 : budget[2] === 'k' ? 1000 : 1) *
        100,
    );
    changed.push('budget');
  }
  if (/\b(?:budget|spending|under|within|up to)\b[^\d.]{0,20}-\s*\d/.test(s))
    throw new Error('Budget cannot be negative.');
  if (
    /\b\d+\.\d+\s+(?:people|guests|persons|attendees|units)\b|(?:^|\s)-\d+\s+(?:people|guests|persons|attendees|units)\b/.test(
      s,
    )
  )
    throw new Error('People and capacity must be positive whole numbers.');
  const quantity =
    s.match(/\b(\d+)\s+(?:people|guests|persons|attendees|units)\b/) ||
    s.match(/\b(?:quantity|capacity|guest count)(?:\s+(?:to|of|is))?\s+(\d+)\b/);
  if (quantity) {
    constraints.quantity = Number(quantity[1]);
    changed.push('quantity');
  }
  const zone = text.match(/\b[A-Z][a-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?\b/)?.[0];
  if (zone) {
    constraints.timezone = zone;
    changed.push('time zone');
  }
  // Validate the zone before Intl uses it. Preserve the original zone unless explicitly changed.
  constraintsSchema.pick({ timezone: true }).parse({ timezone: constraints.timezone });
  const old = partsAt(new Date(base.eventStart), constraints.timezone);
  const today = partsAt(now, constraints.timezone).date;
  let date = old.date,
    hour = old.hour,
    minute = old.minute,
    hasTime = false;
  const explicitDate = s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (explicitDate) {
    date = explicitDate[1];
    const parsed = Date.parse(date + 'T12:00:00Z');
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date)
      throw new Error('Use a valid calendar date in YYYY-MM-DD format.');
    hasTime = true;
  }
  if (/\btomorrow\b/.test(s)) {
    date = new Date(Date.parse(today + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
    hasTime = true;
  } else if (/\btoday\b/.test(s)) {
    date = today;
    hasTime = true;
  }
  const weekday = s.match(
    /\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  );
  if (weekday) {
    const d = new Date(today + 'T12:00:00Z');
    const offset =
      (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(
        weekday[1],
      ) -
        d.getUTCDay() +
        7) %
        7 || 7;
    date = new Date(d.getTime() + offset * 86400000).toISOString().slice(0, 10);
    hasTime = true;
  }
  const clock =
    s.match(
      /\b(?:at|by|starts?(?: at)?|begins?(?: at)?|deadline(?: to| is)?|start time(?: to| is)?)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/,
    ) || s.match(/\b(?:at|by|starts? at|deadline(?: to| is)?)\s+(\d{1,2}):(\d{2})\b/);
  if (clock) {
    hour = Number(clock[1]);
    minute = Number(clock[2] || 0);
    if (minute > 59 || (clock[3] ? hour < 1 || hour > 12 : hour > 23))
      throw new Error('Use a valid time such as 6 pm or 18:00.');
    if (clock[3]) hour = (hour % 12) + (clock[3] === 'pm' ? 12 : 0);
    hasTime = true;
  } else if (/\b(?:starts? at|start time(?: to| is)?)\s+\d{1,2}\b/.test(s))
    throw new Error('Please include am or pm, or use a 24-hour time such as 18:00.');
  const iso = text.match(
    /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/i,
  )?.[0];
  if (hasTime || iso) {
    constraints.eventStart = iso
      ? new Date(iso).toISOString()
      : wallTime(date, hour, minute, constraints.timezone);
    if (Date.parse(constraints.eventStart) <= now.getTime())
      throw new Error('That event time has already passed. Choose a future date and time.');
    changed.push('deadline');
  }
  return {
    constraints: constraintsSchema.parse(constraints),
    changed: changed.filter((name) =>
      name === 'budget'
        ? constraints.budgetMinor !== base.budgetMinor
        : name === 'quantity'
          ? constraints.quantity !== base.quantity
          : name === 'time zone'
            ? constraints.timezone !== base.timezone
            : Date.parse(constraints.eventStart) !== Date.parse(base.eventStart),
    ),
  };
}
export type ConductorIntent =
  | { kind: 'create'; scenario: Mission['scenario']; constraints: Constraints; goal: string }
  | { kind: 'revise'; constraints: Constraints; changed: string[] }
  | { kind: 'status' | 'pause' | 'resume' | 'research' | 'approval' | 'help' }
  | { kind: 'retry'; taskKind: TaskKind };
export function conductorIntent(
  text: string,
  mission: Mission | null,
  defaults: Constraints,
  now = new Date(),
): ConductorIntent {
  const s = normalizeSpeech(text)
    .trim()
    .replace(/^please\s+/, '')
    .replace(/[.!?]+$/, '');
  if (/\b(?:don't|do not|never)\b/.test(s)) return { kind: 'help' };
  if (/^(?:what|why|how|can|could|would|do|does|is|are)\b/.test(s))
    return { kind: mission ? 'status' : 'help' };
  const newGoal =
    !mission ||
    /\b(?:new mission|create (?:a |an )?mission|our venue (?:has )?cancelled|find (?:an? )?(?:alternative |replacement )?venue|rent (?:sound |audio )?equipment)\b/.test(
      s,
    );
  if (
    newGoal &&
    /\b(venue|caterer|catering|transport|equipment|rental|microphones?|sound system|pa system)\b/.test(
      s,
    )
  )
    return {
      kind: 'create',
      scenario: /\b(equipment|rental|microphones?|sound system|pa system)\b/.test(s)
        ? 'equipment'
        : 'relocation',
      constraints: goalConstraints(text, defaults, now).constraints,
      goal: text,
    };
  if (/^(?:pause(?: (?:the )?mission)?|stop (?:the )?(?:research|conversations))$/.test(s))
    return { kind: 'pause' };
  if (/^(?:resume|continue)(?: (?:the )?(?:mission|research))?$/.test(s)) return { kind: 'resume' };
  if (
    /^(?:start|begin|run|launch|request)(?: the)? (?:research|simulation|conversations|calls)$/.test(
      s,
    )
  )
    return { kind: 'research' };
  if (/\b(?:approve|authorize|book|purchase|reserve)\b/.test(s)) return { kind: 'approval' };
  const retry = s.match(
    /^(?:retry|try again(?: with)?)(?: the)? (venue|caterer|catering|transport|equipment|delivery)$/,
  );
  if (retry)
    return {
      kind: 'retry',
      taskKind: retry[1] === 'catering' ? 'caterer' : (retry[1] as TaskKind),
    };
  if (
    mission &&
    /^(?:reduce|lower|change|set|increase|make|move|revise|budget|quantity|capacity|guest count|deadline|event starts|start time|under|within)\b/.test(
      s,
    )
  ) {
    const update = goalConstraints(text, mission.constraints, now);
    if (update.changed.length) return { kind: 'revise', ...update };
  }
  if (
    /\b(status|progress|summary|summarize|summarise|brief|blocking|learned|budget|deadline)\b/.test(
      s,
    ) ||
    /^how (?:is|are)/.test(s)
  )
    return { kind: 'status' };
  return { kind: 'help' };
}
export function missionSummary(m: Mission) {
  const money = (n: number) => `INR ${(n / 100).toLocaleString('en-IN')}`;
  const deadline = new Intl.DateTimeFormat('en-IN', {
    timeZone: m.constraints.timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(m.constraints.eventStart));
  const active = m.attempts.filter((a) => !['completed', 'failed'].includes(a.status)).length;
  const blockers = m.conflicts
    .filter((c) => c.kind !== 'missing')
    .slice(0, 2)
    .map((c) => c.message)
    .join(' ');
  return `Revision ${m.revision}. ${m.constraints.quantity} ${m.scenario === 'relocation' ? 'guests' : 'capacity'}, ${money(m.constraints.budgetMinor)} maximum, ${deadline} (${m.constraints.timezone}). ${active} active ${m.mode === 'simulation' ? 'simulated conversations' : 'calls'}. ${m.plan.feasible ? `Confirmed current terms total ${money(m.plan.totalMinor)}. Review the plan approval card; nothing is booked.` : blockers || 'Current confirmed terms are still needed.'} ${m.status === 'paused' ? 'The mission is paused.' : ''}`.trim();
}
