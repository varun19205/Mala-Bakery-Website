const crypto = require('crypto');

function genId(prefix) {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

/**
 * Validates a coupon against the current settings/order and returns
 * { valid, reason, discount } — never trusts client-calculated discounts.
 */
function validateCoupon(coupon, subtotal) {
  if (!coupon) return { valid: false, reason: 'not_found' };
  if (!coupon.active) return { valid: false, reason: 'inactive' };
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date())
    return { valid: false, reason: 'expired' };
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit)
    return { valid: false, reason: 'usage_limit_reached' };
  if (coupon.minOrder && subtotal < coupon.minOrder)
    return { valid: false, reason: 'min_order_not_met', minOrder: coupon.minOrder };

  let discount = 0;
  if (coupon.type === 'percent') {
    discount = Math.round((subtotal * coupon.value) / 100);
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  } else if (coupon.type === 'flat') {
    discount = coupon.value;
  }
  discount = Math.min(discount, subtotal);
  return { valid: true, discount };
}

/**
 * Recomputes the full order total SERVER-SIDE from product data.
 * The client cart is only a suggestion of what to buy — prices,
 * availability and totals are always trusted from the database, never
 * from the request body. This is what prevents price tampering.
 */
function priceOrder({ cartItems, products, settings, coupon }) {
  const lineItems = [];
  let subtotal = 0;

  for (const ci of cartItems) {
    const product = products.find((p) => p.id === ci.productId);
    if (!product) throw new Error(`Product not found: ${ci.productId}`);
    if (!product.available) throw new Error(`"${product.name}" is currently unavailable`);

    let unitPrice = product.basePrice;
    let variantName = null;
    if (ci.variantId) {
      const variant = (product.variants || []).find((v) => v.id === ci.variantId);
      if (!variant) throw new Error(`Invalid variant for ${product.name}`);
      unitPrice += variant.priceDelta;
      variantName = variant.name;
    }
    const addOnNames = [];
    if (Array.isArray(ci.addOnIds)) {
      for (const aid of ci.addOnIds) {
        const addOn = (product.addOns || []).find((a) => a.id === aid);
        if (!addOn) throw new Error(`Invalid add-on for ${product.name}`);
        unitPrice += addOn.price;
        addOnNames.push(addOn.name);
      }
    }
    if (product.discountPercent) {
      unitPrice = Math.round(unitPrice * (1 - product.discountPercent / 100));
    }
    const qty = Math.max(1, parseInt(ci.qty, 10) || 1);
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;

    lineItems.push({
      productId: product.id,
      name: product.name,
      variantName,
      addOns: addOnNames,
      qty,
      unitPrice,
      lineTotal,
      customNotes: ci.customNotes || '',
      cakeCustomization: ci.cakeCustomization || null,
    });
  }

  let discount = 0;
  let couponCode = null;
  if (coupon) {
    const result = validateCoupon(coupon, subtotal);
    if (!result.valid) throw new Error(`Coupon invalid: ${result.reason}`);
    discount = result.discount;
    couponCode = coupon.code;
  }

  const deliveryFee = subtotal - discount >= (settings.freeDeliveryThreshold || Infinity)
    ? 0
    : settings.deliveryCharge || 0;

  const total = subtotal - discount + deliveryFee;

  return { lineItems, subtotal, discount, couponCode, deliveryFee, total };
}

module.exports = { genId, validateCoupon, priceOrder };
