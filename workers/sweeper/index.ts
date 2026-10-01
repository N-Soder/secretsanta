import type { Env } from '../../functions/_shared/env';
import { sweep } from '../../functions/_shared/sweep';

export default {
  scheduled(_controller: unknown, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    ctx.waitUntil(sweep(env).then(result => {
      console.log(JSON.stringify({ event: 'sweep', ...result }));
    }));
  },
};
