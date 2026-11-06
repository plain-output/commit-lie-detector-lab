import type { GithubCommit } from "./github";

export const REDACTED = "[redacted]";

const TRAILER =
  /^[ \t]*(?:co-authored-by|signed-off-by|reviewed-by|tested-by|acked-by|reported-by|suggested-by|helped-by|cc|author|authored-by|committed-by)[ \t]*:[ \t]*(.*)$/gim;

/**
 * Words that are too generic to treat as somebody's identity. Without this, a committer called
 * "GitHub" or an author called "The Octocat" would blank those words out of every sentence.
 */
const GENERIC = new Set(
  (
    "the a an and or of for with to in on at by from de del der den van von la le da bin " +
    "github gitlab git web flow web-flow noreply no-reply bot bots ci cd build builder release " +
    "releases deploy deployer automation action actions root admin administrator user dev developer " +
    "developers team test tests code coder system server service support info contact hello mail " +
    "email unknown anonymous none null new open source project projects maintainer maintainers " +
    "committer author fix bug update add remove merge"
  ).split(" "),
);

function isUsable(identity: string): boolean {
  return identity.length >= 3 && !GENERIC.has(identity.toLowerCase());
}

function addEmail(out: Set<string>, email: string): void {
  const value = email.trim();
  if (!value.includes("@")) return;
  out.add(value);
  // 12345+login@users.noreply.github.com and jane.doe@example.com both leak through the local part.
  const local = value.slice(0, value.indexOf("@")).replace(/^\d+\+/, "");
  if (isUsable(local)) out.add(local);
}

function addName(out: Set<string>, name: string): void {
  const value = name.trim().replace(/^["']|["']$/g, "");
  if (isUsable(value)) out.add(value);
  for (const part of value.split(/\s+/)) {
    const cleaned = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (isUsable(cleaned)) out.add(cleaned);
  }
}

function addPerson(out: Set<string>, person: string): void {
  const match = /^(.*?)<([^>]*)>/.exec(person);
  if (match) {
    addName(out, match[1] ?? "");
    addEmail(out, match[2] ?? "");
  } else if (person.includes("@")) {
    addEmail(out, person);
  } else {
    addName(out, person);
  }
}

/** Every name, handle and email this commit attributes to a person. */
export function collectIdentities(commit: GithubCommit): string[] {
  const out = new Set<string>();

  for (const person of [commit.commit.author, commit.commit.committer]) {
    if (person?.name) addName(out, person.name);
    if (person?.email) addEmail(out, person.email);
  }
  for (const user of [commit.author, commit.committer]) {
    const login = user?.login?.replace(/\[bot\]$/i, "");
    if (login && isUsable(login)) out.add(login);
  }

  const message = commit.commit.message;
  for (const match of message.matchAll(TRAILER)) addPerson(out, match[1] ?? "");

  // Sign-offs that are not proper trailers, such as "New line. --Signed off by Someone".
  for (const match of message.matchAll(/(?:signed[- ]off|co-?authored|authored)[- ]by[: ]+([^\n<]+)/gi)) {
    addName(out, match[1] ?? "");
  }

  const subject = message.split("\n", 1)[0] ?? "";
  const mergedFrom = /^Merge pull request #\d+ from ([A-Za-z0-9-]+)\//.exec(subject);
  if (mergedFrom?.[1] && isUsable(mergedFrom[1])) out.add(mergedFrom[1]);
  const mergedRemote = /^Merge .*github\.com[:/]([A-Za-z0-9-]+)\//.exec(subject);
  if (mergedRemote?.[1] && isUsable(mergedRemote[1])) out.add(mergedRemote[1]);

  return [...out].sort((a, b) => b.length - a.length);
}

/** The message without attribution trailers, which say who rather than what. */
export function stripTrailers(message: string): string {
  return message.replace(TRAILER, "").trim();
}

function escapeRegExp(text: string): string {
  // Hyphens must stay unescaped: "\-" is a syntax error under the "u" flag used below.
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type Redactor = (text: string) => string;

export function buildRedactor(identities: string[]): Redactor {
  const pattern = identities.length
    ? new RegExp(
        `(?<![\\p{L}\\p{N}_])(?:${identities.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}_])`,
        "giu",
      )
    : null;
  return (text) => (pattern ? text.replace(pattern, REDACTED) : text);
}

/**
 * Final guard on anything leaving the API. Also removes people the commit metadata does not list:
 * any email address, and @handles that are not npm scopes such as @types/node.
 */
export function redactOutput(text: string, redact: Redactor): string {
  return redact(text)
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, REDACTED)
    .replace(/(?<![\w@/.])@[A-Za-z0-9][A-Za-z0-9-]*(?![\w/-])/g, REDACTED);
}
