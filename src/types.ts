export type Scalar = string | number | boolean | null;
export type Fields = Record<string, Scalar>;
export interface Signal { resource: string; event: string; data: Fields }
export type Condition = { field: string; op: 'equals' | 'notEquals'; value: Scalar } | { field: string; op: 'exists' | 'missing' };
export interface Effect { resource: string; event: string; set?: Fields; unset?: string[] }
export interface Workflow {
  id: string;
  name: string;
  enabled?: boolean;
  on: { resource: string; event: string };
  when?: Condition[];
  emit: Effect[];
}
export interface Blueprint { version: 1; name: string; seed: Signal; workflows: Workflow[] }
export interface Budget { maxStates: number; maxTransitions: number }
export interface State extends Signal { id: number; matches: string[] }
export interface Transition { from: number; to: number; workflow: string; effect: number }
export interface Witness { leadIn: Transition[]; cycle: Transition[] }
export interface Analysis {
  schema: 'triggertangle.report/v1';
  name: string;
  blueprint: Blueprint;
  status: 'loop-found' | 'settles' | 'inconclusive';
  complete: boolean;
  reason: string;
  budget: Budget;
  stats: { states: number; transitions: number; workflowStarts: string | null; emittedEvents: string | null };
  states: State[];
  transitions: Transition[];
  witness: Witness | null;
  notes: string[];
}
