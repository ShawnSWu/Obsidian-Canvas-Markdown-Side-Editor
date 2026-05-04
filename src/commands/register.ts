// Command registration for the Canvas MD Side Editor plugin.

type Command = {
  id: string;
  name: string;
  callback: () => void;
};

interface CommandRegistrablePlugin {
  addCommand(cmd: Command): void;
  cycleViewMode?(): void;
}

export function registerCommands(plugin: CommandRegistrablePlugin) {
  // Cycle the side panel's view mode through Editor → Both → Preview.
  // Command id is preserved from the previous "toggle preview" command so
  // users with existing hotkey bindings keep them working.
  plugin.addCommand({
    id: 'cmside-toggle-preview',
    name: 'Canvas Side Editor: Toggle Preview',
    callback: () => plugin.cycleViewMode?.(),
  });
}
