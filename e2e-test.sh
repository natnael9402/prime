#!/usr/bin/env bash
cd "C:\Users\natna\Downloads\store\backend"
node dist/main.js > e2e-backend.log 2>&1 &
BPID=$!
cd "C:\Users\natna\Downloads\store\frontend"
npx.cmd next start -p 3100 > e2e-frontend.log 2>&1 &
FPID=$!
sleep 12
B=http://localhost:5000
F=http://localhost:3100

echo "== pages render (SSR HTML contains content) =="
curl -s $F/ | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log('home hero:', d.includes('ፕሪሚየም ዲጂታል ቁልፎች') ? 'OK' : 'MISSING', '| bytes:', d.length))"
curl -s $F/affiliate | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log('affiliate page:', d.includes('አጋር') ? 'OK' : 'MISSING'))"
curl -s $F/orders | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log('orders page:', d.includes('ትዕዛዞቼ') ? 'OK' : 'MISSING'))"

echo "== full purchase journey =="
PID=$(curl -s "$B/products" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).find(x=>x.stock>0).id))")
INIT=$(curl -s -X POST $B/payments/initialize -H "Content-Type: application/json" -d "{\"productId\":\"$PID\",\"customerName\":\"E2E Buyer\",\"customerEmail\":\"e2e@test.et\",\"refCode\":\"DEMO2024\"}")
OID=$(echo "$INIT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).orderId))")
TX=$(echo "$INIT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).txRef))")
echo "checkout url: $(echo "$INIT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).paymentUrl))")"

curl -s $F/pay/mock/$OID | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log('mock checkout page:', d.includes('የቻፓ ሙከራ ክፍያ') ? 'OK' : 'MISSING'))"
curl -s -X POST $B/payments/mock-confirm/$OID | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log('paid:',o.status,'| key:',o.licenseKey,'| commission:',o.commissionAmount,'ETB')})"
curl -s "$F/order/$OID/activation?tx_ref=$TX" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log('activation page:', (d.includes('ግዢ')||d.includes('ትዕዛዝ')) ? 'OK' : 'MISSING'))"
curl -s $B/affiliates/stats/DEMO2024 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);console.log('affiliate → sales:',s.sales,'| pending:',s.pending,'ETB | link:',s.link)})"
curl -s $F/product/$PID | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log('product page:', d.includes('ይክፈሉ') ? 'OK' : 'MISSING'))"

echo "== cleanup =="
kill $BPID 2>/dev/null
for port in 5000 3100; do
  pid=$(netstat -ano | grep "LISTENING" | grep ":$port " | awk '{print $NF}' | head -1)
  [ -n "$pid" ] && taskkill //F //PID $pid 2>&1 | head -1
done
echo "E2E DONE — all test servers stopped"
