import postgres from "postgres";

export function getProjectDb(connectionString: string) {
  return postgres(connectionString, {
    ssl: "require",
  });
}