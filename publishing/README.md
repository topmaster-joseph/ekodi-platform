# EKODI BOOKS publishing system

## Goal
Keep the fixed cost near zero while preserving professional EPUB quality, retailer independence, version history, and repeatable publishing.

## Canonical package per title
Create one folder per title under `publishing/titles/<slug>/`.

- `manuscript.docx` — final editorial master exported from Google Docs
- `cover.jpg` — ebook cover master
- `metadata.json` — title, subtitle, author, description, keywords, identifiers, price, retailer URLs
- `book.epub` — distribution master
- `checks/` — EPUBCheck report and preview notes
- `release-notes.md` — version and correction history

Do not store contracts, tax records, bank information, passwords, or retailer credentials in this public repository.

## Recommended workflow
1. Write and collaborate in Google Docs.
2. Freeze a release candidate and export DOCX.
3. Convert DOCX to reflowable EPUB 3 with a maintained converter such as Pandoc or Reedsy Studio.
4. Run EPUBCheck and inspect the result in Kindle Previewer and Google Play Books preview.
5. Publish directly to Amazon KDP and Google Play Books so EKODI BOOKS retains retailer control and avoids aggregator fees on the two primary channels.
6. Use a domestic distributor only for stores that are expensive to manage one by one.
7. Add the live retailer URLs to `books/books.json` and `metadata.json`.
8. Tag the Git commit for the published edition, for example `book-001-v1.0.0`.

## Versioning
- `1.0.0` first public edition
- patch `1.0.1` typo or metadata correction
- minor `1.1.0` meaningful added content without a new edition identity
- major `2.0.0` substantially revised edition

## ISBN policy
Amazon KDP and Google Play Books do not require an ISBN for the ebook itself. For long-term publisher identity, domestic distribution, library cataloging, or multiple editions, assign an eISBN through the appropriate Korean ISBN process and keep it in `metadata.json`.

## Retailer policy
- Amazon KDP: direct account
- Google Play Books: direct account
- KDP Select: do not enable by default because ebook exclusivity conflicts with simultaneous Google and domestic distribution
- Domestic stores: one non-exclusive distributor where practical

## Site update
The public catalog is data-driven. Edit only `books/books.json` when a title, status, author, or store URL changes. CI validates duplicate IDs and missing required fields before deployment.
