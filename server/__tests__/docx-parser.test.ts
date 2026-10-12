import AdmZip from "adm-zip";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { DOCX_VARIATION_SEPARATOR, extractDocxText, parseDocx } from "../docx-parser.js";
import { parseDCTCopyFromText } from "../google-drive.js";
import { cleanCopyText } from "../copy-text.js";

// A minimal DOCX whose body is the given <w:p> paragraphs.
function docxWith(paragraphs: string[]): Buffer {
  const zip = new AdmZip();
  const body = paragraphs.join("");
  zip.addFile(
    "word/document.xml",
    Buffer.from(`<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`),
  );
  return zip.toBuffer();
}
const p = (...runs: string[]) => `<w:p>${runs.map((r) => `<w:r><w:t xml:space="preserve">${r}</w:t></w:r>`).join("")}</w:p>`;

const template = readFileSync(
  fileURLToPath(new URL("../../client/public/template_adcopy.docx", import.meta.url)),
);

describe("the ad copy template the app hands out", () => {
  it("extracts its text without any AI call", async () => {
    const { rawText } = await extractDocxText(template);
    expect(rawText).toContain("DCT 161:");
    expect(rawText).toContain("Primary text_1:");
  });

  it("parses into DCT blocks with every variation", async () => {
    const { rawText } = await extractDocxText(template);
    const blocks = parseDCTCopyFromText(rawText);
    expect(blocks).toHaveLength(5);
    for (const block of blocks) {
      expect(block.primaryTexts).toHaveLength(2);
      expect(block.headlines).toHaveLength(2);
    }
  });

  it("keeps all variations through parseDocx", async () => {
    const result = await parseDocx(template);
    expect(result.method).toBe("deterministic");
    expect(result.ads).toHaveLength(5);
    expect(result.ads[0].primary_text.split(DOCX_VARIATION_SEPARATOR)).toHaveLength(2);
    expect(result.ads[0].headline.split(DOCX_VARIATION_SEPARATOR)).toHaveLength(2);
  });
});

describe("parseDCTCopyFromText", () => {
  it("accepts lowercase labels, CRLF line ends and emoji", () => {
    const [block] = parseDCTCopyFromText("DCT 4:\r\nprimary text_1:\r\n🔥 Hot\r\nheadline_1:\r\nBuy 🎟️");
    expect(block.primaryTexts).toEqual(["🔥 Hot"]);
    expect(block.headlines).toEqual(["Buy 🎟️"]);
  });
});

describe("cleanCopyText", () => {
  it("never leaves two spaces or a blank line", () => {
    expect(cleanCopyText("Hello  world\u00A0 again\t!\r\n\r\n\r\nNext   line ")).toBe("Hello world again !\nNext line");
  });

  it("keeps emoji joined", () => {
    expect(cleanCopyText("👨\u200D👩\u200D👧  family")).toBe("👨\u200D👩\u200D👧 family");
  });
});

describe("whitespace in a DOCX", () => {
  const doc = docxWith([
    p("DCT 1:"),
    p("Primary text_1:"),
    p("First ", " paragraph  with   spaces."),
    "<w:p/>",
    "<w:p/>",
    `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Second paragraph</w:t></w:r></w:p>`,
    `<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>line two</w:t></w:r></w:p>`,
    p("Headline_1:"),
    p("Big  sale"),
  ]);

  it("puts each paragraph on one line with single spaces", async () => {
    const { rawText } = await extractDocxText(doc);
    const [block] = parseDCTCopyFromText(rawText);
    expect(block.primaryTexts).toEqual(["First paragraph with spaces.\nSecond paragraph\nLine one\nline two"]);
    expect(block.headlines).toEqual(["Big sale"]);
  });

  it("does the same through parseDocx", async () => {
    const result = await parseDocx(doc);
    expect(result.ads[0].primary_text).toBe("First paragraph with spaces.\nSecond paragraph\nLine one\nline two");
    expect(result.ads[0].headline).toBe("Big sale");
  });

  it("cleans plain-text Google Docs exports too", () => {
    const [block] = parseDCTCopyFromText("\uFEFFDCT 2:\r\nPrimary text:\r\nOne  two\r\n\r\nThree\r\nHeadline:\r\n Buy  now ");
    expect(block.primaryTexts).toEqual(["One two\nThree"]);
    expect(block.headlines).toEqual(["Buy now"]);
  });
});
