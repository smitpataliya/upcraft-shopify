# Shopify Custom App & API Credentials Guide

Step-by-step instructions to generate **Client ID**, **Client Secret**, and **Admin API Access Token** (`shpat_...`) for connecting **Upcraft Shopify Bulk COD Confirmation** to your live Shopify store (`b5nyri-eu.myshopify.com`).

---

## Method 1: Shopify Admin Custom App (Recommended for Single Store)

This is the fastest and standard method for dedicated merchant stores.

### Step 1: Enable App Development
1. Open **Shopify Admin** (`https://admin.shopify.com/store/b5nyri-eu`)
2. Click **Settings** (gear icon, bottom-left corner).
3. Select **Apps and sales channels** from the left menu.
4. Click **Develop apps** (top-right button).
5. If prompted with *"Allow custom app development"*, click **Allow custom app development** and confirm.

---

### Step 2: Create Custom App
1. Click **Create an app**.
2. Set:
   - **App name**: `Upcraft COD Confirmation`
   - **App developer**: Select your account email.
3. Click **Create app**.

---

### Step 3: Configure Admin API Scopes
1. Click the **Configuration** tab.
2. Under **Admin API integration**, click **Configure**.
3. Under **Admin API access scopes**, check the following permissions:

| Scope Group | Permissions to Check | Purpose in Upcraft |
|---|---|---|
| **Draft Orders** | `read_draft_orders`, `write_draft_orders` | Fetch open drafts, update address/tags, complete drafts |
| **Orders** | `read_orders`, `write_orders` | Verify created order status, reconcile COD orders |
| **Products** | `read_products` | Verify product variants, inventory, and prices |
| **Customers** | `read_customers`, `write_customers` | Sync customer phone, email, and recipient details |
| **Shipping** | `read_shipping` | Verify shipping rates and delivery addresses |
| **Inventory** | `read_inventory` | Confirm variant stock readiness |

4. Scroll to bottom/top and click **Save**.

---

### Step 4: Install App & Reveal Credentials
1. Click the **API credentials** tab.
2. In the **Access tokens** section, click **Install app** and confirm **Install**.
3. You will now see:
   - **Admin API access token**:
     - Click **Reveal token once** (starts with `shpat_...`).
     - ⚠️ **CRITICAL**: Copy and store this token immediately. Shopify will NEVER show it again once you navigate away!
   - **API key and secret key**:
     - **API key** = `Client ID`
     - **API secret key** = `Client Secret`

---

## Method 2: Shopify Partner Dashboard (For Partner / App Store Distribution)

Use this method if building from a Shopify Partner account across multiple client stores.

1. Log in to [Shopify Partners](https://partners.shopify.com).
2. Go to **Apps** > **Create app** > **Create app manually**.
3. Enter **App name**: `Upcraft COD Confirmation`.
4. Navigate to **App setup**:
   - **Client ID**: Generated automatically.
   - **Client Secret**: Click eye icon to reveal.
   - **App URL**: `http://localhost:4000` (or your production URL).
   - **Allowed redirection URL(s)**: `http://localhost:4000/api/v1/auth/callback`.
5. Under **Distribution**, select **Custom distribution** (or Public).
6. Select scopes listed above, save, and install on `b5nyri-eu.myshopify.com`.

---

## How to Configure Credentials in Upcraft Console

You can enter the generated credentials either via the **Web UI** or via **Environment Variables**:

### Option A: Via Web UI (Easiest)
1. Open `http://localhost:4000` in browser.
2. Click **Store & COD Policy** in left sidebar.
3. Fill in:
   - **Store Domain**: `b5nyri-eu.myshopify.com`
   - **Admin Access Token (Direct)**: Paste your `shpat_...` token.
   - **Shopify App Client ID**: Paste API Key / Client ID.
   - **Shopify App Client Secret**: Paste API Secret Key / Client Secret.
   - **Mock Simulator Mode**: Toggle **OFF** (switches to Live Store API).
4. Click **Save Changes**.
5. Click **Test Live Connection** to verify API handshake.

---

### Option B: Via Environment Variables (.env)
Update `.env` in `upcraft-shopify` root:

```env
SHOPIFY_STORE=b5nyri-eu.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_your_token_here
SHOPIFY_API_VERSION=2026-10
MOCK_MODE=false
```

Restart or reload your dev server.

---

## Verification Checklist

- [ ] Store domain matches `b5nyri-eu.myshopify.com`.
- [ ] Token starts with `shpat_`.
- [ ] Both `write_draft_orders` and `write_orders` are checked in Shopify custom app configuration.
- [ ] Upcraft Console top bar indicates: `b5nyri-eu.myshopify.com • Live Store API` with blue indicator dot.
- [ ] Clicking **Refresh** on Draft Orders table fetches real store draft orders from Shopify Admin API.
