let url=window.NUONUO_STORE_SUPABASE_URL||'',key=window.NUONUO_STORE_SUPABASE_ANON_KEY||'',owner=window.NUONUO_STORE_OWNER_ID||'0d59b9c2-a3c1-4b28-b42f-228082819ade',sb=null;let products=[],cats=[],cart=[],authMode='login',heroIndex=0,currentProfile=null,currentRewards=null;
const $=s=>document.querySelector(s),money=n=>`RM ${Number(n||0).toFixed(2)}`,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function errText(e){
  const m=e?.message||e?.details||e?.hint||'Unknown Supabase error.';
  const code=String(e?.code||'');
  if(/rate limit|too many emails|over_email_send_rate_limit|sms.*rate|phone.*rate/i.test(`${m} ${code}`)) return 'Authentication is being rate-limited by Supabase. For NuoNuo phone + password signup without SMS verification, keep Confirm phone OFF. Do not enter fake SMS provider credentials.';
  if(/phone.*not.*enabled|unsupported.*phone|phone signups are disabled/i.test(`${m} ${code}`)) return 'NuoNuo customer login no longer uses Supabase Phone Auth. This message usually means the old customer build is still deployed. Redeploy the latest NuoNuo customer ZIP.';
  if(/sms provider|twilio|message service|account sid|auth token/i.test(`${m} ${code}`)) return 'NuoNuo customer login does not use SMS or Twilio. Make sure the latest customer build is deployed and keep Email confirmations OFF.';
  return m;
}
function scrollToId(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});$('#mobileNav')?.classList.remove('open')}window.scrollToId=scrollToId;
let toastTimer;function showToast(message){const t=$('#toast');if(!t)return;t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1900)}
function render(){ $('#count').textContent=cart.reduce((n,x)=>n+x.qty,0);$('#total').textContent=money(cart.reduce((n,x)=>n+x.qty*x.price,0));$('#items').innerHTML=cart.length?cart.map((x,i)=>`<div class="line"><div><b>${esc(x.name)}</b><br><span class="qty"><button onclick="qty(${i},-1)">−</button>${x.qty}<button onclick="qty(${i},1)">+</button></span></div><b>${money(x.qty*x.price)}</b></div>`).join(''):'<p>Cart is empty.</p>'}
window.qty=(i,d)=>{cart[i].qty+=d;if(cart[i].qty<1)cart.splice(i,1);render()};window.add=(id)=>{let p=products.find(x=>x.id===id);if(!p)return;let x=cart.find(x=>x.id===id);x?x.qty++:cart.push({id:p.id,name:p.name,price:Number(p.selling_price||0),cost:Number(p.calculated_cost||0),qty:1});render();showToast('Item added')};
function imageSrc(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  if(/^https?:\/\//i.test(raw)||raw.startsWith('data:')||raw.startsWith('blob:'))return raw;
  if(!sb?.storage?.from)return raw;
  try{
    const clean=raw.replace(/^\/+/,'');
    const bucketHint=clean.startsWith('product-images/')?'product-images':clean.startsWith('nuonuo-images/')?'nuonuo-images':'';
    const path=bucketHint?clean.replace(/^product-images\//,'').replace(/^nuonuo-images\//,''):clean;
    const buckets=bucketHint?[bucketHint]:['product-images','nuonuo-images'];
    for(const bucket of buckets){
      try{
        const {data}=sb.storage.from(bucket).getPublicUrl(path);
        if(data?.publicUrl)return data.publicUrl;
      }catch{}
    }
  }catch{}
  return raw;
}
function menu(cat='',query=''){
  let q=query.trim().toLowerCase();
  if(!cat){
    $('#grid').innerHTML='<div class="menu-empty">Select a category to view the menu.</div>';return;
  }
  let list=products.filter(p=>p.category_id===cat&&(!q||`${p.name} ${p.description||''}`.toLowerCase().includes(q)));
  $('#grid').innerHTML=list.map(p=>{
    const img=imageSrc(p.image_url);
    return `<article class="card"><div class="pic ${img?'':'no-image'}" ${img?`style="background-image:url('${esc(img)}')"`:''}>${img?'':'NuoNuo'}</div><div class="body"><h3>${esc(p.name)}</h3>${p.description?`<p>${esc(p.description)}</p>`:''}<div class="row"><b>${money(p.selling_price)}</b><button class="add" onclick="add('${p.id}')">Add</button></div></div></article>`
  }).join('')||'<p>No products available in this category.</p>';
}
function renderCategories(){
  const holder=$('#categoryCards');if(!holder)return;
  holder.innerHTML=cats.map(c=>{
    const p=products.find(x=>x.category_id===c.id),img=imageSrc(p?.image_url);
    return `<button class="category-card" type="button" onclick="filterByCategory('${c.id}')">${img?`<img src="${esc(img)}" alt="${esc(c.name)}">`:''}<h3>${esc(c.name)}</h3></button>`
  }).join('')||'<p>No categories yet.</p>';
}
function renderHero(){
  if(!products.length)return;
  const featured=products.filter(p=>p.image_url).slice(0,5);if(!featured.length)return;
  const p=featured[heroIndex%featured.length],img=imageSrc(p.image_url);
  $('#heroVisual').innerHTML=`<img src="${esc(img)}" alt="${esc(p.name)}"><div class="hero-caption"><span>${esc(p.name)}</span><small>Shop NuoNuo</small></div>`;
}
function startHero(){if(products.filter(p=>p.image_url).length<2)return;setInterval(()=>{heroIndex++;renderHero()},4500)}
function isNuoNuoChannel(value){const v=String(value??'').trim().toLowerCase().replace(/[·–—_\-]+/g,' ').replace(/\s+/g,' ');if(!v)return true;return v==='nuonuo'||v.startsWith('nuonuo ')}
async function load(){
  try{
    if((!url||url.includes('PASTE_')||!key||key.includes('PASTE_'))){
      try{
        const r=await fetch('/api/config',{cache:'no-store'});
        if(r.ok){const c=await r.json();url=c.url||url;key=c.key||key;}
      }catch(e){console.warn('NuoNuo config API unavailable:',e)}
    }
    if(!url||url.includes('PASTE_')||!key||key.includes('PASTE_')){
      throw new Error('Supabase connection is not configured. Add the public Supabase URL and anon/publishable key to config.js or Vercel environment variables.');
    }
    sb=supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

    // The Management tables are protected by RLS and must NOT be opened to
    // anonymous browser reads. The storefront uses one locked SECURITY DEFINER
    // RPC that returns only public menu fields. This keeps costs, owner IDs and
    // other Management-only columns private while reading the exact same live menu.
    const {data:menuData,error:menuError}=await sb.rpc('get_nuonuo_public_menu');
    if(menuError){
      console.error('NuoNuo public menu RPC failed',menuError);
      throw menuError;
    }
    products=Array.isArray(menuData?.products)?menuData.products:[];
    cats=Array.isArray(menuData?.categories)?menuData.categories:[];

    $('#loading')?.remove();
    const select=$('#categorySelect');
    if(select){
      select.innerHTML='<option value="">Categories</option>'+cats.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
      select.onchange=()=>menu(select.value,$('#searchInput')?.value||'');
    }
    renderCategories();
    renderHero();
    startHero();
    menu('');
  }catch(e){
    console.error('NuoNuo menu load error',e);
    const loading=$('#loading');
    if(loading)loading.innerHTML=`<div>Menu connection failed.</div><small>${esc(errText(e))}</small>`;
  }
}

window.filterByCategory=(id)=>{const select=$('#categorySelect');if(select){select.value=id;menu(id,$('#searchInput')?.value||'')}else menu(id,$('#searchInput')?.value||'')};
window.filterCat=(b,id)=>window.filterByCategory(id);
function currentCategory(){return $('#categorySelect')?.value||''}
$('#shopBtn').onclick=()=>scrollToId('menu');$('#menuToggle').onclick=()=>$('#mobileNav').classList.toggle('open');$('#cart').onclick=()=>{$('#drawer').classList.remove('hidden');$('#drawer').setAttribute('aria-hidden','false');document.body.classList.add('cart-open');render()};$('#close').onclick=()=>{$('#drawer').classList.add('hidden');$('#drawer').setAttribute('aria-hidden','true');document.body.classList.remove('cart-open')};$('#drawerBackdrop').onclick=()=>{$('#drawer').classList.add('hidden');$('#drawer').setAttribute('aria-hidden','true');document.body.classList.remove('cart-open')};
function setAuthMode(mode){authMode=mode;$('#loginTab').classList.toggle('active',mode==='login');$('#signupTab').classList.toggle('active',mode==='signup');$('#authTitle').textContent=mode==='login'?'Welcome back.':'Create your NuoNuo account.';$('#authSubmit').textContent=mode==='login'?'Sign in':'Create account';$('#authNameField').classList.toggle('hidden',mode==='login');$('#authName').required=mode==='signup';$('#authPassword').autocomplete=mode==='signup'?'new-password':'current-password';$('#authMessage').textContent=''}
async function getProfile(){const {data:{session}}=await sb.auth.getSession();if(!session){currentProfile=null;return null}const {data,error}=await sb.from('nuonuo_customer_profiles').select('id,name,phone,email,address,birthday').eq('auth_user_id',session.user.id).eq('owner_id',owner).maybeSingle();if(error){console.error('Profile load error',error);currentProfile=null;return null}currentProfile=data||null;return currentProfile}
function profileComplete(p){return !!(p?.name?.trim()&&p?.phone?.trim())}
function fillProfileForm(p){$('#meName').value=p?.name||'';$('#mePhone').value=p?.phone||'';$('#meEmail').value=p?.email||'';$('#meAddress').value=p?.address||'';$('#meBirthday').value=p?.birthday||''}
async function openMe(){
  const p=await getProfile();
  fillProfileForm(p);
  $('#meMessage').textContent='';
  $('#rewardsModal')?.classList.add('hidden');
  $('#meModal').classList.remove('hidden');
}
window.openRewards=async()=>{
  if(!currentProfile){
    $('#accountModal').classList.remove('hidden');
    setAuthMode('login');
    return;
  }
  $('#meModal').classList.add('hidden');
  $('#rewardsModal').classList.remove('hidden');
  $('#rewardsBox').innerHTML='<p class="reward-empty">Loading rewards…</p>';
  $('#historyBox').innerHTML='<p class="reward-empty">Loading order history…</p>';
  await loadRewards();
  await openOrderHistory();
};
async function refreshAuth(){
  const {data:{session}}=await sb.auth.getSession();
  const detailsNav=$('#myDetailsNav'),ordersNav=$('#myOrdersNav');
  if(session){
    currentProfile=await getProfile();
    const welcomeName=currentProfile?.name?.trim()||'Customer';
    $('#accountLabel').textContent=`Welcome, ${welcomeName}`;
    $('#accountSignedOut').classList.add('hidden');
    $('#accountSignedIn').classList.add('hidden');
    $('#checkoutAccountHint').textContent=profileComplete(currentProfile)?`Signed in as ${welcomeName}.`:'You are signed in, but your name and phone still need to be completed.';
    detailsNav?.classList.remove('hidden');
    ordersNav?.classList.remove('hidden');
  }else{
    currentProfile=null;
    currentRewards=null;
    $('#accountLabel').textContent='Sign in';
    $('#accountSignedOut').classList.remove('hidden');
    $('#accountSignedIn').classList.add('hidden');
    $('#checkoutAccountHint').textContent='Guest checkout: name and phone are required. Address is required only for delivery.';
    detailsNav?.classList.add('hidden');
    ordersNav?.classList.add('hidden');
    $('#meModal')?.classList.add('hidden');
    $('#rewardsModal')?.classList.add('hidden');
  }
}
$('#accountBtn').onclick=()=>{const signedIn=!!currentProfile;if(signedIn){openMe()}else{$('#accountModal').classList.remove('hidden');setAuthMode('login');refreshAuth()}};$('#accountClose').onclick=()=>$('#accountModal').classList.add('hidden');$('#loginTab').onclick=()=>setAuthMode('login');$('#signupTab').onclick=()=>setAuthMode('signup');
$('#authForm').onsubmit=async e=>{e.preventDefault();$('#authMessage').textContent='';$('#authSubmit').disabled=true;try{const phone=normalizePhone($('#authPhone').value),password=$('#authPassword').value,name=$('#authName').value.trim();if(!/^\+?[0-9]{8,15}$/.test(phone.replace(/\s/g,'')))throw new Error('Please enter a valid phone number, e.g. +601112345678.');if(authMode==='signup'){const authEmail=authEmailFromPhone(phone);const {data,error}=await sb.auth.signUp({email:authEmail,password,options:{data:{full_name:name,display_name:name,account_type:'customer',app:'nuonuo-public-store',phone}}});if(error)throw error;if(data.session){await saveProfile({name,phone,email:'',address:'',birthday:''});$('#authMessage').textContent='Account created. You are signed in.';await refreshAuth();$('#accountModal').classList.add('hidden');openMe()}else{$('#authMessage').textContent='Account created, but no session was returned. In Supabase, keep Email confirmations OFF for this password-only customer login.'}}else{const authEmail=authEmailFromPhone(phone);const {error}=await sb.auth.signInWithPassword({email:authEmail,password});if(error)throw error;await refreshAuth();$('#accountModal').classList.add('hidden');openMe()}}catch(err){$('#authMessage').textContent=errText(err)}finally{$('#authSubmit').disabled=false}};
function normalizePhone(value){return String(value||'').replace(/[()\s-]/g,'').trim()}
// NuoNuo uses the phone number as the customer's login ID without requiring
// Supabase Phone Auth/SMS. We keep a private synthetic email solely for
// Supabase's email+password credential system. Customers never see or enter it.
function authEmailFromPhone(phone){const digits=normalizePhone(phone).replace(/^\+/,'').replace(/[^0-9]/g,'');return `customer_${digits}@auth.nuonuo.test`}
async function saveProfile(profile){const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error('Please sign in first.');const normalizedPhone=normalizePhone(profile.phone)||normalizePhone(session.user.phone);const payload={auth_user_id:session.user.id,owner_id:owner,name:profile.name?.trim()||null,phone:normalizedPhone||null,email:profile.email?.trim()||null,address:profile.address?.trim()||null,birthday:profile.birthday||null,updated_at:new Date().toISOString()};const {data,error}=await sb.from('nuonuo_customer_profiles').upsert(payload,{onConflict:'auth_user_id,owner_id'}).select().single();if(error)throw error;currentProfile=data;return data}
$('#meForm').onsubmit=async e=>{e.preventDefault();$('#meMessage').textContent='';$('#meSave').disabled=true;try{await saveProfile({name:$('#meName').value,phone:$('#mePhone').value,email:$('#meEmail').value,address:$('#meAddress').value,birthday:$('#meBirthday').value});await refreshAuth();$('#meModal').classList.add('hidden');showToast('Your details are saved')}catch(err){$('#meMessage').textContent=errText(err)}finally{$('#meSave').disabled=false}};
$('#meClose').onclick=()=>$('#meModal').classList.add('hidden');
$('#rewardsClose').onclick=()=>$('#rewardsModal').classList.add('hidden');

async function fetchOrderHistory(){
  if(!sb||!currentProfile)return null;
  const {data,error}=await sb.rpc('get_nuonuo_customer_order_history');
  if(error)throw error;
  return data||{orders:[],order_count:0,total_spent:0};
}
async function loadRewards(){
  if(!sb||!currentProfile){
    currentRewards=null;
    renderRewards();
    return null;
  }
  try{
    const {data,error}=await sb.rpc('get_nuonuo_customer_rewards');
    if(error)throw error;
    currentRewards=data||null;
  }catch(e){
    // The history RPC is already available in this customer build. Use it as
    // a safe fallback so the rewards area still shows earned rewards even if
    // the optional voucher RPC has not been installed yet.
    try{
      const history=await fetchOrderHistory();
      const orders=Array.isArray(history?.orders)?history.orders:[];
      const earned=orders.reduce((sum,o)=>sum+Math.floor(Math.max(0,Number(o.total||0))/100),0);
      currentRewards={
        order_count:Number(history?.order_count||orders.length||0),
        total_spent:Number(history?.total_spent||0),
        vouchers:[],
        fallback:true,
        earned_rewards:earned
      };
    }catch(historyError){
      console.warn('Rewards and order history unavailable:',e,historyError);
      currentRewards=null;
    }
  }
  renderRewards();
  return currentRewards;
}
function renderRewards(){
  const box=$('#rewardsBox');
  if(!box)return;
  if(!currentRewards){
    box.innerHTML='<p class="reward-empty">Rewards could not be loaded yet.</p>';
    return;
  }
  const vouchers=Array.isArray(currentRewards.vouchers)?currentRewards.vouchers:[];
  const available=vouchers.filter(v=>!v.used_at && new Date(v.expires_at)>new Date());
  const earned=Number(currentRewards.earned_rewards||0);
  const earnedCount=currentRewards.fallback?earned:available.length;
  box.innerHTML=`
    <div class="rewards-head"><b>My rewards</b><span>${available.length} active voucher${available.length===1?'':'s'}</span></div>
    <div class="reward-stats">
      <span><b>${Number(currentRewards.order_count||0)}</b><small>Total orders</small></span>
      <span><b>${money(currentRewards.total_spent||0)}</b><small>Total spent</small></span>
      <span><b>${currentRewards.fallback?earned:available.length}</b><small>${currentRewards.fallback?'Rewards earned':'Active rewards'}</small></span>
    </div>
    <p class="reward-rule">🎟️ Every RM 100 qualifying order earns RM 10 off for your next purchase. Min. spend RM 50 · valid for 3 months.</p>
    ${available.length?available.map(v=>`<div class="voucher-row"><div><b>${esc(v.code)}</b><small>RM ${Number(v.amount||10).toFixed(2)} off · min. spend RM ${Number(v.minimum_spend||50).toFixed(2)} · expires ${new Date(v.expires_at).toLocaleDateString()}</small></div><button type="button" onclick="copyVoucher('${esc(v.code)}')">Copy</button></div>`).join(''):
      (currentRewards.fallback&&earnedCount>0?`<div class="reward-earned">🎟️ You have ${earnedCount} RM 10 reward${earnedCount===1?'':'s'} earned from qualifying orders.</div><p class="reward-note">Voucher codes will appear here automatically once the rewards setup is connected.</p>`:'<p class="reward-empty">No active vouchers yet.</p>')}
  `;
}
window.copyVoucher=async code=>{
  try{await navigator.clipboard.writeText(code);showToast('Voucher copied');}catch{showToast(code)}
};
window.openOrderHistory=async()=>{
  const box=$('#historyBox');
  if(!box)return;
  box.classList.remove('hidden');
  box.innerHTML='<p>Loading order history…</p>';
  try{
    const data=await fetchOrderHistory();
    const orders=Array.isArray(data?.orders)?data.orders:[];
    const count=Number(data?.order_count||orders.length||0);
    const spent=Number(data?.total_spent||0);
    const summary=`<div class="history-summary"><b>${count}</b><span>Total orders</span><b>${money(spent)}</b><span>Total spent</span></div>`;
    if(!orders.length && data?.diagnostics){
      const d=data.diagnostics;
      box.innerHTML=summary+`<p class="reward-empty">No orders found yet.</p><small class="history-debug">Profile: ${d.profile_found?'OK':'missing'} · Phone: ${d.phone_found?'OK':'missing'} · Matching customers: ${Number(d.matching_customers||0)} · Matching orders: ${Number(d.matching_orders||0)}</small>`;
      return;
    }
    box.innerHTML=summary+(orders.length?orders.map(o=>`
      <div class="history-order">
        <div class="history-top"><b>${esc(o.order_number||'Order')}</b><span>${new Date(o.created_at).toLocaleString()}</span></div>
        <div class="history-items">${(Array.isArray(o.items)?o.items:[]).map(i=>`<div><span>${esc(i.name||'Item')} × ${i.quantity}</span><b>${money(i.line_total)}</b></div>`).join('')}</div>
        <div class="history-total"><span>${esc(o.status||'Pending')}</span><b>${money(o.total)}</b></div>
      </div>`).join(''):'<p class="reward-empty">No orders found yet.</p>');
  }catch(e){
    console.warn('Order history unavailable:',e);
    box.innerHTML='<p class="reward-empty">Order history is not available yet.</p>';
  }
};

window.openChangePassword=()=>{$('#passwordModal').classList.remove('hidden');$('#passwordForm').reset();$('#passwordMessage').textContent=''};
$('#passwordClose').onclick=()=>$('#passwordModal').classList.add('hidden');
$('#passwordForm').onsubmit=async e=>{
  e.preventDefault();
  const msg=$('#passwordMessage');msg.textContent='';
  const btn=$('#passwordSubmit');btn.disabled=true;
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(!session||!currentProfile)throw new Error('Please sign in first.');
    const oldPassword=$('#oldPassword').value;
    const newPassword=$('#newPassword').value;
    const confirmPassword=$('#confirmPassword').value;
    if(newPassword.length<6)throw new Error('New password must be at least 6 characters.');
    if(newPassword!==confirmPassword)throw new Error('New passwords do not match.');
    const phone=normalizePhone(currentProfile.phone||'');
    if(!phone)throw new Error('Your account does not have a phone number saved.');
    const {error:verifyError}=await sb.auth.signInWithPassword({email:authEmailFromPhone(phone),password:oldPassword});
    if(verifyError)throw new Error('Current password is incorrect.');
    const {error:updateError}=await sb.auth.updateUser({password:newPassword});
    if(updateError)throw updateError;
    $('#passwordModal').classList.add('hidden');
    showToast('Password changed successfully');
  }catch(err){msg.textContent=errText(err)}
  finally{btn.disabled=false}
};

$('#logoutCustomer').onclick=async()=>{if(!sb)return;await sb.auth.signOut();$('#meModal').classList.add('hidden');await refreshAuth();setAuthMode('login');showToast('You are signed out')};
function birthdayMonthActive(birthday){return !!birthday&&Number(String(birthday).slice(5,7))===new Date().getMonth()+1}
function updateCheckoutAddressRequirement(){const delivery=$('#fulfil').value==='delivery';const input=$('#address');if(input)input.required=delivery}
async function prepareCheckout(){if(!cart.length)return;$('#drawer').classList.add('hidden');$('#drawer').setAttribute('aria-hidden','true');document.body.classList.remove('cart-open');$('#date').value=new Date().toISOString().slice(0,10);$('#summary').innerHTML=cart.map(x=>`<div class="summary"><span>${esc(x.name)} × ${x.qty}</span><b>${money(x.qty*x.price)}</b></div>`).join('');$('#checkoutTotal').textContent=money(cart.reduce((n,x)=>n+x.qty*x.price,0));$('#voucherCode').value='';$('#voucherMessage').textContent='';$('#voucherDiscount').textContent='';const {data:{session}}=await sb.auth.getSession();currentProfile=session?await getProfile():null;const p=currentProfile||{};$('#name').value=p.name||'';$('#phone').value=p.phone||session?.user?.phone||'';$('#email').value=p.email||'';$('#address').value=p.address||'';$('#birthdayCheckout').value=p.birthday||'';$('#checkoutProfileNote').textContent=session?(profileComplete(p)?'Your saved name and phone have been filled in. Address is only needed for delivery.':'Please complete your name and phone below. Address is only needed for delivery. Email and birthday are optional.'):'Guest checkout: name and phone are required. Address is required only for delivery. Email and birthday are optional.';$('#birthdayGiftNotice').classList.toggle('hidden',!birthdayMonthActive(p.birthday));updateCheckoutAddressRequirement();$('#modal').classList.remove('hidden')}
$('#checkout').onclick=prepareCheckout;$('#fulfil').onchange=updateCheckoutAddressRequirement;$('#x').onclick=()=>$('#modal').classList.add('hidden');$('#done').onclick=()=>{$('#success').classList.add('hidden');scrollToId('menu')};
$('#applyVoucher').onclick=async()=>{
  const msg=$('#voucherMessage'),code=$('#voucherCode').value.trim();
  msg.textContent='';$('#voucherDiscount').textContent='';
  if(!code){msg.textContent='Enter a voucher code.';return}
  if(!currentProfile){msg.textContent='Please sign in to use a voucher.';return}
  const subtotal=cart.reduce((n,x)=>n+x.qty*x.price,0);
  if(subtotal<50){msg.textContent='Minimum spend is RM 50.';return}
  try{
    const {data,error}=await sb.rpc('check_nuonuo_voucher',{p_code:code,p_subtotal:subtotal});
    if(error)throw error;
    if(!data?.valid)throw new Error(data?.message||'Voucher is not valid.');
    $('#voucherDiscount').textContent=`RM ${Number(data.discount||10).toFixed(2)} discount applied`;
    $('#voucherMessage').dataset.valid='true';
    $('#voucherMessage').dataset.code=code;
    $('#voucherMessage').textContent='Voucher ready to use.';
    $('#checkoutTotal').textContent=money(Math.max(0,subtotal-Number(data.discount||10)));
  }catch(err){
    $('#voucherMessage').dataset.valid='false';
    $('#voucherMessage').textContent=errText(err);
  }
};
$('#form').onsubmit=async e=>{e.preventDefault();$('#error').textContent='';$('#place').disabled=true;try{const subtotal=cart.reduce((n,x)=>n+x.qty*x.price,0),name=$('#name').value.trim(),phone=$('#phone').value.trim(),email=$('#email').value.trim(),address=$('#address').value.trim(),birthday=$('#birthdayCheckout').value||null,fulfil=$('#fulfil').value,payment=$('#payment').value,note=$('#note').value.trim(),date=$('#date').value;const {data:{session}}=await sb.auth.getSession();if(!name||!phone)throw new Error('Name and phone number are required to place an order.');if(fulfil==='delivery'&&!address)throw new Error('Address is required for delivery orders.');if(!/^\+?[0-9]{8,15}$/.test(normalizePhone(phone)))throw new Error('Please enter a valid phone number.');if(session){await saveProfile({name,phone,email,address,birthday})}const items=cart.map(x=>({product_id:x.id,quantity:x.qty}));
const voucherCode=$('#voucherMessage').dataset.valid==='true'?$('#voucherMessage').dataset.code:'';
let result,oe;
if(session){
  const v2=await sb.rpc('place_nuonuo_public_order_rewards',{p_name:name,p_phone:normalizePhone(phone),p_email:email||null,p_address:address,p_birthday:birthday,p_fulfilment:fulfil,p_payment_method:payment,p_note:note||null,p_order_date:date||null,p_items:items,p_voucher_code:voucherCode||null});
  result=v2.data;oe=v2.error;
  // Safety fallback: if the optional rewards RPC has not been installed,
  // use the original checkout RPC so normal ordering never breaks.
  if(oe && /place_nuonuo_public_order_rewards|does not exist|42883/i.test(`${oe.message||''} ${oe.code||''}`)){
    const base=await sb.rpc('place_nuonuo_public_order',{p_name:name,p_phone:normalizePhone(phone),p_email:email||null,p_address:address,p_birthday:birthday,p_fulfilment:fulfil,p_payment_method:payment,p_note:note||null,p_order_date:date||null,p_items:items});
    result=base.data;oe=base.error;
  }
}else{
  const base=await sb.rpc('place_nuonuo_public_order',{p_name:name,p_phone:normalizePhone(phone),p_email:email||null,p_address:address,p_birthday:birthday,p_fulfilment:fulfil,p_payment_method:payment,p_note:note||null,p_order_date:date||null,p_items:items});
  result=base.data;oe=base.error;
}
if(oe)throw oe;
const orderNumber=result?.order_number||'';
const birthdayGift=!!result?.birthday_gift;
const vouchersEarned=Number(result?.vouchers_earned||0);cart=[];render();$('#modal').classList.add('hidden');$('#orderno').textContent=orderNumber;$('#successBirthday').classList.toggle('hidden',!birthdayGift);$('#successVoucher').classList.toggle('hidden',vouchersEarned<1);$('#successVoucher').textContent=vouchersEarned>0?`🎟️ You earned ${vouchersEarned} RM 10 voucher${vouchersEarned===1?'':'s'} for your next purchase.`:'';$('#success').classList.remove('hidden')}catch(err){console.error(err);$('#error').textContent=errText(err)}finally{$('#place').disabled=false}};
async function initStore(){render();await load();if(sb){sb.auth.onAuthStateChange(()=>refreshAuth());await refreshAuth()}}
initStore();
