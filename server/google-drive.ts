import { google } from 'googleapis';
import { isServiceAccountConfigured } from './google-drive-service-account.js';

let cachedClient: ReturnType<typeof google.drive> | null = null;

function getServiceAccountCredentials(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set');
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('Invalid service account key: missing client_email or private_key');
    }
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  }

  // Backward-compatible fallback when only private key is provided.
  return {
    client_email: 'drivetoads@practical-scion-483209-t7.iam.gserviceaccount.com',
    private_key: trimmed.replace(/\\n/g, '\n'),
  };
}

export async function getUncachableGoogleDriveClient() {
  if (cachedClient) return cachedClient;
  if (!isServiceAccountConfigured()) {
    throw new Error('Google Drive service account is not configured');
  }

  const creds = getServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key,
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  cachedClient = google.drive({ version: 'v3', auth });
  return cachedClient;
}

// Check if Google Drive is connected
export async function checkGoogleDriveConnection(): Promise<{
  connected: boolean;
  accountEmail?: string;
  accountName?: string;
  error?: string;
}> {
  try {
    const drive = await getUncachableGoogleDriveClient();
    const about = await drive.about.get({ fields: 'user' });
    return {
      connected: true,
      accountEmail: about.data.user?.emailAddress || undefined,
      accountName: about.data.user?.displayName || undefined,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

// List files from a folder
export async function listDriveFiles(folderId?: string, mimeTypes?: string[]) {
  const drive = await getUncachableGoogleDriveClient();
  
  let query = folderId ? `'${folderId}' in parents` : '';
  if (mimeTypes && mimeTypes.length > 0) {
    const mimeQuery = mimeTypes.map(m => `mimeType='${m}'`).join(' or ');
    query = query ? `${query} and (${mimeQuery})` : `(${mimeQuery})`;
  }
  query = query ? `${query} and trashed=false` : 'trashed=false';

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, mimeType, size, createdTime)',
    orderBy: 'name',
    pageSize: 100,
  });

  return response.data.files || [];
}

// Extract folder ID from Google Drive URL
export function extractFolderIdFromUrl(url: string): string | null {
  // Patterns: 
  // https://drive.google.com/drive/folders/FOLDER_ID
  // https://drive.google.com/drive/u/0/folders/FOLDER_ID
  // https://drive.google.com/drive/folders/FOLDER_ID?usp=sharing
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /\/drive\/folders\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

// Get folder metadata
export async function getFolderMetadata(folderId: string) {
  const drive = await getUncachableGoogleDriveClient();
  const response = await drive.files.get({
    fileId: folderId,
    fields: 'id, name, mimeType',
  });
  return response.data;
}

// List subfolders (Ad Set folders)
export async function listSubfolders(parentFolderId: string) {
  const drive = await getUncachableGoogleDriveClient();
  const response = await drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name, mimeType, createdTime)',
    orderBy: 'name',
    pageSize: 100,
  });
  return response.data.files || [];
}

// List files in a subfolder (videos + docx)
export async function listAdSetFiles(folderId: string) {
  const drive = await getUncachableGoogleDriveClient();
  
  // Get all files in the folder
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType, size, createdTime)',
    orderBy: 'name',
    pageSize: 100,
  });

  const files = response.data.files || [];
  
  // Categorize files
  const videos: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: string;
    index: number | null;
  }> = [];
  
  let docxFile: { id: string; name: string; size: string } | null = null;

  for (const file of files) {
    if (file.mimeType?.startsWith('video/')) {
      // Extract index from filename (e.g., "1.mp4", "01_video.mp4")
      const indexMatch = file.name?.match(/^(\d{1,2})[_\-.]?/);
      const index = indexMatch ? parseInt(indexMatch[1], 10) : null;
      
      if (index !== null && index >= 1 && index <= 10) {
        videos.push({
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType,
          size: file.size || '0',
          index,
        });
      }
    } else if (
      file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.mimeType === 'application/vnd.google-apps.document' ||
      file.name?.toLowerCase().endsWith('.docx')
    ) {
      docxFile = {
        id: file.id!,
        name: file.name!,
        size: file.size || '0',
      };
    }
  }

  // Sort videos by integer index
  videos.sort((a, b) => (a.index || 0) - (b.index || 0));

  return { videos, docxFile };
}

// Download file content as buffer (supports both binary files and native Google Docs)
// Export native Google Docs as plain text (preserves exact formatting)
export async function exportGoogleDocAsPlainText(fileId: string): Promise<string | null> {
  const drive = await getUncachableGoogleDriveClient();
  
  // Check if it's a native Google Docs file
  const fileMeta = await drive.files.get({ fileId, fields: 'mimeType' });
  if (fileMeta.data.mimeType !== 'application/vnd.google-apps.document') {
    return null; // Not a native Google Docs file
  }
  
  const response = await drive.files.export(
    { fileId, mimeType: 'text/plain' },
    { responseType: 'text' }
  );
  return response.data as string;
}

export async function downloadFileAsBuffer(fileId: string): Promise<Buffer> {
  const drive = await getUncachableGoogleDriveClient();
  
  // First check the file's mimeType to determine download method
  const fileMeta = await drive.files.get({ fileId, fields: 'mimeType' });
  const mimeType = fileMeta.data.mimeType;
  
  if (mimeType === 'application/vnd.google-apps.document') {
    // Native Google Docs file - must use export
    const response = await drive.files.export(
      { fileId, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(response.data as ArrayBuffer);
  }
  
  // Binary file (.docx, video, image, etc.) - direct download
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(response.data as ArrayBuffer);
}

// Parse AdSet name from folder name (e.g., "AdSet 1 - My Campaign" -> { order: 1, name: "My Campaign" })
export function parseAdSetFolderName(folderName: string): { order: number; name: string } {
  // Pattern: "AdSet X - Name" or "Ad Set X - Name" or just the folder name
  const patterns = [
    /^(?:Ad\s*Set|AdSet)\s*(\d+)\s*[-–—]\s*(.+)$/i,
    /^(\d+)\s*[-–—]\s*(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = folderName.match(pattern);
    if (match) {
      return {
        order: parseInt(match[1], 10),
        name: match[2].trim(),
      };
    }
  }

  // Default: use folder name as-is
  return {
    order: 0,
    name: folderName,
  };
}

// Check if folder name starts with "DCT" (case-insensitive)
export function isDCTFolder(folderName: string): boolean {
  return /^DCT[\s_-]?/i.test(folderName);
}

// Parse DCT folder name to extract order and name
export function parseDCTFolderName(folderName: string): { order: number; name: string } {
  // Patterns: "DCT 1", "DCT_02", "DCT X", "DCT - Prospecting", "DCT1 - Name"
  const patterns = [
    /^DCT[\s_-]*(\d+)[\s_-]*[-–—]?\s*(.*)$/i,  // DCT 1 - Name or DCT1 Name
    /^DCT[\s_-]+(.+)$/i,  // DCT - Prospecting (no number)
  ];

  for (const pattern of patterns) {
    const match = folderName.match(pattern);
    if (match) {
      const maybeNum = parseInt(match[1], 10);
      if (!isNaN(maybeNum)) {
        return {
          order: maybeNum,
          name: match[2]?.trim() || `DCT ${maybeNum}`,
        };
      } else {
        return {
          order: 0,
          name: match[1]?.trim() || folderName,
        };
      }
    }
  }

  return { order: 0, name: folderName };
}

// List DCT subfolders from a parent folder
export async function listDCTFolders(parentFolderId: string) {
  const allFolders = await listSubfolders(parentFolderId);
  return allFolders.filter(folder => isDCTFolder(folder.name || ''));
}

// List all creatives (images + videos) in a DCT folder
export async function listDCTCreatives(folderId: string) {
  const drive = await getUncachableGoogleDriveClient();
  
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType, size, createdTime, webViewLink)',
    orderBy: 'name',
    pageSize: 100,
  });

  const files = response.data.files || [];
  
  const creatives: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: string;
    webViewLink?: string;
    type: 'image' | 'video';
  }> = [];
  
  const docxFiles: Array<{ id: string; name: string; createdTime?: string }> = [];

  for (const file of files) {
    const mime = file.mimeType || '';
    const name = file.name || '';
    
    // Videos
    if (mime.startsWith('video/') || /\.(mp4|mov)$/i.test(name)) {
      creatives.push({
        id: file.id!,
        name: name,
        mimeType: mime,
        size: file.size || '0',
        webViewLink: file.webViewLink || undefined,
        type: 'video',
      });
    }
    // Images
    else if (mime.startsWith('image/') || /\.(jpg|jpeg|png)$/i.test(name)) {
      creatives.push({
        id: file.id!,
        name: name,
        mimeType: mime,
        size: file.size || '0',
        webViewLink: file.webViewLink || undefined,
        type: 'image',
      });
    }
    // DOCX files (including native Google Docs)
    else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/vnd.google-apps.document' ||
      name.toLowerCase().endsWith('.docx')
    ) {
      docxFiles.push({
        id: file.id!,
        name: name,
        createdTime: file.createdTime || undefined,
      });
    }
  }

  return { creatives, docxFiles };
}

// List DOCX files in root folder (global copy candidates)
export async function listRootDocxFiles(folderId: string) {
  const drive = await getUncachableGoogleDriveClient();
  
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and (mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType='application/vnd.google-apps.document' or name contains '.docx')`,
    fields: 'files(id, name, mimeType, size, createdTime)',
    orderBy: 'createdTime desc',
    pageSize: 10,
  });

  return response.data.files || [];
}

// Parsed copy structure for a DCT
export interface ParsedDCTCopy {
  dctName: string;
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
}

// Parse DOCX content for DCT copy blocks
export function parseDCTCopyFromText(rawText: string): ParsedDCTCopy[] {
  const results: ParsedDCTCopy[] = [];
  
  const dctHeaders: { name: string; start: number; contentStart: number }[] = [];
  let match;
  
  // Support both:
  // - "DCT 1:"
  // - "DCT 1 - Prospecting" (no trailing colon)
  // If no explicit colon is present, we still treat the line as a section header.
  const dctBlockPattern = /(?:^|\n)\s*(DCT[\s_]*\d+[^\n:]*?)(?:\s*:\s*|\s*(?=\n|$))/gi;
  while ((match = dctBlockPattern.exec(rawText)) !== null) {
    dctHeaders.push({
      name: match[1].trim(),
      start: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  if (dctHeaders.length === 0) {
    // Support both:
    // - "Ad 1:"
    // - "Ad 1 - Retargeting" (no trailing colon)
    const adBlockPattern = /(?:^|\n)\s*(Ad\s*(\d{1,3})[^\n:]*?)(?:\s*:\s*|\s*(?=\n|$))/gi;
    while ((match = adBlockPattern.exec(rawText)) !== null) {
      const adNumber = match[2];
      dctHeaders.push({
        name: `DCT ${adNumber}`,
        start: match.index,
        contentStart: match.index + match[0].length,
      });
    }
  }

  if (dctHeaders.length > 0) {
    dctHeaders.sort((a, b) => a.start - b.start);
    console.log(`[DCT Parser] Najdenih ${dctHeaders.length} DCT sekcij: ${dctHeaders.map(h => h.name).join(", ")}`);

    for (let i = 0; i < dctHeaders.length; i++) {
      const start = dctHeaders[i].contentStart;
      const end = i + 1 < dctHeaders.length ? dctHeaders[i + 1].start : rawText.length;
      const blockText = rawText.slice(start, end);
      
      const copy = extractCopyFields(blockText);
      const status = copy.primaryTexts.length > 0 && copy.headlines.length > 0 ? "OK" : 
                     copy.primaryTexts.length === 0 && copy.headlines.length === 0 ? "prazno" : "delno";
      console.log(`[DCT Parser]   ${dctHeaders[i].name}: ${copy.primaryTexts.length} primary, ${copy.headlines.length} headline, ${copy.descriptions.length} desc [${status}]`);
      
      results.push({
        dctName: dctHeaders[i].name,
        ...copy,
      });
    }

    return results;
  }

  const separatorPattern = /[-–—_=]{5,}/g;
  const hasSeparators = separatorPattern.test(rawText);
  
  if (hasSeparators) {
    console.log("[DCT Parser] Iščem sekcije po ločilnih črtah (---)...");
    const blocks = rawText.split(/[-–—_=]{5,}/).filter(b => b.trim());
    
    for (let i = 0; i < blocks.length; i++) {
      const blockText = blocks[i].trim();
      if (!blockText) continue;
      
      const dctNameMatch = blockText.match(/^\s*(DCT[\s_-]*[^\n:]+):\s*/i);
      let dctName: string;
      let contentText: string;
      
      if (dctNameMatch) {
        dctName = dctNameMatch[1].trim();
        contentText = blockText.slice(dctNameMatch[0].length);
      } else {
        dctName = `DCT ${i + 1}`;
        contentText = blockText;
      }
      
      const copy = extractCopyFields(contentText);
      
      if (copy.primaryTexts.length > 0 || copy.headlines.length > 0) {
        results.push({ dctName, ...copy });
      }
    }
    
    console.log(`[DCT Parser] Iz ločilnih črt: ${results.length} veljavnih blokov`);
    return results;
  }

  const numberedPattern = /(?:^|\n)\s*(\d{1,3})\.\s+/g;
  const numberedHeaders: { name: string; start: number; contentStart: number }[] = [];
  while ((match = numberedPattern.exec(rawText)) !== null) {
    const num = match[1];
    numberedHeaders.push({
      name: `DCT ${num}`,
      start: match.index,
      contentStart: match.index + match[0].length,
    });
  }
  
  if (numberedHeaders.length > 0) {
    console.log(`[DCT Parser] Najdenih ${numberedHeaders.length} oštevilčenih sekcij`);
    numberedHeaders.sort((a, b) => a.start - b.start);
    
    for (let i = 0; i < numberedHeaders.length; i++) {
      const start = numberedHeaders[i].contentStart;
      const end = i + 1 < numberedHeaders.length ? numberedHeaders[i + 1].start : rawText.length;
      const blockText = rawText.slice(start, end);
      
      const copy = extractCopyFields(blockText);
      
      results.push({
        dctName: numberedHeaders[i].name,
        ...copy,
      });
    }

    return results;
  }

  console.log("[DCT Parser] Nobenih headerjev ni najdenih, obravnavam kot en blok");
  const copy = extractCopyFields(rawText);
  if (copy.primaryTexts.length > 0 || copy.headlines.length > 0) {
    results.push({ dctName: 'default', ...copy });
  }
  return results;
}

// Extract copy fields from text block
// Supports both "Label: value on same line" AND "Label:\n\nvalue on next line(s)"
function extractCopyFields(text: string): { primaryTexts: string[]; headlines: string[]; descriptions: string[] } {
  const primaryTexts: string[] = [];
  const headlines: string[] = [];
  const descriptions: string[] = [];

  const fieldLabels = [
    'Primary\\s*text',
    'Primary',
    'Headline',
    'Description',
    'Desc',
  ];
  const extractByLabel = (labelPattern: string): string[] => {
    const results: string[] = [];
    const regex = new RegExp(
      `${labelPattern}[\\s_]*(\\d*):\\s*(.+?)(?=\\n\\s*(?:(?:${fieldLabels.join('|')})[\\s_]*\\d*\\s*:)|$)`,
      'gis'
    );
    let match;
    while ((match = regex.exec(text)) !== null) {
      const value = match[2].trim();
      if (value) results.push(value);
    }
    return results;
  };

  primaryTexts.push(...extractByLabel('(?:Primary\\s*text|Primary)'));
  headlines.push(...extractByLabel('Headline'));
  descriptions.push(...extractByLabel('(?:Description|Desc)'));

  return { primaryTexts, headlines, descriptions };
}

// Normalize DCT name for matching
export function normalizeDCTName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, '').replace(/^dct/, '');
}
