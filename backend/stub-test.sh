#!/usr/bin/env bash
cd "C:\Users\natna\Downloads\store\backend"

# Start HubX stub
node hubx-stub.js > stub.log 2>&1 &
STUB_PID=$!

# Start backend pointed at stub, in mock payment mode
PAYMENT_MODE=mock SUPPLIER_BASE_URL="http://localhost:5055" SUPPLIER_API_KEY="rsk_test_stubkey123" PORT=5056 node dist/main.js > stub-backend.log 2>&1 &
BPID=$!
sleep 7
B=http://localhost:5056

echo "== 1. settings defaults =="
curl -s $B/settings

echo; echo "== 2. supplier status (stub) =="
curl -s $B/supplier/status

echo; echo "== 3. supplier products with ETB preview =="
curl -s $B/supplier/products | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);p.forEach(x=>console.log(\` - \${x.slug}: \$\${x.price_usdt} → \${x.pricePreviewETB} ETB (stock \${x.stock})\`))})"

echo "== 4. import canva-pro-1y with 25% discount =="
CATID=$(curl -s $B/products/categories | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)[0].id))")
IMP=$(curl -s -X POST $B/supplier/import -H "Content-Type: application/json" -d "{\"supplierProductId\":\"canva-pro-1y\",\"categoryId\":\"$CATID\",\"discountPct\":25}")
echo "$IMP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);console.log('imported:',p.name,'| price:',p.price,'ETB | original:',p.originalPrice,'| costUSD:',p.costUSD,'| mode:',p.priceMode)})"
IMPID=$(echo "$IMP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")

echo "== 5. public product list strips economics =="
curl -s "$B/products" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d).find(x=>x.id==='$IMPID');console.log('public price:',p.price,'| original:',p.originalPrice,'| costUSD leaked:',p.costUSD!==undefined?'YES(BAD)':'no(good)','| source leaked:',p.source!==undefined?'YES(BAD)':'no(good)')})"

echo "== 6. cart checkout: hubx qty2 + local qty1 =="
LOCAL=$(curl -s "$B/products" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);console.log(p.find(x=>x.id!=='$IMPID'&&x.stock>0).id)})")
CART=$(curl -s -X POST $B/payments/initialize-cart -H "Content-Type: application/json" -d "{\"items\":[{\"productId\":\"$IMPID\",\"quantity\":2},{\"productId\":\"$LOCAL\",\"quantity\":1}],\"customerName\":\"Cart Buyer\",\"customerEmail\":\"cart.buyer@gmail.com\",\"refCode\":\"DEMO2024\"}")
echo "$CART" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const c=JSON.parse(d);console.log('cartRef:',c.cartRef,'| total:',c.amount,'ETB | lines:',c.itemCount,'| payUrl:',c.paymentUrl)})"
CARTREF=$(echo "$CART" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).cartRef))")
FIRSTOID=$(echo "$CART" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).orderId))")

echo "== 7. mock pay whole cart =="
curl -s -X POST $B/payments/mock-confirm/$FIRSTOID | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);console.log('cart:',r.cart,'| orders settled:',r.orders.length);r.orders.forEach(o=>console.log(\` - \${o.product.name} x\${o.quantity}: \${o.status} | fulfillment: \${o.fulfillmentStatus} | keys: \${(o.licenseKey||'').split('\\n').length}\`))})"

echo "== 8. cart orders show delivered items =="
curl -s $B/orders/cart/$CARTREF | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);const hub=o.find(x=>x.product&&x.product.name.includes('Canva'));console.log('hubx keys:');(hub.licenseKey||'').split('\n').forEach(k=>console.log('   ',k))})"

echo "== 9. pricing update: discount 50% =="
curl -s -X PUT $B/products/$IMPID/pricing -H "Content-Type: application/json" -d '{"discountPct":50}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);console.log('after 50% off → price:',p.price,'| original:',p.originalPrice)})"

echo "== 10. rate change: USD→ETB 250 =="
curl -s -X PUT $B/settings -H "Content-Type: application/json" -d '{"usdToEtb":250}' | head -c 120
echo; curl -s "$B/products" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d).find(x=>x.id==='$IMPID');console.log('recomputed price @250 rate:',p.price,'ETB (expect \$1×250×3×50%off=375)')})"
# restore
curl -s -X PUT $B/settings -H "Content-Type: application/json" -d '{"usdToEtb":200,"globalDiscountPct":0}' > /dev/null

echo "== 11. admin product list has economics =="
curl -s $B/products/admin/all | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d).find(x=>x.id==='$IMPID');console.log('admin sees costUSD:',p.costUSD,'| margin:',p.marginMultiplier,'| preview:',JSON.stringify(p.pricingPreview))})"

kill $STUB_PID $BPID 2>/dev/null
echo; echo "STUB E2E DONE"
