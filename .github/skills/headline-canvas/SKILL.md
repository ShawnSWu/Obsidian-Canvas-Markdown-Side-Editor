---
name: headline-canvas
description: "Create or edit Obsidian Canvas files and mind maps with headline-mode cards. Use when asked to create a Canvas, add or rewrite Canvas cards, or turn notes or other content into an Obsidian Canvas. Do not use for unrelated HTML Canvas tasks."
---

# Headline Canvas

Create Obsidian Canvas text cards that work well with Canvas Markdown Side
Editor's headline mode. Write new card content in English, even when the
request is in another language.

## Headline mode rendering

- The first top-level H1 becomes the headline.
- The first non-nested `[!note]` after that H1 and before the next H1 supplies
  the metadata and subtitle. Notes before the H1 or inside another callout
  are not selected.
- In the Note title, text before the first `|` becomes the optional badge;
  text after it becomes the category.
- Without `|`, the whole Note title is the category and there is no badge.
- The Note body becomes the subtitle.
- Other content remains in the Markdown but is hidden in headline mode.

## Writing cards

- Give each card one main idea and a short, descriptive H1.
- Place the intended Note immediately after the H1.
- Keep badges compact and categories consistent across related cards.
- Use a concise, plain-text summary in the Note body.
- Put lists, detailed instructions, examples, and references below the Note.
- Do not invent identifiers, facts, or missing details. Use a category-only
  Note title when no identifier is supplied.
- Treat brevity as a guideline, not a character limit. Card dimensions, font
  settings, and language affect how much text fits.
- Preserve existing content and meaning when editing. Do not remove content
  unless requested.

## Canvas workflow

1. Identify the main ideas and plan a layout and connections that fit the
   user's content. Use an available Canvas creation skill for the Canvas
   structure and layout when appropriate.
2. Apply the headline card format to new text cards and text cards the user
   explicitly asks to rewrite. Do not rewrite linked files or unrelated
   existing nodes unless requested.
3. Keep supporting details below the selected Note, knowing they will be
   hidden in headline mode.
4. Validate that each intended headline card has an H1 and a qualifying Note,
   metadata is separated correctly, and new card text is in English.
5. Validate Canvas JSON and confirm that edge endpoints reference existing
   nodes. If an Obsidian preview is available, check for clipping and adjust
   the wording or card size as needed.

## Example

```markdown
# Check service connectivity

> [!note] P01 | System checks
> Confirm that the database, API, and supporting services are healthy.

## Details

- Check the database connection.
- Review API health checks.
- Investigate service errors.
```
