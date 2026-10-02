import type { Contact, Job, Mutual, Profile } from '../types';

const MAX = 300;

// The profile fields that feed drafts; when it changes, untouched drafts are stale.
export const profileKey = (p: Profile) => p.name + '|' + p.school + '|' + p.highlight;

// Connection note, worded for how close the contact is. Degree is '1st' | '2nd' |
// '3rd' | 'Saved'. Stays under LinkedIn's 300-char limit by dropping the highlight
// sentence if the role/company names are long.
export function draftNote(contact: Pick<Contact, 'name' | 'degree'>, job: Job, p: Profile): string {
  const first = contact.name.split(' ')[0];
  const intro = 'Hi ' + first + ", I'm " + p.name + ' (' + p.school.split(',')[0] + '). ';
  const ask = job.hasListing
    ? "I'm applying for the " + job.role + ' role at ' + job.company
    : "I'm hoping to join " + job.company + ' as a software engineer';
  const hl = ' I recently ' + p.highlight + '.';
  let body: (hl: string) => string;
  if (contact.degree === '1st') {
    body = (h) => ask + " and would be grateful for a referral if you're comfortable." + h + ' Thanks either way!';
  } else if (contact.degree === '2nd') {
    body = (h) => ask + '. Could you point me to the right person on the team, or share a quick perspective on the role?' +
      h + ' Thanks either way!';
  } else {
    body = (h) => ask + '.' + h + ' Would you have 10 minutes to share your experience at ' + job.company + '? Thanks!';
  }
  const full = intro + body(hl);
  return full.length <= MAX ? full : intro + body('');
}

const INTRO_MAX = 600;

// Message to a 1st-degree mutual asking them to introduce you to a 2nd-degree
// target. A normal message to an existing connection, so no 300-char cap; drops
// the highlight sentence if it runs past ~600.
export function draftIntroRequest(
  mutual: Pick<Mutual, 'name'>, target: Pick<Contact, 'name' | 'title'>, job: Job, p: Profile,
): string {
  const m = mutual.name.split(' ')[0];
  const t = target.name.split(' ')[0];
  const what = target.title.split(/ [|·] /)[0].trim() || 'at ' + job.company;
  const doing = job.hasListing
    ? 'applying for the ' + job.role + ' role at ' + job.company
    : 'hoping to join ' + job.company + ' as a software engineer';
  const body = (hl: string) =>
    'Hi ' + m + ", hope you're doing well! I noticed you're connected with " + t + ", who's " + what + ". I'm " + doing +
    '. Would you be open to sending ' + t + ' a quick note? Something like: "Hey ' + t + ', my friend ' + p.name +
    ' (' + p.school.split(',')[0] + ') is ' + doing + '.' + hl + ' Would you be open to a quick chat or a referral?"' +
    ' Totally fine if not, thanks either way!';
  const full = body(' They ' + p.highlight + '.');
  return full.length <= INTRO_MAX ? full : body('');
}

// The untouched draft for a contact: an intro request to the selected mutual for
// 2nd-degree people who have one, otherwise the connection note.
export function draftContact(
  c: Pick<Contact, 'name' | 'title' | 'degree' | 'mutuals' | 'mutualIndex'>, job: Job, p: Profile,
): string {
  const m = c.degree === '2nd' ? c.mutuals[c.mutualIndex] ?? c.mutuals[0] : undefined;
  return m ? draftIntroRequest(m, c, job, p) : draftNote(c, job, p);
}
