import type { ProxyKind } from '../config/types.js';
import type { ProxyAppModule } from './types.js';
import { chatgptApp } from './chatgpt/index.js';
import { instagramApp } from './instagram/index.js';

const byKind: Record<ProxyKind, ProxyAppModule> = {
  chatgpt: chatgptApp,
  instagram: instagramApp,
};

export function getProxyAppModule(kind: ProxyKind): ProxyAppModule {
  return byKind[kind];
}

/** Register every app’s “before proxy” routes (each handler filters by kind). */
export function registerAllAppBeforeProxy(router: import('express').Router, log: import('pino').Logger): void {
  for (const mod of Object.values(byKind)) {
    mod.registerBeforeProxy(router, log);
  }
}
