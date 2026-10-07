import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { DOCX_VARIATION_SEPARATOR, extractDocxText, parseDocx } from "../docx-parser.js";
import { parseDCTCopyFromText } from "../google-drive.js";

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
