const LABEL = "honesty";
const LABEL_FILL = "#3f4650";
const UNKNOWN_FILL = "#57606a";

// Every fill keeps at least 4.5:1 contrast with the white text.
function scoreFill(score: number): string {
  if (score >= 9) return "#15803d";
  if (score >= 7) return "#4d7c0f";
  if (score >= 4) return "#b45309";
  return "#b91c1c";
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Approximate advance width of Verdana at 11px, which is close enough with textLength applied. */
function textWidth(text: string): number {
  return Math.ceil(text.length * 6.9);
}

function render(value: string, fill: string): string {
  const labelWidth = textWidth(LABEL) + 12;
  const valueWidth = textWidth(value) + 12;
  const width = labelWidth + valueWidth;
  const title = escapeXml(`${LABEL}: ${value}`);
  const safeValue = escapeXml(value);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${title}">` +
    `<title>${title}</title>` +
    `<clipPath id="r"><rect width="${width}" height="20" rx="3"/></clipPath>` +
    `<g clip-path="url(#r)">` +
    `<rect width="${labelWidth}" height="20" fill="${LABEL_FILL}"/>` +
    `<rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${fill}"/>` +
    `</g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">` +
    `<text x="${labelWidth / 2}" y="14" textLength="${labelWidth - 12}" lengthAdjust="spacingAndGlyphs">${LABEL}</text>` +
    `<text x="${labelWidth + valueWidth / 2}" y="14" textLength="${valueWidth - 12}" lengthAdjust="spacingAndGlyphs">${safeValue}</text>` +
    `</g></svg>`
  );
}

export function scoreBadge(score: number): string {
  return render(`${score}/10`, scoreFill(score));
}

export function statusBadge(message: string): string {
  return render(message, UNKNOWN_FILL);
}
