export const ORDER_FOR_AUTOMATION_QUERY = `#graphql
query OrderForAutomation($id: ID!) {
  order(id: $id) {
    id
    name
    email
    phone
    tags
    createdAt
    displayFinancialStatus
    displayFulfillmentStatus
    shippingAddress {
      name
      company
      address1
      address2
      city
      provinceCode
      zip
      countryCodeV2
      phone
    }
    fulfillmentOrders(first: 20) {
      nodes {
        id
        status
        requestStatus
        remainingLineItemsWeight {
          value
          unit
        }
        lineItems(first: 100) {
          nodes {
            id
            sku
            vendor
            productTitle
            variantTitle
            totalQuantity
            remainingQuantity
            requiresShipping
            weight {
              value
              unit
            }
            lineItem {
              id
              name
              title
              sku
              quantity
              currentQuantity
              requiresShipping
              customAttributes {
                key
                value
              }
              product {
                id
                title
                handle
                productType
                tags
                vendor
              }
              variant {
                id
                title
                sku
              }
            }
          }
        }
      }
    }
  }
}
`;

export const PURCHASE_SHIPPING_LABEL_MUTATION = `#graphql
mutation PurchaseShippingLabel($shippingLabelPurchase: ShippingLabelPurchaseInput!) {
  shippingLabelPurchase(shippingLabelPurchase: $shippingLabelPurchase) {
    shippingLabelPurchaseResult {
      id
      done
      status
      errors {
        message
      }
      shippingLabels {
        id
        trackingInfo {
          number
          company
          url
        }
        shippingDocuments {
          documentType
          format
          url
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;

export const SHIPPING_LABEL_PURCHASE_RESULT_QUERY = `#graphql
query ShippingLabelPurchaseResult($id: ID!) {
  node(id: $id) {
    ... on ShippingLabelPurchaseResult {
      id
      done
      status
      errors {
        message
      }
      shippingLabels {
        id
        trackingInfo {
          number
          company
          url
        }
        shippingDocuments {
          documentType
          format
          url
        }
      }
    }
  }
}
`;

export const WEBHOOK_SUBSCRIPTION_CREATE_MUTATION = `#graphql
mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription {
      id
      topic
      endpoint {
        __typename
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;
