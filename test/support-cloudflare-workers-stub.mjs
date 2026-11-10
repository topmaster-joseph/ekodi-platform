// Shared node:test stub for the Workers runtime module (same pattern as marketing-oauth-state-failure).
import { register } from 'node:module';
const hooks = `export async function resolve(spec, ctx, next) {
  if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class WorkerEntrypoint { constructor(c,e){ this.ctx=c; this.env=e; } } export class DurableObject { constructor(c,e){ this.ctx=c; this.env=e; } }', shortCircuit: true };
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hooks));
