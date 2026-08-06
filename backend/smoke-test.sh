#!/usr/bin/env bash
cd "C:\Users\natna\Downloads\store\backend"
node dist/main.js > smoke-server.log 2>&1 &
SERVER_PID=$!
sleep 6
B=http://localhost:5000

echo "== 1. payment mode =="
curl -s $B/payments/mode

echo; echo "== 2. products list (count) =="
curl -s "$B/products" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);console.log('products:',p.length, '| first:', p[0].name, p[0].price, p[0].currency)})"

echo "== 3. affiliate join =="
JOIN=$(curl -s -X POST $B/affiliates/join -H "Content-Type: application/json" -d '{"name":"Abebe Kebede","phone":"0911234567","payoutMethod":"telebirr","payoutAccount":"0911234567"}')
echo "$JOIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('code:',j.code,'| rate:',j.commissionRate,'| link:',j.link)})"
CODE=$(echo "$JOIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).code))")

echo "== 4. track click =="
curl -s -X POST $B/affiliates/click/$CODE

echo; echo "== 5. product id =="
PID=$(curl -s "$B/products" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);console.log(p.find(x=>x.stock>0).id)})")
echo "product: $PID"

echo "== 6. initialize payment (mock, with refCode) =="
INIT=$(curl -s -X POST $B/payments/initialize -H "Content-Type: application/json" -d "{\"productId\":\"$PID\",\"customerName\":\"Test Buyer\",\"customerEmail\":\"buyer@test.et\",\"customerPhone\":\"0911000000\",\"telegramUserId\":\"123456\",\"refCode\":\"$CODE\"}")
echo "$INIT"
OID=$(echo "$INIT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).orderId))")
TX=$(echo "$INIT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).txRef))")

echo; echo "== 7. verify BEFORE payment (must stay PENDING — bug check) =="
curl -s $B/payments/verify/$TX | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log('status:',o.status,'| key:',o.licenseKey||'none (correct!)')})"

echo "== 8. mock-confirm (buyer pays on mock checkout) =="
curl -s -X POST $B/payments/mock-confirm/$OID | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log('status:',o.status,'| key:',o.licenseKey,'| commission:',o.commissionAmount)})"

echo "== 9. verify AFTER payment =="
curl -s $B/payments/verify/$TX | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log('status:',o.status,'| key:',o.licenseKey)})"

echo "== 10. my orders by telegram id =="
curl -s "$B/orders/mine?telegramUserId=123456" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log('orders found:',o.length,'| first status:',o[0]&&o[0].status)})"

echo "== 11. affiliate stats after sale =="
curl -s $B/affiliates/stats/$CODE | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);console.log('clicks:',s.clicks,'| sales:',s.sales,'| pending:',s.pending,'| totalEarned:',s.totalEarned)})"

echo "== 12. admin stats =="
curl -s $B/orders/admin/stats | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);console.log('revenue:',s.totalRevenue,'| paidOrders:',s.paidOrdersCount,'| affiliates:',s.affiliatesCount,'| pendingComm:',s.pendingCommissions)})"

echo "== 13. admin commissions + mark paid =="
CID=$(curl -s "$B/affiliates/admin/commissions" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const c=JSON.parse(d);console.log(c[0].id)})")
curl -s -X POST $B/affiliates/admin/commissions/$CID/pay | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const c=JSON.parse(d);console.log('commission status now:',c.status)})"

echo "== 14. key pool: add keys =="
curl -s -X POST $B/licenses/$PID/keys -H "Content-Type: application/json" -d '{"keys":["SMOKE-KEY-001","SMOKE-KEY-002"]}'

echo; echo "== 15. telegram webhook (simulated /start) =="
curl -s -X POST $B/telegram/webhook -H "Content-Type: application/json" -d '{"message":{"text":"/start","chat":{"id":999},"from":{"first_name":"Test"}}}'

echo; echo "== 16. webhook settle (mock chapa webhook) =="
INIT2=$(curl -s -X POST $B/payments/initialize -H "Content-Type: application/json" -d "{\"productId\":\"$PID\",\"customerName\":\"Webhook Buyer\",\"customerEmail\":\"wh@test.et\"}")
TX2=$(echo "$INIT2" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).txRef))")
curl -s -X POST $B/payments/webhook -H "Content-Type: application/json" -d "{\"tx_ref\":\"$TX2\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);console.log('webhook result:',r.status,'| order status:',r.order&&r.order.status)})"

kill $SERVER_PID 2>/dev/null
echo; echo "SMOKE DONE"
