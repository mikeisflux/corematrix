import "dotenv/config";
import { ensureMigrated } from "../src/lib/db";
ensureMigrated().then(() => { console.log("migrated"); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
