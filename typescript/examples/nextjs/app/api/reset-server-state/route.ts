import path from "path";
import { pathToFileURL } from "url";

import { NextResponse } from "next/server";

import { getPluginDistUtilsRoot } from "@/lib/server/plugin-paths";
import { loadDemoServerEnv } from "@/lib/server/load-env";
import { importRuntimeModule } from "@/lib/server/runtime-import";

export const runtime = "nodejs";

type UserDidStoreModule = {
  resetTrackedUserDidsForTests: () => void;
};

type T3nSessionModule = {
  clearT3nSession: () => void;
};

export async function POST() {
  loadDemoServerEnv();
  try {
    const pluginDistUtils = getPluginDistUtilsRoot();

    const [userDidStore, t3nSession] = await Promise.all([
      importRuntimeModule<UserDidStoreModule>(
        pathToFileURL(path.join(pluginDistUtils, "user-did-store.js")).href
      ),
      importRuntimeModule<T3nSessionModule>(
        pathToFileURL(path.join(pluginDistUtils, "t3n-session.js")).href
      ),
    ]);

    userDidStore.resetTrackedUserDidsForTests();
    t3nSession.clearT3nSession();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Reset failed" },
      { status: 500 }
    );
  }
}
