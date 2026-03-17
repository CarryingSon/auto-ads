import crypto from "crypto";
import { db } from "./server/db";
import { oauthConnections } from "./shared/schema";
import { eq } from "drizzle-orm";

const TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY || process.env.SESSION_SECRET;

function decrypt(encryptedText: string): string {
  if (!TOKEN_ENC_KEY) throw new Error("Encryption key not configured");
  try {
    const parts = encryptedText.split(':');
    if (parts.length === 3) {
      const [ivHex, encrypted, authTagHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const key = crypto.scryptSync(TOKEN_ENC_KEY, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    return encryptedText;
  } catch {
    return encryptedText;
  }
}

async function findAdSet6() {
  const [conn] = await db.select().from(oauthConnections).where(eq(oauthConnections.provider, 'meta')).limit(1);
  if (!conn?.accessToken) return;
  
  const accessToken = decrypt(conn.accessToken);
  
  // First list all ad accounts
  const accountsRes = await fetch(`https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name&access_token=${accessToken}`);
  const accountsData = await accountsRes.json();
  
  console.log('=== Ad Accounts ===');
  for (const acc of accountsData.data || []) {
    console.log(`${acc.name}: ${acc.id}`);
  }
  
  // Find Puzzle Pal account
  const puzzlePal = (accountsData.data || []).find((a: any) => a.name?.toLowerCase().includes('puzzle'));
  if (!puzzlePal) {
    console.log('\nPuzzle Pal account not found');
    return;
  }
  
  console.log(`\n=== Iščem "Ad Set 6" v ${puzzlePal.name} (${puzzlePal.id}) ===\n`);
  
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${puzzlePal.id}/adsets?fields=id,name,status&limit=50&access_token=${accessToken}`
  );
  const data = await res.json();
  
  if (data.error) {
    console.log('Error:', JSON.stringify(data.error, null, 2));
    return;
  }
  
  console.log('Ad Sets:');
  for (const adset of data.data || []) {
    if (adset.name?.toLowerCase().includes('ad set 6') || adset.name?.toLowerCase().includes('adset 6')) {
      console.log(`\n*** NAJDEN: ${adset.name} (ID: ${adset.id}) ***`);
      
      // Get ads in this ad set
      const adsRes = await fetch(
        `https://graph.facebook.com/v21.0/${adset.id}/ads?fields=id,name,creative&access_token=${accessToken}`
      );
      const adsData = await adsRes.json();
      
      if (adsData.data && adsData.data.length > 0) {
        for (const ad of adsData.data) {
          console.log(`\nAd: ${ad.name} (ID: ${ad.id})`);
          
          // Get creative details
          if (ad.creative?.id) {
            const creativeRes = await fetch(
              `https://graph.facebook.com/v21.0/${ad.creative.id}?fields=id,name,object_story_spec,asset_feed_spec&access_token=${accessToken}`
            );
            const creativeData = await creativeRes.json();
            
            console.log('\n=== OBJECT_STORY_SPEC ===');
            console.log(JSON.stringify(creativeData.object_story_spec, null, 2));
            
            console.log('\n=== ASSET_FEED_SPEC ===');
            console.log(JSON.stringify(creativeData.asset_feed_spec, null, 2));
          }
        }
      } else {
        console.log('No ads found in this ad set');
      }
    } else {
      console.log(`  - ${adset.name} (${adset.id})`);
    }
  }
}

findAdSet6().catch(console.error);
