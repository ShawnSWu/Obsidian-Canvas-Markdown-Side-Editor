// Pasted-image handling for the side editor.
//
// savePastedImagesToVault() writes pasted image binaries into the user's
// configured attachment folder (mirroring Obsidian's own "Files & links"
// settings) and returns the markdown/wikilink text to insert at the cursor.
// Insertion into the concrete editor is the caller's job.
import type { App } from 'obsidian';

// Save pasted images to the vault and build the link text to insert.
// Returns null when nothing was saved.
export async function savePastedImagesToVault(
  app: App,
  files: File[],
  sourcePath: string,
): Promise<string | null> {
  try {
    if (!files || files.length === 0) return null;
    const now = new Date();

    const sourceDir = sourcePath.includes('/') ? sourcePath.substring(0, sourcePath.lastIndexOf('/')) : '';

    const getCfg = (k: string) => {
      try {
        const v = (app as unknown as { vault: { getConfig?: (k: string) => unknown } }).vault;
        return v.getConfig?.(k);
      } catch { return undefined; }
    };
    const attachSetting = getCfg('attachmentFolderPath');
    const useMdLinks = !!getCfg('useMarkdownLinks');

    // Resolve preferred attachments folder
    let folderPath = '';
    if (typeof attachSetting === 'string' && attachSetting.trim()) {
      const v = attachSetting.trim();
      if (v.startsWith('./')) {
        // relative to current file folder
        const rel = v.slice(2);
        folderPath = sourceDir ? (rel ? `${sourceDir}/${rel}` : sourceDir) : rel;
      } else {
        // vault-absolute folder
        folderPath = v;
      }
    } else {
      // default: same folder as current source, else vault root
      folderPath = sourceDir || '';
    }

    // Ensure folder exists (if not root)
    if (folderPath) {
      const exists = app.vault.getAbstractFileByPath(folderPath);
      if (!exists) {
        try { await app.vault.createFolder(folderPath); } catch {}
      }
    }

    // Helper to create a unique file path
    const toTwo = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const ts = `${now.getFullYear()}${toTwo(now.getMonth()+1)}${toTwo(now.getDate())}_${toTwo(now.getHours())}${toTwo(now.getMinutes())}${toTwo(now.getSeconds())}`;

    const savedPaths: string[] = [];
    for (let idx = 0; idx < files.length; idx++) {
      const f = files[idx];
      const extFromType = (f.type && f.type.includes('/')) ? `.${f.type.split('/')[1]}` : '';
      const baseName = `Pasted image ${ts}${files.length>1 ? ` ${idx+1}` : ''}${extFromType || '.png'}`;
      let targetPath = folderPath ? `${folderPath}/${baseName}` : baseName;
      // de-dup if exists
      let attempt = 1;
      while (app.vault.getAbstractFileByPath(targetPath)) {
        const alt = `Pasted image ${ts}${files.length>1 ? ` ${idx+1}` : ''} (${++attempt})${extFromType || '.png'}`;
        targetPath = folderPath ? `${folderPath}/${alt}` : alt;
      }
      const buf = await f.arrayBuffer();
      await app.vault.createBinary(targetPath, buf);
      savedPaths.push(targetPath);
    }

    // Insert links
    const insertParts: string[] = [];
    for (const p of savedPaths) {
      if (useMdLinks) {
        // Try to make relative if possible
        let rel = p;
        if (sourceDir && p.startsWith(sourceDir + '/')) rel = p.substring(sourceDir.length + 1);
        insertParts.push(`![](${rel})`);
      } else {
        // wikilink
        const fileName = p.includes('/') ? p.substring(p.lastIndexOf('/') + 1) : p;
        insertParts.push(`![[${fileName}]]`);
      }
    }
    return insertParts.join('\n');
  } catch (e) {
    try { console.error('CanvasMdSideEditor: savePastedImagesToVault failed', e); } catch {}
    return null;
  }
}
