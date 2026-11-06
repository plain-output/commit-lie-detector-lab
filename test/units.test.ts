import { describe, expect, it } from "vitest";
import { scoreBadge, statusBadge } from "../src/badge";
import { allocate, MAX_DIFF_CHARS, renderDiff } from "../src/diff";
import type { GithubCommit } from "../src/github";
import { oneLine, parseModelOutput } from "../src/judge";
import { buildRedactor, collectIdentities, redactOutput, stripTrailers } from "../src/redact";

function commit(overrides: Partial<GithubCommit["commit"]> = {}, rest: Partial<GithubCommit> = {}): GithubCommit {
  return {
    sha: "a".repeat(40),
    commit: {
      message: "Fix a thing",
      author: { name: "Quentin Marlowe", email: "qm.dev@example.org" },
      committer: { name: "GitHub", email: "noreply@github.com" },
      ...overrides,
    },
    author: { login: "qmarlowe" },
    committer: { login: "web-flow" },
    ...rest,
  };
}

describe("redaction", () => {
  const scrub = (text: string, c: GithubCommit = commit()) =>
    redactOutput(text, buildRedactor(collectIdentities(c)));

  it("removes full names, name parts, logins and emails in any case for full forms", () => {
    expect(scrub("Quentin Marlowe broke it")).toBe("[redacted] broke it");
    expect(scrub("quentin marlowe broke it")).toBe("[redacted] broke it");
    expect(scrub("Thanks Marlowe")).toBe("Thanks [redacted]");
    expect(scrub("by qmarlowe today")).toBe("by [redacted] today");
    expect(scrub("mail qm.dev@example.org now")).toBe("mail [redacted] now");
    expect(scrub("see qm.dev for this")).toBe("see [redacted] for this");
  });

  it("does not blank out a generic committer such as GitHub or web-flow", () => {
    expect(scrub("Update the GitHub web-flow docs")).toBe("Update the GitHub web-flow docs");
  });

  it("keeps ordinary words from a name like The Octocat", () => {
    const c = commit({ author: { name: "The Octocat", email: "octocat@github.com" } }, { author: { login: "octocat" } });
    expect(scrub("The commit from Octocat", c)).toBe("The commit from [redacted]");
  });

  it("removes people named in trailers and merge subjects", () => {
    const c = commit({
      message: "Merge pull request #6 from Spaceghost/patch-1\n\nCo-authored-by: Ada Lovelace <ada@example.org>\nSigned-off-by: Grace Hopper <gh@example.org>",
    });
    expect(scrub("Merged Spaceghost/patch-1 with Ada, Lovelace and Grace Hopper", c)).toBe(
      "Merged [redacted]/patch-1 with [redacted], [redacted] and [redacted]",
    );
  });

  it("strips emails and handles the metadata does not list, but keeps npm scopes", () => {
    expect(scrub("ping @someone or a.b@c.io")).toBe("ping [redacted] or [redacted]");
    expect(scrub("Bump @types/node and @cloudflare/workers-types")).toBe("Bump @types/node and @cloudflare/workers-types");
  });

  it("handles identities containing regex characters", () => {
    const c = commit({ author: { name: "J. (Bob) Smith+1", email: "x@y.z" } }, { author: { login: "renovate[bot]" } });
    expect(() => scrub("renovate did this", c)).not.toThrow();
    expect(scrub("renovate did this", c)).toBe("[redacted] did this");
  });

  it("copes with hyphens and other punctuation in real logins and names", () => {
    const c = commit({ author: { name: "Anne-Marie O'Neil", email: "anne-marie@example.org" } }, { author: { login: "some-hyphen-login" } });
    expect(scrub("by some-hyphen-login and Anne-Marie O'Neil", c)).toBe("by [redacted] and [redacted]");
  });

  it("catches a sign-off written in the middle of a line", () => {
    const c = commit({ message: "New line at end of file. --Signed off by Spaceghost" });
    expect(scrub("Spaceghost said so", c)).toBe("[redacted] said so");
  });

  it("removes attribution trailers from the message", () => {
    expect(stripTrailers("Fix it\n\nSigned-off-by: A B <a@b.c>\nCo-Authored-By: C <c@d.e>")).toBe("Fix it");
    expect(stripTrailers("Signed-off-by: A B <a@b.c>")).toBe("");
  });
});

describe("diff rendering", () => {
  it("gives small files everything and cuts only the large ones", () => {
    expect(allocate([10, 1000, 20], 100)).toEqual([10, 70, 20]);
    expect(allocate([10, 20], 100)).toEqual([10, 20]);
    expect(allocate([], 100)).toEqual([]);
  });

  it("does not let a lockfile crowd out code", () => {
    const code = `@@ -1 +1 @@\n-${"a".repeat(500)}\n+SECRET_CODE_CHANGE`;
    const out = renderDiff(
      [
        { filename: "package-lock.json", additions: 9000, deletions: 9000, patch: `+x\n`.repeat(40_000) },
        { filename: "src/a.ts", additions: 1, deletions: 1, patch: code },
      ],
      false,
    );
    expect(out.patches).toContain("SECRET_CODE_CHANGE");
    expect(out.truncated).toBe(true);
    expect(out.patches.length).toBeLessThan(MAX_DIFF_CHARS + 500);
  });

  it("reports complete when every patch fits, and truncated when a patch is missing", () => {
    expect(renderDiff([{ filename: "a", additions: 1, deletions: 0, patch: "+x" }], false).truncated).toBe(false);
    expect(renderDiff([{ filename: "a.png", additions: 0, deletions: 0 }], false).truncated).toBe(false);
    expect(renderDiff([{ filename: "big.sql", additions: 90000, deletions: 0 }], false).truncated).toBe(true);
    expect(renderDiff([{ filename: "a", additions: 1, deletions: 0, patch: "+x" }], true).truncated).toBe(true);
  });

  it("handles a commit with no files", () => {
    expect(renderDiff([], false)).toEqual({ manifest: "(no files changed)", patches: "", truncated: false });
  });
});

describe("model output parsing", () => {
  const good = { score: 7, verdict: "Holds up.", claim: "Fix it", analysis: "x" };

  it("accepts every shape Workers AI returns", () => {
    expect(parseModelOutput({ response: good })?.score).toBe(7);
    expect(parseModelOutput({ response: JSON.stringify(good) })?.score).toBe(7);
    expect(parseModelOutput({ response: `Sure!\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\`` })?.score).toBe(7);
    expect(parseModelOutput({ choices: [{ message: { content: JSON.stringify(good) } }] })?.score).toBe(7);
  });

  it("rejects missing or out-of-range scores rather than inventing one", () => {
    expect(parseModelOutput({ response: { ...good, score: 11 } })).toBeNull();
    expect(parseModelOutput({ response: { ...good, score: -1 } })).toBeNull();
    expect(parseModelOutput({ response: { ...good, score: "high" } })).toBeNull();
    expect(parseModelOutput({ response: { verdict: "x" } })).toBeNull();
    expect(parseModelOutput({ response: { score: 5, verdict: "  " } })).toBeNull();
    expect(parseModelOutput({ response: "not json" })).toBeNull();
    expect(parseModelOutput(null)).toBeNull();
  });

  it("flattens multi-line text to one line and cuts on a word", () => {
    expect(oneLine("a\nb\r\n\tc", 50)).toBe("a b c");
    const cut = oneLine("word ".repeat(100), 50);
    expect(cut.length).toBeLessThanOrEqual(50);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toContain("\n");
  });
});

describe("badge", () => {
  it("is standalone SVG with the score and an accessible name", () => {
    const svg = scoreBadge(7);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain(">7/10<");
    expect(svg).toContain('aria-label="honesty: 7/10"');
    expect(svg).not.toMatch(/<script|href=|url\(http/i);
  });

  it("colours scores by band", () => {
    expect(scoreBadge(10)).toContain("#15803d");
    expect(scoreBadge(8)).toContain("#4d7c0f");
    expect(scoreBadge(5)).toContain("#b45309");
    expect(scoreBadge(0)).toContain("#b91c1c");
  });

  it("escapes status text", () => {
    expect(statusBadge(`<b>&"'`)).not.toContain("<b>");
  });
});
