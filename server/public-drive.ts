// Public Google Drive access - no OAuth required
// Uses manifest.json for folder structure and public download URLs for files

export interface ManifestCreative {
  fileId: string;
  name: string;
  type: "video" | "image";
}

export interface ManifestDCT {
  name: string;
  creatives: ManifestCreative[];
  copyDocxFileId?: string;
}

export interface DriveManifest {
  dcts: ManifestDCT[];
  globalCopyDocxFileId?: string;
}

// Extract folder ID from Google Drive URL
export function extractFolderIdFromUrl(url: string): string | null {
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

// Generate public download URL for a file
export function getPublicDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

// Generate public view URL for manifest.json
export function getManifestUrl(folderId: string, manifestFileId: string): string {
  return getPublicDownloadUrl(manifestFileId);
}

// Download a public file from Google Drive
export async function downloadPublicFile(fileId: string): Promise<Buffer> {
  const url = getPublicDownloadUrl(fileId);
  console.log('[PublicDrive] Downloading file:', { fileId, url });
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
  });

  console.log('[PublicDrive] Response status:', response.status, 'Content-Type:', response.headers.get('content-type'));

  // Get the response as array buffer first
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Check if we got HTML instead of a file (Google Drive sometimes returns a confirmation page)
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html') || buffer.toString('utf-8', 0, 100).includes('<!DOCTYPE')) {
    const text = buffer.toString('utf-8');
    console.log('[PublicDrive] Got HTML response, checking for confirmation:', text.substring(0, 500));
    
    // Try to find download confirmation link
    // Pattern 1: confirm=t&uuid=...
    const confirmMatch = text.match(/confirm=([^&"']+)/);
    // Pattern 2: /uc?export=download&confirm=...&id=...
    const directLinkMatch = text.match(/href="(\/uc\?[^"]+confirm=[^"]+)"/);
    
    if (directLinkMatch) {
      const confirmUrl = `https://drive.google.com${directLinkMatch[1].replace(/&amp;/g, '&')}`;
      console.log('[PublicDrive] Trying direct confirm URL:', confirmUrl);
      const confirmResponse = await fetch(confirmUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
      });
      if (confirmResponse.ok) {
        const confirmArrayBuffer = await confirmResponse.arrayBuffer();
        return Buffer.from(confirmArrayBuffer);
      }
    } else if (confirmMatch) {
      const confirmUrl = `${url}&confirm=${confirmMatch[1]}`;
      console.log('[PublicDrive] Trying confirm URL:', confirmUrl);
      const confirmResponse = await fetch(confirmUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
      });
      if (confirmResponse.ok) {
        const confirmArrayBuffer = await confirmResponse.arrayBuffer();
        return Buffer.from(confirmArrayBuffer);
      }
    }
    
    throw new Error('Google Drive returned HTML instead of file - file may not be publicly accessible');
  }

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  console.log('[PublicDrive] Successfully downloaded file, size:', buffer.length);
  return buffer;
}

export async function checkPublicFileReadable(fileId: string): Promise<boolean> {
  try {
    const url = getPublicDownloadUrl(fileId);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': 'bytes=0-0',
      },
      redirect: 'follow',
    });
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const text = await response.text();
      if (text.includes('confirm=') || text.includes('/uc?')) {
        return true;
      }
      return false;
    }
    return response.ok || response.status === 206;
  } catch (err) {
    console.log('[PublicDrive] File not readable:', fileId, err);
    return false;
  }
}

// Try to fetch manifest.json from a public folder
// Since we can't list folder contents without OAuth, user must provide manifest file ID
// Or we try common patterns
export async function fetchManifestFromFolder(manifestFileId: string): Promise<DriveManifest> {
  try {
    const buffer = await downloadPublicFile(manifestFileId);
    const text = buffer.toString('utf-8');
    const manifest = JSON.parse(text) as DriveManifest;
    
    // Validate manifest structure
    if (!manifest.dcts || !Array.isArray(manifest.dcts)) {
      throw new Error('Invalid manifest: missing dcts array');
    }
    
    return manifest;
  } catch (error) {
    throw new Error(`Failed to fetch manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Parse DCT folder name to extract order and name
export function parseDCTName(name: string): { order: number; name: string } {
  // Match patterns like "DCT 1", "DCT1", "DCT_1", "DCT 1 - Prospecting"
  const match = name.match(/DCT[\s_-]*(\d+)[\s_-]*(.*)/i);
  if (match) {
    return {
      order: parseInt(match[1], 10),
      name: match[2]?.trim() || `DCT ${match[1]}`,
    };
  }
  return { order: 0, name };
}

// Get file extension and determine if it's video or image
export function getFileType(filename: string): "video" | "image" | "document" | "unknown" {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return "unknown";
  
  const videoExts = ['mp4', 'mov', 'avi', 'webm', 'm4v'];
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const docExts = ['docx', 'doc'];
  
  if (videoExts.includes(ext)) return "video";
  if (imageExts.includes(ext)) return "image";
  if (docExts.includes(ext)) return "document";
  return "unknown";
}

// Validate manifest DCTs
export function validateManifest(manifest: DriveManifest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!manifest.dcts || manifest.dcts.length === 0) {
    errors.push("No DCT folders found in manifest");
    return { valid: false, errors };
  }
  
  manifest.dcts.forEach((dct, index) => {
    if (!dct.name) {
      errors.push(`DCT ${index + 1}: Missing name`);
    }
    if (!dct.creatives || dct.creatives.length === 0) {
      errors.push(`DCT "${dct.name}": No creative files`);
    }
    dct.creatives?.forEach((creative, cIndex) => {
      if (!creative.fileId) {
        errors.push(`DCT "${dct.name}" creative ${cIndex + 1}: Missing fileId`);
      }
      if (!creative.name) {
        errors.push(`DCT "${dct.name}" creative ${cIndex + 1}: Missing name`);
      }
    });
  });
  
  return { valid: errors.length === 0, errors };
}
