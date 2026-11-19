# Shopify Product & Store Configuration Guide

Step-by-step setup for configuring Shopify products, inventory, payment methods, and draft orders to work with the **Upcraft Shopify Bulk COD Confirmation** system.

---

## 1. Product Setup in Shopify Admin

### 1.1 Create Product
1. Go to **Shopify Admin** (`https://admin.shopify.com/store/<store-name>`)
2. Navigate to **Products** > **Add product**
3. Configure core details:
   - **Title**: Product display name (e.g., `Classic Heavyweight Cotton T-Shirt`)
   - **Description**: Features, care instructions, specifications
   - **Media**: Upload high-resolution images/videos
   - **Category**: Select appropriate standard product taxonomy

---

### 1.2 Pricing & Tax
- **Price**: Selling price (e.g., `499.00`)
- **Compare-at price**: Original MSRP (if on sale / discounted)
- **Cost per item**: Internal inventory cost (for margin tracking)
- **Charge tax on this product**:
  - Checked if store prices exclude tax (or GST applies at checkout)
  - Unchecked if inclusive of tax

---

### 1.3 Inventory & Stock Management (CRITICAL)

> **IMPORTANT**: The Upcraft bulk order confirmation engine checks real-time inventory on Shopify. If a product has zero stock and backorders are disabled, Shopify rejects draft conversion with `The variant is out of stock`.

Configure inventory settings:
1. **Track quantity**: Keep checked.
2. **Continue selling when out of stock**:
   - **Checked** (Recommended for made-to-order / pre-orders): Prevents draft conversion failure when stock runs out.
   - **Unchecked**: Strictly enforces stock limits; orders fail conversion if inventory is depleted.
3. **Quantity**: Enter positive stock quantity at your primary fulfillment location (e.g., `50`).
4. **SKU / Barcode**: Unique SKU per item/variant (e.g., `TSH-BLK-M`).

---

### 1.4 Shipping & Weight
1. Check **This is a physical product**
2. Enter accurate **Weight** (e.g., `0.25 kg`) — used for calculating shipping tier rates
3. Set **Country/Region of origin** and **HS Code** (for customs/tax compliance)

---

### 1.5 Variants (Sizes, Colors, Styles)
1. In the **Variants** section, click **+ Add options like size or color**
2. Add Option 1: `Size` (e.g., `S`, `M`, `L`, `XL`)
3. Add Option 2: `Color` (e.g., `Black`, `White`, `Navy`)
4. Set individual pricing, SKU, and available inventory per variant.

---

### 1.6 Publishing & Sales Channels
- **Status**: Change from `Draft` to **`Active`**
- **Publishing**: Ensure **Online Store**, **Point of Sale**, and custom app channels are checked under Sales Channels.

---

## 2. Cash on Delivery (COD) Payment Setup

Shopify requires a manual payment gateway configured for COD orders to convert without pre-charging a credit card.

1. Go to **Settings** > **Payments**
2. Scroll to **Manual payment methods**
3. Click **Add manual payment method** > Select **Cash on Delivery (COD)**
4. Fill in:
   - **Additional details**: Instructions shown at checkout (e.g., `Pay in cash or UPI upon delivery.`)
   - **Payment instructions**: Note printed on invoices/confirmation emails
5. Click **Activate Cash on Delivery**

---

## 3. Shipping Zones & Rates Configuration

Draft order completion requires a valid shipping address and shipping profile:

1. Go to **Settings** > **Shipping and delivery**
2. Click **General shipping rates** > **Manage**
3. Create/edit shipping zones (e.g., `Domestic / India`):
   - Add rate: Standard Flat Rate (e.g., `₹50.00` or `Free Shipping` over ₹499)
   - Optional: Add COD Surcharge rate (e.g., `₹40.00 COD Fee`)

---

## 4. Draft Order Creation for Bulk COD Processing

Draft orders can originate from telemarketing, abandoned cart recovery, WhatsApp/Instagram leads, or external CRM funnels.

### Required Fields for Upcraft COD Compatibility:
| Field | Requirement | Reason |
|---|---|---|
| **Line Items** | At least 1 active product variant | Must have positive quantity and available stock |
| **Customer Name** | First & Last Name | Required for shipping label |
| **Phone Number** | Valid 10+ digit mobile number | Essential for courier delivery verification |
| **Shipping Address Line 1** | House/Flat #, Street, Locality | Physical delivery location |
| **City** | Valid city/town name | Courier routing |
| **State / Province** | State name (e.g., `Rajasthan`, `Gujarat`) | Tax and courier zone |
| **Pincode / ZIP** | 6-digit postal code (India) | Delivery hub routing |
| **Country** | `India` or ISO country | Shipping profile match |
| **Tags** | `COD` | Unlocks Upcraft COD bulk conversion |

---

## 5. End-to-End Workflow with Upcraft Shopify Console

```
[Shopify Store / Funnel]
       │
       ▼ (Creates Draft Order)
[Draft Order #D5 with "COD" tag]
       │
       ▼ (Sync via GraphQL API 2026-10)
[Upcraft Draft Orders Page]
       │
       ├─ If missing address/phone ──> Click [Fix] ──> In-place modal ──> Syncs to Shopify
       │
       ▼ Click [+ Bulk]
[Bulk Orders Page]
       │
       ├─ Triage: Ready (N) vs Needs Fix (N)
       │
       ▼ Click [Convert Ready Orders]
[Execute Bulk COD Conversion]
       │
       ▼ (Shopify draftOrderComplete mutation)
[Official Paid/Unpaid Order Created in Shopify Admin]
```

---

## 6. Common Shopify Product Errors & Fixes

### Error 1: `The variant is out of stock`
- **Cause**: Shopify inventory is `0` and "Continue selling when out of stock" is disabled.
- **Fix**: Go to **Products** > Variant > Check **Continue selling when out of stock**, or add available inventory.

### Error 2: `Customer phone is invalid`
- **Cause**: Phone formatted incorrectly or missing country code.
- **Fix**: In Upcraft console, click **Fix** on the draft order row. Update phone to `+91XXXXXXXXXX`. Click **Save & Sync to Shopify**.

### Error 3: `Shipping address is missing required fields`
- **Cause**: Draft order created without pincode, city, or address line 1.
- **Fix**: Click **Fix** in Upcraft console, provide missing fields, and save. Address is immediately marked **COD Ready**.

### Error 4: `Non-COD Tag`
- **Cause**: Draft order lacks the `COD` tag.
- **Fix**: In the **Fix** modal, toggle the **Tag as COD** switch to ON, then save.
