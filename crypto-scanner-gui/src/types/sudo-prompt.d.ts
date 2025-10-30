declare module 'sudo-prompt' {
  export interface Options {
    name?: string;
    icns?: string;
  }

  export type Callback = (error: Error | null, stdout?: string, stderr?: string) => void;

  export function exec(command: string, options: Options, callback: Callback): void;
}
