import "./load-env";
import { createApp, log } from "./app";

const port = parseInt(process.env.PORT || "5000", 10);

async function start() {
  const { httpServer } = await createApp({
    serveFrontend: true,
    enableDevVite: true,
  });

  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
}

start().catch((error) => {
  console.error("[Server] Failed to start:", error);
  process.exit(1);
});
