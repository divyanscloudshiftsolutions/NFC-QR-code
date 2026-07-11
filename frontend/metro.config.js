const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const cacheDir = path.resolve(projectRoot, "cache", "nativewind");

// Ensure cache directory exists before starting Metro
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Pre-compile Tailwind CSS synchronously for all target platforms.
// This ensures that the generated stylesheet files exist on disk BEFORE 
// Metro initializes its haste map directory scan (preventing SHA-1 failures).
const platforms = ["web", "ios", "android"];
for (const p of platforms) {
  try {
    const inputPath = path.resolve(projectRoot, "global.css");
    const outputPath = path.resolve(cacheDir, `global.css.${p}.css`);
    execSync(
      `npx tailwindcss -i "${inputPath}" -o "${outputPath}"`,
      { 
        stdio: "ignore", 
        cwd: projectRoot,
        env: { ...process.env, NATIVEWIND_NATIVE: p } 
      }
    );
  } catch (error) {
    console.error(`Failed to pre-compile Tailwind CSS for platform ${p}:`, error);
  }
}

const config = getDefaultConfig(projectRoot);

// Inject a custom resolveRequest to handle virtual NativeWind cache CSS file paths 
// cleanly in all environments (including Linux/Vercel CI/CD and Windows local).
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const normalizedName = moduleName.replace(/\\/g, "/");
  if (
    normalizedName.includes("cache/nativewind/global.css") ||
    normalizedName.endsWith("cache/nativewind/global.css")
  ) {
    const root = context.projectRoot || projectRoot;
    const resolvedPath = path.resolve(
      root,
      "cache",
      "nativewind",
      `global.css.${platform}.css`
    );
    return {
      filePath: resolvedPath,
      type: "sourceFile",
    };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { 
  input: "./global.css",
  outputDir: "cache/nativewind"
});
