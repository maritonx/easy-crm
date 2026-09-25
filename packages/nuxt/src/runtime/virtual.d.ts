// Provided by the module as a Nitro virtual module.
declare module '#easy-cms-local-api' {
  export function useEasyCMS(): Promise<import('@easy-cms/core').EasyCMS>
}

declare module '#easy-cms-admin-shell' {
  export const basePath: string
  export const html: string
  export const headers: Record<string, string>
}
