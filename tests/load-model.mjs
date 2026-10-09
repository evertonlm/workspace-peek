// Loads PeekModel.js the way QML does (a ".pragma library" script with global
// functions), so the same file runs in the shell and under `node --test`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const source = readFileSync(fileURLToPath(new URL("../PeekModel.js", import.meta.url)), "utf8");

export function loadModel() {
  const context = vm.createContext({});
  vm.runInContext(source.replace(/^\.pragma library\s*$/m, ""), context, { filename: "PeekModel.js" });
  return context;
}

export function fixture(name) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), "utf8"));
}
