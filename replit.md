# Rapid Ads Dashboard

## Overview

Rapid Ads is a web dashboard designed for the bulk upload of video advertisements from Google Drive to Meta (Facebook) Ads. It streamlines the creation of Meta Ads campaigns by allowing users to upload multiple video assets along with a DOCX file containing ad copy. The system automatically parses the ad copy, validates asset-to-copy mapping, offers a dry-run preview, and then creates campaigns in bulk. Key capabilities include private and public Google Drive integration, Meta Ads OAuth, DOCX parsing with AI fallback, per-ad-account settings, and advanced geo-splitting for ad sets based on creative filenames.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS with custom design tokens
- **Build Tool**: Vite
- **Design System**: Modern SaaS aesthetic, inspired by Linear/Stripe, emphasizing clarity, progressive disclosure, and status transparency. Brand colors align with Meta blue, using Inter font family.

### Backend
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js with `tsx`
- **API Pattern**: RESTful JSON API (`/api/*`)
- **File Upload**: Multer (up to 500MB, 12 files)
- **Build**: Custom esbuild script
- **Validation**: Comprehensive pre-flight validation of all launch data before Meta API calls. Includes text length limits (recommended + hard max per Meta specs), dynamic creative variant count checks (max 5), media type validation (MIME + extension fallback), duplicate ad set name detection, UTM parameter validation, lifetime budget + end date requirement, and DSA/OCHA compliance warnings for EU/SG geo targeting.

### Data Storage
- **Database**: PostgreSQL on Supabase (eu-west-1)
- **ORM**: Drizzle ORM
- **Schema**: `shared/schema.ts`
- **Migrations**: Drizzle Kit
- **Key Tables**: `users`, `connections`, `bulk_upload_jobs`, `uploaded_assets`, `extracted_ads`, `meta_objects`, `docx_uploads`, `meta_ad_account_settings`, `billing_payments`, `meta_account_cache`.

### Authentication & Connections
- **Primary Login**: Facebook/Meta OAuth (authentication and Meta Ads access)
- **Session Management**: Express sessions with PostgreSQL storage
- **Google Drive**: Service account for private folders (users share folders with service account email); public folders via `manifest.json`.
- **Security**: Global authentication middleware on all API routes.
- **Ad Account Selection**: Post-OAuth, users select an ad account from available options. Switching accounts uses optimistic updates and per-account data caching (`meta_account_cache` table stores pixels, audiences, pages + embedded Instagram accounts per account; cached data served instantly on switch, then live-refreshed in background).
- **Sidebar Fast Load**: The sidebar uses a single `/api/sidebar-data` endpoint that returns all profile data (ad accounts, pages, Instagram) from the DB in one query — no live Meta API calls on load. Profile data (names, IDs) is stored permanently in `meta_account_cache` after first OAuth and served instantly on every subsequent load. Live Meta API calls only happen the very first time (no cache). `META_CACHE_TTL` for in-memory cache is 30 minutes.

### AI Integration
- **Provider**: OpenAI GPT-5-mini for DOCX parsing fallback.
- **Processing**: Custom batch utilities with rate limiting.

### Key Features and Logic
- **Ad Set Structure**: Each Google Drive subfolder forms an ad set, containing media and one DOCX file.
- **DOCX Requirements**: Must include Primary text, Headline, Description, CTA, URL, UTM fields; multiple entries separated by "---" enable A/B testing.
- **Per-Ad-Account Settings**: Customizable settings (pixel ID, audience, geo-targeting, etc.) stored per ad account.
- **Ad Creation Logic**: Supports "Dynamic" (1 ad per asset with all text variations) and "Single" (1 ad per ASSET × PRIMARY TEXT combination) upload modes, leveraging Meta's `DEGREES_OF_FREEDOM` creative structure.
- **Instagram Integration**: Auto-detects and uses connected Instagram accounts or Facebook Page-backed Instagram for ads.
- **Creative Enhancements**: Supports `creative_features_spec` for image enhancements (e.g., image uncrop, touch-ups) nested within `degrees_of_freedom_spec`. Video enhancements are managed at the campaign level by Meta.
- **DSA/OCHA Compliance**: Configurable Beneficiary and Payer names for ads targeting EU/Singapore, sent at the Ad Set level.
- **Public Drive Import**: Utilizes `manifest.json` for structure without requiring OAuth.
- **Video Transcoding**: Automatic transcoding to ensure Meta compatibility (H.264 video, AAC audio, yuv420p, CFR, faststart) using FFmpeg.
- **Statistics Page**: Ads Manager-style table layout with Campaign → Ad Set → Ad drill-down navigation. Sortable columns (Spend, Impressions, Clicks, CTR, CPC, CPM, ROAS, Purchases) with totals row. Ad detail popup shows ranked text breakdowns (Primary Text, Headline, Description) with "Winner" badges. Campaign list uses a simple list view; Ad Set and Ad views use full metric tables.

## External Dependencies

### Third-Party Services
- **Google Drive**: For file storage and retrieval.
- **Meta Ads API**: For campaign, ad set, and ad creation.
- **OpenAI**: For AI-powered DOCX parsing.

### Database
- **PostgreSQL**: Primary data store.

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit`: ORM and migrations.
- `mammoth`: DOCX text extraction.
- `openai`: OpenAI API client.
- `multer`: File upload handling.
- `googleapis`: Google Drive API client.
- `zod`: Schema validation.
- `connect-pg-simple`: Session storage.