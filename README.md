# Upcraft Shopify — Bulk COD Draft Order Confirmation Platform

> Enterprise-grade internal operations dashboard for e-commerce merchants to review and convert open Cash-on-Delivery (COD) draft orders into official Shopify orders in batches of up to 70 at a time using Shopify Admin GraphQL API (`2026-10`).

---

## 1. Key Capabilities & Safety Architecture

- **Shopify Admin GraphQL Pinned Version:** Targets the official `2026-10` API version using `draftOrderComplete` and `draftOrders` cursor pagination.
- **Strict COD Payment Safeguard:** Converted orders **remain in `PAYMENT_DUE` / `PENDING` status** until cash is physically collected and reconciled. They are never marked as paid or fulfilled automatically.
- **Multi-Page Selection Matrix:** Supports selecting up to 70 drafts across multiple pages with selection persistence.
- **Explicit Safety Confirmation Gate:** Requires typing `CONFIRM <N> ORDERS` before execution to eliminate accidental triggers.
- **Double-Order Prevention & Timeout Reconciliation:** Network timeouts mark items as `UNKNOWN`. An integrated reconciliation engine queries the DraftOrder GID before allowing any retry.
- **Throttling & Leaky Bucket Protection:** Spaced sequential execution (default 400ms delay) respects Shopify API cost limits.
- **Dual Runtime Modes:** Seamlessly toggles between **Live Shopify Store API** and a built-in **High-Fidelity Mock Simulator** (with 75 realistic test drafts, edge cases, and simulated timeouts).
- **Interactive Ant Design Operations Dashboard:**
  - Built with **Ant Design (v6)** (`ConfigProvider`, `Layout`, `Table`, `Modal`, `Statistic`, `Progress`, `Tag`, `Badge`, `Alert`) with dark theme.
  - Expandable nested line items table (`expandedRowRender`).
  - Cross-page persistent selection using Ant Design `rowSelection` with `preserveSelectedRowKeys`.
  - Floating action pill bar for bulk review.
  - Interactive modals for review with typed safety phrase (`CONFIRM <N> ORDERS`), live progress tracker with animated progress bar, single test runner, audit trail, and CSV export.

---

## 2. Quickstart

### Prerequisites
- Node.js v24.x (uses native `node:sqlite` and native `fetch`)

### Launch Application
```bash
# Start the server (serves both API and React SPA on port 4000)
node src/server/index.js
```
Open **`http://localhost:4000`** in your browser.

### Default Staff Credentials
| Role | Username | Password | Permissions |
|---|---|---|---|
| **Admin** | `admin` | `Upcraft2026!` | Store config, test connections, bulk executions, audit |
| **Operator** | `operator` | `Operator2026!` | Review drafts, single tests, confirmed bulk jobs |

---

## 3. Automated Test Suite

Run the full end-to-end automated test suite:
```bash
node tests/test_all.js
```

### Scenarios Verified:
1. Staff authentication & password hashing
2. Open draft orders retrieval & cursor pagination
3. Hard 70-item selection cap enforcement
4. Single COD draft test run with verified `PENDING` financial status
5. Sequential throttled bulk job execution
6. Out-of-stock userErrors handling
7. Network timeout `UNKNOWN` state reconciliation
8. Persistent operational audit trail in SQLite

---

## 4. REST API Contract

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Authenticate staff member |
| `GET` | `/api/auth/me` | Current staff profile & role |
| `GET` | `/api/draft-orders` | Fetch open drafts with cursor pagination |
| `POST` | `/api/draft-orders/verify` | Verify eligibility of draft IDs |
| `POST` | `/api/draft-orders/test-single` | Controlled single test conversion |
| `POST` | `/api/bulk-jobs` | Create bulk confirmation job (1-70 drafts) |
| `GET` | `/api/bulk-jobs` | List recent bulk jobs |
| `GET` | `/api/bulk-jobs/:jobId` | Get job progress & item breakdown |
| `POST` | `/api/bulk-jobs/:jobId/start` | Start confirmed job worker |
| `POST` | `/api/bulk-jobs/:jobId/cancel` | Cancel remaining unprocessed items |
| `POST` | `/api/bulk-jobs/:jobId/items/:itemId/reconcile` | Reconcile timed-out item |
| `GET` | `/api/bulk-jobs/:jobId/export` | Download execution CSV report |
| `GET` | `/api/audit-logs` | Retrieve operational audit events |
| `GET` | `/api/config` | View current store configuration |
| `PUT` | `/api/config` | Update store settings (Admin only) |
| `POST` | `/api/config/test-connection` | Verify Shopify token & scopes |
| `GET` | `/api/health` | Service health status |

---

## 5. Production Docker Deployment

```bash
docker compose up -d
```
Accessible at `http://localhost:4000`. Persistent database stored in named volume `shopify_data`.

