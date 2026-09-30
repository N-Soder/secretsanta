import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { decryptText } from '../utils/crypto';
import { Trans, useTranslation } from 'react-i18next';
import { PageTransition } from '../components/PageTransition';
import { Star } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import CryptoJS from 'crypto-js';
import { Layout } from "../components/Layout";
import { ReceiverData } from "../types";

async function loadPairing(searchParams: URLSearchParams): Promise<[string, ReceiverData]> {
  // Legacy pairings, not generated anymore; remove after 2025-01-01
  if (searchParams.has(`name`) && searchParams.has(`key`) && searchParams.has(`pairing`)) {
    const name = searchParams.get(`name`)!;
    const key = searchParams.get(`key`)!;
    const pairing = searchParams.get(`pairing`)!;

    return [name, {name: CryptoJS.AES.decrypt(pairing, key).toString(CryptoJS.enc.Utf8)}];
  }

  if (searchParams.has(`to`)) {
    const from = searchParams.get('from')!;
    const to = searchParams.get('to')!;
    const decrypted = await decryptText(to);

    try {
      // Try to parse as JSON first (new format with hint)
      const data = JSON.parse(decrypted) as ReceiverData;
      return [from, data];
    } catch {
      // If parsing fails, it's the old format (just the name)
      return [from, {name: decrypted, hint: undefined} as ReceiverData];
    }
  }

  throw new Error(`Missing key or to parameter in search params`);
}

export function Pairing() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<[string, ReceiverData] | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);

  useEffect(() => {
    const decryptReceiver = async () => {
      try {
        setAssignment(await loadPairing(searchParams));
        setInstructions(searchParams.get('info'));
      } catch (err) {
        console.error('Decryption error:', err);
        setError(t('pairing.error'));
      } finally {
        setLoading(false);
      }
    };

    decryptReceiver();
  }, [searchParams, t]);

  return (
    <Layout headerLink={{ to: '/', label: t('pairing.startYourOwn') }}>
      <div className="grid place-items-center py-8 sm:py-14">
        {error && (
          <div role="alert" className="notice-error max-w-md text-base text-center">
            {error}
          </div>
        )}

        {!loading && assignment && (
          <motion.div
            className="w-full max-w-[460px]"
            initial={{ opacity: 0, y: 24, rotateZ: -3 }}
            animate={{ opacity: 1, y: 0, rotateZ: 0 }}
            transition={{ ease: `easeOut`, duration: .6 }}
          >
            <div className="overflow-hidden rounded-[20px] border border-line bg-paper pb-9 text-center shadow-card">
              <div className="fair-isle h-[22px]" aria-hidden />
              <div className="px-6 pt-8 sm:px-8">
                <div className="mx-auto mb-5 w-3.5 h-3.5 rounded-full border-2 border-gold" aria-hidden />
                <h1 className="font-sans text-xs font-bold uppercase tracking-[0.18em] text-gold">
                  {t('pairing.title')}
                </h1>
                <p className="mt-3.5 text-base text-muted">
                  <Trans
                    i18nKey="pairing.assignment"
                    components={{
                      name: <strong className="text-pine">{assignment[0]}</strong>
                    }}
                  />
                </p>
                <div className="mt-4 mb-2 font-display text-[clamp(3.4rem,12vw,5.25rem)] leading-none text-pine break-words">
                  {assignment[1].name}
                </div>
                <div className="mx-auto my-6 w-[60px] h-0.5 rounded bg-cranberry" aria-hidden />
              </div>

              {(instructions || assignment[1].hint) && (
                <div className="mx-6 sm:mx-7 flex gap-2.5 rounded-xl bg-ivory px-4 py-3.5 text-left text-[15px] leading-relaxed text-body whitespace-pre-wrap">
                  <Star size={18} weight="fill" className="flex-none mt-1 text-gold" aria-hidden />
                  <div className="space-y-3">
                    {assignment[1].hint && <p>{assignment[1].hint}</p>}
                    {instructions && <p>{instructions}</p>}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
