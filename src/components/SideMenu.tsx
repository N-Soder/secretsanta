import { Link } from 'react-router-dom';

export function MenuItem({icon, to, onClick, children}: {icon: React.ReactNode, to?: string, onClick?: () => void, children: React.ReactNode}) {
  const contents = (
    <div className="flex items-center select-none">
      <div className={`flex items-center justify-center w-6 mr-2 text-center`}>{icon}</div>
      <div>{children}</div>
    </div>
  );

  const className = `flex bg-white/60 hover:bg-white transition-colors rounded shadow px-2 py-1 cursor-pointer items-baseline`;

  const render = to
    ? to.startsWith(`https://`)
      ? <a className={className} href={to} target={`_blank`}>{contents}</a>
      : <Link className={className} to={to}>{contents}</Link>
    : <div className={className} onClick={onClick}>{contents}</div>;

  return render;
}

export function SideMenu({children}: {children?: React.ReactNode}) {
  return (
    <div className="lg:absolute top-4 left-4 z-50 flex flex-col items-start space-y-2">
      {children}
    </div>
  );
} 