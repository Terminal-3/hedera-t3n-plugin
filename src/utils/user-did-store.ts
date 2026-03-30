export interface UserDidEntry {
  did: string;
  remark: string;
  timestamp: Date;
}

const userDidEntries = new Map<string, UserDidEntry>();

export function addTrackedUserDid(did: string, remark: string): UserDidEntry {
  const entry: UserDidEntry = {
    did,
    remark,
    timestamp: new Date(),
  };

  userDidEntries.set(did, entry);
  return entry;
}

export function replaceTrackedUserDid(did: string, remark: string): UserDidEntry {
  userDidEntries.clear();
  return addTrackedUserDid(did, remark);
}

export function getTrackedUserDidByDid(did: string): UserDidEntry[] {
  const entry = userDidEntries.get(did);
  return entry ? [entry] : [];
}

export function getTrackedUserDidsByRemark(remark: string): UserDidEntry[] {
  const normalized = remark.toLowerCase();
  return Array.from(userDidEntries.values()).filter((entry) =>
    entry.remark.toLowerCase().includes(normalized)
  );
}

export function getAllTrackedUserDids(): UserDidEntry[] {
  return Array.from(userDidEntries.values());
}

export function resetTrackedUserDidsForTests(): void {
  userDidEntries.clear();
}
