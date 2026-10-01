import type { Context } from '../_shared/env';
import { apiError } from '../_shared/http';

const methods: [RegExp, string[]][] = [
  [/^\/api\/config\/?$/, ['GET']],
  [/^\/api\/groups\/?$/, ['POST']],
  [/^\/api\/recover\/?$/, ['POST']],
  [/^\/api\/manage\/[^/]+\/send\/?$/, ['POST']],
  [/^\/api\/manage\/[^/]+\/?$/, ['GET', 'PATCH', 'DELETE']],
  [/^\/api\/manage\/[^/]+\/redraw\/?$/, ['POST']],
  [/^\/api\/manage\/[^/]+\/export\/?$/, ['GET']],
  [/^\/api\/s\/[^/]+\/?$/, ['GET']],
  [/^\/api\/s\/[^/]+\/wishlist\/?$/, ['PUT']],
];

export async function onRequest({ request, next }: Context & { next(): Promise<Response> }): Promise<Response> {
  const path = new URL(request.url).pathname;
  const route = methods.find(([pattern]) => pattern.test(path));
  if (!route) return apiError('notFound', 404);
  if (!route[1].includes(request.method)) return apiError('methodNotAllowed', 405);
  try {
    const response = await next();
    const result = new Response(response.body, response);
    result.headers.set('Cache-Control', 'no-store');
    result.headers.set('Referrer-Policy', 'no-referrer');
    return result;
  } catch {
    console.error('Secret Santa API request failed');
    return apiError('unavailable', 500);
  }
}
