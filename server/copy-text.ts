// Tidies ad copy taken from a DOCX or a Google Docs export: never two spaces
// in a row, every paragraph on its own line, and an empty paragraph kept as
// one blank line, the way the copy reads in the document.
export function cleanCopyText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    // Non-breaking, narrow and figure spaces, and tabs, count as plain spaces.
    .replace(/[\t   ]/g, " ")
    // Zero-width spaces and byte order marks. Zero-width joiners stay: emoji need them.
    .replace(/[​﻿]/g, "")
    .replace(/ {2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
