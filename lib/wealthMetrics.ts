export const wealthMetrics = [
  {
    "name": "managed_aum_sgd",
    "businessName": "Assets Under Management (SGD)",
    "description": "Market value of managed holdings in SGD using one latest available SGD price per instrument as of the holdings snapshot. A missing price makes the group unavailable.",
    "synonyms": [
      "AUM",
      "managed assets",
      "holding value",
      "holdings market value",
      "portfolio market value"
    ],
    "table": "holdings",
    "formula": "CASE WHEN count(holdings.quantity * (SELECT px.price FROM public.instrument_prices px WHERE px.instrument_id = holdings.instrument_id AND px.price_date <= holdings.as_of_date AND px.currency = 'SGD' AND px.source = 'synthetic_demo' AND px.price_type = 'nav' ORDER BY px.price_date DESC, px.id DESC LIMIT 1)) = count(*) THEN sum(holdings.quantity * (SELECT px.price FROM public.instrument_prices px WHERE px.instrument_id = holdings.instrument_id AND px.price_date <= holdings.as_of_date AND px.currency = 'SGD' AND px.source = 'synthetic_demo' AND px.price_type = 'nav' ORDER BY px.price_date DESC, px.id DESC LIMIT 1)) END",
    "currency": "SGD",
    "allowedTables": [
      "holdings",
      "customers",
      "portfolios"
    ]
  },
  {
    "name": "holding_cost_sgd",
    "businessName": "Holdings Cost Basis (SGD)",
    "description": "Total acquisition cost from quantity times average unit cost in SGD.",
    "synonyms": [
      "cost basis",
      "book cost",
      "purchase cost"
    ],
    "table": "holdings",
    "formula": "CASE WHEN count(CASE WHEN holdings.cost_currency = 'SGD' THEN holdings.quantity * holdings.avg_price END) = count(*) THEN sum(CASE WHEN holdings.cost_currency = 'SGD' THEN holdings.quantity * holdings.avg_price END) END",
    "currency": "SGD",
    "allowedTables": [
      "holdings",
      "customers",
      "portfolios"
    ]
  },
  {
    "name": "unrealized_pnl_sgd",
    "businessName": "Unrealized Gain or Loss (SGD)",
    "description": "Market value less acquisition cost for managed holdings.",
    "synonyms": [
      "unrealized P&L",
      "unrealised gain",
      "paper gain"
    ],
    "table": "holdings",
    "formula": "CASE WHEN count((holdings.quantity * (SELECT px.price FROM public.instrument_prices px WHERE px.instrument_id = holdings.instrument_id AND px.price_date <= holdings.as_of_date AND px.currency = 'SGD' AND px.source = 'synthetic_demo' AND px.price_type = 'nav' ORDER BY px.price_date DESC, px.id DESC LIMIT 1)) - (CASE WHEN holdings.cost_currency = 'SGD' THEN holdings.quantity * holdings.avg_price END)) = count(*) THEN sum((holdings.quantity * (SELECT px.price FROM public.instrument_prices px WHERE px.instrument_id = holdings.instrument_id AND px.price_date <= holdings.as_of_date AND px.currency = 'SGD' AND px.source = 'synthetic_demo' AND px.price_type = 'nav' ORDER BY px.price_date DESC, px.id DESC LIMIT 1)) - (CASE WHEN holdings.cost_currency = 'SGD' THEN holdings.quantity * holdings.avg_price END)) END",
    "currency": "SGD",
    "allowedTables": [
      "holdings",
      "customers",
      "portfolios"
    ]
  },
  {
    "name": "declared_assets_sgd",
    "businessName": "Declared Assets (SGD)",
    "description": "Ownership-adjusted assets in the latest declared financial snapshot, excluding managed holdings.",
    "synonyms": [
      "declared assets",
      "external assets",
      "personal assets",
      "assets"
    ],
    "table": "customers",
    "formula": "CASE WHEN count(*) = count((SELECT CASE WHEN count(*) = count(*) FILTER (WHERE pos.currency = 'SGD') THEN coalesce(sum(pos.amount * pos.ownership_pct / 100), 0) END FROM public.customer_financial_positions pos WHERE pos.financial_profile_id = (SELECT fp.id FROM public.customer_financial_profiles fp WHERE fp.customer_id = customers.id AND fp.as_of_date <= CURRENT_DATE ORDER BY fp.as_of_date DESC, fp.id DESC LIMIT 1) AND pos.position_type = 'asset' HAVING EXISTS (SELECT 1 FROM public.customer_financial_profiles fp WHERE fp.customer_id = customers.id AND fp.as_of_date <= CURRENT_DATE))) THEN sum((SELECT CASE WHEN count(*) = count(*) FILTER (WHERE pos.currency = 'SGD') THEN coalesce(sum(pos.amount * pos.ownership_pct / 100), 0) END FROM public.customer_financial_positions pos WHERE pos.financial_profile_id = (SELECT fp.id FROM public.customer_financial_profiles fp WHERE fp.customer_id = customers.id AND fp.as_of_date <= CURRENT_DATE ORDER BY fp.as_of_date DESC, fp.id DESC LIMIT 1) AND pos.position_type = 'asset')) END",
    "currency": "SGD",
    "allowedTables": [
      "customers"
    ]
  },
  {
    "name": "declared_liabilities_sgd",
    "businessName": "Declared Liabilities (SGD)",
    "description": "Ownership-adjusted liabilities in the latest declared financial snapshot.",
    "synonyms": [
      "liabilities",
      "debt",
      "declared debt"
    ],
    "table": "customers",
    "formula": "CASE WHEN count(*) = count((SELECT CASE WHEN count(*) = count(*) FILTER (WHERE pos.currency = 'SGD') THEN coalesce(sum(pos.amount * pos.ownership_pct / 100), 0) END FROM public.customer_financial_positions pos WHERE pos.financial_profile_id = (SELECT fp.id FROM public.customer_financial_profiles fp WHERE fp.customer_id = customers.id AND fp.as_of_date <= CURRENT_DATE ORDER BY fp.as_of_date DESC, fp.id DESC LIMIT 1) AND pos.position_type = 'liability' HAVING EXISTS (SELECT 1 FROM public.customer_financial_profiles fp WHERE fp.customer_id = customers.id AND fp.as_of_date <= CURRENT_DATE))) THEN sum((SELECT CASE WHEN count(*) = count(*) FILTER (WHERE pos.currency = 'SGD') THEN coalesce(sum(pos.amount * pos.ownership_pct / 100), 0) END FROM public.customer_financial_positions pos WHERE pos.financial_profile_id = (SELECT fp.id FROM public.customer_financial_profiles fp WHERE fp.customer_id = customers.id AND fp.as_of_date <= CURRENT_DATE ORDER BY fp.as_of_date DESC, fp.id DESC LIMIT 1) AND pos.position_type = 'liability')) END",
    "currency": "SGD",
    "allowedTables": [
      "customers"
    ]
  },
  {
    "name": "declared_net_worth_sgd",
    "businessName": "Declared Net Worth (SGD)",
    "description": "Ownership-adjusted declared assets less liabilities in the latest financial snapshot, excluding managed holdings.",
    "synonyms": [
      "net worth",
      "declared net worth"
    ],
    "table": "customers",
    "formula": "CASE WHEN count(*) = count((SELECT CASE WHEN count(*) = count(*) FILTER (WHERE pos.currency = 'SGD') THEN coalesce(sum(CASE WHEN pos.position_type = 'asset' THEN pos.amount * pos.ownership_pct / 100 ELSE -(pos.amount * pos.ownership_pct / 100) END), 0) END FROM public.customer_financial_positions pos WHERE pos.financial_profile_id = (SELECT fp.id FROM public.customer_financial_profiles fp WHERE fp.customer_id = customers.id AND fp.as_of_date <= CURRENT_DATE ORDER BY fp.as_of_date DESC, fp.id DESC LIMIT 1)  HAVING EXISTS (SELECT 1 FROM public.customer_financial_profiles fp WHERE fp.customer_id = customers.id AND fp.as_of_date <= CURRENT_DATE))) THEN sum((SELECT CASE WHEN count(*) = count(*) FILTER (WHERE pos.currency = 'SGD') THEN coalesce(sum(CASE WHEN pos.position_type = 'asset' THEN pos.amount * pos.ownership_pct / 100 ELSE -(pos.amount * pos.ownership_pct / 100) END), 0) END FROM public.customer_financial_positions pos WHERE pos.financial_profile_id = (SELECT fp.id FROM public.customer_financial_profiles fp WHERE fp.customer_id = customers.id AND fp.as_of_date <= CURRENT_DATE ORDER BY fp.as_of_date DESC, fp.id DESC LIMIT 1) )) END",
    "currency": "SGD",
    "allowedTables": [
      "customers"
    ]
  }
];
