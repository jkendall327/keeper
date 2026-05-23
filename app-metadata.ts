import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

interface PackageMetadata {
  version?: string;
}

export function readPackageVersion(): string {
  const packageJson = JSON.parse(readFileSync(join(projectRoot(), "package.json"), "utf8")) as PackageMetadata;
  return packageJson.version ?? "0.0.0";
}

function projectRoot(): string {
  try {
    const moduleDir = new URL(".", import.meta.url);
    if (moduleDir.protocol === "file:") {
      return fileURLToPath(moduleDir);
    }
  } catch {
    // Test bundlers may rewrite import.meta.url to a non-file value.
  }
  return process.cwd();
}

export function readGitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function appMetadataDefines(): Record<string, string> {
  return {
    __APP_VERSION__: JSON.stringify(readPackageVersion()),
    __APP_GIT_SHA__: JSON.stringify(readGitSha()),
  };
}
