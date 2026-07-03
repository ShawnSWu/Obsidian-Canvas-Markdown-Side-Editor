// Command registration for the Canvas MD Side Editor plugin.

type Command = {
  id: string;
  name: string;
  callback: () => void;
};

interface CommandRegistrablePlugin {
  addCommand(cmd: Command): void;
  cycleViewMode?(): void;
  toggleHeadlineForActiveCanvas?(): void;
  resetHeadlineOverrideForActiveCanvas?(): void;
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

  // Per-canvas headline mode (canvas style suite). Toggle stores an explicit
  // on/off override for the active canvas; reset removes the override so the
  // canvas follows the global setting again.
  plugin.addCommand({
    id: 'cmside-toggle-headline-canvas',
    name: 'Canvas Side Editor: Toggle headline mode (this canvas)',
    callback: () => plugin.toggleHeadlineForActiveCanvas?.(),
  });
  plugin.addCommand({
    id: 'cmside-reset-headline-canvas',
    name: 'Canvas Side Editor: Reset headline override (this canvas)',
    callback: () => plugin.resetHeadlineOverrideForActiveCanvas?.(),
  });
}
