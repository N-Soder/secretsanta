import { Trans } from "react-i18next";
import { SideMenu } from "./SideMenu";

export type LayoutProps = {
  menuItems?: React.ReactNode[];
  children: React.ReactNode;
};

export function Layout({ menuItems, children }: LayoutProps) {
  return (
    <div className="min-h-screen flex lg:items-center justify-center p-4 lg:overflow-hidden">
      <div className="container mx-auto max-w-5xl">
        <SideMenu>
          {menuItems}
        </SideMenu>

        <div className="my-12 md:my-16 flex flex-col justify-around lg:flex-row gap-12 md:gap-16">
          {children}
        </div>

        <footer className="pb-6 text-center text-sm text-[#f7f2e8]/70">
          <Trans
            i18nKey="footer.credit"
            components={{
              upstreamLink: <a className="underline hover:text-[#f7f2e8]" href="https://github.com/arcanis/secretsanta" target="_blank" rel="noopener noreferrer"/>,
            }}
          />
        </footer>
      </div>
    </div>
  );
}
