/**
 * PrintNode (printnode.com): sends print jobs to the PrintNode client running
 * on a computer on the shop's wifi, which passes them to the Rollo. The API key
 * is the Firebase secret PRINTNODE_API_KEY (PrintNode → Account → API Keys).
 */
const API = "https://api.printnode.com";

export class PrintNodeError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export const isPrintNodeConfigured = (): boolean => !!process.env.PRINTNODE_API_KEY;

const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
  const key = process.env.PRINTNODE_API_KEY;
  if (!key) throw new PrintNodeError(503, "PrintNode isn't set up: the PRINTNODE_API_KEY secret is missing.");
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = (body && typeof body === "object" && body.message) || `PrintNode error (${response.status})`;
    throw new PrintNodeError(response.status, message);
  }
  return body;
};

export interface PrintNodePrinter {
  id: number;
  name: string;
  // "online" when PrintNode can see it.
  state: string;
  computer: { id: number; name: string; state: string };
}

/** Every printer on the account, with the computer it's attached to. */
export const listPrinters = async (): Promise<PrintNodePrinter[]> => {
  const printers = (await request("/printers")) as any[];
  return (printers || []).map((printer) => ({
    id: Number(printer.id),
    name: String(printer.name || printer.description || `Printer ${printer.id}`),
    state: String(printer.state || "unknown"),
    computer: {
      id: Number(printer.computer?.id),
      name: String(printer.computer?.name || ""),
      state: String(printer.computer?.state || "unknown"),
    },
  }));
};

/**
 * Queues one PDF on the printer and returns PrintNode's job id. PrintNode holds
 * the job until the computer is online, so a sleeping laptop prints it on wake.
 * `idempotencyKey` stops a retried call from printing twice; a repeat returns null.
 */
export const submitPdf = async (input: {
  printerId: number;
  title: string;
  pdf: Buffer;
  idempotencyKey?: string;
}): Promise<number | null> => {
  try {
    const id = await request("/printjobs", {
      method: "POST",
      headers: input.idempotencyKey ? { "X-Idempotency-Key": input.idempotencyKey } : {},
      body: JSON.stringify({
        printerId: input.printerId,
        title: input.title,
        contentType: "pdf_base64",
        content: input.pdf.toString("base64"),
        source: "Koinonia dashboard",
        options: { fit_to_page: true },
      }),
    });
    return Number(id);
  } catch (error) {
    // 409: a job with this key was already sent.
    if (error instanceof PrintNodeError && error.status === 409) return null;
    throw error;
  }
};
