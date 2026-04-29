// Command registration for the Canvas MD Side Editor plugin
// Keep this file focused on lightweight command binding.

type Command = {
  id: string;
  name: string;
  callback: () => void;
};

interface CommandRegistrablePlugin {
  addCommand(cmd: Command): void;
  togglePreview?(): void;
}

export function registerCommands(plugin: CommandRegistrablePlugin) {
  // Toggle the preview pane inside the side editor
  plugin.addCommand({
    id: 'cmside-toggle-preview',
    name: 'Canvas Side Editor: Toggle Preview',
    callback: () => plugin.togglePreview?.(),
  });
}
