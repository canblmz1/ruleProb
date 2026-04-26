import "dotenv/config";

export function getEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") return undefined;
  return value.trim();
}

export function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`${name} is required but was not found. Set it in your environment or .env file.`);
  }
  return value;
}
