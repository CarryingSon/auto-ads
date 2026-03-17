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

async function testFormats() {
  const connections = await db.select().from(oauthConnections).where(eq(oauthConnections.provider, 'meta'));
  const conn = connections.sort((a, b) => (b.connectedAt?.getTime() || 0) - (a.connectedAt?.getTime() || 0))[0];
  if (!conn?.accessToken) {
    console.log('No Meta connection found');
    return;
  }
  
  const accessToken = decrypt(conn.accessToken);
  const adAccountId = 'act_5163022290589690';

  const creativeFeatures = {
    enhance_cta: { enroll_status: "OPT_IN" },
    image_touchups: { enroll_status: "OPT_IN" },
    text_optimizations: { enroll_status: "OPT_IN" },
    adapt_to_placement: { enroll_status: "OPT_OUT" },
    advantage_plus_creative: { enroll_status: "OPT_OUT" },
    image_animation: { enroll_status: "OPT_OUT" },
    image_background_gen: { enroll_status: "OPT_OUT" },
    image_brightness_and_contrast: { enroll_status: "OPT_OUT" },
    image_templates: { enroll_status: "OPT_OUT" },
    image_uncrop: { enroll_status: "OPT_OUT" },
    inline_comment: { enroll_status: "OPT_OUT" },
    product_extensions: { enroll_status: "OPT_OUT" },
    site_extensions: { enroll_status: "OPT_OUT" },
    text_translation: { enroll_status: "OPT_OUT" }
  };

  const objectStorySpec = {
    page_id: "863088593551239",
    instagram_user_id: "17841478145449596",
    link_data: {
      link: "https://tonetherapyco.com/",
      image_hash: "c13ad52d5252d0d9eaad9f6d0afa4a45",
      call_to_action: { type: "SHOP_NOW" }
    }
  };

  const assetFeedSpec = {
    bodies: [
      { text: "Hitro do resitve, brez kompliciranja." },
      { text: "Ce zelis rezultat hitro, zacni tukaj." },
      { text: "Zmanjsaj rocno delo, skrajsaj procese." }
    ],
    titles: [
      { text: "Rezerviraj kratek klic" },
      { text: "Poglej, kako deluje" },
      { text: "Poenostavi si delo" }
    ],
    descriptions: [
      { text: "Hiter zacetek. Brez komplikacij." },
      { text: "Brez obveznosti. Samo info." }
    ],
    optimization_type: "DEGREES_OF_FREEDOM"
  };

  // ============================================================
  // TEST 1: creative_features_spec nested inside degrees_of_freedom_spec
  // + asset_feed_spec separate (NO top-level creative_features_spec)
  // ============================================================
  console.log('=== TEST 1: degrees_of_freedom_spec with creative_features_spec inside + separate asset_feed_spec ===\n');
  
  const body1 = new URLSearchParams();
  body1.append('name', 'TEST1 - nested creative_features_spec');
  body1.append('object_story_spec', JSON.stringify(objectStorySpec));
  body1.append('asset_feed_spec', JSON.stringify(assetFeedSpec));
  body1.append('degrees_of_freedom_spec', JSON.stringify({
    creative_features_spec: creativeFeatures
  }));
  body1.append('access_token', accessToken);

  const res1 = await fetch(
    `https://graph.facebook.com/v21.0/${adAccountId}/adcreatives`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body1.toString() }
  );
  const data1 = await res1.json();
  console.log('Status:', res1.status);
  console.log('Response:', JSON.stringify(data1, null, 2));
  
  if (data1.id) {
    console.log('\nSUCCESS! Reading back...');
    const v1 = await fetch(`https://graph.facebook.com/v21.0/${data1.id}?fields=degrees_of_freedom_spec&access_token=${accessToken}`);
    const vd1 = await v1.json();
    if (vd1.degrees_of_freedom_spec?.creative_features_spec) {
      console.log('\n--- ENHANCEMENTS META STORED (TEST 1) ---');
      for (const [key, value] of Object.entries(vd1.degrees_of_freedom_spec.creative_features_spec)) {
        const status = (value as any)?.enroll_status;
        const marker = status === 'OPT_IN' ? 'ON ' : 'OFF';
        console.log(`  [${marker}] ${key}: ${status}`);
      }
    }
    // Cleanup
    await fetch(`https://graph.facebook.com/v21.0/${data1.id}?access_token=${accessToken}`, { method: 'DELETE' });
    console.log('Test creative deleted.');
  }

  console.log('\n\n');

  // ============================================================
  // TEST 2: Current approach - top-level creative_features_spec + asset_feed_spec
  // (this is what our code currently does)
  // ============================================================
  console.log('=== TEST 2: top-level creative_features_spec + asset_feed_spec (current approach) ===\n');
  
  const body2 = new URLSearchParams();
  body2.append('name', 'TEST2 - top-level creative_features_spec');
  body2.append('object_story_spec', JSON.stringify(objectStorySpec));
  body2.append('asset_feed_spec', JSON.stringify(assetFeedSpec));
  body2.append('creative_features_spec', JSON.stringify(creativeFeatures));
  body2.append('access_token', accessToken);

  const res2 = await fetch(
    `https://graph.facebook.com/v21.0/${adAccountId}/adcreatives`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body2.toString() }
  );
  const data2 = await res2.json();
  console.log('Status:', res2.status);
  console.log('Response:', JSON.stringify(data2, null, 2));
  
  if (data2.id) {
    console.log('\nSUCCESS! Reading back...');
    const v2 = await fetch(`https://graph.facebook.com/v21.0/${data2.id}?fields=degrees_of_freedom_spec&access_token=${accessToken}`);
    const vd2 = await v2.json();
    if (vd2.degrees_of_freedom_spec?.creative_features_spec) {
      console.log('\n--- ENHANCEMENTS META STORED (TEST 2) ---');
      for (const [key, value] of Object.entries(vd2.degrees_of_freedom_spec.creative_features_spec)) {
        const status = (value as any)?.enroll_status;
        const marker = status === 'OPT_IN' ? 'ON ' : 'OFF';
        console.log(`  [${marker}] ${key}: ${status}`);
      }
    }
    // Cleanup
    await fetch(`https://graph.facebook.com/v21.0/${data2.id}?access_token=${accessToken}`, { method: 'DELETE' });
    console.log('Test creative deleted.');
  }
  
  process.exit(0);
}

testFormats().catch(console.error);
