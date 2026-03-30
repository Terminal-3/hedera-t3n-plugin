import path from "path";

export function getPluginRoot(): string {
  return path.resolve(process.cwd(), "../../..");
}

export function getPluginDistRoot(): string {
  return path.join(getPluginRoot(), "dist");
}

export function getPluginDistUtilsRoot(): string {
  return path.join(getPluginDistRoot(), "utils");
}
