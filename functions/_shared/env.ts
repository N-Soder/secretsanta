import type { D1Like } from './db';

export interface Env {
  DB: D1Like;
  LINK_KEY: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

export interface Context<P extends string = never> {
  request: Request;
  env: Env;
  params: Record<P, string>;
}

export const emailEnabled = (env: Pick<Env, 'RESEND_API_KEY' | 'EMAIL_FROM'>) => Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
