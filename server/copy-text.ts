// Tidies ad copy taken from a DOCX or a Google Docs export: never two spaces
// in a row, and every paragraph on its own line with no blank lines between.
export function cleanCopyText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    // Non-breaking, narrow and figure spaces, and tabs, count as plain spaces.
    .replace(/[\t   ]/g, " ")
    // Zero-width spaces and byte order marks. Zero-width joiners stay: emoji need them.
    .replace(/[​﻿]/g, "")
    .replace(/ {2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
