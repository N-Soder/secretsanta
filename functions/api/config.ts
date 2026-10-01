import { Context, emailEnabled } from '../_shared/env';
import { json } from '../_shared/http';

export function onRequestGet({ env }: Context): Response {
  return json({ emailEnabled: emailEnabled(env), turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? '' });
}
