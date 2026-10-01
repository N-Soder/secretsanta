import { useState } from 'react';
import { exportUrl } from '../../api/client';
import type { ExportFormat } from '../../api/types';

export function Exports({ token }: { token: string }) {
  const [historyWarning, setHistoryWarning] = useState(false);
  const download = (kind: ExportFormat) => <a className="btn-secondary" href={exportUrl(token, kind)}>{kind === 'links' ? 'Download links CSV' : kind === 'json' ? 'Download JSON' : 'Download history CSV'}</a>;
  return <section className="mt-8 rounded-card border border-line bg-white p-5 sm:p-7"><h2 className="text-title text-pine">Exports</h2><p className="mt-2 text-caption text-muted">Download links to share, or a JSON copy of the group settings and people.</p><div className="mt-4 flex flex-wrap gap-3">{download('links')}{download('json')}<button className="btn-secondary" onClick={() => setHistoryWarning(true)}>Full history CSV</button></div>{historyWarning && <div className="notice mt-4" role="alert"><h3 id="history-warning-title" className="font-bold">This file reveals the pairings</h3><p className="mt-1">The full history includes who is giving to whom. Downloading it will spoil the surprise. Keep it somewhere private for next year.</p><div className="mt-3 flex flex-wrap gap-3"><a className="btn-secondary" href={exportUrl(token, 'history')} onClick={() => setHistoryWarning(false)}>Download full history CSV</a><button className="btn-quiet" onClick={() => setHistoryWarning(false)}>Cancel</button></div></div>}</section>;
}
