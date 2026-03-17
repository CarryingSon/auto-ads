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
  EU: [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  ],
  DACH: ["DE", "AT", "CH"],
  NORDICS: ["SE", "NO", "DK", "FI"],
  ANZ: ["AU", "NZ"],
  BENELUX: ["BE", "NL", "LU"],
};

const AMBIGUOUS_CODES = new Set(["IN", "IT", "AT", "BE", "NO"]);

const ALL_MARKET_CODES = Object.keys(MARKET_TO_COUNTRIES);

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

function detectMarketCode(filename: string): string | null {
  const nameWithoutExt = filename.replace(/\.[^.]+$/, "");

  for (const code of ALL_MARKET_CODES) {
    if (code.length <= 2 && AMBIGUOUS_CODES.has(code)) {
      const pattern = new RegExp(`(?:^|_)${code}(?:_\\d+$|_\\d+_|$)`, "i");
      if (pattern.test(nameWithoutExt)) {
        return code.toUpperCase();
      }
      continue;
    }

    if (code.length > 2) {
      const pattern = new RegExp(`(?:^|_|-)${code}(?:_|-|$)`, "i");
      if (pattern.test(nameWithoutExt)) {
        return code.toUpperCase();
      }
      continue;
    }

    const pattern = new RegExp(`(?:^|[_\\-])${code}(?:[_\\-.]|$)`, "i");
    if (pattern.test(nameWithoutExt)) {
      return code.toUpperCase();
    }
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
