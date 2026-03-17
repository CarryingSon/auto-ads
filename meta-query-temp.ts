import { db } from "./server/db";
import { oauthConnections } from "./shared/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "./server/auth-routes";

async function main() {
  const conn = await db.select().from(oauthConnections).where(eq(oauthConnections.metaUserId, "2612889362422053")).limit(1);
  if (!conn.length) return;
  
  const accessToken = decrypt(conn[0].accessToken!);
  const adAccountId = "act_5163022290589690";
  
  console.log("=== TEST: DEGREES_OF_FREEDOM z 1 primary textom (nova logika) ===\n");
  
  // Get video thumbnail
  const thumbUrl = `https://graph.facebook.com/v24.0/909731764828155?fields=thumbnails&access_token=${accessToken}`;
  const thumbRes = await fetch(thumbUrl);
  const thumbData = await thumbRes.json();
  const thumbnailUrl = thumbData.thumbnails?.data?.[0]?.uri || "";
  
  const objectStorySpec = {
    page_id: "863088593551239",
    instagram_user_id: "17841478145449596",
    video_data: {
      video_id: "909731764828155",
      call_to_action: {
        type: "LEARN_MORE",
        value: { link: "https://ozivistareslike.com/" }
      },
      title: "Naslov 1", // Samo en primary text
      message: "Samo en primarni tekst za ta oglas", // Samo en primary text
      image_url: thumbnailUrl
    }
  };
  
  const assetFeedSpec = {
    optimization_type: "DEGREES_OF_FREEDOM",
    bodies: [{ text: "Samo en primarni tekst za ta oglas" }], // 1 primary text
    titles: [
      { text: "Naslov 1" },
      { text: "Naslov 2" },
      { text: "Naslov 3" }
    ], // 3 headlines za A/B testing
    descriptions: [{ text: "Opis 1" }]
  };
  
  console.log("object_story_spec:", JSON.stringify(objectStorySpec, null, 2));
  console.log("\nasset_feed_spec:", JSON.stringify(assetFeedSpec, null, 2));
  
  const params = new URLSearchParams();
  params.append('name', 'Flexible - Video1 - PT1');
  params.append('object_story_spec', JSON.stringify(objectStorySpec));
  params.append('asset_feed_spec', JSON.stringify(assetFeedSpec));
  params.append('access_token', accessToken);
  
  const response = await fetch(`https://graph.facebook.com/v24.0/${adAccountId}/adcreatives`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  
  const data = await response.json();
  console.log("\nResponse:", JSON.stringify(data, null, 2));
  
  if (data.id) {
    console.log("\n✅ SUCCESS! Creative ID:", data.id);
    console.log("\nNova logika deluje: 1 video + 1 primary text + več headlines za A/B testing");
  } else if (data.error) {
    console.log("\n❌ ERROR:", data.error.message);
  }
}

main().catch(console.error);
