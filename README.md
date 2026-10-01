# Tam Family Recipes

A responsive family recipe library built with plain HTML, CSS, and JavaScript.
Open `index.html` to use the complete local demo. No build command is required.

## Included functionality

- Search by recipe, ingredient, tag, category, and contributor
- Popular, recently added, alphabetical, category, contributor, and favorites views
- Add, edit, and delete recipes
- Cover images and optional step images with in-browser compression
- Grouped ingredients and numbered directions
- Automatic ingredient scaling when servings change
- Family stories, cook's notes, tips/comments, and bookmarks
- Print-friendly recipe pages
- Recipe-card photo import with client-side OCR when internet access is available
- Responsive mobile navigation and keyboard-accessible controls
- Local demo storage plus a Supabase-ready shared data layer

## Shared database setup

The ZIP defaults to local demo mode because no database credentials or account
system were provided. Recipes saved in demo mode remain in that browser.

1. Create a Supabase project.
2. Run `supabase-schema.sql` in the project's SQL editor.
3. Open `config.js` and add the project URL and public anon key.
4. Set `USE_SUPABASE` to `true`.
5. Serve the folder over HTTP instead of opening it with a `file://` URL.

The included row-level security rules allow public reading and restrict writing
to authenticated users. Since accounts were explicitly deferred, the app does
not provide a sign-in screen yet. Until authentication is added, keep
`USE_SUPABASE: false` to test all editor features locally.

## Photo import note

Recipe-card OCR loads Tesseract.js on demand from a CDN. If it cannot load, the
same interface still accepts manual transcription and keeps the uploaded photo
visible while the draft is prepared.

## Files

- `index.html` — application structure and accessible dialogs
- `styles.css` — responsive recipe-box visual system and print styles
- `app.js` — storage, search, filters, recipe editor, photos, comments, and OCR
- `config.js` — local/shared storage configuration
- `supabase-schema.sql` — database table and access policies
- `assets/wonton-soup.webp` — original optimized recipe cover image
