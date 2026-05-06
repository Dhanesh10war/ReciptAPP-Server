import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "data", "db.json");

if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ receipts: [] }, null, 2));
}

export function getReceipts() {
  const data = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  return data.receipts || [];
}

export function insertReceipt(receipt) {
  const data = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  data.receipts.unshift(receipt);
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

export function deleteReceipt(id) {
  const data = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  const index = data.receipts.findIndex(r => r.id === id);
  if (index !== -1) {
    data.receipts.splice(index, 1);
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    return true;
  }
  return false;
}
