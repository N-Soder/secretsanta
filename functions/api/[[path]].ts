import { apiError } from '../_shared/http';

export function onRequest(): Response { return apiError('notFound', 404); }
