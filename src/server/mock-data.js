// Realistic Shopify Draft Orders Mock Fixtures
// Provides 75 realistic draft orders across 2 pages with varied conditions:
// - Standard COD drafts ready for confirmation
// - Non-COD drafts (Prepaid) to test validation
// - Missing phone/address anomalies
// - High-value orders requiring review
// - Mutable in-memory store so mutations update state consistently

const FIRST_NAMES = ['Aarav', 'Diya', 'Rohan', 'Ananya', 'Vivaan', 'Pooja', 'Karan', 'Sneha', 'Aditya', 'Meera', 'Kabir', 'Ishita', 'Arjun', 'Tanvi', 'Rahul'];
const LAST_NAMES = ['Sharma', 'Patel', 'Verma', 'Mehta', 'Gupta', 'Iyer', 'Reddy', 'Chopra', 'Nair', 'Singh', 'Deshmukh', 'Joshi', 'Bose', 'Kapoor'];
const CITIES = [
  { city: 'Mumbai', province: 'Maharashtra', zip: '400001' },
  { city: 'Bengaluru', province: 'Karnataka', zip: '560001' },
  { city: 'New Delhi', province: 'Delhi', zip: '110001' },
  { city: 'Hyderabad', province: 'Telangana', zip: '500001' },
  { city: 'Ahmedabad', province: 'Gujarat', zip: '380001' },
  { city: 'Pune', province: 'Maharashtra', zip: '411001' },
  { city: 'Jaipur', province: 'Rajasthan', zip: '302001' },
  { city: 'Chennai', province: 'Tamil Nadu', zip: '600001' }
];

const PRODUCTS = [
  { title: 'Handcrafted Ceramic Coffee Mug (Set of 2)', price: 799.00 },
  { title: 'Organic Cotton Oversized Hoodie - Charcoal Black', price: 2499.00 },
  { title: 'Full Grain Leather Slim Cardholder Wallet', price: 1299.00 },
  { title: 'Nordic Minimalist Desk LED Lamp with Wireless Charger', price: 3499.00 },
  { title: 'Cold Pressed Sweet Almond Oil 200ml', price: 650.00 },
  { title: 'Mechanical Keyboard with Custom PBT Keycaps', price: 5899.00 },
  { title: 'Premium Matte Black Stainless Steel Water Bottle 1L', price: 999.00 },
  { title: 'Eco-friendly Cork Yoga Mat with Carry Strap', price: 1850.00 }
];

export class MockShopifyStore {
  constructor() {
    this.draftOrders = [];
    this.orders = [];
    this.nextOrderNumber = 1042;
    this.reset();
  }

  reset() {
    this.draftOrders = [];
    this.orders = [];
    this.nextOrderNumber = 1042;

    for (let i = 1; i <= 75; i++) {
      const fn = FIRST_NAMES[(i * 3) % FIRST_NAMES.length];
      const ln = LAST_NAMES[(i * 7) % LAST_NAMES.length];
      const loc = CITIES[i % CITIES.length];
      const prod1 = PRODUCTS[i % PRODUCTS.length];
      const prod2 = PRODUCTS[(i + 3) % PRODUCTS.length];
      const hasTwoItems = i % 3 === 0;

      const lineItems = [
        {
          id: `gid://shopify/DraftOrderLineItem/${80000 + i * 2}`,
          title: prod1.title,
          quantity: (i % 2) + 1,
          originalUnitPriceSet: {
            shopMoney: {
              amount: prod1.price.toFixed(2),
              currencyCode: 'INR'
            }
          }
        }
      ];

      if (hasTwoItems) {
        lineItems.push({
          id: `gid://shopify/DraftOrderLineItem/${80000 + i * 2 + 1}`,
          title: prod2.title,
          quantity: 1,
          originalUnitPriceSet: {
            shopMoney: {
              amount: prod2.price.toFixed(2),
              currencyCode: 'INR'
            }
          }
        });
      }

      const total = lineItems.reduce(
        (sum, item) => sum + parseFloat(item.originalUnitPriceSet.shopMoney.amount) * item.quantity,
        0
      );

      // Determine tags and test edge cases
      let tags = ['COD', 'source_web'];
      let email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`;
      let phone = `+9198${(10000000 + i * 8371).toString().slice(0, 8)}`;

      // Edge case 1: Non-COD draft (Prepaid) on item 10 and 25
      if (i === 10 || i === 25) {
        tags = ['Prepaid', 'Online_Payment'];
      }
      // Edge case 2: Missing phone on item 15
      if (i === 15) {
        phone = null;
      }
      // Edge case 3: High value order on item 5
      if (i === 5) {
        lineItems.push({
          id: `gid://shopify/DraftOrderLineItem/${89999}`,
          title: 'Special Edition Handwoven Silk Rug',
          quantity: 1,
          originalUnitPriceSet: {
            shopMoney: { amount: '18500.00', currencyCode: 'INR' }
          }
        });
      }
      // Edge case 4: Out of stock scenario simulation flag on item 40
      if (i === 40) {
        tags.push('TEST_OUT_OF_STOCK');
      }
      // Edge case 5: Timeout simulation flag on item 45
      if (i === 45) {
        tags.push('TEST_SIMULATE_TIMEOUT');
      }

      const calculatedTotal = lineItems.reduce(
        (sum, item) => sum + parseFloat(item.originalUnitPriceSet.shopMoney.amount) * item.quantity,
        0
      );

      const createdAt = new Date(Date.now() - (76 - i) * 3600000 * 3).toISOString();

      this.draftOrders.push({
        id: `gid://shopify/DraftOrder/${9100000000 + i}`,
        name: `#D${1000 + i}`,
        status: 'OPEN',
        createdAt,
        email,
        phone,
        tags,
        note2: tags.includes('COD') ? 'Customer requested phone verification for COD delivery.' : 'Standard draft order.',
        customer: {
          id: `gid://shopify/Customer/${500000 + i}`,
          firstName: fn,
          lastName: ln,
          email,
          phone
        },
        shippingAddress: {
          address1: `${10 + (i % 80)}, Sector ${(i % 15) + 1}, Garden Heights`,
          city: loc.city,
          province: loc.province,
          zip: loc.zip,
          country: 'India',
          phone: phone || '+919800000000'
        },
        totalPriceSet: {
          shopMoney: {
            amount: calculatedTotal.toFixed(2),
            currencyCode: 'INR'
          }
        },
        lineItems: {
          nodes: lineItems
        },
        order: null
      });
    }
  }

  getOpenDrafts({ first = 50, after = null, query = '' }) {
    let list = this.draftOrders.filter(d => d.status === 'OPEN');

    if (query) {
      const q = query.toLowerCase();
      if (q.includes('tag:cod')) {
        list = list.filter(d => d.tags.some(t => t.toUpperCase() === 'COD'));
      }
      if (q.includes('status:open')) {
        // already filtered
      }
    }

    let startIndex = 0;
    if (after) {
      const decoded = Buffer.from(after, 'base64').toString('ascii');
      const idx = list.findIndex(d => d.id === decoded);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const paginated = list.slice(startIndex, startIndex + first);
    const hasNextPage = startIndex + first < list.length;
    const endCursor = paginated.length > 0
      ? Buffer.from(paginated[paginated.length - 1].id).toString('base64')
      : null;

    return {
      nodes: paginated,
      pageInfo: {
        hasNextPage,
        hasPreviousPage: startIndex > 0,
        endCursor,
        startCursor: paginated.length > 0 ? Buffer.from(paginated[0].id).toString('base64') : null,
        totalOpenCount: list.length
      }
    };
  }

  verifyDrafts(ids) {
    return ids.map(id => {
      const draft = this.draftOrders.find(d => d.id === id);
      if (!draft) return null;
      return {
        id: draft.id,
        name: draft.name,
        status: draft.status,
        tags: draft.tags,
        customer: draft.customer,
        phone: draft.phone,
        totalPriceSet: draft.totalPriceSet,
        order: draft.order
      };
    }).filter(Boolean);
  }

  completeDraft(id, paymentGatewayId = null) {
    const draft = this.draftOrders.find(d => d.id === id);
    if (!draft) {
      return {
        draftOrder: null,
        userErrors: [{ field: ['id'], message: `Draft order ${id} does not exist.` }]
      };
    }

    if (draft.status !== 'OPEN') {
      return {
        draftOrder: {
          id: draft.id,
          status: draft.status,
          order: draft.order
        },
        userErrors: [{ field: ['status'], message: `Draft order ${draft.name} is already ${draft.status}.` }]
      };
    }

    // Simulate edge case failure for OUT_OF_STOCK
    if (draft.tags.includes('TEST_OUT_OF_STOCK')) {
      return {
        draftOrder: null,
        userErrors: [
          { field: ['lineItems'], message: 'Inventory not available for one or more items in this draft order.' }
        ]
      };
    }

    // Simulate timeout if tag indicates it
    if (draft.tags.includes('TEST_SIMULATE_TIMEOUT')) {
      // In a real network timeout, the request drops or times out
      const error = new Error('Gateway Timeout: ETIMEDOUT connecting to Shopify GraphQL API');
      error.code = 'ETIMEDOUT';
      throw error;
    }

    // Success conversion
    const orderNumber = this.nextOrderNumber++;
    const order = {
      id: `gid://shopify/Order/${7000000000 + orderNumber}`,
      name: `#${orderNumber}`,
      // In COD according to document, displayFinancialStatus is PENDING/PAYMENT_DUE, never PAID
      displayFinancialStatus: 'PENDING',
      paymentGatewayNames: [paymentGatewayId || 'Cash on Delivery (COD)']
    };

    draft.status = 'COMPLETED';
    draft.order = order;
    this.orders.push({ ...order, draftOrderId: draft.id });

    return {
      draftOrder: {
        id: draft.id,
        status: 'COMPLETED',
        order
      },
      userErrors: []
    };
  }

  updateDraft(id, input) {
    const draft = this.draftOrders.find(d => d.id === id);
    if (!draft) {
      return {
        draftOrder: null,
        userErrors: [{ field: ['id'], message: `Draft order ${id} not found` }]
      };
    }

    if (input.tags) draft.tags = input.tags;
    if (input.email) draft.email = input.email;
    if (input.phone) draft.phone = input.phone;
    if (input.note) draft.note = input.note;
    if (input.shippingAddress) {
      draft.shippingAddress = { ...(draft.shippingAddress || {}), ...input.shippingAddress };
    }

    return {
      draftOrder: draft,
      userErrors: []
    };
  }

  reconcileDraft(id) {
    const draft = this.draftOrders.find(d => d.id === id);
    if (!draft) return null;
    return {
      id: draft.id,
      name: draft.name,
      status: draft.status,
      order: draft.order
    };
  }
}

export const mockShopifyStore = new MockShopifyStore();

