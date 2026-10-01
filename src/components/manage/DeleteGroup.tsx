import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../Modal';

export function DeleteGroup({ remove, busy, disabled }: { remove: () => Promise<void>; busy: boolean; disabled: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    if (typed !== 'DELETE' || busy) return;
    setError('');
    try { await remove(); }
    catch { setError(t('manage.deleteFailed')); }
  };
  return <section className="mt-8 rounded-card border border-line bg-white p-5 sm:p-7"><h2 className="text-2xl text-pine">{t('manage.deleteTitle')}</h2><p className="mt-2 text-caption text-muted">{t('manage.deleteHelp')}</p><button className="btn-secondary mt-4 text-cranberry" disabled={busy || disabled} onClick={() => { setTyped(''); setError(''); setOpen(true); }}>{t('manage.deleteNow')}</button>
    {open && <Modal labelledBy="delete-title" busy={busy} onClose={() => setOpen(false)}><h2 id="delete-title" className="text-2xl text-pine">{t('manage.deleteWarningTitle')}</h2><p className="mt-4 text-muted">{t('manage.deleteWarning')}</p><label htmlFor="delete-confirmation" className="mt-4 block font-bold text-pine">{t('manage.typeDelete')}</label><input id="delete-confirmation" className="field mt-2" autoComplete="off" spellCheck={false} value={typed} disabled={busy} onChange={event => setTyped(event.target.value)}/>{error && <p className="notice-error mt-3" role="alert">{error}</p>}<div className="mt-6 flex flex-wrap gap-3"><button autoFocus className="btn-secondary" disabled={busy} onClick={() => setOpen(false)}>{t('manage.cancel')}</button><button className="btn-primary" disabled={typed !== 'DELETE' || busy} onClick={() => void submit()}>{busy ? t('manage.deleting') : t('manage.deletePermanently')}</button></div></Modal>}
  </section>;
}
