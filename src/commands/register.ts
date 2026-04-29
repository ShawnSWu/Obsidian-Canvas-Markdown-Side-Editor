// Command registration for the Canvas MD Side Editor plugin
// Keep this file focused on lightweight command binding.

type Command = {
  id: string;
  name: string;
  callback: () => void;
};

interface CommandRegistrablePlugin {
  addCommand(cmd: Command): void;
}

export function registerCommands(_plugin: CommandRegistrablePlugin) {
  // No commands at the moment. Toggle Preview was retired when the
  // preview pane became read-only-only (issue #9 follow-up).
}
