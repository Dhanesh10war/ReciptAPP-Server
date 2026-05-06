import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePhone } from "../whatsapp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.resolve(__dirname, "..", "assets", "logo.png");
const signaturePath = path.resolve(__dirname, "..", "assets", "signature.png");
let logoBase64 = "";
let signatureBase64 = "";

try {
  if (fs.existsSync(logoPath)) {
    const logoBuffer = fs.readFileSync(logoPath);
    logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
    console.log(`[Receipt] Logo loaded successfully from: ${logoPath}`);
  } else {
    console.warn(`[Receipt] Logo NOT FOUND at: ${logoPath}`);
  }

  if (fs.existsSync(signaturePath)) {
    const sigBuffer = fs.readFileSync(signaturePath);
    // Use a more generic mime type if possible, or just stay with png for now
    signatureBase64 = `data:image/png;base64,${sigBuffer.toString("base64")}`;
    console.log(`[Receipt] Signature loaded successfully from: ${signaturePath}`);
  } else {
    console.warn(`[Receipt] Signature NOT FOUND at: ${signaturePath}`);
  }
} catch (error) {
  console.error("[Receipt] Error loading images:", error.message);
}

export function sanitize(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

export function normalizePayerName(value = "") {
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  return /^jc\b/i.test(trimmed) ? trimmed : `Jc ${trimmed}`;
}

export function formatDisplayDate(value = "") {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
}

export function formatMonthYear(from, to) {
  if (!from) return "";
  const fromParsed = new Date(`${from}-01T00:00:00`);
  const fromStr = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(fromParsed);
  
  if (!to || to === from) return fromStr;
  
  const toParsed = new Date(`${to}-01T00:00:00`);
  const toStr = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(toParsed);
  
  return `${fromStr} to ${toStr}`;
}

export function validateReceipt(data) {
  const required = ["recipientPhone", "payerName", "amount", "amountWords", "monthYear", "paymentMethod", "receiptNumber", "date"];
  const errors = {};
  for (const field of required) {
    if (!String(data[field] || "").trim()) errors[field] = "Required";
  }
  return errors;
}

export function buildReceiptPayload(input) {
  return {
    id: input.id || randomUUID(),
    recipientPhone: normalizePhone(input.recipientPhone),
    payerName: normalizePayerName(input.payerName),
    amount: Number(input.amount).toFixed(2),
    amountWords: String(input.amountWords || "").trim(),
    monthYear: formatMonthYear(input.monthYear, input.toMonth),
    paymentMethod: String(input.paymentMethod || "Cash").trim(),
    receiptNumber: String(input.receiptNumber || "").trim(),
    date: String(input.date || "").trim(),
    createdAt: input.createdAt || new Date().toISOString()
  };
}

export function receiptSvg(receipt) {
  const amount = sanitize(receipt.amount);
  const amountWords = sanitize(receipt.amountWords);
  const monthYear = sanitize(receipt.monthYear);
  const payerName = sanitize(receipt.payerName);
  const paymentMethod = sanitize(receipt.paymentMethod);
  const receiptNumber = sanitize(receipt.receiptNumber);
  const displayDate = sanitize(formatDisplayDate(receipt.date));

  // Load signature dynamically with multiple path fallbacks for Production
  let dynamicSignatureBase64 = "";
  try {
    const possiblePaths = [
      path.resolve(__dirname, "..", "assets", "signature.png"),
      path.join(process.cwd(), "assets", "signature.png"),
      path.join(process.cwd(), "server", "assets", "signature.png")
    ];
    
    let sigPath = "";
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        sigPath = p;
        break;
      }
    }

    if (sigPath) {
      const sigBuffer = fs.readFileSync(sigPath);
      dynamicSignatureBase64 = `data:image/png;base64,${sigBuffer.toString("base64")}`;
      console.log(`[Receipt] Successfully read signature from: ${sigPath}`);
    } else {
      console.warn(`[Receipt] Signature file NOT FOUND in any expected location.`);
    }
  } catch (err) {
    console.error("[Receipt] Error reading signature dynamically:", err.message);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="760" viewBox="0 0 1400 760">
  <defs>
    <filter id="remove-bg">
      <feColorMatrix type="matrix" values="1 0 0 0 0
                                           0 1 0 0 0
                                           0 0 1 0 0
                                           -1.1 -1.1 -1.1 1 3"/>
    </filter>
  </defs>
  <rect width="1400" height="760" fill="#f7f9f8"/>
  <rect x="44" y="42" width="1312" height="676" rx="8" fill="#ffffff" stroke="#202723" stroke-width="4"/>
  
  ${logoBase64 ? `<image x="65" y="50" width="280" height="210" href="${logoBase64}" preserveAspectRatio="xMidYMid meet"/>` : ""}
  ${logoBase64 ? `<image x="1055" y="50" width="280" height="210" href="${logoBase64}" preserveAspectRatio="xMidYMid meet"/>` : ""}

  <text x="700" y="90" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#202723">JCI India Zone 17</text>
  <text x="700" y="135" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="800" fill="#1f5f43">JCOM L GOBI 1.0 TABLE</text>
  <text x="700" y="172" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#202723">GOBICHETTIPALAYAM</text>

  <line x1="84" y1="226" x2="1316" y2="226" stroke="#202723" stroke-width="3"/>
  <text x="98" y="276" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#202723">Invoice No.</text>
  <rect x="270" y="243" width="260" height="52" rx="6" fill="#ffffff" stroke="#202723" stroke-width="3"/>
  <text x="294" y="279" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#b8322b">${receiptNumber}</text>
  <text x="1112" y="276" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#202723">Date</text>
  <rect x="1184" y="243" width="132" height="52" rx="6" fill="#ffffff" stroke="#202723" stroke-width="3"/>
  <text x="1200" y="278" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#202723">${displayDate}</text>

  <text x="98" y="354" font-family="Arial, sans-serif" font-size="31" fill="#202723">Received with thanks from</text>
  <line x1="462" y1="358" x2="1316" y2="358" stroke="#202723" stroke-width="3"/>
  <text x="486" y="348" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#202723">${payerName}</text>

  <text x="98" y="431" font-family="Arial, sans-serif" font-size="31" fill="#202723">The sum of Rupees</text>
  <line x1="390" y1="435" x2="1050" y2="435" stroke="#202723" stroke-width="3"/>
  <text x="414" y="425" font-family="Arial, sans-serif" font-size="31" font-weight="700" fill="#202723">${amountWords}</text>
  <text x="1080" y="431" font-family="Arial, sans-serif" font-size="31" fill="#202723">only</text>

  <text x="98" y="508" font-family="Arial, sans-serif" font-size="31" fill="#202723">For the month of</text>
  <line x1="342" y1="512" x2="716" y2="512" stroke="#202723" stroke-width="3"/>
  <text x="366" y="502" font-family="Arial, sans-serif" font-size="31" font-weight="700" fill="#202723">${monthYear}</text>
  <text x="758" y="508" font-family="Arial, sans-serif" font-size="31" fill="#202723">by</text>
  <rect x="812" y="470" width="142" height="52" rx="6" fill="${paymentMethod === "Cash" ? "#dff0e6" : "#ffffff"}" stroke="#202723" stroke-width="3"/>
  <text x="883" y="505" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" font-weight="700" fill="#202723">Cash</text>
  <rect x="980" y="470" width="142" height="52" rx="6" fill="${paymentMethod === "GPay" ? "#dff0e6" : "#ffffff"}" stroke="#202723" stroke-width="3"/>
  <text x="1051" y="505" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" font-weight="700" fill="#202723">GPay</text>

  <rect x="98" y="574" width="368" height="82" rx="8" fill="#ffffff" stroke="#202723" stroke-width="4"/>
  <rect x="98" y="574" width="108" height="82" rx="8" fill="#f1f5f3" stroke="#202723" stroke-width="4"/>
  <text x="152" y="625" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="800" fill="#202723">Rs.</text>
  <text x="238" y="625" font-family="Arial, sans-serif" font-size="38" font-weight="800" fill="#b8322b">${amount}</text>

  <line x1="966" y1="620" x2="1288" y2="620" stroke="#202723" stroke-width="3"/>
  ${dynamicSignatureBase64 ? `<image x="1000" y="525" width="280" height="130" href="${dynamicSignatureBase64}" preserveAspectRatio="xMidYMid meet" filter="url(#remove-bg)"/>` : ""}
  <text x="1127" y="660" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" font-weight="700" fill="#202723">Treasurer</text>
</svg>`;
}

export function nextReceiptNumber(receipts) {
  let max = 0;
  for (const r of receipts) {
    const val = String(r.receiptNumber || "").trim();
    if (/^\d+$/.test(val)) max = Math.max(max, Number(val));
  }
  return String(max + 1).padStart(3, "0");
}
