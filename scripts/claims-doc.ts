// Regenerate docs/claims.md from src/content/claims.ts.
import { writeFileSync } from "node:fs";
import { claimsMarkdown } from "../src/content/claims-doc";

writeFileSync("docs/claims.md", claimsMarkdown());
console.log("docs/claims.md written");
