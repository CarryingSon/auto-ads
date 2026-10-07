import { describe, expect, it } from "vitest";
import { detectGeoSplits, getGeoTargetingForMarket } from "../geo-split-parser.js";

function marketOf(name: string): string | null {
  const result = detectGeoSplits([{ id: "1", name, mimeType: "video/mp4" }]);
  return result.markets[0] ?? null;
}

describe("detectGeoSplits", () => {
  it.each([
    ["video_US.mp4", "US"],
    ["video_UK_2.mp4", "UK"],
    ["DE_ad.mp4", "DE"],
    ["logo_DE.png", "DE"],
    ["SI_video.mp4", "SI"],
    ["reel-HR-v2.mp4", "HR"],
    ["promo-AT-v2.mp4", "AT"],
    ["summer_IT_1.mp4", "IT"],
    ["ad-es-v3.mp4", "ES"],
    ["BE_FR.mp4", "BE"],
    ["campaign_ADRIA.mp4", "ADRIA"],
  ])("reads %s as %s", (name, market) => {
    expect(marketOf(name)).toBe(market);
  });

  it.each([
    "my_AD_1.mp4",
    "final_NO_text.mp4",
    "IMG_1234.jpg",
    "Story_9x16.mp4",
    "Glasbeni_Atlas_FINAL.mp4",
    "made-in-italy.mp4",
    "what_it_is.mp4",
  ])("finds no market in %s", (name) => {
    expect(marketOf(name)).toBeNull();
  });

  it("keeps files without a market for every market", () => {
    const result = detectGeoSplits([
      { id: "1", name: "hook_SI.mp4", mimeType: "video/mp4" },
      { id: "2", name: "hook_HR.mp4", mimeType: "video/mp4" },
      { id: "3", name: "endcard.png", mimeType: "image/png" },
    ]);
    expect(result.markets).toEqual(["HR", "SI"]);
    expect(result.globalFiles.map((f) => f.name)).toEqual(["endcard.png"]);
  });

  it("targets the countries of a region", () => {
    expect(getGeoTargetingForMarket("UK")).toEqual(["GB"]);
    expect(getGeoTargetingForMarket("ADRIA")).toEqual(["SI", "HR", "BA", "RS", "ME", "MK"]);
  });
});
