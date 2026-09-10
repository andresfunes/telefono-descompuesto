import "server-only";

export function getSupabaseSecretKey(): string {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Falta SUPABASE_SECRET_KEY en el entorno del servidor.");
  }
  return secretKey;
}
