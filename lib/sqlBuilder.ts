type SemanticQuery = {
  metrics?: string[];
  dimensions?: string[];
  filters?: any[];
  orderBy?: {
    field: string;
    direction: "asc" | "desc";
  };
  limit?: number;
};

type SemanticModel = {
  entities: { name: string; columns: any[] }[];
  metrics: Record<string, string>;
  relationships: {
    from: string;
    to: string;
    on: string;
  }[];
};

export function buildSQL(query: SemanticQuery, model: SemanticModel) {
  const {
    metrics = [],
    dimensions = [],
    filters = [],
    orderBy,
    limit = 50,
  } = query;

  const selectParts: string[] = [];
  const groupByParts: string[] = [];
  const tables = new Set<string>();

  const entityNames = model.entities.map((e) => e.name);

  // ---- Resolve dimensions ----
  for (const dim of dimensions) {
    const [entity, field] = dim.split(".");
    const column = `${entity}.${field}`;

    selectParts.push(column);
    groupByParts.push(column);
    tables.add(entity);
  }

  // ---- Resolve metrics ----
  for (const metric of metrics) {
    const expr = model.metrics[metric];

    if (!expr) {
      throw new Error(`Metric not found: ${metric}`);
    }

    selectParts.push(`${expr} as ${metric}`);

    for (const entity of entityNames) {
      if (expr.includes(`${entity}.`)) {
        tables.add(entity);
      }
    }
  }

  // ---- Resolve filters ----
  for (const f of filters) {
    if (f.field) {
      const [entity] = f.field.split(".");
      tables.add(entity);
    }
  }

  // ---- Build FROM + JOIN ----
  const tableList = Array.from(tables);

  if (tableList.length === 0) {
    throw new Error("No tables resolved");
  }

  const baseTable = tableList.includes("customers")
    ? "customers"
    : tableList[0];

  let fromClause = `FROM ${baseTable}`;

  const joined = new Set<string>();
  joined.add(baseTable);

  let progress = true;

  while (joined.size < tableList.length && progress) {
    progress = false;

    for (const rel of model.relationships) {
      if (
        joined.has(rel.from) &&
        !joined.has(rel.to) &&
        tableList.includes(rel.to)
      ) {
        fromClause += ` JOIN ${rel.to} ON ${rel.on}`;
        joined.add(rel.to);
        progress = true;
      } else if (
        joined.has(rel.to) &&
        !joined.has(rel.from) &&
        tableList.includes(rel.from)
      ) {
        fromClause += ` JOIN ${rel.from} ON ${rel.on}`;
        joined.add(rel.from);
        progress = true;
      }
    }
  }

  // ---- SELECT ----
  const selectClause = `SELECT ${selectParts.join(", ")}`;

  // ---- WHERE ----
  let whereClause = "";

  if (filters.length > 0) {
    const conditions = filters.map((f) => {
      if (!f.field || !f.operator) {
        throw new Error("Invalid filter format");
      }

      let value;

      // 🔥 ADD: detect date format (YYYY-MM-DD)
      if (
        typeof f.value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(f.value)
      ) {
        value = `'${f.value}'`; // date stays quoted
      } else if (typeof f.value === "number") {
        value = f.value;
      } else {
        value = `'${f.value}'`;
      }

      return `${f.field} ${f.operator} ${value}`;
    });

    whereClause = `WHERE ${conditions.join(" AND ")}`;
  }

  // ---- GROUP BY ----
  let groupByClause = "";
  if (metrics.length > 0 && groupByParts.length > 0) {
    groupByClause = `GROUP BY ${groupByParts.join(", ")}`;
  }

  // ---- ORDER BY ----
  let orderByClause = "";

  if (orderBy && orderBy.field) {
    orderByClause = `ORDER BY ${orderBy.field} ${
      orderBy.direction?.toUpperCase() || "DESC"
    }`;
  }

  // ---- LIMIT ----
  const limitClause = `LIMIT ${limit}`;

  const sql = `
    ${selectClause}
    ${fromClause}
    ${whereClause}
    ${groupByClause}
    ${orderByClause}
    ${limitClause}
  `;

  console.log("FINAL SQL:", sql);

  return sql;
}