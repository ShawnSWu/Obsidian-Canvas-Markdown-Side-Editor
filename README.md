# ✨ Canvas MD Side Editor

If you’re a Canvas enthusiast like me, you won’t want to miss this plugin.  
It allows you to open a right-side Markdown editor directly from the **“Big picture”** 🪐 view of your Canvas, so you can ✍️ edit without zooming in.  
With ⚡ live preview and 💾 auto-save, you can format while writing, move smoothly between cards, and keep your thoughts flowing without interruption.

<img width="1000" height="995" alt="image" src="https://github.com/user-attachments/assets/529bf519-1e51-463e-bad9-13d65fe83440" />

Edit Canvas Markdown cards from a right-side editor with live preview and auto-save.  
Click a Canvas card and start typing – as fast and natural as editing a normal note.

![ezgif-49c7f29a5c95cc](https://github.com/user-attachments/assets/5836c7ad-45af-420c-bfcd-fb2ec503ada1)

---

## 🌈 Why this plugin？

Obsidian Canvas is fantastic for visual thinking — but editing Markdown cards directly inside Canvas can feel cramped and clunky.  
You often have to zoom in and out, double-click small cards, and switch focus repeatedly. This breaks the flow of writing.

**Canvas MD Side Editor** was created to fix exactly that.  
It brings the full power of Obsidian's editor to your Canvas view, letting you write comfortably in a side panel, with **live preview**, **auto-save**, and **no context switching**.  

The goal is simple:  
> ✍️ *Write Markdown with the comfort of a full editor, while keeping the “big picture” in sight.* 🪐

---

## 🌟 Features

- **⚡ Open-and-edit instantly**  
  - 🖱️ Click a Canvas Text card or a File card pointing to a `.md` file to open the side editor automatically.

- **💾 Auto-save**  
  - Changes are saved when switching cards or clicking the Canvas background.

- **🔒 Auto-close while editing inside Canvas**  
  - If you focus or type in a Canvas card’s own editor, pending changes in the side editor are saved ✅ and the side panel closes automatically to avoid conflicting edits.

- **🖼️ Paste images into the side editor**  
  - Paste screenshots or images directly. Files are saved into your preferred 📂 attachment folder and linked according to your Obsidian settings.

- **👀 Live preview**  
  - Built-in MarkdownRenderer preview styled by your Obsidian theme.  
  - 🔄 Toggle preview on/off and ↔️ resize the panel by dragging.

- **📖 Read-only mode**  
  - Show only the Preview pane with the editor hidden.  
  - Useful when you want a clean reading panel.  
  - ⚙️ Enable in *Settings → Community Plugins → Canvas MD Side Editor → Read only*.
---

## 📦 Installation

### 🧭 Option 1 — Install from Obsidian Community Plugins (Recommended)

1. Open **Obsidian**.
2. Go to **Settings → Community Plugins**.
3. Turn off **Safe Mode** if it’s enabled.
4. Click **Browse** and search for `Canvas MD Side Editor`.
5. Click **Install**, then **Enable** the plugin.

---

### 🛠️ Option 2 — Manual Installation from GitHub Releases

If the plugin has not been published to the community store yet, you can install it manually:

1. Go to the [GitHub Releases page](https://github.com/ShawnSWu/Obsidian-Canvas-Markdown-Side-Editor/releases).  
2. Download the latest release zip file, e.g.  
3. Unzip the file. You should see something like:
   * main.js
   * manifest.json
   * styles.css
4. Locate your Obsidian **vault folder** on your computer.
5. Inside your vault, navigate to the plugins folder:
   * `.obsidian/plugins/`
   * 
> 📌 If the `plugins` folder doesn’t exist yet, create it manually.
6. Create a new folder for this plugin (e.g. `canvas-md-side-editor`) and put the three files into it:
```text
.obsidian/plugins/canvas-md-side-editor/
├── main.js
├── manifest.json
└── styles.css
```
7. Go back to Obsidian:
- Open **Settings → Community Plugins**
- Click **Reload plugins** (if needed)
- Find **Canvas MD Side Editor** in the list and toggle it ON ✅

👉 Now, Try clicking a Canvas card now and start typing — it’s that smooth 🚀
---

## ⚙️ Settings
<img width="1083" height="695" alt="image" src="https://github.com/user-attachments/assets/b70444cb-c9fe-48a2-bfca-ab19f03ba868" />

- **📏 Default panel width**  
  Initial width of the side panel (in pixels). Drag the panel edge to resize; the width is remembered.

- **⏱️ Preview debounce (ms)**  
  Delay before updating the preview on edits. Increase for very large notes.

- **🔒 Read only**  
  When enabled, the side panel shows only the Preview pane. The editor and the preview toggle are hidden.

- **🔤 Editor font size (px)**  
  Explicit font size for the side editor. Leave unset to follow your theme when the panel first opens.

- **🔡 Preview font size (px)**  
  Explicit font size for the preview pane. Leave unset to follow your theme when the panel first opens.

---

## 🖥️ Compatibility

- Requires Obsidian `minAppVersion >= 1.1.0`.  
- 🖥️ Desktop focused (`isDesktopOnly: true`).

---