import { buildSQL } from "./sqlBuilder";

const query = {
  metrics: ["realized_profit"],
  dimensions: ["customers.country"],
  limit: 10,
};

const model = {
  entities: {
    customers: {
      table: "customers",
      fields: {
        id: "id",
        country: "country",
      },
    },
    transactions: {
      table: "transactions",
      fields: {
        customer_id: "customer_id",
        price: "price",
        quantity: "quantity",
      },
    },
  },
  metrics: {
    realized_profit:
      "SUM((transactions.price - 10) * transactions.quantity)",
  },
  relationships: [
    {
      from: "transactions",
      to: "customers",
      on: "transactions.customer_id = customers.id",
    },
  ],
};

const sql = buildSQL(query, model);

console.log("\nGenerated SQL:\n");
console.log(sql);