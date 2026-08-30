import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`[server] listening on http://localhost:${env.PORT}`);
  console.log(`[server] environment: ${env.NODE_ENV}`);
  console.log(`[server] CORS origin: ${env.FRONTEND_ORIGIN}`);
});
