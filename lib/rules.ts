// Hard-rule checks shared by ingest, approve and the queue UI.

// Pay/base/$ questions are never auto-drafted or auto-sent.
export const PAY = /\$|\bpay(s|ing|out|outs|ment|ments)?\b|\bpaid\b|\bbase\b|\brates?\b|\binvoice\b|\bcompensation\b/i;

// Bot drafts sometimes leave "[CONFIRM: ...]" style blanks; those must be filled before sending.
export const PLACEHOLDER = /\[(confirm|todo|tbd|fill|insert|name|number|x)\b[^\]]*\]/i;
