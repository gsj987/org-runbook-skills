/**
 * Shim for @mariozechner/pi-coding-agent types
 * This allows local TypeScript compilation without pi installed
 */

// Global ExtensionAPI interface
declare global {
  interface Window {
    ExtensionAPI: ExtensionAPI;
  }
}

interface ToolConfig {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
    enum?: string[];
    items?: any;
  };
  handler: (args: any) => Promise<any>;
}

interface CommandConfig {
  description: string;
  handler: (args: any) => Promise<any>;
}

interface ExtensionAPI {
  registerTool(config: ToolConfig): void;
  registerCommand(name: string, config: CommandConfig): void;
  on(event: string, handler: (event: any, context: any) => any): void;
  on(event: "tool_call", handler: (event: ToolCallEvent, context: any) => any): void;
}

interface ToolCallEvent {
  tool: string;
  args: Record<string, any>;
}

export { ExtensionAPI, ToolConfig, CommandConfig, ToolCallEvent };
