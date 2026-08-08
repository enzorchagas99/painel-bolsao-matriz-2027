#!/usr/bin/env node
// Copia os CSVs "*_itens_da_venda_*.csv" da pasta raiz do projeto
// (um nível acima deste app) para data/raw/, de onde o painel os lê.
//
// Uso:
//   npm run sync-data
//
// Depois de rodar, gere um novo build/deploy para publicar os dados
// atualizados (ver README.md).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, "..");
const sourceDir = path.join(appRoot, "..");
const targetDir = path.join(appRoot, "data", "raw");

fs.mkdirSync(targetDir, { recursive: true });

const files = fs
  .readdirSync(sourceDir)
  .filter((f) => f.toLowerCase().endsWith(".csv"));

if (files.length === 0) {
  console.error(`Nenhum arquivo .csv encontrado em ${sourceDir}`);
  process.exit(1);
}

for (const file of files) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
  console.log(`Copiado: ${file}`);
}

console.log(`\n${files.length} arquivo(s) sincronizado(s) em ${targetDir}`);
console.log("Rode `npm run check-etl` para conferir os números antes de publicar.");
