import { APIUserAbortError } from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findContact, validEmail } from "../src/findContact.js";
import type { AttemptResult } from "../src/findContact.js";

// A fake `run` whose three attempts are controlled by the test.
function fakeRun() {
  const signals: AbortSignal[] = [];
  const focuses: string[] = [];
  const controls: { resolve: (r: AttemptResult) => void; reject: (e: unknown) => void }[] = [];
  const run = (_info: Record<string, unknown>, focus: string, signal: AbortSignal) =>
    new Promise<AttemptResult>((resolve, reject) => {
      focuses.push(focus);
      signals.push(signal);
      controls.push({ resolve, reject });
    });
  return { run, signals, focuses, controls };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const info = { company: "Acme", role: "Engineer" };

let unhandled: unknown[];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

beforeEach(() => {
  unhandled = [];
  process.on("unhandledRejection", onUnhandled);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  vi.restoreAllMocks();
});

describe("findContact", () => {
  it("starts 3 attempts at once, each with a different focus", async () => {
    const f = fakeRun();
    const p = findContact(info, f.run);
    expect(f.controls).toHaveLength(3);
    expect(new Set(f.focuses).size).toBe(3);
    f.controls.forEach((c) => c.resolve(null));
    await p;
  });

  it("first valid email wins and the other attempts are aborted", async () => {
    const f = fakeRun();
    const p = findContact(info, f.run);
    f.controls[1].resolve({ email: " second@acme.com ", label: " Second Person " });
    expect(await p).toEqual({ email: "second@acme.com", label: "Second Person" });
    expect(f.signals.map((s) => s.aborted)).toEqual([true, false, true]);
  });

  it("skips an invalid email and uses a later valid one", async () => {
    const f = fakeRun();
    const p = findContact(info, f.run);
    f.controls[0].resolve({ email: "not-an-email", label: "Nobody" });
    await tick();
    expect(f.signals[0].aborted).toBe(false);
    expect(f.signals[1].aborted).toBe(false);
    f.controls[2].resolve({ email: "third@acme.com", label: "Third" });
    expect(await p).toEqual({ email: "third@acme.com", label: "Third" });
  });

  it("returns a winner that settles last", async () => {
    const f = fakeRun();
    const p = findContact(info, f.run);
    f.controls[0].resolve(null);
    f.controls[1].reject(new Error("boom"));
    await tick();
    f.controls[2].resolve({ email: "last@acme.com", label: "Last" });
    expect(await p).toEqual({ email: "last@acme.com", label: "Last" });
  });

  it("returns {} when attempts mix not-found and errors", async () => {
    const f = fakeRun();
    const p = findContact(info, f.run);
    f.controls[0].resolve(null);
    f.controls[1].reject(new Error("boom"));
    f.controls[2].resolve(null);
    expect(await p).toEqual({});
  });

  it("returns {} when the only completed attempt found an invalid email", async () => {
    const f = fakeRun();
    const p = findContact(info, f.run);
    f.controls[0].resolve({ email: "jane@example.com", label: "Jane" });
    f.controls[1].reject(new Error("boom"));
    f.controls[2].reject(new Error("boom"));
    expect(await p).toEqual({});
  });

  it("throws when all attempts fail", async () => {
    const f = fakeRun();
    const p = findContact(info, f.run);
    const settled = expect(p).rejects.toThrow("last failure");
    f.controls[0].reject(new Error("first failure"));
    f.controls[1].reject(new Error("middle failure"));
    f.controls[2].reject(new Error("last failure"));
    await settled;
  });

  it("throws when run throws synchronously in every attempt", async () => {
    await expect(
      findContact(info, () => {
        throw new Error("sync failure");
      }),
    ).rejects.toThrow("sync failure");
  });

  it("aborted attempts rejecting after a winner change nothing and cause no unhandled rejection", async () => {
    const f = fakeRun();
    const p = findContact(info, f.run);
    f.controls[2].resolve({ email: "win@acme.com", label: "Winner" });
    const result = await p;
    f.controls[0].reject(new APIUserAbortError());
    const abortError = new Error("This operation was aborted");
    abortError.name = "AbortError";
    f.controls[1].reject(abortError);
    await tick();
    await tick();
    expect(result).toEqual({ email: "win@acme.com", label: "Winner" });
    expect(unhandled).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("logs each attempt without email addresses", async () => {
    const f = fakeRun();
    const p = findContact(info, f.run);
    f.controls[1].resolve({ email: "secret@acme.com", label: "Secret" });
    await p;
    f.controls[0].reject(new APIUserAbortError());
    f.controls[2].reject(new APIUserAbortError());
    await tick();
    const lines = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
    expect(lines).toHaveLength(3);
    expect(lines.some((l) => /^find-contact attempt=2 result=found \d+ms$/.test(l))).toBe(true);
    expect(lines.filter((l) => /result=aborted \d+ms$/.test(l))).toHaveLength(2);
    expect(lines.join("\n")).not.toContain("secret@acme.com");
  });

  it("falls back to 'Recruiting team' for an empty winning label", async () => {
    const f = fakeRun();
    const p = findContact(info, f.run);
    f.controls[0].resolve({ email: "jobs@acme.com", label: "   " });
    expect(await p).toEqual({ email: "jobs@acme.com", label: "Recruiting team" });
  });
});

describe("validEmail", () => {
  it("accepts normal addresses", () => {
    expect(validEmail("jane.doe@acme.com")).toBe(true);
    expect(validEmail("university-recruiting+2026@acme.co.uk")).toBe(true);
    expect(validEmail("  careers@acme.io  ")).toBe(true);
    // Real addresses that merely contain a placeholder word.
    expect(validEmail("careers@latest.com")).toBe(true);
    expect(validEmail("contest@acme.com")).toBe(true);
    expect(validEmail("jobs@testlabs.io")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(validEmail("a@b")).toBe(false);
    expect(validEmail("a b@c.com")).toBe(false);
    expect(validEmail("<a@b.com>")).toBe(false);
    expect(validEmail("")).toBe(false);
    expect(validEmail("a@@b.com")).toBe(false);
  });

  it("rejects placeholder addresses", () => {
    expect(validEmail("jane@example.com")).toBe(false);
    expect(validEmail("name@yourcompany.com")).toBe(false);
    expect(validEmail("you@domain.com")).toBe(false);
    expect(validEmail("jane@email.com")).toBe(false);
    expect(validEmail("test@acme.com")).toBe(false);
    expect(validEmail("Jane@EXAMPLE.org")).toBe(false);
  });
});
