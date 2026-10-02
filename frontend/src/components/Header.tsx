import Logo from './Logo';
import type { Screen } from '../types';

interface Props {
  screen: Screen;
  prevScreen: Screen;
  name: string;
  go: (s: Screen) => void;
}

const TABS: [string, Screen][] = [['Jobs', 'jobs'], ['Company search', 'company'], ['Profile', 'profile']];

export default function Header({ screen, prevScreen, name, go }: Props) {
  const active = (key: Screen) => screen === key || (screen === 'job' && prevScreen === key);
  return (
    <header className="hdr">
      <div className="wrap hdr-in">
        <div className="mark"><Logo size={24} /><span>Top of the Stack</span></div>
        <nav className="tabs" id="tabs" aria-label="Sections">
          {TABS.map(([label, key]) => (
            <button key={key} className={'tab' + (active(key) ? ' on' : '')}
              aria-current={active(key) ? 'page' : undefined} onClick={() => go(key)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="hdr-right"><div className="dot"></div><span id="hdr-name">resume loaded · {name}</span></div>
      </div>
    </header>
  );
}
