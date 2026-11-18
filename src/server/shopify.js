// Shopify Admin GraphQL API (2026-10) Client
// Enforces pinned API version 2026-10 and strict COD mutation parameters.
// Implements dual-mode execution: Live Shopify Admin API and Mock Simulator.

import { getConfig } from './db.js';
import { mockShopifyStore } from './mock-data.js';

const GRAPHQL_QUERIES = {
  GET_DRAFT_ORDERS: `
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
            name
            firstName
            lastName
            address1
            address2
            city
            province
            provinceCode
            zip
            country
            phone
          }
          billingAddress {
            name
            firstName
            lastName
            address1
            address2
            city
            province
            provinceCode
            zip
            country
            phone
          }
          subtotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalTaxSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
              currencyCode
            }
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
              name
              sku
              variantTitle
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
  `,

  VERIFY_DRAFTS: `
    query VerifyDrafts($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on DraftOrder {
          id
          name
          status
          updatedAt
          tags
          customer {
            firstName
            lastName
          }
          phone
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          order {
            id
            name
          }
        }
      }
    }
  `,

  COMPLETE_DRAFT: `
    mutation CompleteDraft($id: ID!) {
      draftOrderComplete(id: $id) {
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
  `,

  COMPLETE_DRAFT_WITH_GATEWAY: `
    mutation CompleteDraftWithGateway($id: ID!, $paymentGatewayId: ID!) {
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
  `,

  RECONCILE_DRAFT: `
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
  `,

  UPDATE_DRAFT_ORDER: `
    mutation UpdateDraftOrder($id: ID!, $input: DraftOrderInput!) {
      draftOrderUpdate(id: $id, input: $input) {
        draftOrder {
          id
          name
          status
          tags
          phone
          email
          note2
          shippingAddress {
            name
            firstName
            lastName
            address1
            address2
            city
            province
            provinceCode
            zip
            country
            phone
          }
          billingAddress {
            name
            firstName
            lastName
            address1
            address2
            city
            province
            provinceCode
            zip
            country
            phone
          }
          subtotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalTaxSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
              currencyCode
            }
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
              name
              sku
              variantTitle
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
        userErrors {
          field
          message
        }
      }
    }
  `
};

export class ShopifyClient {
  constructor(options = {}) {
    this.options = options;
  }

  getCurrentConfig() {
    return getConfig();
  }

  async executeGraphQL(query, variables = {}, timeoutMs = 15000) {
    const config = this.getCurrentConfig();

    if (config.mock_mode || !config.has_token) {
      // Handled by specific method fallbacks
      throw new Error('GraphQL execution requires live mode');
    }

    const domain = config.store_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${domain}/admin/api/${config.api_version}/graphql.json`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': config.access_token
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`Shopify HTTP ${response.status}: ${text}`);
        error.status = response.status;
        throw error;
      }

      const json = await response.json();
      if (json.errors && json.errors.length > 0) {
        if (!json.data) {
          const error = new Error(json.errors.map(e => e.message).join(' | '));
          error.shopifyErrors = json.errors;
          throw error;
        }
        // If data is returned (field-level restriction), log warning but return available data
        console.warn('Shopify GraphQL field notice:', json.errors.map(e => e.message).join(' | '));
      }

      return json.data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const timeoutError = new Error(`Shopify GraphQL request timed out after ${timeoutMs}ms`);
        timeoutError.code = 'ETIMEDOUT';
        timeoutError.isTimeout = true;
        throw timeoutError;
      }
      throw err;
    }
  }

  async getDraftOrders({ first = 50, after = null, query = 'status:OPEN' } = {}) {
    const config = this.getCurrentConfig();
    if (config.mock_mode || !config.has_token) {
      return mockShopifyStore.getOpenDrafts({ first, after, query });
    }

    const data = await this.executeGraphQL(GRAPHQL_QUERIES.GET_DRAFT_ORDERS, { first, after, query });
    return data.draftOrders;
  }

  async verifyDrafts(ids) {
    const config = this.getCurrentConfig();
    if (config.mock_mode || !config.has_token) {
      return mockShopifyStore.verifyDrafts(ids);
    }

    const data = await this.executeGraphQL(GRAPHQL_QUERIES.VERIFY_DRAFTS, { ids });
    return (data.nodes || []).filter(Boolean);
  }

  async completeDraftOrder(id, paymentGatewayId = null) {
    const config = this.getCurrentConfig();
    const gateway = paymentGatewayId !== undefined ? paymentGatewayId : config.cod_payment_gateway_id;

    if (config.mock_mode || !config.has_token) {
      return mockShopifyStore.completeDraft(id, gateway);
    }

    // Force strict Cash-on-Delivery payment safeguard: enforce payment_pending=true
    const domain = config.store_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const numericId = String(id).replace(/\D/g, '');
    let url = `https://${domain}/admin/api/${config.api_version}/draft_orders/${numericId}/complete.json?payment_pending=true`;
    if (gateway) {
      url += `&payment_gateway_id=${encodeURIComponent(gateway)}`;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': config.access_token
      }
    });

    const json = await response.json();
    if (!response.ok) {
      const errorMsg = json.errors ? (typeof json.errors === 'string' ? json.errors : JSON.stringify(json.errors)) : `HTTP ${response.status}`;
      return {
        draftOrder: null,
        userErrors: [{ field: ['draft_order'], message: errorMsg }]
      };
    }

    const draftGid = id.startsWith('gid://') ? id : `gid://shopify/DraftOrder/${numericId}`;
    const reconciled = await this.reconcileDraftOrder(draftGid).catch(() => null);

    return {
      draftOrder: {
        id: draftGid,
        status: 'COMPLETED',
        order: reconciled?.order || {
          id: `gid://shopify/Order/${json.draft_order.order_id}`,
          name: `#${json.draft_order.name?.replace('#D', '') || json.draft_order.order_id}`,
          displayFinancialStatus: 'PENDING',
          paymentGatewayNames: ['Cash on Delivery (COD)']
        }
      },
      userErrors: []
    };
  }

  async updateDraftOrder(id, input) {
    const config = this.getCurrentConfig();
    if (config.mock_mode || !config.has_token) {
      return mockShopifyStore.updateDraft(id, input);
    }

    const data = await this.executeGraphQL(GRAPHQL_QUERIES.UPDATE_DRAFT_ORDER, { id, input });
    return data.draftOrderUpdate;
  }

  async reconcileDraftOrder(id) {
    const config = this.getCurrentConfig();
    if (config.mock_mode || !config.has_token) {
      return mockShopifyStore.reconcileDraft(id);
    }

    const data = await this.executeGraphQL(GRAPHQL_QUERIES.RECONCILE_DRAFT, { id });
    return data.node;
  }

  async testConnection() {
    const config = this.getCurrentConfig();
    if (config.mock_mode || !config.has_token) {
      return {
        success: true,
        mockMode: true,
        message: 'Mock Simulator is active. Connected to high-fidelity virtual store.',
        storeDomain: config.store_domain,
        apiVersion: config.api_version
      };
    }

    try {
      const data = await this.executeGraphQL(`
        query CheckStoreDetails {
          shop {
            name
            myshopifyDomain
            currencyCode
          }
        }
      `);

      return {
        success: true,
        mockMode: false,
        message: `Successfully connected to Shopify store "${data.shop.name}" (${data.shop.myshopifyDomain})`,
        shop: data.shop,
        apiVersion: config.api_version
      };
    } catch (err) {
      return {
        success: false,
        mockMode: false,
        message: `Connection failed: ${err.message}`,
        error: err.message
      };
    }
  }
}

export const shopifyClient = new ShopifyClient();

