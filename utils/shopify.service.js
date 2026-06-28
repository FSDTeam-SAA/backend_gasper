// OAuth token cache — same logic as the working test code
let _cachedToken = null;
let _tokenExpiry = null;

async function getAccessToken() {
  const now = Date.now();
  if (_cachedToken && _tokenExpiry && now < _tokenExpiry) return _cachedToken;

  // All env vars read here (at call time), not at module load time
  const shopUrl = process.env.SHOPIFY_SHOP_URL;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  const res = await fetch(`https://${shopUrl}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify OAuth failed ${res.status}: ${body}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Shopify OAuth response has no access_token: ${JSON.stringify(data)}`);
  }

  _cachedToken = data.access_token;
  _tokenExpiry = now + ((data.expires_in || 86400) * 1000) - 600000;
  return _cachedToken;
}

async function shopifyFetch(path, options = {}) {
  const token = await getAccessToken();
  const shopUrl = process.env.SHOPIFY_SHOP_URL;
  const version = process.env.SHOPIFY_API_VERSION || '2026-04';
  const url = `https://${shopUrl}/admin/api/${version}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify ${res.status} on ${path}: ${body}`);
  }

  const data = await res.json();
  const linkHeader = res.headers.get('Link') || '';
  return { data, linkHeader };
}

function parseCursors(linkHeader) {
  const next = linkHeader.match(/<[^>]+[?&]page_info=([^>&]+)[^>]*>;\s*rel="next"/);
  const prev = linkHeader.match(/<[^>]+[?&]page_info=([^>&]+)[^>]*>;\s*rel="previous"/);
  return {
    nextPageInfo: next ? next[1] : null,
    prevPageInfo: prev ? prev[1] : null,
  };
}

export function normalizeProduct(p) {
  const defaultVariant = p.variants?.[0] || {};
  const totalStock = (p.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
  let status = 'in_stock';
  if (totalStock === 0) status = 'out_of_stock';
  else if (totalStock < 5) status = 'low_stock';

  return {
    shopifyId: String(p.id),
    title: p.title,
    brand: p.vendor || '',
    description: (p.body_html || '').replace(/<[^>]+>/g, '').trim(),
    detailedDescription: p.body_html || '',
    price: parseFloat(defaultVariant.price || 0),
    compareAtPrice: defaultVariant.compare_at_price ? parseFloat(defaultVariant.compare_at_price) : null,
    sku: defaultVariant.sku || '',
    stock: totalStock,
    status,
    category: p.product_type || '',
    tags: p.tags ? p.tags.split(', ').map(t => t.trim()).filter(Boolean) : [],
    photos: (p.images || []).map(img => ({
      url: img.src,
      public_id: String(img.id),
      alt: img.alt || '',
    })),
    variants: (p.variants || []).map(v => ({
      id: String(v.id),
      title: v.title,
      price: parseFloat(v.price || 0),
      compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
      sku: v.sku || '',
      stock: v.inventory_quantity || 0,
      options: [v.option1, v.option2, v.option3].filter(Boolean),
    })),
    options: (p.options || []).map(o => ({ name: o.name, values: o.values })),
    handle: p.handle,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function buildSortParam(params, sort) {
  if (!sort || sort === 'latest') params.set('order', 'created_at desc');
  else if (sort === 'oldest') params.set('order', 'created_at asc');
  else if (sort === 'title_asc') params.set('order', 'title asc');
  else if (sort === 'title_desc') params.set('order', 'title desc');
}

export async function fetchProducts({ limit = 20, pageInfo, category, brand, sort, includeDrafts = false } = {}) {
  // category is one or more Shopify collection IDs (comma-separated for multi-select filters)
  const collectionIds = category ? String(category).split(',').map(c => c.trim()).filter(Boolean) : [];

  if (collectionIds.length > 1) {
    // Shopify's products.json only accepts a single collection_id — fetch each and merge/dedupe.
    // Cursor pagination can't be merged across separate collections, so paging is disabled here.
    const results = await Promise.all(
      collectionIds.map(id => {
        const params = new URLSearchParams();
        params.set('limit', Math.min(Number(limit) || 20, 250));
        params.set('collection_id', id);
        if (!includeDrafts) params.set('status', 'active');
        if (brand) params.set('vendor', brand);
        buildSortParam(params, sort);
        return shopifyFetch(`/products.json?${params}`);
      })
    );

    const seen = new Set();
    const products = [];
    for (const { data } of results) {
      for (const p of data.products) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        products.push(normalizeProduct(p));
      }
    }

    return { products, nextPageInfo: null, prevPageInfo: null };
  }

  const params = new URLSearchParams();
  params.set('limit', Math.min(Number(limit) || 20, 250));

  if (pageInfo) {
    params.set('page_info', pageInfo);
  } else {
    if (!includeDrafts) params.set('status', 'active');
    if (collectionIds[0]) params.set('collection_id', collectionIds[0]);
    if (brand) params.set('vendor', brand);
    buildSortParam(params, sort);
  }

  const { data, linkHeader } = await shopifyFetch(`/products.json?${params}`);
  const { nextPageInfo, prevPageInfo } = parseCursors(linkHeader);

  return {
    products: data.products.map(normalizeProduct),
    nextPageInfo,
    prevPageInfo,
  };
}

export async function fetchProductCount({ category, brand, includeDrafts = false } = {}) {
  const params = new URLSearchParams();
  if (!includeDrafts) params.set('status', 'active');
  if (category) params.set('collection_id', category);
  if (brand) params.set('vendor', brand);
  const { data } = await shopifyFetch(`/products/count.json?${params}`);
  return data.count;
}

export async function fetchProductById(shopifyId) {
  const { data } = await shopifyFetch(`/products/${shopifyId}.json`);
  return normalizeProduct(data.product);
}

// Fetches all products once and groups them by tag — avoids N separate API calls
// Used by getCategories?includeProducts=true and getCategoryTree
export async function fetchCategoriesWithProducts({ includeDrafts = false } = {}) {
  const params = new URLSearchParams({ limit: 250 });
  if (!includeDrafts) params.set('status', 'active');

  const { data } = await shopifyFetch(`/products.json?${params}`);
  const products = data.products.map(normalizeProduct);

  const tagMap = {};
  for (const product of products) {
    for (const tag of product.tags) {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push(product);
    }
  }

  return tagMap;
}

export async function fetchCategories() {
  // product_type is empty on this store — use tags as categories
  const { data } = await shopifyFetch('/products.json?limit=250&fields=id,tags&status=active');
  const allTags = data.products.flatMap(p =>
    p.tags ? p.tags.split(', ').map(t => t.trim()).filter(Boolean) : []
  );
  return [...new Set(allTags)].sort();
}

function normalizeCollection(c) {
  return {
    shopifyId: String(c.id),
    title: c.title,
    handle: c.handle,
    description: (c.body_html || '').replace(/<[^>]+>/g, '').trim(),
    image: c.image ? { url: c.image.src, alt: c.image.alt || '' } : null,
    publishedAt: c.published_at,
    updatedAt: c.updated_at,
  };
}

// Shopify collections (custom + smart) — "active" means published (published_at set)
export async function fetchActiveCollections() {
  const params = 'limit=250&published_status=published';
  const [customRes, smartRes] = await Promise.all([
    shopifyFetch(`/custom_collections.json?${params}`),
    shopifyFetch(`/smart_collections.json?${params}`),
  ]);

  const collections = [
    ...customRes.data.custom_collections,
    ...smartRes.data.smart_collections,
  ].filter(c => c.published_at);

  return collections.map(normalizeCollection).sort((a, b) => a.title.localeCompare(b.title));
}

export async function fetchAllBrands() {
  const { data } = await shopifyFetch('/products.json?limit=250&fields=id,vendor&status=active');
  return [...new Set(data.products.map(p => p.vendor).filter(Boolean))].sort();
}

export async function fetchProductsByVendor(vendor, { includeDrafts = false } = {}) {
  const params = new URLSearchParams({ vendor, limit: 250 });
  if (!includeDrafts) params.set('status', 'active');
  const { data } = await shopifyFetch(`/products.json?${params}`);
  return data.products.map(normalizeProduct);
}

// Orders

export async function createShopifyOrder({ email, lineItems, shippingAddress, note }) {
  const body = {
    order: {
      email,
      line_items: lineItems.map(item => ({
        variant_id: Number(item.variantId),
        quantity: Number(item.quantity),
      })),
      shipping_address: {
        first_name: shippingAddress.firstName || '',
        last_name: shippingAddress.lastName || '',
        address1: shippingAddress.street,
        city: shippingAddress.city,
        zip: shippingAddress.postalCode,
        country_code: shippingAddress.country,
        phone: shippingAddress.phone || '',
      },
      financial_status: 'pending',
      note: note || '',
    },
  };

  const { data } = await shopifyFetch('/orders.json', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.order;
}

export async function fetchOrdersByEmail(email, { status = 'any', limit = 50 } = {}) {
  const params = new URLSearchParams({ status, limit });
  if (email) params.set('email', email);
  const { data } = await shopifyFetch(`/orders.json?${params}`);
  return data.orders;
}

export async function fetchOrderById(orderId) {
  const { data } = await shopifyFetch(`/orders/${orderId}.json`);
  return data.order;
}

export async function cancelShopifyOrder(orderId) {
  const { data } = await shopifyFetch(`/orders/${orderId}/cancel.json`, { method: 'POST' });
  return data.order;
}
