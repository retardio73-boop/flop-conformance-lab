import { cpSync, mkdirSync } from "node:fs";
mkdirSync("dist/conformance", { recursive: true });
cpSync("conformance/fixtures", "dist/conformance/fixtures", { recursive: true });
cpSync("conformance/sources", "dist/conformance/sources", { recursive: true });
cpSync("conformance/observatory", "dist/conformance/observatory", { recursive: true });
