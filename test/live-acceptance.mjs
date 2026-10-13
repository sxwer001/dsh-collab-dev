// Independent checks of the real-model delivery; expected values come from the user test brief.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = path.resolve(process.argv[2]);
const { itemTotal, subtotal } = await import(pathToFileURL(path.join(workspace, 'src/pricing.js')));
const { shippingFee } = await import(pathToFileURL(path.join(workspace, 'src/shipping.js')));
const { quote } = await import(pathToFileURL(path.join(workspace, 'src/index.js')));
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const throws = (fn, type) => { assert.throws(fn, type); checks++; };
const max = Number.MAX_SAFE_INTEGER;
equal(itemTotal(1200, 2), 2400); equal(itemTotal(0, 10), 0); equal(itemTotal(max, 1), max);
equal(itemTotal(max, 0), 0); throws(() => itemTotal(max, 2), RangeError);
for (const value of [-1, 0.5, '1', NaN, Infinity, max + 1, null]) {
  throws(() => itemTotal(value, 1), TypeError); throws(() => itemTotal(1, value), TypeError);
  throws(() => shippingFee('domestic', value), TypeError);
}
equal(subtotal([]), 0); equal(subtotal([{ unitCents: 1200, quantity: 2 }, { unitCents: 100, quantity: 3 }]), 2700);
throws(() => subtotal([{ unitCents: max, quantity: 1 }, { unitCents: 1, quantity: 1 }]), RangeError);
for (const value of [null, {}, 'items', [null], [{}]]) throws(() => subtotal(value), TypeError);
equal(shippingFee('domestic', 9999), 600); equal(shippingFee('domestic', 10000), 0);
equal(shippingFee('domestic', max), 0); equal(shippingFee('international', 0), 2000);
equal(shippingFee('international', max), 2000); throws(() => shippingFee('elsewhere', 100), TypeError);
equal(await quote([{ unitCents: 1200, quantity: 2 }], 'domestic'), { subtotalCents: 2400, shippingCents: 600, totalCents: 3000 });
equal(await quote([{ unitCents: 10000, quantity: 1 }], 'domestic'), { subtotalCents: 10000, shippingCents: 0, totalCents: 10000 });
equal(await quote([], 'international'), { subtotalCents: 0, shippingCents: 2000, totalCents: 2000 });
equal(await quote([{ unitCents: max, quantity: 1 }], 'domestic'), { subtotalCents: max, shippingCents: 0, totalCents: max });
await assert.rejects(async () => quote([{ unitCents: max, quantity: 1 }], 'international'), RangeError); checks++;
await assert.rejects(async () => quote([], 'invalid'), TypeError); checks++;
console.log(JSON.stringify({ passed: true, independentAcceptanceChecks: checks }));
