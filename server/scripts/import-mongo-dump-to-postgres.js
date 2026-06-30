#!/usr/bin/env node

require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { connectDatabase, getPool } = require("../db/postgres");

const COLLECTION_HINTS = {
  User: ["name", "email", "password", "role"],
  Question: ["questionText", "options", "correctAnswer"],
  Result: ["answers", "suiteId"],
  TestSuite: ["name", "status", "duration"],
  ExamSettings: ["totalQuestions", "examDuration"],
  OrgOption: ["key", "projects"],
  RoleDefinition: ["name", "baseRole"],
  EmailOtp: ["email", "otp", "purpose"],
};

const IMPORT_ORDER = [
  "User",
  "RoleDefinition",
  "OrgOption",
  "ExamSettings",
  "TestSuite",
  "Question",
  "Result",
  "EmailOtp",
];

function usage() {
  console.log(`
Usage:
  node server/scripts/import-mongo-dump-to-postgres.js <dump-folder> [--dry-run] [--replace]

Examples:
  node server/scripts/import-mongo-dump-to-postgres.js "C:\\Users\\acer\\AppData\\Local\\Temp" --dry-run
  node server/scripts/import-mongo-dump-to-postgres.js "./mongo-export" --replace

Environment:
  DATABASE_URL, POSTGRES_URL, or POSTGRESQL_URL must point to PostgreSQL.

Notes:
  - Mongo ObjectIds are converted to stable PostgreSQL UUIDs.
  - References are preserved automatically.
  - --replace deletes only the app collections imported by this script before inserting.
`);
}

function parseArgs(argv) {
  const flags = new Set(argv.filter(arg => arg.startsWith("--")));
  const dumpDir = argv.find(arg => !arg.startsWith("--"));
  if (flags.has("--help") || flags.has("-h")) return { help: true };
  return {
    dumpDir: dumpDir ? path.resolve(dumpDir) : null,
    dryRun: flags.has("--dry-run"),
    replace: flags.has("--replace"),
  };
}

function stableUuidFromObjectId(objectId) {
  const hash = crypto.createHash("md5").update(`mongo-objectid:${objectId}`).digest("hex").split("");
  hash[12] = "4";
  hash[16] = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  const hex = hash.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fromExtendedJson(value) {
  if (Array.isArray(value)) return value.map(fromExtendedJson);
  if (!value || typeof value !== "object") return value;

  const keys = Object.keys(value);
  if (keys.length === 1) {
    if (value.$oid !== undefined) return stableUuidFromObjectId(String(value.$oid));
    if (value.$numberInt !== undefined) return Number.parseInt(value.$numberInt, 10);
    if (value.$numberLong !== undefined) return Number.parseInt(value.$numberLong, 10);
    if (value.$numberDouble !== undefined) return Number.parseFloat(value.$numberDouble);
    if (value.$date !== undefined) {
      const rawDate = value.$date;
      if (typeof rawDate === "string") return new Date(rawDate).toISOString();
      if (rawDate?.$numberLong !== undefined) {
        return new Date(Number.parseInt(rawDate.$numberLong, 10)).toISOString();
      }
    }
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, fromExtendedJson(item)])
  );
}

function stripMongoFields(document) {
  const output = { ...document };
  delete output.__v;
  return output;
}

function classifyCollection(documents) {
  const sample = documents.find(item => item && typeof item === "object") || {};

  if ("questionText" in sample && Array.isArray(sample.options)) return "Question";
  if (Array.isArray(sample.answers) && ("suiteId" in sample || "testName" in sample)) return "Result";
  if ("email" in sample && "password" in sample && "role" in sample) return "User";
  if ("key" in sample && "projects" in sample) return "OrgOption";
  if ("baseRole" in sample) return "RoleDefinition";
  if ("totalQuestions" in sample && ("examDuration" in sample || "aptitudeCount" in sample)) return "ExamSettings";
  if ("otp" in sample && "purpose" in sample) return "EmailOtp";
  if ("name" in sample && ("duration" in sample || "status" in sample || "assignedUsers" in sample)) return "TestSuite";

  const best = Object.entries(COLLECTION_HINTS)
    .map(([collection, fields]) => ({
      collection,
      score: fields.filter(field => field in sample).length,
    }))
    .sort((a, b) => b.score - a.score)[0];

  return best?.score >= 2 ? best.collection : null;
}

function readJsonArray(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text.startsWith("[") && !text.startsWith("{")) return null;
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function loadDump(dumpDir) {
  if (!dumpDir || !fs.existsSync(dumpDir) || !fs.statSync(dumpDir).isDirectory()) {
    throw new Error(`Dump folder not found: ${dumpDir || "(missing)"}`);
  }

  const files = fs.readdirSync(dumpDir)
    .filter(file => file.toLowerCase().endsWith(".json"))
    .map(file => path.join(dumpDir, file));

  const grouped = new Map();
  const skipped = [];

  for (const file of files) {
    try {
      const rawDocuments = readJsonArray(file);
      if (!rawDocuments) {
        skipped.push({ file, reason: "not JSON data" });
        continue;
      }

      const documents = rawDocuments.map(fromExtendedJson).map(stripMongoFields);
      if (!documents.length) continue;

      const collection = classifyCollection(documents);
      if (!collection) {
        skipped.push({ file, reason: "unknown document shape" });
        continue;
      }

      if (!grouped.has(collection)) grouped.set(collection, []);
      grouped.get(collection).push(...documents);
      console.log(`Detected ${path.basename(file)} -> ${collection} (${documents.length})`);
    } catch (error) {
      skipped.push({ file, reason: error.message });
    }
  }

  return { grouped, skipped };
}

function dedupeById(documents) {
  const map = new Map();
  for (const document of documents) {
    if (!document._id) document._id = crypto.randomUUID();
    map.set(String(document._id), document);
  }
  return [...map.values()];
}

async function replaceCollections(collections) {
  if (!collections.length) return;
  await getPool().query("DELETE FROM app_documents WHERE collection = ANY($1::text[])", [collections]);
}

async function upsertDocument(collection, document) {
  const id = document._id;
  const createdAt = document.createdAt || new Date().toISOString();
  const updatedAt = document.updatedAt || createdAt;
  const data = { ...document };
  delete data._id;

  await getPool().query(`
    INSERT INTO app_documents (collection, id, data, created_at, updated_at)
    VALUES ($1, $2, $3::jsonb, $4, $5)
    ON CONFLICT (id) DO UPDATE
      SET collection = EXCLUDED.collection,
          data = EXCLUDED.data,
          updated_at = EXCLUDED.updated_at
  `, [collection, id, JSON.stringify(data), createdAt, updatedAt]);
}

async function importDump({ dumpDir, dryRun, replace }) {
  const { grouped, skipped } = loadDump(dumpDir);
  const collections = IMPORT_ORDER.filter(collection => grouped.has(collection));

  console.log("\nImport plan:");
  for (const collection of collections) {
    console.log(`  ${collection}: ${dedupeById(grouped.get(collection)).length}`);
  }

  if (skipped.length) {
    console.log("\nSkipped files:");
    for (const item of skipped) {
      console.log(`  ${path.basename(item.file)}: ${item.reason}`);
    }
  }

  if (dryRun) {
    console.log("\nDry run complete. No PostgreSQL changes were made.");
    return;
  }

  await connectDatabase();
  if (replace) {
    console.log("\nReplacing imported collections...");
    await replaceCollections(collections);
  }

  for (const collection of collections) {
    const documents = dedupeById(grouped.get(collection));
    for (const document of documents) {
      await upsertDocument(collection, document);
    }
    console.log(`Imported ${documents.length} ${collection} document(s).`);
  }

  console.log("\nMongo dump import completed successfully.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!args.dumpDir) {
    usage();
    process.exitCode = 1;
    return;
  }
  await importDump(args);
}

main().catch(error => {
  console.error("\nImport failed:", error.message);
  process.exitCode = 1;
});
