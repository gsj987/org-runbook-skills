/**
 * Local type declarations for pi extension API
 * These types are available when running inside pi,
 * but not available in local development environment.
 */

// Re-export the actual types from pi if available
declare module "@mariozechner/pi-coding-agent" {
  export interface ExtensionAPI {
    registerTool(config: ToolConfig): void;
    registerCommand(name: string, config: CommandConfig): void;
    on(event: string, handler: EventHandler): void;
  }

  export interface ToolConfig {
    name: string;
    description: string;
    inputSchema: object;
    handler: (args: any) => Promise<any>;
  }

  export interface CommandConfig {
    description: string;
    handler: (args: any) => Promise<any>;
  }

  export type EventHandler = (event: ToolCallEvent, context: any) => any;

  export interface ToolCallEvent {
    tool: string;
    args: Record<string, any>;
  }
}

// Fallback types for local development
declare global {
  interface ExtensionAPI {
    registerTool(config: any): void;
    registerCommand(name: string, config: any): void;
    on(event: string, handler: any): void;
  }
}

export {};
