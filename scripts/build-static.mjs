import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const files = ["index.html", "style.css", "app.js", "storage.js", "xlsx.js"];
const directories = ["assets"];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of files) {
  await cp(join(root, file), join(dist, file));
}

for (const directory of directories) {
  await cp(join(root, directory), join(dist, directory), { recursive: true });
}

console.log("Staff Planner pronto per la build desktop.");
