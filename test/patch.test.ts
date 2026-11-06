import { describe, expect, it } from "vitest";
import { decodeMimeWords, parsePatch } from "../src/patch";

const SHA = "1234567890abcdef1234567890abcdef12345678";

function patch(headerExtra: string, body: string, rest: string): string {
  return `From ${SHA} Mon Sep 17 00:00:00 2001\nFrom: Jane Doe <jd@example.org>\nDate: Tue, 6 Mar 2012 15:06:50 -0800\n${headerExtra}\n\n${body}${rest}`;
}

const STAT = "---\n a.txt | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n\n";
const DIFF = "diff --git a/a.txt b/a.txt\nindex 1..2 100644\n--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@\n ctx\n-old\n+new\n-- \n2.40.0\n";

describe("parsePatch", () => {
  it("reads sha, author, message and a modified file without the git signature", () => {
    const { commit } = parsePatch(patch("Subject: [PATCH] Fix the thing", "Longer body.\n\n", STAT + DIFF), false, SHA)!;
    expect(commit.sha).toBe(SHA);
    expect(commit.commit.author).toEqual({ name: "Jane Doe", email: "jd@example.org" });
    expect(commit.commit.message).toBe("Fix the thing\n\nLonger body.");
    expect(commit.files).toEqual([
      { filename: "a.txt", status: "modified", additions: 1, deletions: 1, patch: "@@ -1,2 +1,2 @@\n ctx\n-old\n+new" },
    ]);
    expect(commit.stats).toEqual({ additions: 1, deletions: 1, total: 2 });
  });

  it("unfolds long subjects and decodes encoded names", () => {
    const text = `From ${SHA} Mon Sep 17 00:00:00 2001\nFrom: =?UTF-8?q?J=C3=BCrgen=20M=C3=BCller?= <j@example.org>\nSubject: [PATCH 1/2] A subject long enough\n that git folded it\n\n${STAT}${DIFF}`;
    const { commit } = parsePatch(text, false, SHA)!;
    expect(commit.commit.author?.name).toBe("Jürgen Müller");
    expect(commit.commit.message).toBe("A subject long enough that git folded it");
  });

  it("is not fooled by a --- line or pasted diff in the message", () => {
    const body = "Before\n---\n fake | 1 +\n\ndiff --git a/fake b/fake\n+++ b/fake\n@@ -1 +1 @@\n+fake\n\n";
    const { commit } = parsePatch(patch("Subject: [PATCH] Tricky", body, STAT + DIFF), false, SHA)!;
    expect(commit.files?.map((file) => file.filename)).toEqual(["a.txt"]);
    expect(commit.commit.message).toContain("Before");
  });

  it("recognises added, removed, renamed and binary files", () => {
    const diff = [
      "diff --git a/new.txt b/new.txt\nnew file mode 100644\nindex 0..1\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+x\n",
      "diff --git a/old.txt b/old.txt\ndeleted file mode 100644\nindex 1..0\n--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n",
      "diff --git a/from.txt b/to.txt\nsimilarity index 100%\nrename from from.txt\nrename to to.txt\n",
      "diff --git a/a.png b/a.png\nindex 1..2 100644\nBinary files a/a.png and b/a.png differ\n",
    ].join("");
    const { commit } = parsePatch(patch("Subject: [PATCH] Many", "", `---\n a | 1 +\n\n${diff}-- \n2.40.0\n`), false, SHA)!;
    expect(commit.files?.map((file) => [file.filename, file.status, Boolean(file.patch)])).toEqual([
      ["new.txt", "added", true],
      ["old.txt", "removed", true],
      ["to.txt", "renamed", false],
      ["a.png", "modified", false],
    ]);
  });

  it("handles an empty commit", () => {
    const { commit } = parsePatch(patch("Subject: [PATCH] Trigger CI", "", "---\n\n-- \n2.40.0\n"), false, SHA)!;
    expect(commit.commit.message).toBe("Trigger CI");
    expect(commit.files).toEqual([]);
  });

  it("does not count a deleted line beginning with dashes as the signature", () => {
    const diff = "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,2 +1 @@\n-- \n+x\n ctx\n-- \n2.40.0\n";
    const { commit } = parsePatch(patch("Subject: [PATCH] X", "", `---\n a | 1 +\n\n${diff}`), false, SHA)!;
    expect(commit.files?.[0]?.deletions).toBe(1);
  });

  it("rejects a patch of some other commit, which is what a merge commit's URL returns", () => {
    const text = patch("Subject: [PATCH 01/13] First of the series", "", STAT + DIFF);
    expect(parsePatch(text, false, "f".repeat(40))).toBeNull();
    expect(parsePatch(text, false, SHA.slice(0, 7))?.commit.sha).toBe(SHA);
    expect(parsePatch(text, false, SHA.slice(0, 7).toUpperCase())?.commit.sha).toBe(SHA);
  });

  it("flags a clipped patch and rejects anything that is not a patch", () => {
    expect(parsePatch(patch("Subject: [PATCH] X", "", STAT + DIFF), true, SHA)?.moreFiles).toBe(true);
    expect(parsePatch("<!DOCTYPE html><title>Sign in</title>", false, SHA)).toBeNull();
    expect(parsePatch("", false, SHA)).toBeNull();
  });
});

describe("decodeMimeWords", () => {
  it("decodes Q and B words, joins adjacent ones, and leaves plain text alone", () => {
    expect(decodeMimeWords("=?UTF-8?B?SsO8cmdlbg==?=")).toBe("Jürgen");
    expect(decodeMimeWords("=?UTF-8?q?J=C3=BC?= =?UTF-8?q?rgen?=")).toBe("Jürgen");
    expect(decodeMimeWords("Plain Name")).toBe("Plain Name");
    expect(decodeMimeWords("=?nope?q?x?=")).toBe("=?nope?q?x?=");
  });
});
