import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPLOYEES_WAIT_MS, IN_PLACE_WAIT_MS, mountSaveButton, type SaveButtonHandle } from '../src/saveButton';
import type { Message, SaveCompanyResponse } from '../src/types';

// The module remembers the last employees link it saw (to ignore a stale one after SPA navigation),
// so each test uses ids no earlier test used.
let nextId = 100;
const fresh = (): string => String(nextId++);

const EMPLOYEES = (ids: string[]): string =>
  `<a href="/search/results/people/?currentCompany=${encodeURIComponent(JSON.stringify(ids))}&origin=COMPANY_PAGE_CANNED_SEARCH">1K+ employees</a>`;

const host = (): HTMLElement | null => document.querySelector('[data-warmline="save-company"]');
const saveBtn = (): HTMLButtonElement => host()!.querySelector('button')!;

let handle: SaveButtonHandle | undefined;
let a = '';
let b = '';

function mount(slug: string, company: string, send: (m: Message) => Promise<unknown>, navigate = vi.fn()): ReturnType<typeof vi.fn> {
  handle = mountSaveButton({ slug, company, send, navigate, inPlace: false });
  return navigate;
}

beforeEach(() => {
  a = fresh();
  b = fresh();
  vi.useFakeTimers();
  document.title = '';
  document.body.innerHTML = '';
});

afterEach(() => {
  handle?.destroy();
  handle = undefined;
  vi.useRealTimers();
});

describe('save button', () => {
  it('appears with both names once the employees link exists, top-right with inline styles', () => {
    document.body.innerHTML = `<main><h1>Example Corp</h1>${EMPLOYEES([a, b])}</main>`;
    mount('example-corp', 'Acme', async () => ({ ok: true }));
    expect(saveBtn().textContent).toBe('Save "Example Corp" as "Acme"');
    expect(saveBtn().disabled).toBe(false);
    const style = host()!.style;
    expect(style.position).toBe('fixed');
    expect(style.right).toBe('16px');
    expect(style.top).toBe('72px');
    expect(Number(style.zIndex)).toBeGreaterThan(1_000_000);
  });

  it('puts names in with textContent, never as markup', () => {
    document.body.innerHTML = `<main><h1>&lt;img src=x onerror=alert(1)&gt;</h1>${EMPLOYEES([a])}</main>`;
    mount('x', '<b>Acme</b>', async () => ({ ok: true }));
    expect(host()!.querySelector('img')).toBeNull();
    expect(host()!.querySelector('b')).toBeNull();
    expect(saveBtn().textContent).toBe('Save "<img src=x onerror=alert(1)>" as "<b>Acme</b>"');
  });

  it('shows nothing before 10s, then a disabled button if there is no employees link', () => {
    document.body.innerHTML = '<main><h1>Example Corp</h1></main>';
    mount('example-corp', 'Acme', async () => ({ ok: true }));
    expect(host()).toBeNull();
    vi.advanceTimersByTime(EMPLOYEES_WAIT_MS - 1);
    expect(host()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(saveBtn().textContent).toBe("LinkedIn doesn't list employees for this page");
    expect(saveBtn().disabled).toBe(true);
  });

  it('enables itself if the employees link appears late', () => {
    document.body.innerHTML = '<main><h1>Example Corp</h1></main>';
    mount('example-corp', 'Acme', async () => ({ ok: true }));
    vi.advanceTimersByTime(EMPLOYEES_WAIT_MS);
    expect(saveBtn().disabled).toBe(true);
    document.querySelector('main')!.insertAdjacentHTML('beforeend', EMPLOYEES([a]));
    return vi.advanceTimersByTimeAsync(500).then(() => {
      expect(saveBtn().disabled).toBe(false);
      expect(saveBtn().textContent).toBe('Save "Example Corp" as "Acme"');
    });
  });

  it('is dismissed by the x button', () => {
    document.body.innerHTML = `<main><h1>Example Corp</h1>${EMPLOYEES([a])}</main>`;
    mount('example-corp', 'Acme', async () => ({ ok: true }));
    (host()!.querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(host()).toBeNull();
  });

  it('on click sends the slug, name and ids, then replaces the location with the 1st + 2nd degree search', async () => {
    document.body.innerHTML = `<main><h1>Example Corp</h1>${EMPLOYEES([a, b])}</main>`;
    const send = vi.fn(async (): Promise<SaveCompanyResponse> => ({ ok: true, company: 'Acme', ids: [a, b] }));
    const navigate = mount('example-corp', 'Acme', send);
    saveBtn().click();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledWith({ type: 'saveCompany', slug: 'example-corp', linkedinName: 'Example Corp', ids: [a, b] });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(
      `https://www.linkedin.com/search/results/people/?currentCompany=%5B%22${a}%22%2C%22${b}%22%5D&network=%5B%22F%22%2C%22S%22%5D&origin=COMPANY_PAGE_CANNED_SEARCH&warmline=Acme`,
    );
  });

  it('shows an error and stays clickable when the save fails, without navigating', async () => {
    document.body.innerHTML = `<main><h1>Example Corp</h1>${EMPLOYEES([a])}</main>`;
    const send = vi.fn(async (): Promise<SaveCompanyResponse> => ({ ok: false }));
    const navigate = mount('example-corp', 'Acme', send);
    saveBtn().click();
    await vi.advanceTimersByTimeAsync(0);
    expect(navigate).not.toHaveBeenCalled();
    expect(host()!.textContent).toContain("Couldn't reach Top of the Stack");
    expect(saveBtn().disabled).toBe(false);
    saveBtn().click();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('treats a rejected sendMessage as a failed save', async () => {
    document.body.innerHTML = `<main><h1>Example Corp</h1>${EMPLOYEES([a])}</main>`;
    const navigate = mount('example-corp', 'Acme', async () => {
      throw new Error('worker gone');
    });
    saveBtn().click();
    await vi.advanceTimersByTimeAsync(0);
    expect(navigate).not.toHaveBeenCalled();
    expect(host()!.textContent).toContain("Couldn't reach Top of the Stack");
  });

  it("ignores the previous company's employees link after SPA navigation to another company", async () => {
    document.body.innerHTML = `<main><h1>First Co</h1>${EMPLOYEES([a])}</main>`;
    handle = mountSaveButton({ slug: 'first-co', company: 'Acme', send: async () => ({ ok: true }), navigate: vi.fn() });
    expect(saveBtn().textContent).toBe('Save "First Co" as "Acme"');
    handle.destroy();
    // The new page's DOM has not rendered yet: the old link is still there.
    handle = mountSaveButton({ slug: 'second-co', company: 'Acme', send: async () => ({ ok: true }), navigate: vi.fn() });
    expect(host()).toBeNull();
    document.body.innerHTML = `<main><h1>Second Co</h1>${EMPLOYEES([b])}</main>`;
    await vi.advanceTimersByTimeAsync(500);
    expect(saveBtn().textContent).toBe('Save "Second Co" as "Acme"');
  });

  it('reloads an in-place company page once when the employees link is missing', () => {
    const reload = vi.fn();
    const slug = 'inplace-' + fresh();
    handle = mountSaveButton({ slug, company: 'Acme', send: vi.fn(), inPlace: true, reload });
    vi.advanceTimersByTime(IN_PLACE_WAIT_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    handle.destroy();
    // Same company in the same tab again (e.g. the link is really absent): no second reload.
    const reload2 = vi.fn();
    handle = mountSaveButton({ slug, company: 'Acme', send: vi.fn(), inPlace: true, reload: reload2 });
    vi.advanceTimersByTime(IN_PLACE_WAIT_MS);
    expect(reload2).not.toHaveBeenCalled();
  });

  it('does not reload when the link shows up, or when the page was fully loaded', () => {
    const reload = vi.fn();
    document.body.innerHTML = `<main>${EMPLOYEES([a])}</main>`;
    handle = mountSaveButton({ slug: 'loaded-' + fresh(), company: 'Acme', send: vi.fn(), inPlace: true, reload });
    vi.advanceTimersByTime(IN_PLACE_WAIT_MS);
    expect(reload).not.toHaveBeenCalled();
    handle.destroy();
    document.body.innerHTML = '';
    handle = mountSaveButton({ slug: 'full-' + fresh(), company: 'Acme', send: vi.fn(), inPlace: false, reload });
    vi.advanceTimersByTime(EMPLOYEES_WAIT_MS);
    expect(reload).not.toHaveBeenCalled();
  });
});
