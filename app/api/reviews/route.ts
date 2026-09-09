import { env } from "cloudflare:workers";

type ReviewInput = { name?: unknown; customerType?: unknown; companyName?: unknown; rating?: unknown; message?: unknown };

const googleReviewDates: Record<string, string> = {
  "Willy Halley": "2026-09-08T12:00:00.000Z",
  "Alexandra Ameline": "2026-09-06T12:00:00.000Z",
  "Gabin Merle": "2026-08-26T12:00:00.000Z",
};

async function ensureSchema() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    customer_type TEXT NOT NULL DEFAULT 'individual',
    company_name TEXT,
    rating INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
}

export async function GET() {
  await ensureSchema();
  const result = await env.DB.prepare("SELECT id, name, customer_type AS customerType, company_name AS companyName, rating, message, created_at AS createdAt FROM reviews ORDER BY created_at DESC LIMIT 200").all();
  const reviews = result.results
    .map((review) => ({
      ...review,
      createdAt:
        googleReviewDates[String(review.name)] ?? String(review.createdAt),
    }))
    .sort(
      (first, second) =>
        new Date(String(second.createdAt)).getTime() -
        new Date(String(first.createdAt)).getTime(),
    );
  return Response.json(reviews);
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as ReviewInput;
    const name = String(body.name ?? "").trim().slice(0, 50);
    const customerType = body.customerType === "company" ? "company" : "individual";
    const companyName = String(body.companyName ?? "").trim().slice(0, 80);
    const message = String(body.message ?? "").trim().slice(0, 600);
    const rating = Number(body.rating);
    if (name.length < 2) throw new Error("Merci d’indiquer votre prénom.");
    if (customerType === "company" && companyName.length < 2) throw new Error("Merci d’indiquer le nom de votre entreprise.");
    if (message.length < 10) throw new Error("Votre avis doit contenir au moins 10 caractères.");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("Choisissez une note de 1 à 5 étoiles.");
    const review = { id: crypto.randomUUID(), name, customerType, ...(customerType === "company" ? { companyName } : {}), rating, message, createdAt: new Date().toISOString() };
    await env.DB.prepare("INSERT INTO reviews (id, name, customer_type, company_name, rating, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(review.id, name, customerType, customerType === "company" ? companyName : null, rating, message, review.createdAt).run();
    return Response.json(review, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Avis invalide." }, { status: 400 });
  }
}
