type SemanticQuery = {
  metrics?: string[];
  dimensions?: string[];
  filters?: any[];
  filterGroups?: any[][];
  orderBy?: {
    field: string;
    direction: "asc" | "desc";
  };
  limit?: number;
};

type MetricDefinition =
  | string
  | {
      formula: string;
      table?: string;
    };

type SemanticModel = {
  entities: { name: string; columns: any[] }[];
  metrics: Record<string, MetricDefinition>;
  relationships: {
    from: string;
    to: string;
    on: string;
  }[];
};

function getMetricFormula(metricDef: MetricDefinition) {
  if (typeof metricDef === "string") {
    return metricDef;
  }

  return metricDef.formula;
}

function getMetricTable(metricDef: MetricDefinition) {
  if (typeof metricDef === "string") {
    return null;
  }

  return metricDef.table || null;
}

function getFieldType(field: string, model: SemanticModel) {
  const [entityName, columnName] = field.split(".");

  const entity = model.entities.find((e) => e.name === entityName);
  if (!entity) return null;

  const column = entity.columns.find((c: any) => c.name === columnName);
  if (!column) return null;

  return column.type;
}

function escapeSqlString(value: string) {
  return value.replace(/'/g, "''");
}

function buildFuzzyValue(value: string) {
  return escapeSqlString(value).trim().split(/\s+/).join("%");
}

function buildCondition(f: any, model: SemanticModel) {
  if (!f.field || !f.operator) {
    throw new Error("Invalid filter format");
  }

  const fieldType = getFieldType(f.field, model);
  const operator = String(f.operator).trim();
  const rawValue = f.value;

  // Fuzzy matching for text/string equality.
  // Example: "living room" -> ILIKE '%living%room%'
  // This also matches "Living Room Studio" and "living_room".
  if (
    (fieldType === "string" || fieldType === "text") &&
    operator === "=" &&
    typeof rawValue === "string"
  ) {
    const fuzzyValue = buildFuzzyValue(rawValue);
    return `${f.field} ILIKE '%${fuzzyValue}%'`;
  }

  if (
    (fieldType === "string" || fieldType === "text") &&
    operator === "!=" &&
    typeof rawValue === "string"
  ) {
    const fuzzyValue = buildFuzzyValue(rawValue);
    return `${f.field} NOT ILIKE '%${fuzzyValue}%'`;
  }

  let value;

  if (
    typeof rawValue === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(rawValue)
  ) {
    value = `'${escapeSqlString(rawValue)}'`;
  } else if (typeof rawValue === "number") {
    value = rawValue;
  } else {
    value = `'${escapeSqlString(String(rawValue))}'`;
  }

  return `${f.field} ${operator} ${value}`;
}

export function buildSQL(query: SemanticQuery, model: SemanticModel) {
  const {
    metrics = [],
    dimensions = [],
    filters = [],
    filterGroups = [],
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
    const metricDef = model.metrics[metric];

    if (!metricDef) {
      throw new Error(`Metric not found: ${metric}`);
    }

    const expr = getMetricFormula(metricDef);
    const metricTable = getMetricTable(metricDef);

    selectParts.push(`${expr} as ${metric}`);

    // Important for count(*) metrics
    if (metricTable) {
      tables.add(metricTable);
    }

    // Also detect table names inside formulas like sum(bookings.amount_paid)
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

  // ---- Resolve filter groups ----
  for (const group of filterGroups) {
    for (const f of group) {
      if (f.field) {
        const [entity] = f.field.split(".");
        tables.add(entity);
      }
    }
  }

  // ---- Build FROM + JOIN ----
  const tableList = Array.from(tables);

  if (tableList.length === 0) {
    throw new Error("No tables resolved");
  }

  const baseTable = tableList[0];

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

  const andConditions = filters.map((f) => buildCondition(f, model));

  const orGroupConditions = filterGroups.map((group) => {
    const groupConditions = group.map((f) => buildCondition(f, model));
    return `(${groupConditions.join(" AND ")})`;
  });

  const allConditions = [...andConditions];

  if (orGroupConditions.length > 0) {
    allConditions.push(`(${orGroupConditions.join(" OR ")})`);
  }

  if (allConditions.length > 0) {
    whereClause = `WHERE ${allConditions.join(" AND ")}`;
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