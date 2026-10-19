import { z } from 'zod';
export const constraintsSchema = z
  .object({
    budgetMinor: z.number().int().min(0).max(100_000_000),
    currency: z.literal('INR'),
    quantity: z.number().int().min(1).max(10000),
    eventStart: z.iso.datetime({ offset: true }),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, 'Invalid IANA time zone'),
  })
  .strict();
export type Constraints = z.infer<typeof constraintsSchema>;
export const kindSchema = z.enum(['venue', 'caterer', 'transport', 'equipment', 'delivery']);
export type TaskKind = z.infer<typeof kindSchema>;
export type Mode = 'simulation' | 'real';
export type CallStatus =
  | 'dispatching'
  | 'uncertain'
  | 'queued'
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'call-disconnected'
  | 'completed'
  | 'failed';
export const activeStatuses: CallStatus[] = [
  'dispatching',
  'uncertain',
  'queued',
  'initiated',
  'ringing',
  'in-progress',
  'call-disconnected',
];
export const termsSchema = z
  .object({
    priceMinor: z.number().int().min(0).max(100_000_000),
    currency: z.literal('INR'),
    capacity: z.number().int().min(0).max(10000).optional(),
    readyAt: z.iso.datetime({ offset: true }).optional(),
    setupMinutes: z.number().int().min(0).max(1440).optional(),
    description: z.string().min(1).max(1000),
    confirmation: z.enum(['reported', 'confirmed']),
  })
  .strict();
export type Terms = z.infer<typeof termsSchema>;
export interface Contact {
  id: string;
  name: string;
  kind: TaskKind;
  phone: string;
  authorized: boolean;
}
export interface Task {
  id: string;
  kind: TaskKind;
  contactId: string;
  title: string;
  dependsOn: string[];
  state: 'pending' | 'active' | 'complete' | 'blocked';
  question: string;
  rounds: number;
  dispatchBlocked?: boolean;
}
export interface Attempt {
  id: string;
  taskId: string;
  mode: Mode;
  status: CallStatus;
  executionId?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  phase: number;
  dueAt: string;
  lastBrief?: string;
  briefRevision?: number;
  briefEvidenceKey?: string;
  error?: string;
  costMinor?: number;
  recordingUrl?: string;
  transcript?: string;
  artifactPollCount?: number;
  artifactNextPollAt?: string;
  providerStatus?: string;
  providerCostCents?: number;
  providerDurationSeconds?: number;
  providerBillingSettled?: boolean;
}
export interface Observation {
  id: string;
  taskId: string;
  attemptId: string;
  mode: Mode;
  text: string;
  createdAt: string;
  revision: number;
  confirmation: 'reported' | 'confirmed';
}
export interface Offer extends Terms {
  id: string;
  taskId: string;
  attemptId: string;
  mode: Mode;
  revision: number;
  stale: boolean;
  declined: boolean;
  createdAt: string;
}
export interface Approval {
  id: string;
  kind: 'research' | 'plan';
  revision: number;
  evidenceKey: string;
  status: 'requested' | 'approved' | 'declined' | 'stale';
  createdAt: string;
  decidedAt?: string;
  callBudgetMinor?: number;
}
export interface Conflict {
  id: string;
  kind: 'budget' | 'timing' | 'capacity' | 'missing' | 'confirmation' | 'clarification';
  taskId?: string;
  message: string;
}
export interface MissionEvent {
  id: string;
  type: string;
  at: string;
  mode: Mode;
  revision: number;
  message: string;
  attemptId?: string;
}
export interface Revision {
  id: string;
  number: number;
  constraints: Constraints;
  reason: string;
  createdAt: string;
}
export interface Mission {
  id: string;
  ownerId: string;
  title: string;
  goal: string;
  scenario: 'relocation' | 'equipment';
  mode: Mode;
  status: 'draft' | 'running' | 'paused' | 'blocked' | 'ready' | 'approved';
  revision: number;
  constraints: Constraints;
  revisions: Revision[];
  contacts: Contact[];
  tasks: Task[];
  attempts: Attempt[];
  observations: Observation[];
  offers: Offer[];
  approvals: Approval[];
  conflicts: Conflict[];
  events: MissionEvent[];
  processedKeys: string[];
  responses: Record<string, Terms[]>;
  createdAt: string;
  updatedAt: string;
  plan: { offerIds: string[]; totalMinor: number; feasible: boolean };
  callBudgetMinor: number;
  callReservedMinor: number;
}
export interface Scope {
  role: 'conductor' | 'phone';
  missionId: string;
  taskId?: string;
  attemptId?: string;
  ownerId: string;
  expires: number;
}
