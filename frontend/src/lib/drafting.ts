import type { Contact, Job, JobData, Profile } from '../types';
import { PEOPLE } from '../data/constants';
import { slug } from './format';

export function draftNote(contact: Pick<Contact, 'name'>, job: Job, p: Profile): string {
  const first = contact.name.split(' ')[0];
  const ask = job.hasListing
    ? "I'm applying for the " + job.role + ' role at ' + job.company
    : "I'm hoping to join " + job.company + ' as a software engineer';
  return 'Hi ' + first + ", I'm " + p.name + ' (' + p.school.split(',')[0] + '). ' +
    ask + " and would be grateful for a referral if you're comfortable. I recently " +
    p.highlight + '. Thanks either way!';
}

export function draftEmail(job: Job, p: Profile): string {
  const role = job.hasListing ? 'the ' + job.role + ' position' : 'software engineering opportunities';
  return "Hi " + job.company + " Recruiting team,\n\nI'm " + p.name + ', ' + p.school +
    ". I'm reaching out about " + role + ' and wanted to introduce myself directly.' +
    "\n\nLast summer at Brex I shipped a card-controls API used by 400+ customers and cut p95 latency on spend-limit checks by 38%. On the side, I " +
    p.highlight + ".\n\nI'd love to bring that same ownership to " + job.company +
    '. My resume is attached — happy to share more or chat whenever works.' +
    '\n\nBest,\n' + p.name;
}

export function buildDone(job: Job, p: Profile): Extract<JobData, { status: 'done' }> {
  const contacts: Contact[] = PEOPLE.map(([name, title, degree, reason], i) => ({
    id: 'c' + i, name,
    title: title + ' at ' + job.company,
    degree, reason, status: 'Not sent',
    text: draftNote({ name }, job, p),
  }));
  return {
    status: 'done',
    contacts,
    email: {
      to: 'diego.alvarez@' + slug(job.company),
      toName: 'Diego Alvarez · Technical Recruiter',
      confidence: 'pattern verified · 86%',
      subject: job.hasListing
        ? job.role + ' — ' + p.name
        : 'Software Engineering at ' + job.company + ' — ' + p.name,
      text: draftEmail(job, p),
    },
  };
}
