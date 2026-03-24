const VALID_CTA_TYPES = [
  "LEARN_MORE", "SHOP_NOW", "SIGN_UP", "SUBSCRIBE", "CONTACT_US",
  "DOWNLOAD", "GET_OFFER", "BOOK_NOW", "WATCH_MORE", "APPLY_NOW",
  "BUY_NOW", "GET_QUOTE", "ORDER_NOW", "SEND_MESSAGE", "CALL_NOW",
  "GET_DIRECTIONS", "SAVE", "REQUEST_TIME", "SEE_MENU", "LISTEN_NOW",
  "OPEN_LINK", "NO_BUTTON", "MESSAGE_PAGE", "WHATSAPP_MESSAGE",
  "INSTALL_APP", "USE_APP", "PLAY_GAME", "WATCH_VIDEO",
];

const VALID_OBJECTIVES = [
  "OUTCOME_SALES", "OUTCOME_TRAFFIC", "OUTCOME_LEADS",
  "OUTCOME_ENGAGEMENT", "OUTCOME_AWARENESS", "OUTCOME_APP_PROMOTION",
];

const VALID_BUDGET_TYPES = ["DAILY", "LIFETIME"];
const VALID_GENDERS = ["ALL", "MALE", "FEMALE"];
const VALID_CONVERSION_EVENTS = [
  "PURCHASE", "LEAD", "COMPLETE_REGISTRATION", "ADD_TO_CART", "INITIATE_CHECKOUT",
  "VIEW_CONTENT", "SEARCH", "ADD_PAYMENT_INFO", "CONTACT", "SUBSCRIBE",
  "START_TRIAL", "CUSTOMIZE_PRODUCT", "ADD_TO_WISHLIST", "DONATE", "SCHEDULE",
  "SUBMIT_APPLICATION",
];

const SUPPORTED_VIDEO_MIMES = [
  "video/mp4", "video/quicktime", "video/x-msvideo", "video/x-ms-wmv",
  "video/avi", "video/mov", "video/gif",
];
const SUPPORTED_IMAGE_MIMES = [
  "image/jpeg", "image/png", "image/gif", "image/bmp", "image/tiff", "image/webp",
];
const UNSUPPORTED_MIMES = [
  "video/webm", "video/x-matroska", "video/ogg", "audio/mpeg", "audio/wav",
  "application/pdf", "application/zip",
];

const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".wmv", ".gif"];
const SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".webp"];

const EU_DSA_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "SG",
];

const TEXT_LIMITS = {
  primaryText: { recommended: 125, max: 2200, label: "Primary text" },
  headline: { recommended: 40, max: 255, label: "Headline" },
  description: { recommended: 30, max: 255, label: "Description" },
};

const MAX_DYNAMIC_CREATIVE_VARIANTS = 5;


interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

interface LaunchDataParams {
  accessToken?: string;
  adAccountId?: string;
  pageId?: string;
  campaignId?: string;
  campaignName?: string;
  campaignSettings: {
    objective?: string;
    budgetType?: string;
    budgetAmount?: number;
    conversionEvent?: string;
    isCBO?: boolean;
    startDate?: string;
    startTime?: string;
    endDate?: string;
    endTime?: string;
    specialAdCategories?: string[];
  };
  adSetSettings: {
    geoTargeting?: string[];
    ageMin?: number;
    ageMax?: number;
    gender?: string;
    pixelId?: string;
    audienceType?: string;
    audienceId?: string;
    optimizationGoal?: string;
    dailyMinSpendTarget?: number;
    dailySpendCap?: number;
    lifetimeSpendCap?: number;
  };
  adSettings: {
    defaultCta?: string;
    defaultUrl?: string;
    websiteUrl?: string;
    displayLink?: string;
  };
  jobAdsets: Array<{
    id: string;
    name: string;
  }>;
  assets: Array<{
    id: string;
    adsetId?: string | null;
    driveFileId?: string | null;
    originalFilename: string;
    mimeType?: string | null;
    status?: string | null;
  }>;
  extractedAds: Array<{
    adsetId?: string | null;
    primaryText?: string | null;
    headline?: string | null;
    description?: string | null;
    cta?: string | null;
    url?: string | null;
    utm?: string | null;
  }>;
  copyOverrides?: Record<string, any>;
  isScheduled?: boolean;
  scheduledAt?: string;
  hasCampaignBudget?: boolean;
  beneficiaryName?: string | null;
  payerName?: string | null;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isPlaceholderUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === "example.com" || host === "www.example.com";
  } catch {
    return false;
  }
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.substring(lastDot).toLowerCase();
}

function validateTextLength(
  text: string,
  limits: { recommended: number; max: number; label: string },
  field: string,
  adsetName: string,
  index: number,
  errors: ValidationError[],
  warnings: ValidationError[],
) {
  const variantLabel = `${limits.label} variant ${index + 1}`;
  if (text.length > limits.recommended) {
    warnings.push({
      field,
      message: `Ad set "${adsetName}": ${variantLabel} exceeds recommended ${limits.recommended} characters (has ${text.length}). Meta may truncate it.`,
      severity: "warning",
    });
  }
}

function validateUtmString(utm: string, field: string, adsetName: string, warnings: ValidationError[]) {
  if (utm.includes(" ")) {
    warnings.push({
      field,
      message: `Ad set "${adsetName}": UTM parameters contain spaces which may break tracking URLs. Use %20 or + instead.`,
      severity: "warning",
    });
  }
  const invalidChars = utm.match(/[{}|\\^`<>[\]]/g);
  if (invalidChars) {
    const unique = [...new Set(invalidChars)].join(" ");
    warnings.push({
      field,
      message: `Ad set "${adsetName}": UTM parameters contain characters that may cause issues: ${unique}`,
      severity: "warning",
    });
  }
}

export function validateMetaLaunchData(params: LaunchDataParams): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // ===== 1. AUTHENTICATION & ACCOUNT =====
  if (!params.accessToken || params.accessToken.trim().length === 0) {
    errors.push({
      field: "accessToken",
      message: "Meta access token is missing or empty. Please reconnect your Meta account.",
      severity: "error",
    });
  }

  if (!params.adAccountId || params.adAccountId.trim().length === 0) {
    errors.push({
      field: "adAccountId",
      message: "No ad account selected. Please select an ad account before launching.",
      severity: "error",
    });
  } else {
    const cleanAdAccountId = params.adAccountId.replace(/^act_/, "");
    if (!/^\d+$/.test(cleanAdAccountId)) {
      errors.push({
        field: "adAccountId",
        message: `Ad account ID "${params.adAccountId}" has invalid format. Must be numeric (with optional act_ prefix).`,
        severity: "error",
      });
    }
  }

  if (!params.pageId || params.pageId.trim().length === 0) {
    errors.push({
      field: "pageId",
      message: "No Facebook Page selected. Please select a Facebook Page linked to your ad account.",
      severity: "error",
    });
  } else if (!/^\d+$/.test(params.pageId)) {
    errors.push({
      field: "pageId",
      message: `Facebook Page ID "${params.pageId}" has invalid format. Must be numeric.`,
      severity: "error",
    });
  }

  if (params.campaignId && !/^\d+$/.test(params.campaignId)) {
    errors.push({
      field: "campaignId",
      message: `Campaign ID "${params.campaignId}" has invalid format. Must be numeric.`,
      severity: "error",
    });
  }

  // ===== 2. CAMPAIGN SETTINGS =====
  const cs = params.campaignSettings;

  if (!params.campaignId) {
    if (!cs.objective || !VALID_OBJECTIVES.includes(cs.objective)) {
      const objDisplay = cs.objective || "(empty)";
      errors.push({
        field: "campaignObjective",
        message: `Invalid campaign objective: ${objDisplay}. Must be one of: ${VALID_OBJECTIVES.join(", ")}`,
        severity: "error",
      });
    }
  }

  if (!params.hasCampaignBudget) {
    if (!cs.budgetType || !VALID_BUDGET_TYPES.includes(cs.budgetType)) {
      const btDisplay = cs.budgetType || "(empty)";
      errors.push({
        field: "budgetType",
        message: `Invalid budget type: ${btDisplay}. Must be DAILY or LIFETIME.`,
        severity: "error",
      });
    }

    if (!cs.budgetAmount || cs.budgetAmount <= 0) {
      errors.push({
        field: "budgetAmount",
        message: "Budget amount must be greater than 0.",
        severity: "error",
      });
    }

    if (cs.budgetAmount && cs.budgetAmount > 1000000) {
      warnings.push({
        field: "budgetAmount",
        message: `Budget amount is very high (${cs.budgetAmount}). Please double-check this value.`,
        severity: "warning",
      });
    }

    if (cs.budgetType === "LIFETIME" && !cs.endDate) {
      errors.push({
        field: "endDate",
        message: "Lifetime budget requires an end date. Meta will reject ad sets without one.",
        severity: "error",
      });
    }
  }

  // ===== 3. AD SET SETTINGS =====
  const as = params.adSetSettings;

  if (!as.geoTargeting || as.geoTargeting.length === 0) {
    errors.push({
      field: "geoTargeting",
      message: "No geo targeting set. At least one country must be selected.",
      severity: "error",
    });
  } else {
    const invalidGeos = as.geoTargeting.filter(g => !/^[A-Z]{2}$/.test(g));
    if (invalidGeos.length > 0) {
      errors.push({
        field: "geoTargeting",
        message: `Invalid country codes: ${invalidGeos.join(", ")}. Must be 2-letter ISO codes (e.g. US, DE, GB).`,
        severity: "error",
      });
    }

    const euCountriesTargeted = as.geoTargeting.filter(c => EU_DSA_COUNTRIES.includes(c));
    if (euCountriesTargeted.length > 0) {
      if (!params.beneficiaryName || params.beneficiaryName.trim().length === 0) {
        warnings.push({
          field: "beneficiaryName",
          message: `Targeting EU/SG countries (${euCountriesTargeted.join(", ")}): DSA Beneficiary name is not explicitly set. Will fall back to Facebook Page name.`,
          severity: "warning",
        });
      }
      if (!params.payerName || params.payerName.trim().length === 0) {
        warnings.push({
          field: "payerName",
          message: `Targeting EU/SG countries (${euCountriesTargeted.join(", ")}): DSA Payer name is not explicitly set. Will fall back to Facebook Page name.`,
          severity: "warning",
        });
      }
    }
  }

  if (as.ageMin !== undefined) {
    if (as.ageMin < 13 || as.ageMin > 65) {
      errors.push({
        field: "ageMin",
        message: `Minimum age ${as.ageMin} is out of range. Must be between 13 and 65.`,
        severity: "error",
      });
    }
  }

  if (as.ageMax !== undefined) {
    if (as.ageMax < 13 || as.ageMax > 65) {
      errors.push({
        field: "ageMax",
        message: `Maximum age ${as.ageMax} is out of range. Must be between 13 and 65.`,
        severity: "error",
      });
    }
  }

  if (as.ageMin !== undefined && as.ageMax !== undefined && as.ageMin > as.ageMax) {
    errors.push({
      field: "ageRange",
      message: `Minimum age (${as.ageMin}) cannot be greater than maximum age (${as.ageMax}).`,
      severity: "error",
    });
  }

  if (as.gender && !VALID_GENDERS.includes(as.gender)) {
    errors.push({
      field: "gender",
      message: `Invalid gender targeting "${as.gender}". Must be ALL, MALE, or FEMALE.`,
      severity: "error",
    });
  }

  if (as.audienceType === "CUSTOM" && !as.audienceId) {
    errors.push({
      field: "audienceId",
      message: "Custom audience type selected but no audience ID provided.",
      severity: "error",
    });
  }

  if (as.pixelId && !/^\d+$/.test(as.pixelId)) {
    errors.push({
      field: "pixelId",
      message: `Invalid pixel ID "${as.pixelId}". Pixel ID must be numeric.`,
      severity: "error",
    });
  }

  if (as.dailyMinSpendTarget !== undefined && as.dailyMinSpendTarget < 0) {
    errors.push({
      field: "dailyMinSpendTarget",
      message: "Daily minimum spend target cannot be negative.",
      severity: "error",
    });
  }

  if (as.dailySpendCap !== undefined && as.dailySpendCap < 0) {
    errors.push({
      field: "dailySpendCap",
      message: "Daily spend cap cannot be negative.",
      severity: "error",
    });
  }

  if (as.dailyMinSpendTarget !== undefined && as.dailySpendCap !== undefined && as.dailyMinSpendTarget > as.dailySpendCap) {
    errors.push({
      field: "spendLimits",
      message: `Daily minimum spend (${as.dailyMinSpendTarget}) cannot exceed daily spend cap (${as.dailySpendCap}).`,
      severity: "error",
    });
  }

  // Objective/optimization alignment for conversion campaigns
  const effectiveObjective = cs.objective || "OUTCOME_SALES";
  const requiresConversionSignals =
    effectiveObjective === "OUTCOME_SALES" ||
    as.optimizationGoal === "OFFSITE_CONVERSIONS";

  if (requiresConversionSignals) {
    if (!as.pixelId || as.pixelId.trim().length === 0) {
      errors.push({
        field: "pixelId",
        message: `Campaign objective "${effectiveObjective}" requires a Meta Pixel ID.`,
        severity: "error",
      });
    }

    const rawConversionEvent = cs.conversionEvent?.trim() || "";
    if (!rawConversionEvent) {
      errors.push({
        field: "conversionEvent",
        message: `Campaign objective "${effectiveObjective}" requires a conversion event (e.g. PURCHASE).`,
        severity: "error",
      });
    } else {
      const normalizedConversionEvent = rawConversionEvent.toUpperCase();
      if (!VALID_CONVERSION_EVENTS.includes(normalizedConversionEvent)) {
        errors.push({
          field: "conversionEvent",
          message: `Invalid conversion event "${rawConversionEvent}". Use a valid Meta custom_event_type (e.g. PURCHASE, LEAD, ADD_TO_CART, COMPLETE_REGISTRATION).`,
          severity: "error",
        });
      }
    }
  }

  // ===== 4. AD SETTINGS =====
  const ads = params.adSettings;

  if (!ads.defaultCta) {
    errors.push({
      field: "defaultCta",
      message: "Default CTA (Call to Action) is not set.",
      severity: "error",
    });
  } else if (!VALID_CTA_TYPES.includes(ads.defaultCta)) {
    errors.push({
      field: "defaultCta",
      message: `Invalid CTA type "${ads.defaultCta}". Must be one of: ${VALID_CTA_TYPES.slice(0, 10).join(", ")}...`,
      severity: "error",
    });
  }

  if (!ads.defaultUrl) {
    errors.push({
      field: "defaultUrl",
      message: "Default URL is not set. A destination URL is required for ads.",
      severity: "error",
    });
  } else if (!isValidUrl(ads.defaultUrl)) {
    errors.push({
      field: "defaultUrl",
      message: `Invalid default URL "${ads.defaultUrl}". Must be a valid http:// or https:// URL.`,
      severity: "error",
    });
  } else if (isPlaceholderUrl(ads.defaultUrl)) {
    errors.push({
      field: "defaultUrl",
      message: `Default URL "${ads.defaultUrl}" is a placeholder. Set a real landing URL before launch.`,
      severity: "error",
    });
  }

  if (ads.websiteUrl && !isValidUrl(ads.websiteUrl)) {
    errors.push({
      field: "websiteUrl",
      message: `Invalid website URL "${ads.websiteUrl}". Must be a valid http:// or https:// URL.`,
      severity: "error",
    });
  } else if (ads.websiteUrl && isPlaceholderUrl(ads.websiteUrl)) {
    errors.push({
      field: "websiteUrl",
      message: `Website URL "${ads.websiteUrl}" is a placeholder. Set a real landing URL before launch.`,
      severity: "error",
    });
  }

  if (ads.displayLink) {
    if (ads.displayLink.startsWith("http://") || ads.displayLink.startsWith("https://")) {
      warnings.push({
        field: "displayLink",
        message: `Display link should not include protocol (http/https). Use just the domain like "example.com".`,
        severity: "warning",
      });
    }
    if (ads.displayLink.length > 100) {
      warnings.push({
        field: "displayLink",
        message: `Display link is very long (${ads.displayLink.length} chars). Consider keeping it under 30 characters.`,
        severity: "warning",
      });
    }
  }

  // ===== 5. SCHEDULING =====
  if (params.isScheduled) {
    if (!params.scheduledAt) {
      errors.push({
        field: "scheduledAt",
        message: "Scheduled launch selected but no date/time provided.",
        severity: "error",
      });
    } else {
      const scheduledDate = new Date(params.scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        errors.push({
          field: "scheduledAt",
          message: `Invalid scheduled date "${params.scheduledAt}".`,
          severity: "error",
        });
      } else if (scheduledDate.getTime() < Date.now() - 60000) {
        errors.push({
          field: "scheduledAt",
          message: "Scheduled date is in the past. Please select a future date and time.",
          severity: "error",
        });
      }
    }
  }

  if (cs.endDate) {
    const endDateTime = new Date(`${cs.endDate}T${cs.endTime || "23:59"}:00`);
    if (isNaN(endDateTime.getTime())) {
      errors.push({
        field: "endDate",
        message: `Invalid end date "${cs.endDate}".`,
        severity: "error",
      });
    } else if (cs.startDate) {
      const startDateTime = new Date(`${cs.startDate}T${cs.startTime || "00:00"}:00`);
      if (!isNaN(startDateTime.getTime()) && endDateTime <= startDateTime) {
        errors.push({
          field: "endDate",
          message: "End date must be after start date.",
          severity: "error",
        });
      }
    }
  }

  // ===== 6. AD SETS & ASSETS =====
  if (!params.jobAdsets || params.jobAdsets.length === 0) {
    errors.push({
      field: "jobAdsets",
      message: "No ad sets found for this job. Upload media files first.",
      severity: "error",
    });
  }

  const adsetNames = params.jobAdsets.map(a => a.name);
  const duplicateNames = adsetNames.filter((name, i) => adsetNames.indexOf(name) !== i);
  if (duplicateNames.length > 0) {
    const uniqueDupes = [...new Set(duplicateNames)];
    warnings.push({
      field: "jobAdsets",
      message: `Duplicate ad set names detected: ${uniqueDupes.map(n => `"${n}"`).join(", ")}. This may cause confusion in Ads Manager.`,
      severity: "warning",
    });
  }

  const activeAssets = params.assets.filter(a => a.status !== "error");
  if (activeAssets.length === 0) {
    errors.push({
      field: "assets",
      message: "No valid media assets found. All assets have errors or none were uploaded.",
      severity: "error",
    });
  }

  const assetsWithoutDriveId = activeAssets.filter(a => !a.driveFileId);
  if (assetsWithoutDriveId.length > 0) {
    errors.push({
      field: "assets",
      message: `${assetsWithoutDriveId.length} asset(s) have no source file ID: ${assetsWithoutDriveId.map(a => a.originalFilename).join(", ")}`,
      severity: "error",
    });
  }

  for (const asset of activeAssets) {
    const mime = asset.mimeType?.toLowerCase() || "";
    const ext = getFileExtension(asset.originalFilename);

    if (mime) {
      if (UNSUPPORTED_MIMES.includes(mime)) {
        errors.push({
          field: `asset_${asset.originalFilename}`,
          message: `"${asset.originalFilename}" has unsupported format (${mime}). Meta does not accept this file type.`,
          severity: "error",
        });
      } else if (!SUPPORTED_VIDEO_MIMES.includes(mime) && !SUPPORTED_IMAGE_MIMES.includes(mime)) {
        warnings.push({
          field: `asset_${asset.originalFilename}`,
          message: `"${asset.originalFilename}" has unrecognized media type (${mime}). It may not be accepted by Meta.`,
          severity: "warning",
        });
      }
    } else if (ext) {
      if (!SUPPORTED_VIDEO_EXTENSIONS.includes(ext) && !SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
        warnings.push({
          field: `asset_${asset.originalFilename}`,
          message: `"${asset.originalFilename}" has unrecognized file extension (${ext}). Verify it is a supported video or image format.`,
          severity: "warning",
        });
      }
    }
  }

  // ===== 7. PER-ADSET TEXT VALIDATION =====
  for (const adset of params.jobAdsets) {
    const adsetAssets = activeAssets.filter(a => a.adsetId === adset.id);
    if (adsetAssets.length === 0) {
      warnings.push({
        field: `adset_${adset.name}`,
        message: `Ad set "${adset.name}" has no valid media assets and will be skipped.`,
        severity: "warning",
      });
      continue;
    }

    const adCopy = params.extractedAds.find(a => a.adsetId === adset.id);
    const override = params.copyOverrides?.[adset.id];

    const rawPrimaryText = override?.primaryText || adCopy?.primaryText || "";
    const rawHeadline = override?.headline || adCopy?.headline || "";
    const rawDescription = override?.description || adCopy?.description || "";

    const normText = (t: string) => t.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
    const primaryTexts = normText(rawPrimaryText).split(/\n\n---\n\n|\n---\n|---/).map((t: string) => t.trim()).filter((t: string) => t.length > 0);
    const headlines = normText(rawHeadline).split(/\n\n---\n\n|\n---\n|---/).map((t: string) => t.trim()).filter((t: string) => t.length > 0);
    const descriptions = normText(rawDescription).split(/\n\n---\n\n|\n---\n|---/).map((t: string) => t.trim()).filter((t: string) => t.length > 0);

    if (primaryTexts.length === 0) {
      errors.push({
        field: `adset_${adset.name}_primaryText`,
        message: `Ad set "${adset.name}" has no primary text. Each ad set needs at least one primary text.`,
        severity: "error",
      });
    }

    if (headlines.length === 0) {
      errors.push({
        field: `adset_${adset.name}_headline`,
        message: `Ad set "${adset.name}" has no headline. Each ad set needs at least one headline.`,
        severity: "error",
      });
    }

    if (primaryTexts.length > MAX_DYNAMIC_CREATIVE_VARIANTS) {
      warnings.push({
        field: `adset_${adset.name}_primaryText`,
        message: `Ad set "${adset.name}" has ${primaryTexts.length} primary text variants but Meta allows max ${MAX_DYNAMIC_CREATIVE_VARIANTS}. Extra variants will be truncated.`,
        severity: "warning",
      });
    }

    if (headlines.length > MAX_DYNAMIC_CREATIVE_VARIANTS) {
      warnings.push({
        field: `adset_${adset.name}_headline`,
        message: `Ad set "${adset.name}" has ${headlines.length} headline variants but Meta allows max ${MAX_DYNAMIC_CREATIVE_VARIANTS}. Extra variants will be truncated.`,
        severity: "warning",
      });
    }

    if (descriptions.length > MAX_DYNAMIC_CREATIVE_VARIANTS) {
      warnings.push({
        field: `adset_${adset.name}_description`,
        message: `Ad set "${adset.name}" has ${descriptions.length} description variants but Meta allows max ${MAX_DYNAMIC_CREATIVE_VARIANTS}. Extra variants will be truncated.`,
        severity: "warning",
      });
    }

    for (let i = 0; i < primaryTexts.length; i++) {
      validateTextLength(primaryTexts[i], TEXT_LIMITS.primaryText, `adset_${adset.name}_primaryText_${i}`, adset.name, i, errors, warnings);
    }
    for (let i = 0; i < headlines.length; i++) {
      validateTextLength(headlines[i], TEXT_LIMITS.headline, `adset_${adset.name}_headline_${i}`, adset.name, i, errors, warnings);
    }
    for (let i = 0; i < descriptions.length; i++) {
      validateTextLength(descriptions[i], TEXT_LIMITS.description, `adset_${adset.name}_description_${i}`, adset.name, i, errors, warnings);
    }

    const utm = override?.utm || adCopy?.utm || "";
    if (utm && utm.trim().length > 0) {
      validateUtmString(utm, `adset_${adset.name}_utm`, adset.name, warnings);
    }

    const overrideCta = override?.cta;
    if (overrideCta && !VALID_CTA_TYPES.includes(overrideCta)) {
      errors.push({
        field: `adset_${adset.name}_cta`,
        message: `Ad set "${adset.name}" has invalid CTA "${overrideCta}".`,
        severity: "error",
      });
    }

    const overrideUrl = override?.url;
    if (overrideUrl) {
      if (!isValidUrl(overrideUrl)) {
        errors.push({
          field: `adset_${adset.name}_url`,
          message: `Ad set "${adset.name}" has invalid URL "${overrideUrl}".`,
          severity: "error",
        });
      } else if (isPlaceholderUrl(overrideUrl)) {
        errors.push({
          field: `adset_${adset.name}_url`,
          message: `Ad set "${adset.name}" uses placeholder URL "${overrideUrl}". Set a real landing URL.`,
          severity: "error",
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateAdSetBeforeCreation(params: {
  campaignId: string;
  adSetName: string;
  pageId: string;
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  finalCta: string;
  finalUrl: string;
  assets: Array<{ driveFileId?: string | null; originalFilename: string; mimeType?: string | null }>;
  budgetAmount?: number;
  budgetType?: string;
  hasCampaignBudget?: boolean;
}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!params.campaignId) {
    errors.push({ field: "campaignId", message: "Campaign ID is missing. Cannot create ad set without a campaign.", severity: "error" });
  }

  if (!params.pageId) {
    errors.push({ field: "pageId", message: "Facebook Page ID is missing.", severity: "error" });
  }

  if (!params.adSetName || params.adSetName.trim().length === 0) {
    errors.push({ field: "adSetName", message: "Ad set name is empty.", severity: "error" });
  }

  if (params.primaryTexts.length === 0) {
    errors.push({ field: "primaryTexts", message: `Ad set "${params.adSetName}" has no primary text.`, severity: "error" });
  }

  if (params.headlines.length === 0) {
    errors.push({ field: "headlines", message: `Ad set "${params.adSetName}" has no headline.`, severity: "error" });
  }

  if (!params.finalUrl || !isValidUrl(params.finalUrl)) {
    const urlDisplay = params.finalUrl || "(empty)";
    errors.push({ field: "finalUrl", message: `Ad set "${params.adSetName}" has invalid destination URL: ${urlDisplay}`, severity: "error" });
  } else if (isPlaceholderUrl(params.finalUrl)) {
    errors.push({
      field: "finalUrl",
      message: `Ad set "${params.adSetName}" uses placeholder URL "${params.finalUrl}". Set a real landing URL before launch.`,
      severity: "error",
    });
  }

  if (!params.finalCta || !VALID_CTA_TYPES.includes(params.finalCta)) {
    const ctaDisplay = params.finalCta || "(empty)";
    errors.push({ field: "finalCta", message: `Ad set "${params.adSetName}" has invalid CTA: ${ctaDisplay}`, severity: "error" });
  }

  const validAssets = params.assets.filter(a => a.driveFileId);
  if (validAssets.length === 0) {
    errors.push({ field: "assets", message: `Ad set "${params.adSetName}" has no media files with valid source IDs.`, severity: "error" });
  }

  if (!params.hasCampaignBudget && params.budgetAmount !== undefined && params.budgetAmount <= 0) {
    errors.push({ field: "budget", message: `Ad set "${params.adSetName}" has invalid budget amount (${params.budgetAmount}).`, severity: "error" });
  }

  for (let i = 0; i < params.primaryTexts.length; i++) {
    validateTextLength(params.primaryTexts[i], TEXT_LIMITS.primaryText, `primaryText_${i}`, params.adSetName, i, errors, warnings);
  }
  for (let i = 0; i < params.headlines.length; i++) {
    validateTextLength(params.headlines[i], TEXT_LIMITS.headline, `headline_${i}`, params.adSetName, i, errors, warnings);
  }
  for (let i = 0; i < params.descriptions.length; i++) {
    validateTextLength(params.descriptions[i], TEXT_LIMITS.description, `description_${i}`, params.adSetName, i, errors, warnings);
  }

  if (params.primaryTexts.length > MAX_DYNAMIC_CREATIVE_VARIANTS) {
    warnings.push({ field: "primaryTexts", message: `Ad set "${params.adSetName}" has ${params.primaryTexts.length} primary text variants, max ${MAX_DYNAMIC_CREATIVE_VARIANTS}. Extra will be truncated.`, severity: "warning" });
  }
  if (params.headlines.length > MAX_DYNAMIC_CREATIVE_VARIANTS) {
    warnings.push({ field: "headlines", message: `Ad set "${params.adSetName}" has ${params.headlines.length} headline variants, max ${MAX_DYNAMIC_CREATIVE_VARIANTS}. Extra will be truncated.`, severity: "warning" });
  }
  if (params.descriptions.length > MAX_DYNAMIC_CREATIVE_VARIANTS) {
    warnings.push({ field: "descriptions", message: `Ad set "${params.adSetName}" has ${params.descriptions.length} description variants, max ${MAX_DYNAMIC_CREATIVE_VARIANTS}. Extra will be truncated.`, severity: "warning" });
  }

  for (const asset of validAssets) {
    const mime = asset.mimeType?.toLowerCase() || "";
    const ext = getFileExtension(asset.originalFilename);
    if (mime && UNSUPPORTED_MIMES.includes(mime)) {
      errors.push({ field: `asset_${asset.originalFilename}`, message: `"${asset.originalFilename}" has unsupported format (${mime}). Meta does not accept this file type.`, severity: "error" });
    } else if (mime && !SUPPORTED_VIDEO_MIMES.includes(mime) && !SUPPORTED_IMAGE_MIMES.includes(mime)) {
      warnings.push({ field: `asset_${asset.originalFilename}`, message: `"${asset.originalFilename}" has unrecognized media type (${mime}). It may not be accepted by Meta.`, severity: "warning" });
    } else if (!mime && ext && !SUPPORTED_VIDEO_EXTENSIONS.includes(ext) && !SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
      warnings.push({ field: `asset_${asset.originalFilename}`, message: `"${asset.originalFilename}" has unrecognized file extension (${ext}).`, severity: "warning" });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
