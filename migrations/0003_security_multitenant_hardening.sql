-- Multi-tenant hardening indexes
DELETE FROM global_settings gs
USING global_settings newer
WHERE gs.user_id IS NOT NULL
  AND gs.user_id = newer.user_id
  AND gs.id <> newer.id
  AND gs.updated_at < newer.updated_at;

DELETE FROM connections c
USING connections newer
WHERE c.user_id IS NOT NULL
  AND c.user_id = newer.user_id
  AND c.provider = newer.provider
  AND c.id <> newer.id
  AND COALESCE(c.last_tested_at, c.connected_at, TO_TIMESTAMP(0))
      < COALESCE(newer.last_tested_at, newer.connected_at, TO_TIMESTAMP(0));

CREATE UNIQUE INDEX IF NOT EXISTS global_settings_user_id_unique
ON global_settings (user_id)
WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS connections_user_provider_unique
ON connections (user_id, provider)
WHERE user_id IS NOT NULL;

-- Backfill legacy NULL-user global settings to known OAuth users.
WITH legacy AS (
  SELECT
    facebook_page_id,
    facebook_page_name,
    instagram_page_id,
    instagram_page_name,
    use_instagram_from_facebook,
    beneficiary_name,
    payer_name,
    use_dynamic_creative,
    primary_text_variations,
    headline_variations,
    description_variations,
    default_cta,
    default_website_url,
    default_utm_template,
    plan_type,
    uploads_remaining
  FROM global_settings
  WHERE user_id IS NULL
  ORDER BY updated_at DESC
  LIMIT 1
),
users_to_seed AS (
  SELECT DISTINCT user_id
  FROM oauth_connections
  WHERE user_id IS NOT NULL
)
INSERT INTO global_settings (
  user_id,
  facebook_page_id,
  facebook_page_name,
  instagram_page_id,
  instagram_page_name,
  use_instagram_from_facebook,
  beneficiary_name,
  payer_name,
  use_dynamic_creative,
  primary_text_variations,
  headline_variations,
  description_variations,
  default_cta,
  default_website_url,
  default_utm_template,
  plan_type,
  uploads_remaining,
  updated_at
)
SELECT
  u.user_id,
  l.facebook_page_id,
  l.facebook_page_name,
  l.instagram_page_id,
  l.instagram_page_name,
  l.use_instagram_from_facebook,
  l.beneficiary_name,
  l.payer_name,
  l.use_dynamic_creative,
  l.primary_text_variations,
  l.headline_variations,
  l.description_variations,
  l.default_cta,
  l.default_website_url,
  l.default_utm_template,
  l.plan_type,
  l.uploads_remaining,
  CURRENT_TIMESTAMP
FROM legacy l
CROSS JOIN users_to_seed u
ON CONFLICT DO NOTHING;
