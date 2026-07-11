const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Inject a custom resolveRequest to handle virtual NativeWind cache CSS file paths 
// cleanly in all environments (including Linux/Vercel CI/CD and Windows local).
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const normalizedName = moduleName.replace(/\\/g, "/");
  if (
    normalizedName.includes("cache/nativewind/global.css") ||
    normalizedName.endsWith("cache/nativewind/global.css")
  ) {
    const projectRoot = context.projectRoot || __dirname;
    const resolvedPath = path.resolve(
      projectRoot,
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
