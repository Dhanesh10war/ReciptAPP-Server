import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const waAuthDir = path.resolve(process.cwd(), "data", "wa-auth");

export const whatsappSession = {
  connected: false,
  phone: "",
  qrSvg: "",
  qrCreatedAt: "",
  connectedAt: "",
  status: "starting",
  lastError: ""
};

const logger = pino({ level: "silent" });
let sock = null;
let starting = null;

export function normalizePhone(input = "") {
  let cleaned = String(input).replace(/\D/g, "");
  if (cleaned.length === 10) cleaned = "91" + cleaned;
  return cleaned;
}

export function isSessionActive() {
  return whatsappSession.connected;
}

export async function startWhatsAppConnector() {
  if (sock || starting) return starting;

  starting = (async () => {
    try {
      await fs.mkdir(waAuthDir, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(waAuthDir);
      const { version } = await fetchLatestBaileysVersion();

      sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        browser: ["Windows", "Chrome", "11.0.0"]
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          whatsappSession.qrSvg = await QRCode.toString(qr, { type: "svg", margin: 1 });
          whatsappSession.qrCreatedAt = new Date().toISOString();
          whatsappSession.status = "qr";
        }

        if (connection === "open" && sock) {
          whatsappSession.connected = true;
          whatsappSession.phone = sock.user?.id?.split(":")[0] || "";
          whatsappSession.status = "connected";
          whatsappSession.qrSvg = "";
          whatsappSession.lastError = "";
        }

        if (connection === "close") {
          const code = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = code !== DisconnectReason.loggedOut;
          whatsappSession.connected = false;
          whatsappSession.status = shouldReconnect ? "disconnected" : "logged_out";
          sock = null;
          starting = null;
          if (shouldReconnect) setTimeout(startWhatsAppConnector, 5000);
        }
      });

      return sock;
    } catch (err) {
      sock = null;
      starting = null;
      throw err;
    }
  })();

  return starting;
}

export async function requestPairingCode(phone) {
  const cleanPhone = normalizePhone(phone);
  console.log(`[WhatsApp] Requesting code for: ${cleanPhone}`);

  // Wipe session for fresh pairing
  await fs.rm(waAuthDir, { recursive: true, force: true }).catch(() => { });
  await fs.mkdir(waAuthDir, { recursive: true });

  sock = null;
  starting = null;

  const s = await startWhatsAppConnector();

  // Wait for socket to be ready
  await new Promise(r => setTimeout(r, 8000));

  if (!sock) throw new Error("Connection failed to start");

  try {
    const code = await sock.requestPairingCode(cleanPhone);
    console.log(`[WhatsApp] CODE: ${code}`);
    return code;
  } catch (err) {
    console.error("[WhatsApp] Pairing Error:", err.message);
    throw err;
  }
}

export function sessionPayload() {
  return {
    ok: true,
    connected: whatsappSession.connected,
    phone: whatsappSession.phone,
    qrSvg: whatsappSession.qrSvg,
    status: whatsappSession.status,
    lastError: whatsappSession.lastError
  };
}

export async function startQrSession() {
  await startWhatsAppConnector();
  return sessionPayload();
}

export async function logoutSession() {
  if (sock) await sock.logout().catch(() => { });
  await fs.rm(waAuthDir, { recursive: true, force: true }).catch(() => { });
  whatsappSession.connected = false;
  whatsappSession.status = "starting";
}

export async function sendWhatsAppReceipt(to, receipt, pdfBuffer) {
  if (!sock) {
    console.log("[WhatsApp] No socket, trying to reconnect...");
    await startWhatsAppConnector();
    await new Promise(r => setTimeout(r, 5000));
  }
  
  if (!sock || !whatsappSession.connected) {
    console.error("[WhatsApp] Failed to send: Not connected");
    return { ok: false, error: "Not connected" };
  }

  try {
    const jid = `${normalizePhone(to)}@s.whatsapp.net`;
    console.log(`[WhatsApp] Sending PDF to ${jid}...`);
    
    await sock.sendMessage(jid, {
      document: pdfBuffer,
      fileName: `receipt-${receipt.receiptNumber}.pdf`,
      mimetype: "application/pdf",
      caption: `JCI Receipt #${receipt.receiptNumber} for ${receipt.payerName}`
    });
    
    console.log(`[WhatsApp] SUCCESS: Receipt #${receipt.receiptNumber} sent.`);
    return { ok: true };
  } catch (err) {
    console.error("[WhatsApp] SEND ERROR:", err.message);
    try {
      await new Promise(r => setTimeout(r, 2000));
      if (sock) {
         const jid = `${normalizePhone(to)}@s.whatsapp.net`;
         await sock.sendMessage(jid, {
           document: pdfBuffer,
           fileName: `receipt-${receipt.receiptNumber}.pdf`,
           mimetype: "application/pdf"
         });
         return { ok: true };
      }
    } catch (e) {}
    return { ok: false, error: err.message };
  }
}

// Auto-start on boot if credentials exist
(async () => {
  try {
    const credsFile = path.join(waAuthDir, "creds.json");
    const exists = await fs.access(credsFile).then(() => true).catch(() => false);
    if (exists) {
      console.log("[WhatsApp] Saved session found. Auto-connecting...");
      startWhatsAppConnector().catch(err => {
        console.error("[WhatsApp] Auto-connection error:", err.message);
      });
    }
  } catch (e) {
    console.error("[WhatsApp] Startup check failed:", e.message);
  }
})();
