import { chmod } from "fs/promises";

const OWNER_ONLY_FILE_MODE = 0o600;

export async function ensureOwnerOnlyFilePermissions(
  path: string,
  label: string = "sensitive file"
): Promise<void> {
  try {
    await chmod(path, OWNER_ONLY_FILE_MODE);
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === "ENOENT") {
      return;
    }
    if (process.env.NODE_ENV !== "test") {
      console.warn(`Warning: Could not set restrictive permissions on the ${label}.`);
    }
  }
}
