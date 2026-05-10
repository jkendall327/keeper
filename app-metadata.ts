import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface PackageMetadata {
  version?: string;
}

export function readPackageVersion(): string {
  const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as PackageMetadata;
  return packageJson.version ?? "0.0.0";
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
