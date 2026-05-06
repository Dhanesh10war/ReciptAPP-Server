import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getReceipts, insertReceipt, deleteReceipt } from "./db.js";
import {
  whatsappSession,
  isSessionActive,
  startQrSession,
  logoutSession,
  sessionPayload,
  sendWhatsAppReceipt,
  normalizePhone,
  requestPairingCode
} from "./whatsapp.js";
import { validateReceipt, buildReceiptPayload, receiptSvg, nextReceiptNumber } from "./services/receipt.js";
import { svgToPdfBuffer } from "./services/pdf.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const receiptDir = path.resolve(__dirname, "data", "receipts");

fs.mkdir(receiptDir, { recursive: true }).catch(console.error);

const router = Router();

router.get("/api/contacts", async (req, res) => {
  try {
    const filePath = path.join(__dirname, "data", "contacts.json");
    const data = await fs.readFile(filePath, "utf-8");
    const contacts = JSON.parse(data);
    
    console.log(`[Contacts] Loaded ${contacts.length} static contacts from JSON.`);
    res.json({ ok: true, contacts });
  } catch (error) {
    console.error("[Contacts] Error reading static JSON:", error.message);
    res.json({ ok: false, error: "Failed to load static contacts" });
  }
});

router.get("/api/session", (req, res, next) => {
  try {
    res.json(sessionPayload());
  } catch (e) {
    next(e);
  }
});
router.post("/api/session/qr", async (req, res, next) => {
  try { res.json(await startQrSession()); } catch (e) { next(e); }
});
router.post("/api/session/logout", async (req, res, next) => {
  try { await logoutSession(); res.json(sessionPayload()); } catch (e) { next(e); }
});

router.post("/api/session/pair", async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;
    const code = await requestPairingCode(phoneNumber);
    res.json({ ok: true, code });
  } catch (e) {
    next(e);
  }
});

router.get("/api/meta", (req, res, next) => {
  try {
    const receipts = getReceipts();
    res.json({
      ok: true,
      nextNumber: nextReceiptNumber(receipts),
      whatsappConnected: isSessionActive(),
      whatsappPhone: whatsappSession.phone
    });
  } catch (e) {
    next(e);
  }
});

router.post("/api/receipts", async (req, res, next) => {
  try {
    const errors = validateReceipt(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ ok: false, errors });

    const receipt = buildReceiptPayload(req.body);
    console.log(`[Receipt] Generating SVG and PDF for receipt #${receipt.receiptNumber}...`);
    const svg = receiptSvg(receipt);
    const pdfBuffer = await svgToPdfBuffer(svg);
    console.log(`[Receipt] PDF generated successfully (${pdfBuffer.length} bytes).`);

    await fs.writeFile(path.join(receiptDir, `${receipt.id}.svg`), svg);
    await fs.writeFile(path.join(receiptDir, `${receipt.id}.pdf`), pdfBuffer);

    insertReceipt(receipt);

    const phones = Array.isArray(req.body.recipientPhones) ? req.body.recipientPhones : [req.body.recipientPhone];
    const uniquePhones = [...new Set(phones.map(normalizePhone).filter(Boolean))];

    const results = await Promise.all(uniquePhones.map(p => sendWhatsAppReceipt(p, receipt, pdfBuffer)));

    res.status(201).json({ ok: true, receipt, results });
  } catch (e) { next(e); }
});

router.get("/api/receipts", (req, res, next) => {
  try {
    res.json({ ok: true, receipts: getReceipts() });
  } catch (e) {
    next(e);
  }
});
router.delete("/api/receipts/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    if (deleteReceipt(id)) {
      await fs.unlink(path.join(receiptDir, `${id}.svg`)).catch(() => {});
      await fs.unlink(path.join(receiptDir, `${id}.pdf`)).catch(() => {});
      return res.json({ ok: true });
    }
    res.status(404).json({ ok: false, error: "Not found" });
  } catch (e) { next(e); }
});

export default router;
