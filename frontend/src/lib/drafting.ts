import type { Contact, Job, Profile } from '../types';

export function draftNote(contact: Pick<Contact, 'name'>, job: Job, p: Profile): string {
  const first = contact.name.split(' ')[0];
  const ask = job.hasListing
    ? "I'm applying for the " + job.role + ' role at ' + job.company
    : "I'm hoping to join " + job.company + ' as a software engineer';
  return 'Hi ' + first + ", I'm " + p.name + ' (' + p.school.split(',')[0] + '). ' +
    ask + " and would be grateful for a referral if you're comfortable. I recently " +
    p.highlight + '. Thanks either way!';
}
