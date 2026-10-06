import { analyze } from './engine';
import type { Blueprint, Budget } from './types';
self.onmessage = (event: MessageEvent<{ blueprint: Blueprint; budget?: Partial<Budget> }>): void => {
  try { self.postMessage({ report: analyze(event.data.blueprint, event.data.budget) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'The design could not be checked.' }); }
};
