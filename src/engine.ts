import { validateBlueprint } from './model';
import type { Analysis, Blueprint, Budget, Condition, Fields, Signal, State, Transition, Witness } from './types';

export const DEFAULT_BUDGET: Budget = { maxStates: 256, maxTransitions: 2048 };
export const NOTES = [
  'Design rehearsal only. No live accounts, tools or workflows were connected or executed.',
  'The result applies only to this seed and these exact, declared resource IDs, event types and field rules.',
  'Delivery is modeled as once per emitted event. Retries, concurrency, timing, changed-only writes, stored records, deduplication and LLM decisions are not modeled.',
  'A cycle is repeatable under this deterministic model, not proof of runaway behavior in a real platform. Settles is not a production safety certification.',
  'Disabling a workflow can break a loop while also removing intended work. Test business outcomes separately.',
];
function key(signal: Signal): string {
  return JSON.stringify([signal.resource, signal.event, Object.entries(signal.data).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)]);
}
function matches(data: Fields, condition: Condition): boolean {
  const exists = Object.hasOwn(data, condition.field);
  switch (condition.op) {
    case 'exists': return exists;
    case 'missing': return !exists;
    case 'equals': return exists && data[condition.field] === condition.value;
    case 'notEquals': return !exists || data[condition.field] !== condition.value;
  }
}
function limits(input: Partial<Budget>): Budget {
  for (const field of Object.keys(input)) if (!['maxStates', 'maxTransitions'].includes(field)) throw new Error('Unsupported exploration budget setting.');
  const budget = { ...DEFAULT_BUDGET, ...input };
  if (!Number.isInteger(budget.maxStates) || budget.maxStates < 1 || budget.maxStates > 512 || !Number.isInteger(budget.maxTransitions) || budget.maxTransitions < 1 || budget.maxTransitions > 8192) throw new Error('Budget requires 1–512 states and 1–8,192 transitions.');
  return budget;
}

export function analyze(input: Blueprint, requestedBudget: Partial<Budget> = {}): Analysis {
  const blueprint = validateBlueprint(input); const budget = limits(requestedBudget);
  const states: State[] = [{ ...blueprint.seed, data: { ...blueprint.seed.data }, id: 0, matches: [] }];
  const transitions: Transition[] = []; const identifiers = new Map([[key(blueprint.seed), 0]]);
  const parents: Array<Transition | undefined> = [undefined];
  let complete = true;
  exploration: for (let index = 0; index < states.length; index++) {
    const state = states[index]!;
    for (const workflow of blueprint.workflows) {
      if (workflow.enabled === false || workflow.on.resource !== state.resource || workflow.on.event !== state.event || (workflow.when !== undefined && !workflow.when.every(condition => matches(state.data, condition)))) continue;
      state.matches.push(workflow.id);
      for (const [effectIndex, effect] of workflow.emit.entries()) {
        if (transitions.length >= budget.maxTransitions) { complete = false; break exploration; }
        const data = { ...state.data }; for (const field of effect.unset ?? []) delete data[field]; Object.assign(data, effect.set);
        const signal: Signal = { resource: effect.resource, event: effect.event, data };
        const signature = key(signal); let target = identifiers.get(signature);
        if (target === undefined) {
          if (states.length >= budget.maxStates) { complete = false; break exploration; }
          target = states.length; identifiers.set(signature, target); states.push({ ...signal, id: target, matches: [] });
          parents[target] = { from: index, to: target, workflow: workflow.id, effect: effectIndex };
        }
        transitions.push({ from: index, to: target, workflow: workflow.id, effect: effectIndex });
      }
    }
  }
  const outgoing: Transition[][] = states.map(() => []);
  for (const transition of transitions) outgoing[transition.from]!.push(transition);
  const witness = findCycle(outgoing, parents);
  const status = witness ? 'loop-found' : complete ? 'settles' : 'inconclusive';
  const counts = complete && !witness ? countDeliveries(states, outgoing) : { workflowStarts: null, emittedEvents: null };
  const reason = witness ? `A reachable signal repeats along a causal cycle in this model.${complete ? '' : ' Other branches remain unexplored because the budget was reached.'}` : complete ? 'Every reachable branch settles for this seed under the declared rules.' : 'The exploration budget was reached before all branches were checked. No conclusion about termination is available.';
  return { schema: 'triggertangle.report/v1', name: blueprint.name, blueprint: structuredClone(blueprint), status, complete, reason, budget, stats: { states: states.length, transitions: transitions.length, ...counts }, states, transitions, witness, notes: [...NOTES] };
}

function findCycle(outgoing: Transition[][], parents: Array<Transition | undefined>): Witness | null {
  const colors = new Uint8Array(outgoing.length); const ancestry: Array<Transition | undefined> = [];
  function visit(node: number): Transition[] | null {
    colors[node] = 1;
    for (const edge of outgoing[node]!) {
      if (colors[edge.to] === 1) {
        const cycle = [edge]; let current = edge.from;
        while (current !== edge.to) { const parent = ancestry[current]!; cycle.unshift(parent); current = parent.from; }
        return cycle;
      }
      if (colors[edge.to] === 0) { ancestry[edge.to] = edge; const found = visit(edge.to); if (found) return found; }
    }
    colors[node] = 2; return null;
  }
  const cycle = visit(0);
  if (!cycle) return null;
  const leadIn: Transition[] = []; let current = cycle[0]!.from;
  while (parents[current]) { const parent = parents[current]!; leadIn.unshift(parent); current = parent.from; }
  return { leadIn, cycle };
}

function countDeliveries(states: State[], outgoing: Transition[][]): { workflowStarts: string; emittedEvents: string } {
  const incoming = new Uint32Array(states.length);
  for (const edges of outgoing) for (const edge of edges) incoming[edge.to] = incoming[edge.to]! + 1;
  const queue = states.filter(state => incoming[state.id] === 0).map(state => state.id);
  const visits = states.map(() => 0n); visits[0] = 1n;
  let workflowStarts = 0n; let emittedEvents = 0n;
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index]!; const count = visits[node]!;
    workflowStarts += count * BigInt(states[node]!.matches.length);
    for (const edge of outgoing[node]!) {
      emittedEvents += count; visits[edge.to] = visits[edge.to]! + count;
      incoming[edge.to] = incoming[edge.to]! - 1;
      if (incoming[edge.to] === 0) queue.push(edge.to);
    }
  }
  return { workflowStarts: workflowStarts.toString(), emittedEvents: emittedEvents.toString() };
}
