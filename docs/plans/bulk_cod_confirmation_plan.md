# Upcraft Shopify — Bulk COD Draft Order Confirmation System
## Comprehensive Architecture & Implementation Plan

**Target API:** Shopify Admin GraphQL API `2026-10`  
**Application Scope:** Internal Operations Dashboard for Bulk Cash-on-Delivery (COD) Draft Order Confirmation  
**Reference Document:** `docs/Shopify_Bulk_COD_Draft_Order_Confirmation_Guide.docx`  

---

## 1. Executive Summary & Core Mandate

The **Upcraft Shopify Bulk COD Confirmation** platform is a secure, high-throughput internal operations product. It enables authorized e-commerce operations staff to:
1. Retrieve open draft orders from Shopify Admin GraphQL API (`2026-10`).
2. Filter and inspect COD eligibility evidence (tags, note attributes, shipping addresses, customer contacts).
3. Select up to 70 drafts across multiple paginated pages without losing selection state.
4. Review selected drafts with financial summaries, anomaly warnings, and inventory commitment disclosures.
5. Provide explicit safety confirmation by typing a verification phrase (`CONFIRM <N> ORDERS`).
6. Execute conversions sequentially with rate-limit throttling using Shopify's `draftOrderComplete` GraphQL mutation.
7. Maintain strict COD financial discipline: **never** mark orders as paid or fulfilled automatically upon conversion; orders remain in `PAYMENT_DUE` / `UNPAID` status.
8. Reconcile uncertain outcomes (`UNKNOWN` status resulting from network timeouts or drops) before any retry to prevent duplicate order generation.
9. Support both **Live Shopify GraphQL API** mode and a built-in **High-Fidelity Mock Simulator** for zero-risk local staging, testing, and operational demonstrations.

---

## 2. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Upcraft Shopify React Dashboard                      │
│   - Multi-Page Selection Matrix (1-70 cap)  - Anomaly Badging          │
│   - Typed Confirmation Safety Gate           - Real-time Progress Bar  │
│   - Single Draft Test Runner                 - CSV Export & Audit Log  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ HTTPS / REST API
┌────────────────────────────────────▼───────────────────────────────────┐
│               Upcraft Shopify Node.js / Express Core                   │
│   - RBAC & Staff Session Security            - Request Validation      │
│   - Sequential Throttled Queue Worker        - Reconciliation Engine   │
│   - Audit Event Logger                       - Rate-Limit Backoff      │
└──────────────┬──────────────────────────────────────────┬──────────────┘
               │                                          │
┌──────────────▼─────────────┐              ┌─────────────▼──────────────┐
│  Persistent SQLite Engine  │              │  Shopify Admin GraphQL     │
│  - BulkJobs & JobItems     │              │  Version: 2026-10          │
│  - AuditEvents & StaffUsers│              │  - draftOrders (Query)     │
│  - Store Configuration     │              │  - draftOrderComplete (Mut)│
│  - Processing Claims       │              │  - node / draftOrder (Rec) │
└────────────────────────────┘              └────────────────────────────┘
```

---

## 3. Data Schema (SQLite Engine)

### 3.1 `store_config`
- `id`: INTEGER PRIMARY KEY (singleton = 1)
- `store_domain`: TEXT NOT NULL (e.g., `brand-store.myshopify.com`)
- `access_token`: TEXT NOT NULL (masked on read)
- `api_version`: TEXT NOT NULL DEFAULT '2026-10'
- `cod_marker_type`: TEXT NOT NULL DEFAULT 'TAG' ('TAG' | 'NOTE_ATTRIBUTE' | 'ANY')
- `cod_marker_value`: TEXT NOT NULL DEFAULT 'COD'
- `cod_payment_gateway_id`: TEXT NULL
- `max_batch_size`: INTEGER NOT NULL DEFAULT 70
- `rate_limit_delay_ms`: INTEGER NOT NULL DEFAULT 400
- `mock_mode`: BOOLEAN NOT NULL DEFAULT 0
- `updated_at`: DATETIME DEFAULT CURRENT_TIMESTAMP

### 3.2 `staff_users`
- `id`: TEXT PRIMARY KEY (UUID)
- `username`: TEXT UNIQUE NOT NULL
- `password_hash`: TEXT NOT NULL
- `full_name`: TEXT NOT NULL
- `email`: TEXT NOT NULL
- `role`: TEXT NOT NULL DEFAULT 'OPERATOR' ('ADMIN' | 'OPERATOR')
- `is_active`: BOOLEAN NOT NULL DEFAULT 1
- `created_at`: DATETIME DEFAULT CURRENT_TIMESTAMP

### 3.3 `bulk_jobs`
- `id`: TEXT PRIMARY KEY (UUID)
- `store_domain`: TEXT NOT NULL
- `created_by`: TEXT NOT NULL
- `status`: TEXT NOT NULL DEFAULT 'PENDING' ('PENDING' | 'RUNNING' | 'COMPLETED' | 'PARTIALLY_FAILED' | 'FAILED' | 'CANCELLED')
- `requested_count`: INTEGER NOT NULL
- `success_count`: INTEGER NOT NULL DEFAULT 0
- `failed_count`: INTEGER NOT NULL DEFAULT 0
- `unknown_count`: INTEGER NOT NULL DEFAULT 0
- `currency`: TEXT NOT NULL DEFAULT 'INR'
- `total_amount`: REAL NOT NULL DEFAULT 0.0
- `started_at`: DATETIME NULL
- `completed_at`: DATETIME NULL
- `created_at`: DATETIME DEFAULT CURRENT_TIMESTAMP

### 3.4 `bulk_job_items`
- `id`: TEXT PRIMARY KEY (UUID)
- `job_id`: TEXT NOT NULL REFERENCES `bulk_jobs(id)` ON DELETE CASCADE
- `draft_order_id`: TEXT NOT NULL (Shopify GID: `gid://shopify/DraftOrder/...`)
- `draft_order_name`: TEXT NOT NULL (e.g. `#D1042`)
- `customer_name`: TEXT NULL
- `customer_phone`: TEXT NULL
- `total_amount`: REAL NOT NULL DEFAULT 0.0
- `currency`: TEXT NOT NULL DEFAULT 'INR'
- `status`: TEXT NOT NULL DEFAULT 'PENDING' ('PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN')
- `shopify_order_id`: TEXT NULL (Shopify GID: `gid://shopify/Order/...`)
- `shopify_order_name`: TEXT NULL (e.g. `#1089`)
- `payment_gateway_names`: TEXT NULL
- `display_financial_status`: TEXT NULL
- `error_code`: TEXT NULL
- `error_message`: TEXT NULL
- `attempts`: INTEGER NOT NULL DEFAULT 0
- `last_attempt_at`: DATETIME NULL
- `reconciled_at`: DATETIME NULL
- UNIQUE(`job_id`, `draft_order_id`)

### 3.5 `audit_events`
- `id`: TEXT PRIMARY KEY (UUID)
- `actor`: TEXT NOT NULL
- `action`: TEXT NOT NULL
- `target_type`: TEXT NOT NULL
- `target_id`: TEXT NULL
- `metadata`: TEXT NULL (JSON payload)
- `ip_address`: TEXT NULL
- `timestamp`: DATETIME DEFAULT CURRENT_TIMESTAMP

---

## 4. Shopify GraphQL Operations (`2026-10`)

### 4.1 Query Open Draft Orders
```graphql
query GetDraftOrders($first: Int!, $after: String, $query: String) {
  draftOrders(first: $first, after: $after, query: $query) {
    nodes {
      id
      name
      status
      createdAt
      email
      phone
      tags
      note2
      customer {
        id
        firstName
        lastName
        email
        phone
      }
      shippingAddress {
        address1
        city
        province
        zip
        country
        phone
      }
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      lineItems(first: 50) {
        nodes {
          id
          title
          quantity
          originalUnitPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      endCursor
      startCursor
    }
  }
}
```

### 4.2 Single Draft Order Completion Mutation
```graphql
mutation CompleteDraft($id: ID!, $paymentGatewayId: Identifier) {
  draftOrderComplete(id: $id, paymentGatewayId: $paymentGatewayId) {
    draftOrder {
      id
      status
      order {
        id
        name
        displayFinancialStatus
        paymentGatewayNames
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

### 4.3 Timeout & Unknown State Reconciliation Query
```graphql
query ReconcileDraftOrder($id: ID!) {
  node(id: $id) {
    ... on DraftOrder {
      id
      name
      status
      order {
        id
        name
        displayFinancialStatus
        paymentGatewayNames
      }
    }
  }
}
```

---

## 5. Reliability, Deduplication & Reconciliation Lifecycle

When processing bulk draft orders, the following state machine protects against double orders:

```
[ PENDING ] 
     │
     ▼ (Acquire Processing Claim)
[ PROCESSING ]
     │
     ├───► [ SUCCEEDED ] (Shopify returns valid Order GID)
     │
     ├───► [ FAILED ] (Shopify userErrors or invalid preconditions)
     │
     └───► [ UNKNOWN ] (Network timeout, HTTP 5xx, or disconnect)
               │
               ▼ (Reconciliation Engine re-queries Draft by GID)
         ┌─────────────┴─────────────┐
         ▼                           ▼
   Draft is COMPLETED          Draft is still OPEN
   Order exists:               Reconcile to FAILED or
   Reconcile to [ SUCCEEDED ]  mark [ RETRY_READY ]
```

---

## 6. Safety & Verification Rules

1. **Hard 70-Item Selection Cap**: The UI and backend strictly block any batch exceeding 70 drafts.
2. **COD Marker Verification**: Drafts without configured COD tags or attributes are flagged with warnings and excluded unless manually overridden by an admin.
3. **Double Click Prevention**: Explicit typed verification phrase (`CONFIRM <N> ORDERS`).
4. **Single Test Run Mode**: Operators can verify a single draft first to check that `paymentGatewayNames` and `displayFinancialStatus` match expectations before launching 60-70 drafts.
5. **Rate-Limiting Protection**: Calls are spaced by default 400ms apart to adhere to Shopify GraphQL leaky bucket cost limits.

