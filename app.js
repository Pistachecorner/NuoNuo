const url=window.NUONUO_STORE_SUPABASE_URL,key=window.NUONUO_STORE_SUPABASE_ANON_KEY,owner=window.NUONUO_STORE_OWNER_ID,sb=supabase.createClient(url,key);let products=[],cats=[],cart=[],authMode='login',heroIndex=0;
const $=s=>document.querySelector(s),money=n=>`RM ${Number(n||0).toFixed(2)}`,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function errText(e){
  const m=e?.message||e?.details||e?.hint||'Unknown Supabase error.';
  const code=String(e?.code||'');
  if(/rate limit|too many emails|over_email_send_rate_limit/i.test(`${m} ${code}`)){
    return 'Customer registration is blocked by Supabase email rate limits. This NuoNuo customer account does not need email confirmation for testing: in Supabase → Authentication → Providers → Email, turn OFF Confirm email, then try Register again. For production email confirmation, configure Custom SMTP instead.';
  }
  return m;
}
function scrollToId(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});$('#mobileNav')?.classList.remove('open')}window.scrollToId=scrollToId;
let toastTimer;
function showToast(message){const t=$('#toast');if(!t)return;t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1700)}
function render(){ $('#count').textContent=cart.reduce((n,x)=>n+x.qty,0);$('#total').textContent=money(cart.reduce((n,x)=>n+x.qty*x.price,0));$('#items').innerHTML=cart.length?cart.map((x,i)=>`<div class="line"><div><b>${esc(x.name)}</b><br><span class="qty"><button onclick="qty(${i},-1)">−</button>${x.qty}<button onclick="qty(${i},1)">+</button></span></div><b>${money(x.qty*x.price)}</b></div>`).join(''):'<p>Cart is empty.</p>'}
window.qty=(i,d)=>{cart[i].qty+=d;if(cart[i].qty<1)cart.splice(i,1);render()};window.add=(id)=>{let p=products.find(x=>x.id===id);if(!p)return;let x=cart.find(x=>x.id===id);x?x.qty++:cart.push({id:p.id,name:p.name,price:Number(p.selling_price||0),cost:Number(p.calculated_cost||0),qty:1});render();showToast('Item added');};
function menu(cat='',query=''){let q=query.trim().toLowerCase();if(!cat){$('#grid').innerHTML='<div class="menu-empty">Choose a category above to browse our desserts.</div>';return}let list=products.filter(p=>p.category_id===cat&&(!q||`${p.name} ${p.description||''}`.toLowerCase().includes(q)));$('#grid').innerHTML=list.map(p=>`<article class="card"><div class="pic ${p.image_url?'':'no-image'}" ${p.image_url?`style="background-image:url('${esc(p.image_url)}')"`:''}>${p.image_url?'':'NuoNuo'}</div><div class="body"><h3>${esc(p.name)}</h3>${p.description?`<p>${esc(p.description)}</p>`:''}<div class="row"><b>${money(p.selling_price)}</b><button class="add" onclick="add('${p.id}')">Add</button></div></div></article>`).join('')||'<p>No products available in this category.</p>'}
function renderCategories(){const holder=$('#categoryCards');if(!holder)return;holder.innerHTML=cats.slice(0,6).map(c=>{const p=products.find(x=>x.category_id===c.id);return `<button class="category-card" type="button" onclick="filterByCategory('${c.id}')">${p?.image_url?`<img src="${esc(p.image_url)}" alt="${esc(c.name)}">`:''}<h3>${esc(c.name)}</h3></button>`}).join('')||'<p>No categories yet.</p>'}
window.filterByCategory=id=>{scrollToId('menu');setTimeout(()=>{const b=[...document.querySelectorAll('.tab')].find(x=>x.dataset.id===id);if(b)filterCat(b,id)},50)};
function renderHero(){if(!products.length)return;const featured=products.filter(p=>p.image_url).slice(0,5);if(!featured.length)return;const p=featured[heroIndex%featured.length];$('#heroVisual').innerHTML=`<img src="${esc(p.image_url)}" alt="${esc(p.name)}"><div class="hero-caption"><span>${esc(p.name)}</span><small>Shop NuoNuo</small></div>`;}
function startHero(){if(products.filter(p=>p.image_url).length<2)return;setInterval(()=>{heroIndex++;renderHero()},4500)}
function isNuoNuoChannel(value){
  const v=String(value??'').trim().toLowerCase().replace(/[·–—_\-]+/g,' ').replace(/\s+/g,' ');
  if(!v)return true;
  return v==='nuonuo'||v.startsWith('nuonuo ');
}

async function load(){
  if(!url||url.includes('PASTE_')||!key||key.includes('PASTE_')||!owner||owner.includes('PASTE_')){
    $('#loading').textContent='Connect Supabase in config.js to load your real NuoNuo menu.';
    return;
  }

  // Do not hard-code one exact channel spelling here. The Management app can use
  // labels such as “NuoNuo · Local”, while older rows may simply be “nuonuo”.
  // RLS remains the final security boundary for the public storefront.
  const [p,c]=await Promise.all([
    sb.from('products').select('id,name,description,selling_price,calculated_cost,image_url,category_id,sales_channel').eq('user_id',owner).eq('active',true).order('name'),
    sb.from('categories').select('id,name,sort_order,sales_channel').eq('user_id',owner).order('sort_order').order('name')
  ]);

  if(p.error||c.error){
    console.error('NuoNuo menu load error',{products:p.error,categories:c.error});
    $('#loading').innerHTML=`<div>Menu connection failed.</div><small>${esc(errText(p.error||c.error))}</small>`;
    return;
  }

  products=(p.data||[]).filter(x=>isNuoNuoChannel(x.sales_channel));
  cats=(c.data||[]).filter(x=>isNuoNuoChannel(x.sales_channel));
  $('#loading').remove();

  $('#cats').innerHTML=cats.map(c=>`<button data-id="${c.id}" class="tab" onclick="filterCat(this,'${c.id}')">${esc(c.name)}</button>`).join('');
  renderCategories();
  renderHero();
  startHero();
  // Keep the menu empty on first load. Products appear only after the customer
  // chooses a category, as requested.
  menu();
}
window.filterCat=(b,id)=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');menu(id,$('#searchInput')?.value||'')};
function currentCategory(){return document.querySelector('.tab.active')?.dataset.id||''}
$('#shopBtn').onclick=()=>scrollToId('menu');
$('#menuToggle').onclick=()=>$('#mobileNav').classList.toggle('open');$('#cart').onclick=()=>{$('#drawer').classList.remove('hidden');$('#drawer').setAttribute('aria-hidden','false');document.body.classList.add('cart-open');render()};$('#close').onclick=()=>{$('#drawer').classList.add('hidden');$('#drawer').setAttribute('aria-hidden','true');document.body.classList.remove('cart-open')};$('#drawerBackdrop').onclick=()=>{$('#drawer').classList.add('hidden');$('#drawer').setAttribute('aria-hidden','true');document.body.classList.remove('cart-open')};
function setAuthMode(mode){authMode=mode;$('#loginTab').classList.toggle('active',mode==='login');$('#signupTab').classList.toggle('active',mode==='signup');$('#authTitle').textContent=mode==='login'?'Welcome back.':'Create your NuoNuo account.';$('#authSubmit').textContent=mode==='login'?'Sign in':'Create account';$('#authNameField').classList.toggle('hidden',mode==='login');$('#authName').required=mode==='signup';$('#authMessage').textContent=''}
async function refreshAuth(){const {data:{session}}=await sb.auth.getSession();if(session){$('#accountLabel').textContent='Account';$('#accountSignedOut').classList.add('hidden');$('#accountSignedIn').classList.remove('hidden');$('#signedInEmail').textContent=session.user.email||'';$('#checkoutAccountHint').textContent=`Signed in as ${session.user.email||'your account'}.`;}else{$('#accountLabel').textContent='Sign in';$('#accountSignedOut').classList.remove('hidden');$('#accountSignedIn').classList.add('hidden');$('#checkoutAccountHint').textContent='You can checkout as a guest, or sign in for a faster checkout.'}}
$('#accountBtn').onclick=()=>{$('#accountModal').classList.remove('hidden');refreshAuth()};$('#accountClose').onclick=()=>$('#accountModal').classList.add('hidden');$('#loginTab').onclick=()=>setAuthMode('login');$('#signupTab').onclick=()=>setAuthMode('signup');
$('#authForm').onsubmit=async e=>{e.preventDefault();$('#authMessage').textContent='';$('#authSubmit').disabled=true;try{const email=$('#authEmail').value.trim(),password=$('#authPassword').value,name=$('#authName').value.trim();if(authMode==='signup'){const redirectTo=`${window.location.origin}/#account`;const {data,error}=await sb.auth.signUp({
        email,
        password,
        options:{
          data:{
            full_name:name,
            display_name:name,
            account_type:'customer',
            app:'nuonuo-public-store'
          },
          emailRedirectTo:redirectTo
        }
      });if(error)throw error;if(data.session){$('#authMessage').textContent='Account created. You are signed in.';await refreshAuth()}else{$('#authMessage').textContent='Account created. Please check your email to confirm your account.'}}else{const {error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;await refreshAuth()}}catch(err){$('#authMessage').textContent=errText(err)}finally{$('#authSubmit').disabled=false}};
$('#logoutCustomer').onclick=async()=>{await sb.auth.signOut();await refreshAuth();setAuthMode('login')};sb.auth.onAuthStateChange(()=>refreshAuth());
$('#checkout').onclick=async()=>{if(!cart.length)return;$('#drawer').classList.add('hidden');$('#drawer').setAttribute('aria-hidden','true');document.body.classList.remove('cart-open');$('#date').value=new Date().toISOString().slice(0,10);$('#summary').innerHTML=cart.map(x=>`<div class="summary"><span>${esc(x.name)} × ${x.qty}</span><b>${money(x.qty*x.price)}</b></div>`).join('');$('#checkoutTotal').textContent=money(cart.reduce((n,x)=>n+x.qty*x.price,0));const {data:{session}}=await sb.auth.getSession();if(session){$('#email').value=session.user.email||'';$('#checkoutAccountHint').textContent=`Signed in as ${session.user.email||'your account'}.`;}else{$('#checkoutAccountHint').textContent='You can checkout as a guest, or sign in for a faster checkout.'}$('#modal').classList.remove('hidden')};
$('#x').onclick=()=>$('#modal').classList.add('hidden');$('#done').onclick=()=>{$('#success').classList.add('hidden');scrollToId('menu')};
$('#form').onsubmit=async e=>{e.preventDefault();$('#error').textContent='';$('#place').disabled=true;try{const subtotal=cart.reduce((n,x)=>n+x.qty*x.price,0),name=$('#name').value.trim(),phone=$('#phone').value.trim(),email=$('#email').value.trim(),address=$('#address').value.trim(),fulfil=$('#fulfil').value,payment=$('#payment').value,note=$('#note').value.trim(),date=$('#date').value;const customerId=crypto.randomUUID(),orderId=crypto.randomUUID(),orderNumber=`WEB-${Date.now().toString().slice(-6)}`;const {error:ce}=await sb.from('customers').insert({id:customerId,user_id:owner,name,phone,email,address,notes:'Public NuoNuo website order',sales_channel:'nuonuo'});if(ce)throw ce;const {error:oe}=await sb.from('orders').insert({id:orderId,user_id:owner,customer_id:customerId,order_number:orderNumber,sales_channel:'nuonuo',order_type:'pre_order',scheduled_date:date,order_date:date,status:'pending',subtotal,discount:0,delivery_fee:0,total:subtotal,payment_status:'unpaid',payment_method:payment,notes:[`Public website · ${fulfil}`,note].filter(Boolean).join(' | ')});if(oe)throw oe;for(const x of cart){const {error}=await sb.from('order_items').insert({user_id:owner,order_id:orderId,product_id:x.id,quantity:x.qty,unit_price:x.price,unit_cost:x.cost,addons_total:0,line_total:x.qty*x.price});if(error)throw error}cart=[];render();$('#modal').classList.add('hidden');$('#orderno').textContent=orderNumber;$('#success').classList.remove('hidden')}catch(err){console.error(err);$('#error').textContent=errText(err)}finally{$('#place').disabled=false}};
load();render();refreshAuth();
