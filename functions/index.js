// functions/index.js
const { onRequest } = require("firebase-functions/v2/https");
const sgMail = require("@sendgrid/mail");

const BUILD_TAG = "sendMail-2025-08-11-01h15";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "https://kdexpertise.be",
  "https://www.kdexpertise.be",
]);

function cors(req, res) {
  const o = req.headers.origin;
  if (ALLOWED_ORIGINS.has(o)) res.set("Access-Control-Allow-Origin", o);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).send(""); return true; }
  return false;
}

function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || ""); }
function esc(s = "") { return String(s).replace(/</g, "&lt;"); }

exports.sendMail = onRequest(
  {
    region: "europe-west1",
    secrets: [
      "SENDGRID_API_KEY",
      "MAIL_FROM_SECRET",
      "MAIL_ADMIN_SECRET",
    ],
  },
  async (req, res) => {
    if (cors(req, res)) return;

    try {
      if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

      const body = typeof req.body === "string"
        ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })()
        : (req.body || {});

      const {
        type, name, email, phone, message,
        subject, page, source, appointment
      } = body;

      if (!name || !isEmail(email) || !message) {
        return res.status(400).json({ error: "Champs manquants ou invalides" });
      }

      const sgKey = (process.env.SENDGRID_API_KEY || "").trim();
      if (!sgKey) return res.status(500).json({ error: "SENDGRID_API_KEY manquant" });
      sgMail.setApiKey(sgKey);

      const fromEmail = (process.env.MAIL_FROM_SECRET || "").trim();
      const adminEmail = (process.env.MAIL_ADMIN_SECRET || "").trim();
      if (!fromEmail || !adminEmail) {
        return res.status(500).json({ error: "MAIL_FROM_SECRET / MAIL_ADMIN_SECRET manquants" });
      }

      const now = new Date().toISOString();
      const ua = req.headers["user-agent"] || "";
      const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "";
      const referer = req.headers["referer"] || "";
      const finalSubject = `[${BUILD_TAG}] ${subject || `Contact${type ? ` (${type})` : ""} — ${name}`}`;

      const adminText =
`Nouveau message ${type ? `(${type})` : ""}
Nom: ${name}
Email: ${email}
${phone ? `Téléphone: ${phone}\n` : ""}${appointment ? `RDV souhaité: ${appointment}\n` : ""}${page ? `Page: ${page}\n` : ""}${source ? `Source: ${source}\n` : ""}Date: ${now}
IP: ${ip}
Referrer: ${referer}
User-Agent: ${ua}

Message:
${message}
`;

      const adminHtml = `
        <h3>Nouveau message ${type ? `(${type})` : ""}</h3>
        <ul>
          <li><b>Nom :</b> ${esc(name)}</li>
          <li><b>Email :</b> ${esc(email)}</li>
          ${phone ? `<li><b>Téléphone :</b> ${esc(phone)}</li>` : ""}
          ${appointment ? `<li><b>RDV souhaité :</b> ${esc(appointment)}</li>` : ""}
          ${page ? `<li><b>Page :</b> ${esc(page)}</li>` : ""}
          ${source ? `<li><b>Source :</b> ${esc(source)}</li>` : ""}
          <li><b>Date :</b> ${esc(now)}</li>
          <li><b>IP :</b> ${esc(ip)}</li>
          <li><b>Referrer :</b> ${esc(referer)}</li>
          <li><b>User-Agent :</b> ${esc(ua)}</li>
          <li><b>BUILD_TAG :</b> ${esc(BUILD_TAG)}</li>
        </ul>
        <h4>Message</h4>
        <pre style="white-space:pre-wrap;font-family:inherit">${esc(message)}</pre>
      `;

      const clientHtml = `
        <p>Bonjour ${esc(name)},</p>
        <p>Merci pour votre message. Nous vous répondrons dans les plus brefs délais.</p>
        ${appointment ? `<p><b>RDV souhaité :</b> ${esc(appointment)}</p>` : ""}
        <pre style="white-space:pre-wrap;font-family:inherit">${esc(message)}</pre>
        <p>Bien cordialement,<br/>KD Expertise</p>
      `;

      try {
        await sgMail.send([
          {
            to: adminEmail,
            from: { email: fromEmail, name: "KD Expertise" },
            replyTo: { email, name },
            subject: finalSubject,
            text: adminText,
            html: adminHtml,
          },
          {
            to: email,
            from: { email: fromEmail, name: "KD Expertise" },
            replyTo: { email: fromEmail, name: "KD Expertise" },
            subject: "Votre message a bien été reçu",
            text: message,
            html: clientHtml,
          },
        ]);
        return res.status(200).json({ ok: true, tag: BUILD_TAG });
      } catch (err) {
        console.error("SG ERROR BODY =", err?.response?.body);
        console.error("SG ERROR =", String(err));
        return res.status(502).json({ error: "SendGrid", details: err?.response?.body || String(err) });
      }
    } catch (e) {
      console.error("Erreur sendMail:", e);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  }
);
