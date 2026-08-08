#!/usr/bin/env node
// Sincroniza (espelha) os CSVs da pasta raiz do projeto (um nível acima
// deste app) para data/raw/, de onde o painel os lê. "Sincronizar" aqui
// significa espelhar de verdade: arquivos removidos da pasta raiz também
// são removidos de data/raw/ (ex.: quando um export por unidade é
// substituído por um export consolidado "Matriz" mais completo) — isso
// evita que o painel de qualidade de dados fique cheio de alertas de
// "linha duplicada" por causa de cópias antigas esquecidas.
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

const sourceFiles = fs
  .readdirSync(sourceDir)
  .filter((f) => f.toLowerCase().endsWith(".csv"));

if (sourceFiles.length === 0) {
  console.error(`Nenhum arquivo .csv encontrado em ${sourceDir}`);
  process.exit(1);
}

const existingTargetFiles = fs
  .readdirSync(targetDir)
  .filter((f) => f.toLowerCase().endsWith(".csv"));

for (const file of existingTargetFiles) {
  if (!sourceFiles.includes(file)) {
    fs.unlinkSync(path.join(targetDir, file));
    console.log(`Removido (não existe mais na origem): ${file}`);
  }
}

for (const file of sourceFiles) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
  console.log(`Copiado: ${file}`);
}

console.log(`\n${sourceFiles.length} arquivo(s) sincronizado(s) em ${targetDir}`);
console.log("Rode `npm run check-etl` para conferir os números antes de publicar.");
