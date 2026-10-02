import type { Profile } from '../types';

interface Props {
  profile: Profile;
  onChange: (patch: Partial<Profile>) => void;
}

export default function ProfileScreen({ profile, onChange }: Props) {
  const field = (id: string, label: string, key: keyof Profile, long?: boolean) => (
    <label className="lbl" htmlFor={id}>
      {label}
      {long
        ? <textarea className="ta ta-mono" id={id} rows={12} value={profile[key]}
            onChange={(e) => onChange({ [key]: e.target.value })} />
        : <input className="inp" id={id} type="text" value={profile[key]}
            onChange={(e) => onChange({ [key]: e.target.value })} />}
    </label>
  );

  return (
    <div className="col-720">
      <div>
        <h1>About you</h1>
        <p className="sub" style={{ marginTop: 8 }}>The AI uses this to write every referral note and email.</p>
      </div>
      <div className="pf-grid">
        {field('pf-name', 'Name', 'name')}
        {field('pf-school', 'School / background', 'school')}
      </div>
      {field('pf-highlight', 'One-line highlight to mention', 'highlight')}
      {field('pf-resume', 'Resume (paste text)', 'resume', true)}
      <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>Saved automatically.</div>
    </div>
  );
}
