export interface FlagMatch {
  value: string;
  consumedCount: number;
}

export function tryReadFlag(
  argv: string[],
  index: number,
  flag: string,
  alias?: string
): FlagMatch | undefined {
  const arg = argv[index];

  // Check long flag with equals: --flag=value
  if (arg.startsWith(`${flag}=`)) {
    return {
      value: arg.slice(`${flag}=`.length).trim(),
      consumedCount: 1,
    };
  }

  // Check long flag as separate arg: --flag value
  if (arg === flag) {
    const next = argv[index + 1];
    if (!next || next.startsWith("-")) {
      throw new Error(`Missing value for ${flag}`);
    }
    return {
      value: next.trim(),
      consumedCount: 2,
    };
  }

  // Check alias if provided: -f value or -f=value
  if (alias) {
    if (arg.startsWith(`${alias}=`)) {
      return {
        value: arg.slice(`${alias}=`.length).trim(),
        consumedCount: 1,
      };
    }
    if (arg === alias) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new Error(`Missing value for ${alias}`);
      }
      return {
        value: next.trim(),
        consumedCount: 2,
      };
    }
  }

  return undefined;
}

export function assertEnumFlagValue<T extends string>(
  flag: string,
  value: string,
  supported: readonly T[]
): T {
  if (supported.includes(value as T)) {
    return value as T;
  }

  throw new Error(
    `Invalid value for ${flag}: "${value}". Supported values: ${supported.join(", ")}`
  );
}

export function buildUnknownFlagError(arg: string, supportedFlags: string): Error {
  return new Error(`Unknown argument: "${arg}". Supported flags: ${supportedFlags}`);
}

export function buildUnexpectedPositionalArgError(
  arg: string,
  supportedFlags: string
): Error {
  return new Error(
    `Unexpected positional argument: "${arg}". Supported flags: ${supportedFlags}`
  );
}
