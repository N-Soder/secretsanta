import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Layout } from '../components/Layout';

// Unknown paths, and any unexpected render error, get a friendly page instead
// of the router's default error screen. No error details are shown.
export function RouteError() {
  const error = useRouteError();
  return <NotFound missing={isRouteErrorResponse(error) && error.status === 404}/>;
}

export function NotFound({ missing = true }: { missing?: boolean }) {
  return (
    <Layout>
      <section className="mx-auto max-w-2xl py-10">
        <p className="eyebrow">{missing ? 'Page not found' : 'Something went wrong'}</p>
        <h1 className="mt-2 text-display text-pine">{missing ? 'This page doesn’t exist' : 'This page couldn’t be shown'}</h1>
        <p className="mt-4 leading-relaxed text-muted">
          {missing
            ? 'Check the link you were sent. Secret Santa links look like /s/ followed by a short code.'
            : 'Please reload the page. If it keeps happening, start again from the home page.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="btn-secondary" to="/">Start a new draw</Link>
          <Link className="btn-quiet" to="/recover">Recover your organiser link</Link>
        </div>
      </section>
    </Layout>
  );
}
