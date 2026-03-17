import AdmZip from "adm-zip";
import OpenAI from "openai";
import type { ExtractedAdData, AiExtractionResponse } from "@shared/schema";
import { aiExtractionResponseSchema } from "@shared/schema";

const FIELD_NAMES = ["Primary text", "Headline", "Description", "CTA", "URL", "UTM"] as const;
const FIELD_BOUNDARY = `(?:Primary text|Headline|Description|CTA|URL|UTM|Ad\\s+\\d|DCT\\s*\\d)`;

const PRECOMPILED_FULL: Record<string, RegExp> = {};
const PRECOMPILED_LINE: Record<string, RegExp> = {};
for (const f of FIELD_NAMES) {
  PRECOMPILED_FULL[f] = new RegExp(`${f}\\s*\\d*\\s*:\\s*(.+?)(?=${FIELD_BOUNDARY}\\s*\\d*\\s*:?|$)`, "is");
  PRECOMPILED_LINE[f] = new RegExp(`${f}\\s*\\d*\\s*:\\s*([^\\n]+)`, "i");
}

const SECTION_SPLIT_RE = /(?=(?:Ad|DCT)\s*\d{1,3}:?)/i;
const INDEX_RE = /^(?:Ad|DCT)\s*(\d{1,3}):?/i;

const VALID_CTAS = new Set([
  "LEARN_MORE", "SHOP_NOW", "SIGN_UP", "SUBSCRIBE", "CONTACT_US",
  "DOWNLOAD", "GET_OFFER", "BOOK_NOW", "WATCH_MORE", "APPLY_NOW"
]);

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

const TEXT_RE = /<w:t[^>]*>([^<]*)<\/w:t>/g;
const BR_RE = /<w:br[^/]*\/>/g;
const TAB_RE = /<w:tab[^/]*\/>/g;

function extractTextFromDocxZip(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) {
    throw new Error("No word/document.xml found in DOCX");
  }
  const xml = entry.getData().toString("utf8");

  const parts: string[] = [];

  let pStart = 0;
  while (true) {
    const pOpen = xml.indexOf("<w:p ", pStart);
    const pOpen2 = xml.indexOf("<w:p>", pStart);
    let pIdx = -1;
    if (pOpen === -1 && pOpen2 === -1) break;
    if (pOpen === -1) pIdx = pOpen2;
    else if (pOpen2 === -1) pIdx = pOpen;
    else pIdx = Math.min(pOpen, pOpen2);

    const pClose = xml.indexOf("</w:p>", pIdx);
    if (pClose === -1) break;

    const pContent = xml.substring(pIdx, pClose + 6);

    let pText = "";
    const tokens: Array<{ pos: number; type: "text" | "br" | "tab"; value: string }> = [];

    let m;
    const localTextRe = new RegExp(TEXT_RE.source, "g");
    while ((m = localTextRe.exec(pContent)) !== null) {
      tokens.push({ pos: m.index, type: "text", value: m[1] });
    }
    const localBrRe = new RegExp(BR_RE.source, "g");
    while ((m = localBrRe.exec(pContent)) !== null) {
      tokens.push({ pos: m.index, type: "br", value: "\n" });
    }
    const localTabRe = new RegExp(TAB_RE.source, "g");
    while ((m = localTabRe.exec(pContent)) !== null) {
      tokens.push({ pos: m.index, type: "tab", value: " " });
    }

    tokens.sort((a, b) => a.pos - b.pos);
    for (const tok of tokens) {
      pText += tok.value;
    }

    pText = decodeXmlEntities(pText);

    if (pText.length > 0) {
      parts.push(pText);
    } else {
      if (parts.length > 0 && parts[parts.length - 1] !== "") {
        parts.push("");
      }
    }

    pStart = pClose + 6;
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractField(section: string, fieldName: string): string {
  const fullRe = PRECOMPILED_FULL[fieldName];
  if (fullRe) {
    const match = section.match(fullRe);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }
  const lineRe = PRECOMPILED_LINE[fieldName];
  if (lineRe) {
    const match = section.match(lineRe);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }
  return "";
}

function normalizeNewlines(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{2,}(---+)\n{2,}/g, '\n$1\n')
    .replace(/\n{2,}(—[-—]+)\n{2,}/g, '\n$1\n')
    .replace(/\n\n/g, '\n')
    .trim();
}

export async function parseDocxDeterministic(buffer: Buffer): Promise<{
  rawText: string;
  ads: ExtractedAdData[];
  success: boolean;
}> {
  const startTime = performance.now();

  let rawText: string;
  let extractMethod = "zip";
  try {
    rawText = extractTextFromDocxZip(buffer);
  } catch (zipErr) {
    console.log("[DOCX Parser] ZIP extraction failed, falling back to mammoth");
    const mammoth = await import("mammoth");
    const result = await mammoth.default.extractRawText({ buffer });
    rawText = result.value;
    extractMethod = "mammoth";
  }

  const extractTime = performance.now();
  console.log(`[DOCX Parser] Besedilo izvlečeno iz datoteke (${extractMethod}), ${rawText.length} znakov v ${(extractTime - startTime).toFixed(0)}ms`);

  const ads: ExtractedAdData[] = [];
  const adSections = rawText.split(SECTION_SPLIT_RE);
  const matchedSections = adSections.filter(s => INDEX_RE.test(s));
  console.log(`[DOCX Parser] Najdenih ${matchedSections.length} sekcij (Ad/DCT) v dokumentu`);

  for (const section of adSections) {
    const indexMatch = section.match(INDEX_RE);
    if (!indexMatch) continue;

    const index = parseInt(indexMatch[1], 10);
    if (index < 1 || index > 100) continue;

    const primaryText = normalizeNewlines(extractField(section, "Primary text"));
    const headline = normalizeNewlines(extractField(section, "Headline"));
    const description = normalizeNewlines(extractField(section, "Description"));
    const ctaRaw = extractField(section, "CTA").toUpperCase().replace(/\s+/g, "_");
    const url = extractField(section, "URL");
    const utm = extractField(section, "UTM");

    const missingFields: string[] = [];
    if (!primaryText) missingFields.push("Primary text");
    if (!headline) missingFields.push("Headline");
    if (!description) missingFields.push("Description");
    if (!ctaRaw || ctaRaw === "") missingFields.push("CTA");
    if (!url) missingFields.push("URL");

    if (missingFields.length > 0) {
      console.log(`[DOCX Parser] Ad ${index}: manjkajoča polja: ${missingFields.join(", ")}`);
    } else {
      console.log(`[DOCX Parser] Ad ${index}: vsa polja najdena`);
    }

    const cta = VALID_CTAS.has(ctaRaw) ? ctaRaw : "LEARN_MORE";

    ads.push({
      index,
      primary_text: primaryText,
      headline,
      description,
      cta: cta as ExtractedAdData["cta"],
      url: url || "",
      utm,
    });
  }

  ads.sort((a, b) => a.index - b.index);

  const totalTime = performance.now();
  const hasRequiredFields = ads.every((ad) => ad.headline && ad.primary_text);
  const adsWithMissing = ads.filter(ad => !ad.headline || !ad.primary_text);

  if (ads.length === 0) {
    console.log(`[DOCX Parser] Regex parser ni našel nobenega oglasa (${(totalTime - startTime).toFixed(0)}ms)`);
  } else if (hasRequiredFields) {
    console.log(`[DOCX Parser] Regex parser uspešen: ${ads.length} oglasov najdenih (${(totalTime - startTime).toFixed(0)}ms)`);
  } else {
    console.log(`[DOCX Parser] Regex parser delno uspešen: ${ads.length} oglasov, ${adsWithMissing.length} brez obveznih polj (${(totalTime - startTime).toFixed(0)}ms)`);
  }

  return {
    rawText,
    ads,
    success: ads.length > 0 && hasRequiredFields,
  };
}

export async function parseDocxWithAI(rawText: string): Promise<ExtractedAdData[]> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const systemPrompt = `You are a document parser that extracts ad copy from DOCX text content. 
Extract structured data for Meta Ads from the provided text.
The document may have sections labeled "Ad X", "DCT X", or "DCT X:" where X is a number.
IMPORTANT: Preserve the EXACT text formatting from the document. Use single newlines (\\n) between paragraphs, NOT double newlines. Do not add extra spacing.
Return ONLY valid JSON, no markdown, no explanations.`;

  const userPrompt = `Parse this document and extract ad data for each "Ad X" or "DCT X" section.
Return ONLY this exact JSON structure (no markdown code blocks):

{
  "ads": [
    {
      "index": 1,
      "primary_text": "The main ad copy text with single newlines between paragraphs",
      "headline": "The headline",
      "description": "Optional description",
      "cta": "LEARN_MORE",
      "url": "https://example.com",
      "utm": "utm_source=facebook&utm_campaign=test"
    }
  ]
}

CRITICAL: For primary_text, headline, and description, preserve the exact text formatting from the document. Use SINGLE newlines (\\n) between lines. Do NOT use double newlines (\\n\\n) unless there is an intentional blank line in the original. The output must match how it looks in Google Docs exactly.

Valid CTA values: LEARN_MORE, SHOP_NOW, SIGN_UP, SUBSCRIBE, CONTACT_US, DOWNLOAD, GET_OFFER, BOOK_NOW, WATCH_MORE, APPLY_NOW

Document text:
${rawText}`;

  console.log("[DOCX Parser] Pošiljam besedilo ChatGPT-ju za parsanje...");

  let response;
  try {
    response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
    });
  } catch (modelError: any) {
    if (modelError?.status === 404 || modelError?.status === 401 || 
        modelError?.message?.includes("model") || modelError?.code === "model_not_found") {
      console.log("[DOCX Parser] Model gpt-5-mini ni na voljo, uporabljam gpt-4o-mini");
      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      });
    } else {
      throw modelError;
    }
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  console.log("[DOCX Parser] ChatGPT odgovoril, obdelujem rezultat...");

  let jsonText = content.trim();
  jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
  jsonText = jsonText.replace(/^```\s*/i, "").replace(/```\s*$/i, "");

  const parsed = JSON.parse(jsonText);
  const validated = aiExtractionResponseSchema.parse(parsed);

  const cleanedAds = validated.ads.map(ad => ({
    ...ad,
    primary_text: ad.primary_text?.replace(/\n\n/g, '\n').trim() || "",
    headline: ad.headline?.replace(/\n\n/g, '\n').trim() || "",
    description: ad.description?.replace(/\n\n/g, '\n').trim() || "",
  }));

  console.log(`[DOCX Parser] ChatGPT našel ${cleanedAds.length} oglasov`);

  return cleanedAds;
}

export async function parseDocx(buffer: Buffer): Promise<{
  rawText: string;
  ads: ExtractedAdData[];
  method: "deterministic" | "ai";
}> {
  const deterministicResult = await parseDocxDeterministic(buffer);

  if (deterministicResult.success && deterministicResult.ads.length > 0) {
    console.log(`[DOCX Parser] Regex parser uspešen — uporabljam regex rezultat (${deterministicResult.ads.length} oglasov)`);
    return {
      rawText: deterministicResult.rawText,
      ads: deterministicResult.ads,
      method: "deterministic",
    };
  }

  console.log(`[DOCX Parser] Regex parser ni uspel — poskušam DCT fallback parser...`);
  try {
    const { parseDCTCopyFromText } = await import("./google-drive");
    const dctBlocks = parseDCTCopyFromText(deterministicResult.rawText);
    const validBlocks = dctBlocks.filter(b => b.primaryTexts.length > 0 && b.headlines.length > 0);
    if (validBlocks.length > 0) {
      const fallbackAds: ExtractedAdData[] = validBlocks.map((block, idx) => ({
        index: idx + 1,
        primary_text: block.primaryTexts[0] || "",
        headline: block.headlines[0] || "",
        description: block.descriptions[0] || "",
        cta: "LEARN_MORE" as ExtractedAdData["cta"],
        url: "",
        utm: "",
      }));
      console.log(`[DOCX Parser] DCT fallback uspešen — ${fallbackAds.length} veljavnih blokov najdenih, ChatGPT ni potreben`);
      return {
        rawText: deterministicResult.rawText,
        ads: fallbackAds,
        method: "deterministic",
      };
    } else {
      console.log(`[DOCX Parser] DCT fallback: ${dctBlocks.length} blokov najdenih, ${validBlocks.length} z obema obveznima poljema (primary + headline)`);
    }
  } catch (fallbackErr) {
    console.log("[DOCX Parser] DCT fallback parser ni uspel:", fallbackErr);
  }

  console.log(`[DOCX Parser] Oba deterministična parserja nista uspela — kličem ChatGPT...`);
  try {
    const aiAds = await parseDocxWithAI(deterministicResult.rawText);
    return {
      rawText: deterministicResult.rawText,
      ads: aiAds,
      method: "ai",
    };
  } catch (error) {
    console.error("[DOCX Parser] ChatGPT parsanje ni uspelo:", error);
    console.log(`[DOCX Parser] Vračam prazen rezultat — noben parser ni uspel`);
    return {
      rawText: deterministicResult.rawText,
      ads: deterministicResult.ads,
      method: "deterministic",
    };
  }
}

export function validateAds(
  ads: ExtractedAdData[],
  videoIndices: number[]
): {
  validAds: Array<ExtractedAdData & { isValid: boolean; errors: string[] }>;
  missingIndices: number[];
  warnings: string[];
} {
  const validAds = ads.map((ad) => {
    const errors: string[] = [];

    if (!ad.headline || ad.headline.trim() === "") {
      errors.push("Headline is required");
    }
    if (!ad.primary_text || ad.primary_text.trim() === "") {
      errors.push("Primary text is required");
    }
    if (ad.url && !ad.url.match(/^https?:\/\/.+/)) {
      errors.push("URL must be a valid HTTP/HTTPS URL");
    }
    if (ad.utm && ad.utm.includes(" ")) {
      errors.push("UTM parameters cannot contain spaces");
    }

    return {
      ...ad,
      isValid: errors.length === 0,
      errors,
    };
  });

  const adIndices = new Set(ads.map((a) => a.index));
  const missingIndices = videoIndices.filter((idx) => !adIndices.has(idx));

  const warnings: string[] = [];
  ads.forEach((ad) => {
    if (!videoIndices.includes(ad.index)) {
      warnings.push(`Ad ${ad.index} has no matching video`);
    }
  });

  return { validAds, missingIndices, warnings };
}
