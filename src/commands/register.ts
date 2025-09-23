// Command registration for the Canvas MD Side Editor plugin
// Keep this file focused on lightweight command binding.

export function registerCommands(plugin: any) {
  // Toggle the preview pane inside the side editor
  plugin.addCommand({
    id: 'cmside-toggle-preview',
    name: 'Canvas Side Editor: Toggle Preview',
    callback: () => plugin.togglePreview?.(),
  });
}
