import type { GithubFile } from "./github";

export const MAX_DIFF_CHARS = 20_000;
const MAX_MANIFEST_CHARS = 4_000;

const GENERATED =
  /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|cargo\.lock|poetry\.lock|pipfile\.lock|composer\.lock|gemfile\.lock|go\.sum|flake\.lock)$|\.min\.(?:js|css)$|\.map$|\.snap$|(?:^|\/)(?:dist|vendor|node_modules|__snapshots__)\//i;

export interface RenderedDiff {
  manifest: string;
  patches: string;
  /** True when the model did not see every changed line. */
  truncated: boolean;
}

/** Splits budget so small files show in full and only the largest are cut (max-min fairness). */
export function allocate(sizes: number[], budget: number): number[] {
  const shares = sizes.map(() => 0);
  let remaining = budget;
  let open = sizes.map((_, index) => index);
  while (open.length > 0 && remaining > 0) {
    const share = Math.floor(remaining / open.length);
    if (share === 0) break;
    const stillOpen: number[] = [];
    for (const index of open) {
      const want = (sizes[index] ?? 0) - (shares[index] ?? 0);
      const grant = Math.min(want, share);
      shares[index] = (shares[index] ?? 0) + grant;
      remaining -= grant;
      if (want > share) stillOpen.push(index);
    }
    open = stillOpen;
  }
  return shares;
}

function clip(patch: string, chars: number): string {
  if (patch.length <= chars) return patch;
  const cut = patch.lastIndexOf("\n", chars);
  const kept = cut > 0 ? patch.slice(0, cut) : patch.slice(0, chars);
  return `${kept}\n... [${patch.length - kept.length} more characters of this file not shown]`;
}

/**
 * Renders the changed files for the model within a fixed budget. Hand-written files get budget
 * first so that a lockfile cannot crowd out the code the commit message is talking about.
 */
export function renderDiff(files: GithubFile[], moreFiles: boolean): RenderedDiff {
  let truncated = moreFiles;

  const lines = files.map(
    (file) =>
      `${file.status ?? "changed"} ${file.filename} (+${file.additions ?? 0} -${file.deletions ?? 0})`,
  );
  let manifest = lines.join("\n");
  if (manifest.length > MAX_MANIFEST_CHARS) {
    manifest = clip(manifest, MAX_MANIFEST_CHARS);
    truncated = true;
  }
  if (moreFiles) manifest += "\n... [more changed files exist beyond this list]";

  const withPatch = files.filter((file) => file.patch);
  if (withPatch.length < files.length) {
    // Binary, renamed-only and oversized files have no patch. Only the content-changing ones hide anything.
    const hidden = files.some((file) => !file.patch && (file.additions ?? 0) + (file.deletions ?? 0) > 0);
    truncated ||= hidden;
  }

  const authored = withPatch.filter((file) => !GENERATED.test(file.filename));
  const generated = withPatch.filter((file) => GENERATED.test(file.filename));
  const size = (file: GithubFile) => file.patch?.length ?? 0;

  const authoredShares = allocate(authored.map(size), MAX_DIFF_CHARS);
  const spent = authoredShares.reduce((sum, share) => sum + share, 0);
  const generatedShares = allocate(generated.map(size), MAX_DIFF_CHARS - spent);

  const sections: string[] = [];
  const render = (group: GithubFile[], shares: number[]) => {
    group.forEach((file, index) => {
      const share = shares[index] ?? 0;
      const patch = file.patch ?? "";
      if (share < patch.length) truncated = true;
      if (share < 80) {
        sections.push(`--- ${file.filename}\n[patch not shown]`);
      } else {
        sections.push(`--- ${file.filename}\n${clip(patch, share)}`);
      }
    });
  };
  render(authored, authoredShares);
  render(generated, generatedShares);

  return { manifest: manifest || "(no files changed)", patches: sections.join("\n\n"), truncated };
}
