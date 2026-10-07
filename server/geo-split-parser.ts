const MARKET_TO_COUNTRIES: Record<string, string[]> = {
  US: ["US"],
  UK: ["GB"],
  GB: ["GB"],
  AU: ["AU"],
  CA: ["CA"],
  DE: ["DE"],
  FR: ["FR"],
  ES: ["ES"],
  IT: ["IT"],
  NL: ["NL"],
  BE: ["BE"],
  AT: ["AT"],
  CH: ["CH"],
  SE: ["SE"],
  NO: ["NO"],
  DK: ["DK"],
  FI: ["FI"],
  IE: ["IE"],
  NZ: ["NZ"],
  SG: ["SG"],
  JP: ["JP"],
  KR: ["KR"],
  BR: ["BR"],
  MX: ["MX"],
  PL: ["PL"],
  CZ: ["CZ"],
  PT: ["PT"],
  RO: ["RO"],
  HU: ["HU"],
  HR: ["HR"],
  BG: ["BG"],
  GR: ["GR"],
  TR: ["TR"],
  IN: ["IN"],
  PH: ["PH"],
  TH: ["TH"],
  MY: ["MY"],
  ID: ["ID"],
  VN: ["VN"],
  ZA: ["ZA"],
  AE: ["AE"],
  SA: ["SA"],
  IL: ["IL"],
  EG: ["EG"],
  SI: ["SI"],
  RS: ["RS"],
  BA: ["BA"],
  ME: ["ME"],
  MK: ["MK"],
  AL: ["AL"],
  SK: ["SK"],
  LT: ["LT"],
  LV: ["LV"],
  EE: ["EE"],
  LU: ["LU"],
  CY: ["CY"],
  MT: ["MT"],
  UA: ["UA"],
  EU: [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  ],
  DACH: ["DE", "AT", "CH"],
  NORDICS: ["SE", "NO", "DK", "FI"],
  ANZ: ["AU", "NZ"],
  BENELUX: ["BE", "NL", "LU"],
  ADRIA: ["SI", "HR", "BA", "RS", "ME", "MK"],
};

// Codes that are also everyday words ("in", "it", "my", ...). They count only
// written in capitals and at the start or end of the name, so "my_AD_1" or
// "final_NO_text" are not read as Malaysia or Norway.
const AMBIGUOUS_CODES = new Set(["IN", "IT", "AT", "BE", "NO", "MY", "ID", "ME", "AL"]);

// Trailing name parts that are not part of what the file is called:
// "promo_AT_v2" ends in "AT" for this purpose.
const TRAILING_NOISE_RE = /^(?:v?\d+|final|copy|edit|new)$/i;


interface FileInfo {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

export interface GeoSplitResult {
  shouldSplit: boolean;
  markets: string[];
  filesByMarket: Record<string, FileInfo[]>;
  globalFiles: FileInfo[];
}

export interface SplitAdSet {
  marketCode: string;
  name: string;
  geoTargeting: string[];
  files: FileInfo[];
}

// The market a creative is for, from its file name: "video_US.mp4" -> "US",
// "SI-reel.mp4" -> "SI". The first market named wins ("BE_FR" -> "BE").
function detectMarketCode(filename: string): string | null {
  const tokens = filename
    .replace(/\.[^.]+$/, "")
    .split(/[\s_\-.()[\]]+/)
    .filter(Boolean);

  let lastMeaningful = tokens.length - 1;
  while (lastMeaningful > 0 && TRAILING_NOISE_RE.test(tokens[lastMeaningful])) {
    lastMeaningful--;
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const code = token.toUpperCase();
    if (!(code in MARKET_TO_COUNTRIES)) continue;

    if (AMBIGUOUS_CODES.has(code)) {
      const isCapitalised = token === code;
      const isAtEdge = i === 0 || i === lastMeaningful;
      if (!isCapitalised || !isAtEdge) continue;
    }
    return code;
  }

  return null;
}

export function detectGeoSplits(files: FileInfo[]): GeoSplitResult {
  const filesByMarket: Record<string, FileInfo[]> = {};
  const globalFiles: FileInfo[] = [];

  for (const file of files) {
    const market = detectMarketCode(file.name);
    if (market) {
      if (!filesByMarket[market]) {
        filesByMarket[market] = [];
      }
      filesByMarket[market].push(file);
    } else {
      globalFiles.push(file);
    }
  }

  const markets = Object.keys(filesByMarket).sort();
  const shouldSplit = markets.length >= 1;

  return { shouldSplit, markets, filesByMarket, globalFiles };
}

export function getGeoTargetingForMarket(marketCode: string): string[] {
  return MARKET_TO_COUNTRIES[marketCode.toUpperCase()] || [marketCode.toUpperCase()];
}

export function splitAdSetByGeo(
  adSetName: string,
  files: FileInfo[],
): SplitAdSet[] {
  const geoData = detectGeoSplits(files);

  if (!geoData.shouldSplit) {
    return [];
  }

  return geoData.markets.map((market) => ({
    marketCode: market,
    name: `${adSetName} ${market}`,
    geoTargeting: getGeoTargetingForMarket(market),
    files: [...(geoData.filesByMarket[market] || []), ...geoData.globalFiles],
  }));
}
