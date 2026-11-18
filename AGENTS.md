# Upcraft Shopify — Project Rules & Guidelines

**Product:** Bulk Shopify COD Draft Order Confirmation Platform  
**Target:** Shopify Admin GraphQL API 2026-10  
**Stack:** Node.js (v24), Express, React SPA Dashboard, SQLite (`node:sqlite`), Tailwind CSS  

---

## 1. Project Overview

`upcraft-shopify` is an internal operations platform designed for Shopify e-commerce merchants and customer support teams. It enables staff to securely review and convert open Cash-on-Delivery (COD) draft orders into official Shopify orders in batches of up to 70 at a time using Shopify's Admin GraphQL API (`2026-10`). 

The product enforces strict Cash-on-Delivery safeguards:
- Converts drafts to orders using `draftOrderComplete`.
- Orders remain in `PAYMENT_DUE` / `UNPAID` status (never marked paid or fulfilled automatically).
- Guarantees selection persistence across multi-page pagination with a strict 70-item cap.
- Eliminates duplicate order risks via an active processing claim state machine and timeout reconciliation engine.
- Offers dual runtime modes: Live Shopify GraphQL API and a High-Fidelity Mock Simulator for zero-risk local validation.

---

## 2. Directory Structure

```
upcraft-shopify/
├── .agents/                    # Workspace agent rules & project skills
├── docs/                       # Architecture plans, completed tasks & modules
├── src/
│   ├── server/                 # Node.js + Express backend
│   │   ├── config.js           # Environment & runtime settings
│   │   ├── db.js               # SQLite database client & migrations
│   │   ├── shopify.js          # Shopify Admin GraphQL client (2026-10)
│   │   ├── mock-data.js        # High-fidelity Shopify mock fixtures
│   │   ├── queue.js            # Sequential throttled job runner
│   │   ├── reconciliation.js   # UNKNOWN state reconciliation engine
│   │   ├── auth.js             # Staff authentication & RBAC
│   │   ├── routes.js           # REST API endpoints
│   │   └── index.js            # Express server entry point
│   └── client/                 # React SPA Dashboard & static bundle
│       ├── index.html          # Main HTML entry
│       ├── app.js              # Complete interactive React dashboard
│       └── styles.css          # Styling & theme variables
├── tests/                      # Automated test suite
│   ├── test_db.js              # Database & migrations tests
│   ├── test_shopify.js         # GraphQL client & mock tests
│   ├── test_queue.js           # Job execution & reconciliation tests
│   └── test_api.js             # End-to-end REST API tests
├── package.json                # Project manifest
├── .env.example                # Example configuration
└── README.md                   # Setup and usage guide
```

---

## 3. Pre-Approved Safe Commands

The following commands are pre-approved for autonomous execution:
- Start server: `node src/server/index.js`
- Run test suite: `node tests/test_all.js`
- Inspect database: `node -e "const { getDb } = require('./src/server/db'); ..."`
- Check health: `curl -I http://localhost:4000/api/health`

---

## 4. Key Security & Operational Principles

1. **Token Protection:** Never expose the Shopify Admin API token to the client. Keep all GraphQL requests on the server.
2. **Never Mark COD Orders Paid:** COD orders must only commit inventory and convert to regular orders with financial status `PAYMENT_DUE` / `PENDING`.
3. **No Blind Retries:** If a timeout occurs, assign status `UNKNOWN`. Reconcile by querying the draft GID before any retry.
4. **Typed Confirmation Phrase:** Enforce the typed phrase `CONFIRM <N> ORDERS` in the UI to prevent unintended bulk submissions.

