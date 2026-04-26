import { build as esbuild } from "esbuild";
import { build as viteBuild, createLogger } from "vite";
import { rm, readFile } from "fs/promises";

const viteLogger = createLogger();
const POSTCSS_FROM_WARNING = "A PostCSS plugin did not pass the `from` option";

function createBuildLogger() {
  return {
    ...viteLogger,
    warn(message: string, options?: Parameters<typeof viteLogger.warn>[1]) {
      if (message.includes(POSTCSS_FROM_WARNING)) return;
      viteLogger.warn(message, options);
    },
    warnOnce(message: string, options?: Parameters<typeof viteLogger.warnOnce>[1]) {
      if (message.includes(POSTCSS_FROM_WARNING)) return;
      viteLogger.warnOnce(message, options);
    },
  };
}

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  process.env.NODE_ENV ||= "production";

  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild({ customLogger: createBuildLogger() });

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
