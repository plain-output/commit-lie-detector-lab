import type { FetchedCommit, GithubFile } from "./github";

/**
 * Parses GitHub's `/commit/<sha>.patch` (git format-patch output) into the same shape the REST API
 * returns, so the rest of the pipeline cannot tell the sources apart. Returns null if the text is
 * not a patch of the requested commit.
 */
export function parsePatch(text: string, clipped: boolean, requestedSha: string): FetchedCommit | null {
  const first = /^From ([0-9a-f]{40}) /.exec(text);
  if (!first?.[1]?.startsWith(requestedSha.toLowerCase())) return null;

  const headerEnd = text.indexOf("\n\n");
  if (headerEnd < 0) return null;
  const headers = parseHeaders(text.slice(0, headerEnd));
  const rest = text.slice(headerEnd + 2);

  // The boundary is a "---" line, a diffstat and a blank line before the first diff. Commit messages
  // can contain lookalikes, but a hunk cannot (blank lines in hunks start with a space), so the last
  // match is the real one.
  const boundaries = [...rest.matchAll(/(?:^|\n)---\n(?: .*\n)*\n(?=diff --git )/g)];
  const boundary = boundaries.at(-1);

  let body: string;
  let diffText: string;
  if (boundary) {
    body = rest.slice(0, boundary.index);
    diffText = rest.slice(boundary.index + boundary[0].length);
  } else {
    // No file changes: an empty commit or a clean merge.
    const signature = rest.search(/(?:^|\n)---\n|\n-- \n/);
    body = signature >= 0 ? rest.slice(0, signature) : rest;
    diffText = "";
  }

  const subject = (headers.get("subject") ?? "").replace(/^\[PATCH[^\]]*\]\s*/, "");
  const message = [subject, body.trim()].filter(Boolean).join("\n\n");
  const author = parseAddress(headers.get("from") ?? "");

  const files = parseFiles(diffText);
  const additions = files.reduce((sum, file) => sum + (file.additions ?? 0), 0);
  const deletions = files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);

  return {
    commit: {
      sha: first[1],
      commit: { message, author, committer: null },
      stats: { additions, deletions, total: additions + deletions },
      files,
    },
    moreFiles: clipped,
  };
}

function parseHeaders(block: string): Map<string, string> {
  const headers = new Map<string, string>();
  const unfolded = block.replace(/\n[ \t]+/g, " ");
  for (const line of unfolded.split("\n").slice(1)) {
    const colon = line.indexOf(":");
    if (colon > 0) {
      headers.set(line.slice(0, colon).toLowerCase(), decodeMimeWords(line.slice(colon + 1).trim()));
    }
  }
  return headers;
}

function parseAddress(value: string): { name: string; email: string } {
  const match = /^(.*?)\s*<([^>]*)>$/.exec(value);
  return match ? { name: match[1] ?? "", email: match[2] ?? "" } : { name: value, email: "" };
}

/** Decodes RFC 2047 words: git writes non-ASCII names and subjects as =?UTF-8?q?J=C3=BCrgen?=. */
export function decodeMimeWords(value: string): string {
  return value
    .replace(/(\?=)\s+(=\?)/g, "$1$2")
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (whole, charset: string, encoding: string, data: string) => {
      try {
        const bytes =
          encoding.toLowerCase() === "b"
            ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
            : quotedPrintableBytes(data);
        return new TextDecoder(charset).decode(bytes);
      } catch {
        return whole;
      }
    });
}

function quotedPrintableBytes(data: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    if (char === "_") {
      out.push(0x20);
    } else if (char === "=" && i + 2 < data.length) {
      out.push(Number.parseInt(data.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(data.charCodeAt(i));
    }
  }
  return Uint8Array.from(out);
}

function parseFiles(diffText: string): GithubFile[] {
  if (!diffText) return [];
  // format-patch ends with a "-- " line and the git version. Only the end of the text is safe to
  // strip, because "-- " mid-diff is a deleted line.
  const trimmed = diffText.replace(/\n-- \n[^\n]*\n*$/, "\n");
  const sections = trimmed.split(/^(?=diff --git )/m).filter((section) => section.startsWith("diff --git "));
  return sections.map(parseFileSection);
}

function parseFileSection(section: string): GithubFile {
  const lines = section.split("\n");
  const hunkStart = lines.findIndex((line) => line.startsWith("@@ "));
  const header = hunkStart >= 0 ? lines.slice(0, hunkStart) : lines;
  const hunks = hunkStart >= 0 ? lines.slice(hunkStart) : [];

  const headerValue = (prefix: string) =>
    header.find((line) => line.startsWith(prefix))?.slice(prefix.length).trim();

  const renamedTo = headerValue("rename to ");
  const newPath = headerValue("+++ b/");
  const oldPath = headerValue("--- a/");
  const fromHeader = /^diff --git a\/.* b\/(.*)$/.exec(lines[0] ?? "")?.[1];
  const filename = renamedTo ?? newPath ?? oldPath ?? fromHeader ?? "unknown";

  let status = "modified";
  if (header.some((line) => line.startsWith("new file mode"))) status = "added";
  else if (header.some((line) => line.startsWith("deleted file mode"))) status = "removed";
  else if (renamedTo) status = "renamed";

  let additions = 0;
  let deletions = 0;
  for (const line of hunks) {
    if (line.startsWith("+")) additions++;
    else if (line.startsWith("-")) deletions++;
  }

  const file: GithubFile = { filename, status, additions, deletions };
  if (hunks.length > 0) file.patch = hunks.join("\n").trimEnd();
  return file;
}
