// src/services/firebaseMail.ts — REMPLACE TOUT (ajout du champ appointment)
export type SendMailPayload = {
  type: string;
  name: string;
  email: string;
  phone?: string;
  message: string;
  subject?: string;
  page?: string;
  source?: string;
  appointment?: string; // nouveau (optionnel)
};

export async function sendMail(payload: SendMailPayload) {
  const res = await fetch(import.meta.env.VITE_SENDMAIL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : "Erreur serveur";
    const det = data?.details ? ` / ${JSON.stringify(data.details)}` : "";
    throw new Error(`${msg}${det}`);
  }
  return data;
}
