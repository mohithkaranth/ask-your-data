export async function getTableSchema(db: any, table: string) {
  const res = await db`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = ${table}
    ORDER BY ordinal_position
  `;

  return res.map((col: any) => {
    let type = "string";

    if (
      col.data_type.includes("int") ||
      col.data_type.includes("numeric") ||
      col.data_type.includes("double") ||
      col.data_type.includes("real")
    ) {
      type = "number";
    }

    if (
      col.data_type.includes("date") ||
      col.data_type.includes("timestamp")
    ) {
      type = "date";
    }

    return {
      name: col.column_name,
      type,
    };
  });
}