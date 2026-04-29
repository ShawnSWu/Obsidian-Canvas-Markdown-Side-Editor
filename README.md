# ✨ Canvas MD Side Editor

If you’re a Canvas enthusiast like me, you won’t want to miss this plugin.  
It allows you to open a right-side Markdown editor directly from the **“Big picture”** 🪐 view of your Canvas, so you can ✍️ edit without zooming in.  
With ⚡ live preview and 💾 auto-save, you can format while writing, move smoothly between cards, and keep your thoughts flowing without interruption.

<img width="1000" height="995" alt="image" src="https://github.com/user-attachments/assets/529bf519-1e51-463e-bad9-13d65fe83440" />

Edit Canvas Markdown cards from a right-side editor with live preview and auto-save.  
Click a Canvas card and start typing – as fast and natural as editing a normal note.

![ezgif-49c7f29a5c95cc](https://github.com/user-attachments/assets/5836c7ad-45af-420c-bfcd-fb2ec503ada1)

---

## 🆕 What's new

### 🪟 Dock anywhere — Right / Left / Top / Bottom / Floating

Pin the side editor to any edge of your Canvas, or pop it into a fully **floating** panel
you can drag around and resize from the corner. The plugin remembers each dock's size
and the floating panel's position, so it always reopens exactly where you left it.

<!-- screenshot: dock-positions -->

### 🏷️ Headline mode — turn your Canvas into a board of titles

Flip on **Headline mode** and every Markdown card visually collapses to just its first
`# H1`. Your "big picture" 🪐 becomes an instantly scannable map of ideas, while the full
content stays one click away through the side editor. Title size is tunable
(5 – 60 % of card width) so headlines stay readable at any zoom level.

<!-- screenshot: headline-mode -->

---

## 🌈 Why this plugin?

Obsidian Canvas is fantastic for visual thinking — but editing Markdown cards directly inside Canvas can feel cramped and clunky.  
You often have to zoom in and out, double-click small cards, and switch focus repeatedly. This breaks the flow of writing.

**Canvas MD Side Editor** was created to fix exactly that.  
It brings the full power of Obsidian's editor to your Canvas view, letting you write comfortably in a side panel, with **live preview**, **auto-save**, and **no context switching**.  

The goal is simple:  
> ✍️ *Write Markdown with the comfort of a full editor, while keeping the “big picture” in sight.* 🪐

---

## 🌟 Features

- **🪟 Flexible docking & floating panel**  
  - Dock the side editor on the **Right**, **Left**, **Top**, or **Bottom** of the Canvas — or detach it as a **Floating** panel.  
  - 🖱️ Drag the floating panel anywhere; resize it from the corner. Position and size are persisted per dock.

- **🏷️ Headline mode** *(issue #13)*  
  - Vault-wide toggle that collapses every Canvas card to just its first `# H1`.  
  - Get a clean "table of contents" view of your Canvas; full content remains editable through the side editor.  
  - 🔠 Headline size is configurable as a percentage of card width (5 – 60 %).

- **⚡ Open-and-edit instantly**  
  - 🖱️ Click a Canvas Text card or a File card pointing to a `.md` file to open the side editor automatically.

- **💾 Auto-save**  
  - Changes are saved when switching cards or clicking the Canvas background.

- **🔒 Auto-close while editing inside Canvas**  
  - If you focus or type in a Canvas card's own editor, pending changes in the side editor are saved ✅ and the side panel closes automatically to avoid conflicting edits.

- **🖼️ Paste images into the side editor**  
  - Paste screenshots or images directly. Files are saved into your preferred 📂 attachment folder and linked according to your Obsidian settings.

- **👀 Live preview**  
  - Built-in MarkdownRenderer preview styled by your Obsidian theme.  
  - 🔄 Toggle preview on/off and ↔️ resize the panel by dragging.

- **📖 Read-only mode**  
  - Show only the Preview pane with the editor hidden.  
  - Useful when you want a clean reading panel.  
  - ⚙️ Enable in *Settings → Community Plugins → Canvas MD Side Editor → Read only*.

- **⌨️ Command palette**  
  - `Canvas Side Editor: Toggle Preview` — bind a hotkey to flip the preview pane on or off.
---

## 📦 Installation

## 🧭 Option 1 — Install via BRAT (Recommand before approval)

While this plugin is awaiting approval in the Obsidian Community Plugins, we recommend installing it via BRAT for automatic updates:

1. Enable third‑party plugins: Settings → `Community Plugins` → Turn on.
2. Install BRAT: Settings → `Community Plugins` → `Browse` → search “BRAT” → Install and enable.
3. Open BRAT settings: Settings → BRAT → Add Beta plugin.
4. Paste the repository URL: `https://github.com/ShawnSWu/Obsidian-Canvas-Markdown-Side-Editor`
5. Confirm. BRAT will automatically download and install the plugin, and fetch future updates.

👉 Now, Try clicking a Canvas card now and start typing — it’s that smooth 🚀

---


## ⚙️ Settings
<img width="1083" height="695" alt="image" src="https://github.com/user-attachments/assets/b70444cb-c9fe-48a2-bfca-ab19f03ba868" />

- **🪟 Dock position** *(issue #11)*  
  Where the side panel lives: **Right** (default), **Left**, **Top**, **Bottom**, or **Floating**. Floating mode lets you drag the panel anywhere and resize it from the corner; position and size are persisted.

- **📏 Default panel width**  
  Initial width when docked **left** or **right** (in pixels). Drag the panel edge to resize; the width is remembered.

- **📐 Default panel height**  
  Initial height when docked **top** or **bottom** (in pixels). Drag the panel edge to resize; the height is remembered.

- **⏱️ Preview debounce (ms)**  
  Delay before updating the preview on edits. Increase for very large notes.

- **🔒 Read only**  
  When enabled, the side panel shows only the Preview pane. The editor and the preview toggle are hidden.

- **🏷️ Headline mode** *(issue #13)*  
  Vault-wide toggle that collapses every Canvas card to its first `# H1`. Turn it off to restore normal cards.

- **🔠 Headline title size**  
  Size of the headline title in headline mode, as a percentage of the card's width (5 – 60). Bigger value → bigger text.

- **🔤 Editor font size (px)**  
  Explicit font size for the side editor. Leave unset to follow your theme when the panel first opens.

- **🔡 Preview font size (px)**  
  Explicit font size for the preview pane. Leave unset to follow your theme when the panel first opens.

---

## 🖥️ Compatibility

- Requires Obsidian `minAppVersion >= 1.1.0`.  
- 🖥️ Desktop focused (`isDesktopOnly: true`).

---