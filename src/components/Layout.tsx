import { ArrowRight, Snowflake } from "@phosphor-icons/react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export type LayoutProps = {
  headerLink?: { to: string; label: string };
  children: React.ReactNode;
};

export function Layout({ headerLink, children }: LayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col">
      <div className="fair-isle h-7 flex-none" aria-hidden />

      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 flex-1 flex flex-col">
        <header className="flex items-center justify-between gap-4 py-5">
          <Link to="/" className="flex items-center gap-2.5 font-display text-2xl text-pine">
            <Snowflake size={24} weight="bold" className="text-cranberry" aria-hidden />
            {t('home.brand')}
          </Link>
          {headerLink && (
            <Link to={headerLink.to} className="flex items-center gap-1 text-sm text-muted hover:text-pine transition-colors">
              {headerLink.label}
              <ArrowRight size={14} weight="bold" aria-hidden />
            </Link>
          )}
        </header>

        <main className="flex-1">
          {children}
        </main>

        <footer className="mt-12 border-t border-line py-6 text-sm text-muted">
          <Trans
            i18nKey="footer.credit"
            components={{
              upstreamLink: <a className="text-pine underline underline-offset-2 hover:text-cranberry" href="https://github.com/arcanis/secretsanta" target="_blank" rel="noopener noreferrer"/>,
            }}
          />
        </footer>
      </div>
    </div>
  );
}
