/**
 * Privacy (principle 4): remove names before any text reaches the model.
 * Matches every full name and every name part of 2+ letters from the school's
 * pupil and staff lists, case-insensitively, on word boundaries. Over-redacting
 * a common word that is also a name ("Grace") is the safe failure.
 */
export function redactNames(text: string, names: string[]): { text: string; count: number } {
  const parts = new Set<string>();
  for (const n of names) {
    const clean = n.trim();
    if (!clean) continue;
    parts.add(clean);
    for (const p of clean.split(/[\s'-]+/)) if (p.length >= 2) parts.add(p);
  }
  if (parts.size === 0) return { text, count: 0 };
  // Longest first, so a full name is replaced before its parts.
  const sorted = [...parts].sort((a, b) => b.length - a.length).map(escapeRegex);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${sorted.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  let count = 0;
  const out = text.replace(re, () => {
    count++;
    return "[name]";
  });
  // Collapse "[name] [name]" left by first + last name matched separately.
  return { text: out.replace(/\[name\](?:\s+\[name\])+/g, "[name]"), count };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const INJECTION_PATTERNS: [RegExp, string][] = [
  [/\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(instructions?|scheme|rules?|prompt|above|previous)\b/i, "asks the marker to ignore instructions or the scheme"],
  [/\b(give|award|mark)\b[^.\n]{0,30}\b(full|all( the)?|maximum|top|10\/10|100%)\s*marks?\b/i, "asks for full marks"],
  [/\b(full|maximum)\s+marks?\s+(please|for (me|this))\b/i, "asks for full marks"],
  [/\byou are (now|an?|the)\b[^.\n]{0,40}\b(ai|assistant|marker|model|chatgpt|claude)\b/i, "tries to change the marker's role"],
  [/\b(system prompt|developer message|new instructions?|override)\b/i, "refers to the marker's instructions"],
  [/\b(dear|hey|hi|note to)\s+(ai|claude|chatgpt|marker|assistant)\b/i, "addresses the AI marker directly"],
  [/<\/?(system|instructions?|assistant)>/i, "contains instruction-like tags"],
];

/**
 * Local check for prompt injection, independent of the model, so an attempt is
 * always flagged even if the model is fooled (principle: pupil work is data).
 */
export function detectInjection(text: string): string[] {
  const found = new Set<string>();
  for (const [re, label] of INJECTION_PATTERNS) if (re.test(text)) found.add(label);
  return [...found].map((l) => `The pupil's work ${l}. It was treated as data, not followed. Check this work yourself.`);
}
