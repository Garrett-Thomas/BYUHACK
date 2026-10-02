import type { Speed } from '../types';
import SegmentedControl from './SegmentedControl';

interface Props {
  speed: Speed;
  onSpeed: (s: Speed) => void;
  showRepo: boolean;
  onShowRepo: (v: boolean) => void;
}

const SPEED_OPTIONS = (['Fast', 'Normal', 'Slow'] as const).map((s) => ({ value: s, label: s.toLowerCase() }));
const REPO_OPTIONS = [{ value: true, label: 'on' }, { value: false, label: 'off' }];

export default function Footer({ speed, onSpeed, showRepo, onShowRepo }: Props) {
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <div className="foot-item">
          <span className="eyebrow">agent speed</span>
          <SegmentedControl id="seg-speed" options={SPEED_OPTIONS} value={speed} onChange={onSpeed} />
        </div>
        <div className="foot-item">
          <span className="eyebrow">source column</span>
          <SegmentedControl id="seg-repo" options={REPO_OPTIONS} value={showRepo} onChange={onShowRepo} />
        </div>
      </div>
    </footer>
  );
}
