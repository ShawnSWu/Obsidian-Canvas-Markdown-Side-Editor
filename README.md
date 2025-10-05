# ✨ Canvas MD Side Editor

If you’re a Canvas enthusiast like me, you won’t want to miss this plugin.  
It allows you to open a right-side Markdown editor directly from the **“Big picture”** 🪐 view of your Canvas, so you can ✍️ edit without zooming in.  
With ⚡ live preview and 💾 auto-save, you can format while writing, move smoothly between cards, and keep your thoughts flowing without interruption.

<img width="1000" height="995" alt="image" src="https://github.com/user-attachments/assets/529bf519-1e51-463e-bad9-13d65fe83440" />

Edit Canvas Markdown cards from a right-side editor with live preview and auto-save.  
Click a Canvas card and start typing – as fast and natural as editing a normal note.

![ezgif-49c7f29a5c95cc](https://github.com/user-attachments/assets/5836c7ad-45af-420c-bfcd-fb2ec503ada1)

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

- **🛡️ Robust Canvas support**

---

## 📦 Installation

📥 Install via **Obsidian Community Plugins** or manually from GitHub [Releases]([https://github.com/ShawnSWu/canvas-md-side-editor/releases](https://github.com/ShawnSWu/Obsidian-Canvas-Markdown-Side-Editor/releases/)).

---

## 🚀 Getting Started

Click a Canvas Text card or a File card pointing to a `.md` file to open the side editor automatically.  
More usage and examples can be found in this README and the release notes.

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

## 🆕 What’s New

- **v1.2.2**
  - ✨ Auto-close the side editor when you start editing directly inside a Canvas card (focus or type).  
    This prevents conflicting edits between the Canvas inline editor and the side panel.
  - 🎯 Minor interaction polish around double-click zoom suppression when the side panel is open.
  - Adjustable text size for both panes.
  - New settings: "Editor font size (px)" and "Preview font size (px)".
  ![fontsize](https://github.com/user-attachments/assets/70a9a4fd-0d55-48bb-beb9-690a02c26946)

