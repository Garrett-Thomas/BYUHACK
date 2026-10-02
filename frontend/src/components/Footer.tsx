import SegmentedControl from './SegmentedControl';

interface Props {
  showRepo: boolean;
  onShowRepo: (v: boolean) => void;
}

const REPO_OPTIONS = [{ value: true, label: 'on' }, { value: false, label: 'off' }];

export default function Footer({ showRepo, onShowRepo }: Props) {
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <div className="foot-item">
          <span className="eyebrow">source column</span>
          <SegmentedControl id="seg-repo" options={REPO_OPTIONS} value={showRepo} onChange={onShowRepo} />
        </div>
      </div>
    </footer>
  );
}
