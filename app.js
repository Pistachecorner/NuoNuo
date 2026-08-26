const url=window.NUONUO_STORE_SUPABASE_URL,key=window.NUONUO_STORE_SUPABASE_ANON_KEY,owner=window.NUONUO_STORE_OWNER_ID,sb=supabase.createClient(url,key);let products=[],cats=[],cart=[];
const $=s=>document.querySelector(s),money=n=>`RM ${Number(n||0).toFixed(2)}`,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function errText(e){return e?.message||e?.details||e?.hint||'Unknown Supabase error.'}
function render(){ $('#count').textContent=cart.reduce((n,x)=>n+x.qty,0);$('#total').textContent=money(cart.reduce((n,x)=>n+x.qty*x.price,0));$('#items').innerHTML=cart.length?cart.map((x,i)=>`<div class="line"><div><b>${esc(x.name)}</b><br><span class="qty"><button onclick="qty(${i},-1)">−</button>${x.qty}<button onclick="qty(${i},1)">+</button></span></div><b>${money(x.qty*x.price)}</b></div>`).join(''):'<p>Cart is empty.</p>'}
window.qty=(i,d)=>{cart[i].qty+=d;if(cart[i].qty<1)cart.splice(i,1);render()};window.add=(id)=>{let p=products.find(x=>x.id===id);if(!p)return;let x=cart.find(x=>x.id===id);x?x.qty++:cart.push({id:p.id,name:p.name,price:Number(p.selling_price||0),cost:Number(p.calculated_cost||0),qty:1});render()};
function menu(cat=''){let list=products.filter(p=>!cat||p.category_id===cat);$('#grid').innerHTML=list.map(p=>`<article class="card"><div class="pic" ${p.image_url?`style="background-image:url('${esc(p.image_url)}')"`:''}>${p.image_url?'':'NuoNuo'}</div><div class="body"><h3>${esc(p.name)}</h3><p>${esc(p.description||'')}</p><div class="row"><b>${money(p.selling_price)}</b><button class="add" onclick="add('${p.id}')">Add</button></div></div></article>`).join('')||'<p>No products available.</p>'}
async function load(){
  if(!url||url.includes('PASTE_')||!key||key.includes('PASTE_')||!owner||owner.includes('PASTE_'))return $('#loading').textContent='Connect Supabase in config.js to load your real NuoNuo menu.';
  const [p,c]=await Promise.all([
    sb.from('products').select('id,name,description,selling_price,calculated_cost,image_url,category_id').eq('user_id',owner).eq('sales_channel','nuonuo').eq('active',true).order('name'),
    sb.from('categories').select('id,name').eq('user_id',owner).eq('sales_channel','nuonuo').order('sort_order').order('name')
  ]);
  if(p.error||c.error){console.error('NuoNuo menu load error',{products:p.error,categories:c.error});$('#loading').innerHTML=`<div>Menu connection failed.</div><small>${esc(errText(p.error||c.error))}</small>`;return}
  products=p.data||[];cats=c.data||[];$('#loading').remove();$('#cats').innerHTML=[{id:'',name:'All'},...cats].map((c,i)=>`<button class="tab ${i?'':'active'}" onclick="filterCat(this,'${c.id}')">${esc(c.name)}</button>`).join('');menu()
}
window.filterCat=(b,id)=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');menu(id)};
$('#shopBtn').onclick=()=>{$('#menu').scrollIntoView({behavior:'smooth',block:'start'});};$('#cart').onclick=()=>{$('#drawer').classList.remove('hidden');render()};$('#close').onclick=()=>$('#drawer').classList.add('hidden');
$('#checkout').onclick=()=>{if(!cart.length)return;$('#drawer').classList.add('hidden');$('#date').value=new Date().toISOString().slice(0,10);$('#summary').innerHTML=cart.map(x=>`<div class="summary"><span>${esc(x.name)} × ${x.qty}</span><b>${money(x.qty*x.price)}</b></div>`).join('');$('#checkoutTotal').textContent=money(cart.reduce((n,x)=>n+x.qty*x.price,0));$('#modal').classList.remove('hidden')};
$('#x').onclick=()=>$('#modal').classList.add('hidden');$('#done').onclick=()=>$('#success').classList.add('hidden');
$('#form').onsubmit=async e=>{e.preventDefault();$('#error').textContent='';$('#place').disabled=true;try{
  const subtotal=cart.reduce((n,x)=>n+x.qty*x.price,0),name=$('#name').value.trim(),phone=$('#phone').value.trim(),email=$('#email').value.trim(),address=$('#address').value.trim(),fulfil=$('#fulfil').value,payment=$('#payment').value,note=$('#note').value.trim(),date=$('#date').value;
  const customerId=crypto.randomUUID(),orderId=crypto.randomUUID(),orderNumber=`WEB-${Date.now().toString().slice(-6)}`;
  const {error:ce}=await sb.from('customers').insert({id:customerId,user_id:owner,name,phone,email,address,notes:'Public NuoNuo website order',sales_channel:'nuonuo'});if(ce)throw ce;
  const {error:oe}=await sb.from('orders').insert({id:orderId,user_id:owner,customer_id:customerId,order_number:orderNumber,sales_channel:'nuonuo',order_type:'pre_order',scheduled_date:date,order_date:date,status:'pending',subtotal,discount:0,delivery_fee:0,total:subtotal,payment_status:'unpaid',payment_method:payment,notes:[`Public website · ${fulfil}`,note].filter(Boolean).join(' | ')});if(oe)throw oe;
  for(const x of cart){const {error}=await sb.from('order_items').insert({user_id:owner,order_id:orderId,product_id:x.id,quantity:x.qty,unit_price:x.price,unit_cost:x.cost,addons_total:0,line_total:x.qty*x.price});if(error)throw error}
  cart=[];render();$('#modal').classList.add('hidden');$('#orderno').textContent=orderNumber;$('#success').classList.remove('hidden')
}catch(err){console.error(err);$('#error').textContent=errText(err)}finally{$('#place').disabled=false}};load();render();
