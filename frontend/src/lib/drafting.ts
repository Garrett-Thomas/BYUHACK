import type { Contact, Job, Profile } from '../types';

const MAX = 300;

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
