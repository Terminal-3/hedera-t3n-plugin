type RuntimeImport = (specifier: string) => Promise<unknown>;

// Keep external file loading out of Turbopack's static import analysis in `next dev`.
const runtimeImport = new Function(
  "specifier",
  "return import(specifier);"
) as RuntimeImport;

export async function importRuntimeModule<T>(specifier: string): Promise<T> {
  return runtimeImport(specifier) as Promise<T>;
}
