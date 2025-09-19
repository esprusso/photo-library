# AI Image Library - Future Feature Ideas

## 🔍 **Search & Discovery**
- **Advanced Search**: Search by prompt keywords, model names, or generation parameters
- **Similar Images**: Find images with similar prompts or visual characteristics
- **Smart Collections**: Auto-generate collections based on prompts/styles
- **Duplicate Detection**: Find and manage duplicate or similar images

## 🏷️ **Organization & Management**
- **Auto-Tagging**: AI-powered automatic tagging based on image content
- **Custom Collections**: User-created albums/folders beyond categories
- **Image Comparison**: Side-by-side view to compare different generations

## 📊 **Analytics & Insights**
- **Generation Stats**: Most used models, prompts, settings dashboard
- **Usage Analytics**: View/download statistics, favorite trends
- **Prompt Analytics**: Most successful prompts, parameter correlations
- **Storage Insights**: Disk usage, file type breakdown

## 🎨 **Creative Tools**
- **Prompt Builder**: GUI tool to construct complex prompts
- **Style Transfer**: Extract and apply styles from existing images
- **Variation Generator**: Generate variations of existing images
- **Prompt History**: Track and reuse successful prompts

## 🔄 **Import/Export & Integration**
- **Batch Import**: Drag-and-drop folder import with metadata preservation
- **Export Collections**: Export filtered sets as ZIP with metadata
- **External Integration**: Connect to ComfyUI, Automatic1111, or other tools
- **Backup/Sync**: Cloud storage integration or backup scheduling

## 🎯 **User Experience**
- **Slideshow Mode**: Full-screen slideshow with customizable timing
- **Image Editor**: Basic editing (crop, rotate, brightness/contrast)
- **Print Layouts**: Generate print-friendly layouts/contact sheets
- **Mobile App**: Companion mobile app for browsing on the go

## 🔧 **Technical Enhancements**
- **Performance**: Lazy loading, image optimization, caching improvements
- **Multi-User**: User accounts and permission management
- **API Access**: REST API for external integrations
- **Themes**: Customizable UI themes and layouts

## 🧹 Duplicate Handling Roadmap

Phase 1 — foundation (DONE)
- pHash computation job (type `phash`) with progress in Jobs + Duplicates banner
- Duplicate clustering via Hamming distance with prefix bucketing
- Ignore list: `duplicate_ignores` table + endpoints; clusters exclude ignored pairs
- Merge metadata: POST `/api/images/merge-duplicates` merges tags/categories/favorite/rating/date into keeper
- Duplicates UI: select images in a cluster; auto-keeper = highest resolution; actions for Ignore Selected and Merge into Keeper

Phase 2 — safe deletion (NEXT)
- Soft delete support on `images` table
  - Columns: `deleted_at` (timestamp), `deleted_reason` (text), `trash_path` (string)
  - Queries exclude soft-deleted images by default
- Move-to-Trash Job
  - Endpoint: POST `/api/images/trash` with `{ image_ids[] }` → creates job type `trash`
  - Moves original files into `/data/trash/YYYY-MM-DD/` (configurable), deletes thumbnails, marks DB rows as soft-deleted
  - Restore endpoint: POST `/api/images/trash/restore` with `{ image_ids[] }`
  - Purge endpoint/job: DELETE `/api/images/trash/purge?older_than=30d` (configurable retention)
- Duplicates UI: checkbox to “Move duplicates to Trash after merge”, default ON

Phase 3 — review + ergonomics
- Ignore entire cluster button + Ignore Manager (list, unignore)
- Quick keep strategies: keep highest rating/newest/original filename
- Space-reclaim estimate before applying Merge/Delete
- Visual preview diff (optional), confidence scoring

Backend API surface (to add in Phase 2/3)
- POST `/api/images/trash` (job), POST `/api/images/trash/restore`, DELETE `/api/images/trash/purge`
- POST `/api/images/duplicates/ignore` (DONE), DELETE `/api/images/duplicates/ignore` (DONE)
- GET `/api/images/duplicates` (filters ignored) (DONE)
- POST `/api/images/merge-duplicates` (metadata merge) (DONE)

Config
- `TRASH_DIR` (default: `/data/trash`), `TRASH_RETENTION_DAYS` (default: 30)

UI tasks (Phase 2)
- Add global “Apply to Trash” toggle for Duplicates page (remember preference)
- Show soft-deleted banner on ImageModal with restore action
- Jobs page: show Trash job progress with items and reclaimable size

Safety & telemetry
- Dry‑run for merge/trash to preview changes
- Write job logs (what merged/deleted/ignored) to `/data/logs/duplicates-YYYYMMDD.jsonl`

## 📱 **Quick Wins** (prioritized for implementation):
1. ✅ **Bulk selection** - checkboxes to select multiple images (IN PROGRESS)
2. **Copy prompt button** - one-click copy to clipboard
3. **Slideshow mode** - full-screen image viewing with auto-advance
4. **Sort options** - sort by date, rating, file size, model, etc.
5. **Grid size toggle** - adjust thumbnail size (small/medium/large)

## Implementation Notes:
- Start with Quick Wins for immediate value
- Focus on user workflow: browsing/organizing vs creative generation
- Consider mobile-first responsive design for new features
- Maintain keyboard navigation compatibility
