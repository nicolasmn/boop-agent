// Loads .env.local then .env into process.env.
// Used by scripts that run outside the main server process.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
