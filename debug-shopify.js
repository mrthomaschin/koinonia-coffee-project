// Debug script to test Shopify Storefront API connection
// Run with: node debug-shopify.js

require('dotenv').config();

const storeDomain = process.env.REACT_APP_SHOPIFY_STORE_DOMAIN;
const token = process.env.REACT_APP_SHOPIFY_STOREFRONT_ACCESS_TOKEN;

console.log('=== Shopify Configuration Debug ===\n');

// Check if variables are loaded
console.log('1. Environment Variables:');
console.log('   Store Domain:', storeDomain || '❌ NOT SET');
console.log('   Token:', token ? `✓ Set (${token.substring(0, 10)}...)` : '❌ NOT SET');
console.log('');

// Check format
console.log('2. Format Validation:');
if (storeDomain) {
  if (storeDomain.includes('https://') || storeDomain.includes('http://')) {
    console.log('   ❌ Store domain should NOT include https:// or http://');
  } else if (!storeDomain.includes('.myshopify.com')) {
    console.log('   ⚠️  Store domain should end with .myshopify.com');
  } else {
    console.log('   ✓ Store domain format looks good');
  }
}

if (token) {
  if (token.startsWith('shpat_')) {
    console.log('   ❌ This looks like an Admin API token. You need a Storefront API token!');
  } else if (token === 'your_storefront_access_token_here') {
    console.log('   ❌ Token is still the placeholder value');
  } else {
    console.log('   ✓ Token format looks good');
  }
}
console.log('');

// Test API connection
if (storeDomain && token && !token.startsWith('shpat_')) {
  console.log('3. Testing API Connection...');
  
  const query = `
    {
      shop {
        name
        primaryDomain {
          url
        }
      }
    }
  `;

  fetch(`https://${storeDomain}/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query }),
  })
    .then(response => {
      console.log('   Status:', response.status);
      if (response.status === 401) {
        console.log('   ❌ 401 Unauthorized - Token is invalid or missing permissions');
        console.log('   → Check that you copied the Storefront API token (not Admin API)');
        console.log('   → Verify the token has the required scopes enabled');
      } else if (response.status === 200) {
        console.log('   ✓ Connection successful!');
        return response.json();
      } else {
        console.log('   ❌ Unexpected status code');
      }
      return response.json();
    })
    .then(data => {
      if (data && data.data && data.data.shop) {
        console.log('   ✓ Shop Name:', data.data.shop.name);
        console.log('   ✓ Shop URL:', data.data.shop.primaryDomain.url);
      } else if (data && data.errors) {
        console.log('   ❌ GraphQL Errors:', JSON.stringify(data.errors, null, 2));
      }
    })
    .catch(error => {
      console.log('   ❌ Connection Error:', error.message);
    });
} else {
  console.log('3. Skipping API test - configuration incomplete');
}
