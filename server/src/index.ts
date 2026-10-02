import { createApp } from "./app.js";
import { openDb, resolveDatabasePath } from "./db.js";

const db = openDb(resolveDatabasePath(process.env.DATABASE_PATH));
const app = createApp(db);

const port = Number(process.env.PORT) || 3001;
app.listen(port, "127.0.0.1", () => {
  console.log(`server listening on 127.0.0.1:${port}`);
});
