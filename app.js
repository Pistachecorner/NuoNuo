let url=window.NUONUO_STORE_SUPABASE_URL||'',key=window.NUONUO_STORE_SUPABASE_ANON_KEY||'',owner=window.NUONUO_STORE_OWNER_ID||'0d59b9c2-a3c1-4b28-b42f-228082819ade',sb=null;let products=[],cats=[],addons=[],productAddonLinks=[],cart=[],authMode='login',heroIndex=0,currentProfile=null,currentRewards=null;
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
function cartItemUnitPrice(x){return Number(x.price||0)+(x.addons||[]).reduce((sum,a)=>sum+Number(a.price||0),0)}
function cartItemTotal(x){return cartItemUnitPrice(x)*Number(x.qty||0)}
function render(){ $('#count').textContent=cart.reduce((n,x)=>n+x.qty,0);$('#total').textContent=money(cart.reduce((n,x)=>n+cartItemTotal(x),0));$('#items').innerHTML=cart.length?cart.map((x,i)=>`<div class="line"><div><b>${esc(x.name)}</b>${x.addons?.length?`<br><small>${x.addons.map(a=>`+ ${esc(a.name)}`).join(', ')}</small>`:''}<br><span class="qty"><button onclick="qty(${i},-1)">−</button>${x.qty}<button onclick="qty(${i},1)">+</button></span></div><b>${money(cartItemTotal(x))}</b></div>`).join(''):'<p>Cart is empty.</p>'}
window.qty=(i,d)=>{cart[i].qty+=d;if(cart[i].qty<1)cart.splice(i,1);render()};
function isDubaiChewyProduct(productId){
  const product=products.find(p=>String(p.id)===String(productId));
  if(!product)return false;
  const category=cats.find(c=>sameId(c.id,product.category_id));
  const haystack=`${product.name||''} ${category?.name||''}`.toLowerCase();
  return haystack.includes('dubai chewy cookies');
}
function addonOptionsForProduct(productId){
  // Keep the storefront connected to the same Management > NuoNuo > Menu
  // data. Management's order builder uses explicit product_addons links when
  // they exist, and falls back to all active add-ons in the active channel
  // when a product has no explicit links. Mirror that exact behavior here.
  if(!isDubaiChewyProduct(productId))return [];
  const ids=productAddonLinks
    .filter(x=>String(x.product_id)===String(productId))
    .map(x=>String(x.addon_id));
  const linked=ids.map(id=>addons.find(a=>String(a.id)===id)).filter(Boolean);
  return linked.length ? linked : addons.filter(a=>a && a.active!==false);
}
function addToCart(p,selectedAddons=[],quantity=1){
  if(!p)return;
  const qty=Math.max(1,Math.floor(Number(quantity)||1));
  const normalized=[...(selectedAddons||[])].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const signature=`${p.id}|${normalized.map(a=>a.id).join(',')}`;
  const x=cart.find(x=>x.signature===signature);
  if(x)x.qty+=qty;
  else cart.push({signature,id:p.id,name:p.name,price:Number(p.selling_price||0),cost:Number(p.calculated_cost||0),qty,addons:normalized.map(a=>({id:a.id,name:a.name,price:Number(a.price||0)}))});
  render();
  showToast(`${qty} item${qty===1?'':'s'} added`);
}
function closeProductDetail(){const m=$('#productDetailModal');if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true')}}
function openProductDetail(id){
  const p=products.find(x=>String(x.id)===String(id));
  if(!p)return;
  const m=$('#productDetailModal'),content=$('#productDetailContent');
  if(!m||!content)return;
  const imgs=productImageCandidates(p);
  const cat=cats.find(c=>sameId(c.id,p.category_id));
  const options=addonOptionsForProduct(p.id);
  content.innerHTML=`<button type="button" class="product-detail-close" aria-label="Close">×</button>
    <div class="product-detail-grid">
      <div class="product-detail-image">${imgs.length?imageTag(imgs,p.name):'<div class="no-image">NuoNuo</div>'}</div>
      <div class="product-detail-info">
        <small>${esc(cat?.name||'NUONUO')}</small>
        <h2>${esc(p.name)}</h2>
        <div class="product-detail-price">${money(p.selling_price)}</div>
        ${p.description?`<p class="product-detail-description">${esc(p.description)}</p>`:'<p class="product-detail-description muted">Freshly made with care.</p>'}
        ${options.length?`<div class="product-detail-addons"><div class="addon-heading"><span>Add-ons</span><small>Optional</small></div><div class="addon-list">${options.map(a=>`<label class="addon-option"><input type="checkbox" value="${esc(a.id)}"><span>${esc(a.name)}</span><b>+ ${money(a.price)}</b></label>`).join('')}</div></div>`:''}
        <div class="product-detail-quantity"><span>Quantity</span><div class="quantity-control"><button type="button" id="productQtyMinus" aria-label="Decrease quantity">−</button><span id="productQty">1</span><button type="button" id="productQtyPlus" aria-label="Increase quantity">+</button></div></div>
        <button type="button" id="productDetailAdd" class="dark product-detail-add">Add to cart · ${money(p.selling_price)}</button>
      </div>
    </div>`;
  m.classList.remove('hidden');
  m.setAttribute('aria-hidden','false');
  const close=content.querySelector('.product-detail-close');
  close.onclick=closeProductDetail;
  let quantity=1;
  const qtyEl=content.querySelector('#productQty');
  const addBtn=content.querySelector('#productDetailAdd');
  const getSelected=()=>options.filter(a=>content.querySelector(`input[value="${CSS.escape(String(a.id))}"]`)?.checked);
  const updateTotal=()=>{
    const selected=getSelected();
    const unit=Number(p.selling_price||0)+selected.reduce((s,a)=>s+Number(a.price||0),0);
    qtyEl.textContent=quantity;
    addBtn.textContent=`Add to cart · ${money(unit*quantity)}`;
  };
  content.querySelector('#productQtyMinus').onclick=()=>{quantity=Math.max(1,quantity-1);updateTotal()};
  content.querySelector('#productQtyPlus').onclick=()=>{quantity=Math.min(100,quantity+1);updateTotal()};
  content.querySelectorAll('.addon-option input').forEach(i=>i.onchange=updateTotal);
  addBtn.onclick=()=>{addToCart(p,getSelected(),quantity);closeProductDetail()};
  updateTotal();
}

function imageCandidates(value){
  const raw=String(value??'').trim();
  if(!raw)return [];
  const out=[];
  const push=v=>{v=String(v||'').trim();if(v&&!out.includes(v))out.push(v)};
  if(/^data:|^blob:/i.test(raw)){push(raw);return out;}
  if(/^https?:\/\//i.test(raw)){
    try{
      const u=new URL(raw);
      const m=u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i);
      if(m){
        const bucket=m[1],path=decodeURIComponent(m[2]);
        if(sb?.storage?.from){
          const pub=sb.storage.from(bucket).getPublicUrl(path).data?.publicUrl;
          push(pub);
        }
        push(raw);
      }else push(raw);
    }catch{push(raw)}
    return out;
  }
  let clean=raw.replace(/^\/+/, '').replace(/^https?:\/\/[^/]+\//i,'');
  clean=clean.replace(/^storage\/v1\/object\/(?:public|sign|authenticated)\//i,'');
  const bucketMatch=clean.match(/^(product-images|product-image|nuonuo-images|nuonuo-image)\/(.+)$/i);
  if(bucketMatch){
    const bucket=bucketMatch[1],path=bucketMatch[2];
    if(sb?.storage?.from){push(sb.storage.from(bucket).getPublicUrl(path).data?.publicUrl)}
    return out;
  }
  if(sb?.storage?.from){
    for(const bucket of ['product-images','product-image','nuonuo-images','nuonuo-image']){
      try{push(sb.storage.from(bucket).getPublicUrl(clean).data?.publicUrl)}catch{}
    }
  }
  push(raw);
  return out;
}
function imageSrc(value){return imageCandidates(value)[0]||'';}
function productImageCandidates(p){
  const values=[p?.image_url,p?.image,p?.imageUrl,p?.photo_url,p?.photoUrl,p?.product_image,p?.productImage,p?.image_path,p?.photo];
  const out=[];for(const v of values)for(const u of imageCandidates(v))if(!out.includes(u))out.push(u);return out;
}
function productImage(p){return productImageCandidates(p)[0]||'';}
function handleImageError(img){
  try{
    const list=JSON.parse(img.dataset.imageCandidates||'[]');
    const current=img.dataset.currentCandidate||img.getAttribute('src')||'';
    const index=list.indexOf(current);
    const next=list[index+1];
    if(next){
      img.dataset.currentCandidate=next;
      img.src=next;
      return;
    }
  }catch{}
  img.style.display='none';
  img.parentElement?.classList.add('no-image');
}
window.handleImageError=handleImageError;
function imageTag(candidates,alt,className=''){
  if(!candidates?.length)return '';
  const first=candidates[0];
  return `<img class="${className}" src="${esc(first)}" data-current-candidate="${esc(first)}" data-image-candidates="${esc(JSON.stringify(candidates))}" alt="${esc(alt||'')}" onerror="handleImageError(this)">`;
}
function sameId(a,b){return String(a??'').trim()===String(b??'').trim();}
function categoryProducts(catId){return products.filter(p=>sameId(p.category_id,catId));}

function productCardMarkup(p){
  const imgs=productImageCandidates(p);
  const category=cats.find(c=>sameId(c.id,p.category_id));
  return `<article class="card product-card-clickable" tabindex="0" role="button" data-product-detail="${esc(p.id)}"><div class="pic ${imgs.length?'':'no-image'}">${imgs.length?imageTag(imgs,p.name):'NuoNuo'}</div><div class="body"><small class="product-category">${esc(category?.name||'NUONUO')}</small><h3>${esc(p.name)}</h3>${p.description?`<p>${esc(p.description)}</p>`:''}<div class="row"><b>${money(p.selling_price)}</b><span class="view-product">View details →</span></div></div></article>`;
}
function bindProductCards(){
  $('#grid').querySelectorAll('[data-product-detail]').forEach(card=>{
    const open=()=>openProductDetail(card.dataset.productDetail);
    card.onclick=e=>{if(e.target.closest('a,button'))return;open()};
    card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}};
  });
}
function menu(cat='',query=''){
  const q=query.trim().toLowerCase();
  const filtered=products.filter(p=>(!cat||sameId(p.category_id,cat))&&(!q||`${p.name} ${p.description||''}`.toLowerCase().includes(q)));
  if(cat){
    const category=cats.find(c=>sameId(c.id,cat));
    $('#grid').innerHTML=filtered.length?`<section class="menu-category-section" id="menu-category-${esc(cat)}"><div class="menu-category-heading"><div class="section-kicker">CATEGORY</div><h3>${esc(category?.name||'Category')}</h3></div><div class="menu-category-products">${filtered.map(productCardMarkup).join('')}</div></section>`:'<p>No products available.</p>';
  }else{
    const sections=cats.map(c=>{
      const list=filtered.filter(p=>sameId(p.category_id,c.id));
      if(!list.length)return '';
      return `<section class="menu-category-section" id="menu-category-${esc(c.id)}"><div class="menu-category-heading"><div class="section-kicker">CATEGORY</div><h3>${esc(c.name)}</h3></div><div class="menu-category-products">${list.map(productCardMarkup).join('')}</div></section>`;
    }).join('');
    const uncategorized=filtered.filter(p=>!cats.some(c=>sameId(c.id,p.category_id)));
    const extra=uncategorized.length?`<section class="menu-category-section" id="menu-category-other"><div class="menu-category-heading"><div class="section-kicker">CATEGORY</div><h3>Other</h3></div><div class="menu-category-products">${uncategorized.map(productCardMarkup).join('')}</div></section>`:'';
    $('#grid').innerHTML=(sections+extra)||'<p>No products available.</p>';
  }
  bindProductCards();
}
function renderCategoryNav(){
  const holder=$('#menuCategoryNav');
  if(!holder)return;
  holder.innerHTML=`<button type="button" class="menu-category-link active" data-menu-category="">All</button>`+cats.map(c=>`<button type="button" class="menu-category-link" data-menu-category="${esc(c.id)}">${esc(c.name)}</button>`).join('');
  holder.onclick=e=>{
    const btn=e.target.closest('[data-menu-category]');
    if(!btn)return;
    const id=btn.dataset.menuCategory||'';
    filterByCategory(id);
  };
}
function scrollToMenuCategory(id){
  const target=id?document.getElementById(`menu-category-${id}`):document.getElementById('menu');
  if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderTrending(){
  const holder=$('#trendingLinks');
  if(!holder)return;
  holder.innerHTML=cats.map(c=>`<button type="button" class="trending-link" data-category-id="${esc(c.id)}">${esc(c.name)}</button>`).join('');
  if(holder.dataset.bound==='1')return;
  holder.dataset.bound='1';
  holder.addEventListener('click',e=>{
    const b=e.target.closest('[data-category-id]');
    if(!b||!holder.contains(b))return;
    e.preventDefault();
    window.filterByCategory(b.dataset.categoryId);
  });
}
function normalizePopularText(value){
  return String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,'');
}
function findPopularProduct(categoryNeedles, productNeedles){
  const categoryNames=(p)=>{
    const c=cats.find(c=>sameId(c.id,p.category_id));
    return normalizePopularText(c?.name);
  };
  const productName=(p)=>normalizePopularText(p?.name);
  const categoryMatch=(p)=>categoryNeedles.some(n=>categoryNames(p).includes(normalizePopularText(n)));
  const productExact=(p)=>productNeedles.some(n=>productName(p)===normalizePopularText(n));
  const productContains=(p)=>productNeedles.some(n=>productName(p).includes(normalizePopularText(n)));

  // IMPORTANT: curated homepage picks must match the requested product name.
  // Never fall back to a generic word such as "Oreo", otherwise a different
  // Oreo product can accidentally replace the intended pick.
  return products.find(p=>productExact(p)&&categoryMatch(p))
    || products.find(p=>productExact(p))
    || products.find(p=>productContains(p)&&categoryMatch(p))
    || products.find(p=>productContains(p))
    || null;
}
function renderPopular(){
  const holder=$('#popularGrid');
  if(!holder)return;

  // Fixed homepage picks, in the exact order requested by the owner.
  const picks=[
    findPopularProduct(
      ['Dubai Chewy Cookies (Marshmallow Version)','Dubai Chewy Cookies'],
      ['Signature Pistachio']
    ),
    findPopularProduct(
      ['Pistaché Spread','Pistache Spread'],
      ['100% Pistachio Chunky (120g)','100% Pistachio Chunky','Pistahchio Chunky (120g)','Pistachio Chunky (120g)']
    ),
    findPopularProduct(
      ['Snowflakes Nougat'],
      ['Cocoa Indulgence (200g 20pcs)','Cocoa Indulgence']
    ),
    findPopularProduct(
      ['Daifuku Mochi','Daifuku'],
      ['Daifuku Mochi Matcha Redbean','Matcha Redbean','Matcha Red Bean']
    ),
    findPopularProduct(
      ['Crispy OatNuoNuo Clusters','Crispy Oat NuoNuo Clusters','Crispy OatNuoNuo'],
      ['Crispy OatNuoNuo Clusters Oreo Cream','Oreo Cream']
    )
  ];

  const unique=[];
  const seen=new Set();
  for(const p of picks){
    if(!p)continue;
    const key=String(p.id||p.name);
    if(!seen.has(key)){seen.add(key);unique.push(p);}
  }

  holder.innerHTML=unique.map(p=>{
    const imgs=productImageCandidates(p);
    const category=cats.find(c=>sameId(c.id,p.category_id));
    return `<article class="popular-card"><button type="button" class="popular-image" data-category-id="${esc(p.category_id||'')}">${imgs.length?imageTag(imgs,p.name):'<span class="popular-no-image">'+esc(p.name)+'</span>'}<span>View collection →</span></button><div class="popular-meta"><small>${esc(category?.name||'NuoNuo')}</small><h3>${esc(p.name)}</h3><b>${money(p.selling_price)}</b></div></article>`;
  }).join('')||'<p class="menu-empty">No featured products available.</p>';
  if(holder.dataset.bound==='1')return;
  holder.dataset.bound='1';
  holder.addEventListener('click',e=>{
    const b=e.target.closest('[data-category-id]');
    if(!b||!holder.contains(b))return;
    e.preventDefault();
    window.filterByCategory(b.dataset.categoryId);
  });
}

function renderCategories(){
  const holder=$('#categoryCards');if(!holder)return;
  holder.innerHTML=cats.map(c=>{
    const p=categoryProducts(c.id)[0];
    const imgs=[...imageCandidates(c.image_url||c.image||c.photo_url||''),...productImageCandidates(p)];
    return `<button class="category-card" type="button" data-category-id="${esc(c.id)}" aria-label="View ${esc(c.name)}">${imgs.length?imageTag(imgs,c.name):''}<h3>${esc(c.name)}</h3></button>`
  }).join('')||'<p>No categories yet.</p>';
}

function bindCategoryCards(){
  const holder=$('#categoryCards');
  if(!holder||holder.dataset.bound==='1')return;
  holder.dataset.bound='1';
  holder.addEventListener('click',e=>{
    const card=e.target.closest('.category-card');
    if(!card||!holder.contains(card))return;
    e.preventDefault();
    e.stopPropagation();
    const id=card.dataset.categoryId;
    if(id) filterByCategory(id);
  });
}
const HERO_SLIDES=[
  {src:'hero-signature-pistachio.png',alt:'Signature Pistachio Dubai Chewy Cookies × Ferrero Rocher'},
  {src:'hero-matcha-strawberry.png',alt:'Matcha Reserve Dubai Chewy Cookies × Strawberry'}
];
function heroProducts(){
  // Hero imagery is intentionally independent from the live product menu.
  // This keeps the two selected Hero banners stable and prevents product data
  // changes from removing or replacing the Hero slides.
  return HERO_SLIDES;
}
function restartHeroTimer(){
  clearInterval(window.__nuonuoHeroTimer);
  window.__nuonuoHeroTimer=setInterval(()=>{
    const slides=heroProducts();
    if(slides.length<2)return;
    heroIndex=(heroIndex+1)%slides.length;
    renderHero();
  },5000);
}
function renderHero(){
  const slides=heroProducts();
  if(!slides.length)return;
  heroIndex=((heroIndex%slides.length)+slides.length)%slides.length;
  const slide=slides[heroIndex];
  const holder=$('#heroVisual');
  if(!holder)return;
  holder.innerHTML=`<img class="hero-slide-image" src="${esc(slide.src)}" alt="${esc(slide.alt)}"><div class="hero-controls" aria-label="Hero image controls"><button type="button" class="hero-arrow hero-prev" aria-label="Previous">‹</button><div class="hero-dots">${slides.map((_,i)=>`<button type="button" class="hero-dot ${i===heroIndex?'active':''}" data-hero-index="${i}" aria-label="Slide ${i+1}"></button>`).join('')}</div><button type="button" class="hero-arrow hero-next" aria-label="Next">›</button></div>`;
  if(holder.dataset.bound==='1')return;
  holder.dataset.bound='1';
  holder.addEventListener('click',e=>{
    const dot=e.target.closest('[data-hero-index]');
    if(dot){heroIndex=Number(dot.dataset.heroIndex)||0;renderHero();restartHeroTimer();return;}
    if(e.target.closest('.hero-prev')){heroIndex=(heroIndex-1+heroProducts().length)%heroProducts().length;renderHero();restartHeroTimer();return;}
    if(e.target.closest('.hero-next')){heroIndex=(heroIndex+1)%heroProducts().length;renderHero();restartHeroTimer();return;}
  });
  let sx=0,sy=0;
  holder.addEventListener('touchstart',e=>{const t=e.changedTouches[0];sx=t.clientX;sy=t.clientY},{passive:true});
  holder.addEventListener('touchend',e=>{const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){const n=heroProducts().length;heroIndex=(heroIndex+(dx<0?1:-1)+n)%n;renderHero();restartHeroTimer();}},{passive:true});
}
function startHero(){
  restartHeroTimer();
}

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
    addons=Array.isArray(menuData?.addons)?menuData.addons:[];
    productAddonLinks=Array.isArray(menuData?.product_addons)?menuData.product_addons:[];
    // Normalize IDs/URLs so cards always follow the same live Management records.
    products=products.map(p=>({...p,category_id:String(p.category_id??'')}));
    cats=cats.map(c=>({...c,id:String(c.id??'')}));

    $('#loading')?.remove();
    const select=$('#categorySelect');
    if(select){
      select.innerHTML='<option value="">All</option>'+cats.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
      select.onchange=()=>filterByCategory(select.value);
    }
    renderCategoryNav();
    renderTrending();
    renderPopular();
    renderCategories();
    bindCategoryCards();
    renderHero();
    startHero();
    menu('');
  }catch(e){
    console.error('NuoNuo menu load error',e);
    const loading=$('#loading');
    if(loading)loading.innerHTML=`<div>Menu connection failed.</div><small>${esc(errText(e))}</small>`;
  }
}

window.filterByCategory=(id)=>{
  const categoryId=String(id??'');
  const select=$('#categorySelect');
  if(select)select.value=categoryId;
  $('#menuCategoryNav')?.querySelectorAll('.menu-category-link').forEach(btn=>btn.classList.toggle('active',(btn.dataset.menuCategory||'')===categoryId));
  menu('', $('#searchInput')?.value||'');
  requestAnimationFrame(()=>scrollToMenuCategory(categoryId));
};
window.filterCat=(b,id)=>window.filterByCategory(id);
function currentCategory(){return $('#categorySelect')?.value||''}
$('#shopBtn').onclick=()=>{menu('',$('#searchInput')?.value||'');scrollToId('menu')};$('#menuToggle').onclick=()=>$('#mobileNav').classList.toggle('open');$('#cart').onclick=()=>{$('#drawer').classList.remove('hidden');$('#drawer').setAttribute('aria-hidden','false');document.body.classList.add('cart-open');render()};$('#close').onclick=()=>{$('#drawer').classList.add('hidden');$('#drawer').setAttribute('aria-hidden','true');document.body.classList.remove('cart-open')};$('#drawerBackdrop').onclick=()=>{$('#drawer').classList.add('hidden');$('#drawer').setAttribute('aria-hidden','true');document.body.classList.remove('cart-open')};
function setAuthMode(mode){authMode=mode;$('#loginTab').classList.toggle('active',mode==='login');$('#signupTab').classList.toggle('active',mode==='signup');$('#authTitle').textContent=mode==='login'?'Welcome back.':'Create your NuoNuo account.';$('#authSubmit').textContent=mode==='login'?'Sign in':'Create account';$('#authNameField').classList.toggle('hidden',mode==='login');$('#authName').required=mode==='signup';$('#authPassword').autocomplete=mode==='signup'?'new-password':'current-password';$('#authMessage').textContent=''}
async function getProfile(){const {data:{session}}=await sb.auth.getSession();if(!session){currentProfile=null;return null}const {data,error}=await sb.from('nuonuo_customer_profiles').select('id,name,phone,email,address,birthday').eq('auth_user_id',session.user.id).eq('owner_id',owner).maybeSingle();if(error){console.error('Profile load error',error);currentProfile=null;return null}currentProfile=data||null;return currentProfile}
function profileComplete(p){return !!(p?.name?.trim()&&p?.phone?.trim())}
function fillProfileForm(p){$('#meName').value=p?.name||'';$('#mePhone').value=p?.phone||'';$('#meEmail').value=p?.email||'';$('#meAddress').value=p?.address||'';$('#meBirthday').value=p?.birthday||''}
async function openMe(){
  const p=await getProfile();
  fillProfileForm(p);
  $('#meMessage').textContent='';
  $('#meModal').classList.remove('hidden');
}
async function refreshAuth(){
  const {data:{session}}=await sb.auth.getSession();
  const nav=$('#myOrdersNav');
  if(session){
    currentProfile=await getProfile();
    const welcomeName=currentProfile?.name?.trim()||'Customer';
    $('#accountLabel').textContent=`Welcome, ${welcomeName}`;
    $('#accountSignedOut').classList.add('hidden');
    $('#accountSignedIn').classList.add('hidden');
    $('#checkoutAccountHint').textContent=profileComplete(currentProfile)?`Signed in as ${welcomeName}.`:'You are signed in, but your name and phone still need to be completed.';
    nav?.classList.remove('hidden');
    if(nav) nav.onclick=()=>openRewardsAndOrders();
  }else{
    currentProfile=null;
    currentRewards=null;
    $('#accountLabel').textContent='Sign in';
    $('#accountSignedOut').classList.remove('hidden');
    $('#accountSignedIn').classList.add('hidden');
    $('#checkoutAccountHint').textContent='Guest checkout: name and phone are required. Address is required only for delivery.';
    nav?.classList.add('hidden');
  }
}
$('#accountBtn').onclick=()=>{const signedIn=!!currentProfile;if(signedIn){openMe()}else{$('#accountModal').classList.remove('hidden');setAuthMode('login');refreshAuth()}};
window.openRewardsAndOrders=async()=>{if(!currentProfile)return;$('#rewardsModal').classList.remove('hidden');await loadRewards();await openOrderHistory()};
$('#rewardsClose').onclick=()=>$('#rewardsModal').classList.add('hidden');
$('#accountClose').onclick=()=>$('#accountModal').classList.add('hidden');$('#loginTab').onclick=()=>setAuthMode('login');$('#signupTab').onclick=()=>setAuthMode('signup');
$('#authForm').onsubmit=async e=>{e.preventDefault();$('#authMessage').textContent='';$('#authSubmit').disabled=true;try{const phone=normalizePhone($('#authPhone').value),password=$('#authPassword').value,name=$('#authName').value.trim();if(!/^\+?[0-9]{8,15}$/.test(phone.replace(/\s/g,'')))throw new Error('Please enter a valid phone number, e.g. +601112345678.');if(authMode==='signup'){const authEmail=authEmailFromPhone(phone);const {data,error}=await sb.auth.signUp({email:authEmail,password,options:{data:{full_name:name,display_name:name,account_type:'customer',app:'nuonuo-public-store',phone}}});if(error)throw error;if(data.session){await saveProfile({name,phone,email:'',address:'',birthday:''});$('#authMessage').textContent='Account created. You are signed in.';await refreshAuth();$('#accountModal').classList.add('hidden');openMe()}else{$('#authMessage').textContent='Account created, but no session was returned. In Supabase, keep Email confirmations OFF for this password-only customer login.'}}else{const authEmail=authEmailFromPhone(phone);const {error}=await sb.auth.signInWithPassword({email:authEmail,password});if(error)throw error;await refreshAuth();$('#accountModal').classList.add('hidden');openMe()}}catch(err){$('#authMessage').textContent=errText(err)}finally{$('#authSubmit').disabled=false}};
function normalizePhone(value){return String(value||'').replace(/[()\s-]/g,'').trim()}
// NuoNuo uses the phone number as the customer's login ID without requiring
// Supabase Phone Auth/SMS. We keep a private synthetic email solely for
// Supabase's email+password credential system. Customers never see or enter it.
function authEmailFromPhone(phone){const digits=normalizePhone(phone).replace(/^\+/,'').replace(/[^0-9]/g,'');return `customer_${digits}@auth.nuonuo.test`}
async function saveProfile(profile){const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error('Please sign in first.');const normalizedPhone=normalizePhone(profile.phone)||normalizePhone(session.user.phone);const payload={auth_user_id:session.user.id,owner_id:owner,name:profile.name?.trim()||null,phone:normalizedPhone||null,email:profile.email?.trim()||null,address:profile.address?.trim()||null,birthday:profile.birthday||null,updated_at:new Date().toISOString()};const {data,error}=await sb.from('nuonuo_customer_profiles').upsert(payload,{onConflict:'auth_user_id,owner_id'}).select().single();if(error)throw error;currentProfile=data;return data}
$('#meForm').onsubmit=async e=>{e.preventDefault();$('#meMessage').textContent='';$('#meSave').disabled=true;try{await saveProfile({name:$('#meName').value,phone:$('#mePhone').value,email:$('#meEmail').value,address:$('#meAddress').value,birthday:$('#meBirthday').value});await refreshAuth();$('#meModal').classList.add('hidden');showToast('Your details are saved')}catch(err){$('#meMessage').textContent=errText(err)}finally{$('#meSave').disabled=false}};
$('#meClose').onclick=()=>$('#meModal').classList.add('hidden');

async function loadRewards(){
  if(!sb||!currentProfile){
    currentRewards=null;
    renderRewards();
    return null;
  }
  try{
    const {data,error}=await sb.rpc('get_nuonuo_customer_rewards');
    if(error) throw error;
    currentRewards=data||null;
  }catch(e){
    console.warn('Rewards feature unavailable until the optional rewards SQL is run:',e);
    currentRewards=null;
  }
  renderRewards();
  return currentRewards;
}
function renderRewards(){
  const box=$('#rewardsBox');
  if(!box)return;
  if(!currentRewards){
    box.innerHTML='<small>Rewards & order history will appear here after the rewards setup is enabled.</small>';
    return;
  }
  const vouchers=Array.isArray(currentRewards.vouchers)?currentRewards.vouchers:[];
  const available=vouchers.filter(v=>!v.used_at && new Date(v.expires_at)>new Date());
  box.innerHTML=`
    <div class="rewards-head"><b>My rewards</b><span>${available.length} available voucher${available.length===1?'':'s'}</span></div>
    <div class="reward-stats"><span><b>${Number(currentRewards.order_count||0)}</b><small>Total orders</small></span><span><b>${money(currentRewards.total_spent||0)}</b><small>Total spent</small></span></div>
    <p class="reward-rule">🎟️ Every cumulative RM 100 qualifying spend earns 1 × RM 10 voucher. Vouchers can accumulate. Each voucher is valid for 1 month and can be used on a purchase of RM 60 or more.</p>
    ${available.length?available.map(v=>`<article class="voucher-card"><div class="voucher-card-top"><b class="voucher-code">${esc(v.code)}</b><span class="voucher-badge">Valid</span></div><div class="voucher-card-main"><span class="voucher-ticket-icon">%</span><div class="voucher-card-details"><b>RM ${Number(v.amount||10).toFixed(2)} off</b><span>Min. spend RM ${Number(v.minimum_spend||60).toFixed(2)} <i>•</i> Expires ${new Date(v.expires_at).toLocaleDateString('en-GB')}</span></div></div><div class="voucher-card-divider"></div><div class="voucher-card-bottom"><span class="voucher-validity">Valid for 1 month from the date of issue.</span><button type="button" class="voucher-copy-btn" onclick="copyVoucher('${esc(v.code)}')"><span>▣</span> Copy code</button></div></article>`).join(''):'<p class="reward-empty">No active vouchers yet.</p>'}
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
    const {data,error}=await sb.rpc('get_nuonuo_customer_order_history');
    if(error)throw error;
    let orders=Array.isArray(data?.orders)?data.orders:[];
    // Customer order history follows the actual payment/sales timestamp, not the order creation timestamp.
    orders=orders.slice().sort((a,b)=>{
      const ap=String(a.payment_date||''); const bp=String(b.payment_date||'');
      if(ap!==bp)return bp.localeCompare(ap);
      const at=String(a.payment_time||''); const bt=String(b.payment_time||'');
      if(at!==bt)return bt.localeCompare(at);
      return String(b.created_at||'').localeCompare(String(a.created_at||''));
    });
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
        <div class="history-top"><b>${esc(o.order_number||'Order')}</b><span>${o.payment_date ? new Date(`${o.payment_date}T${o.payment_time ? String(o.payment_time).slice(11,19) : '00:00:00'}+08:00`).toLocaleString() : new Date(o.created_at).toLocaleString()}</span></div>
        <div class="history-items">${(Array.isArray(o.items)?o.items:[]).map(i=>`<div><span>${esc(i.name||'Item')} × ${i.quantity}</span><b>${money(i.line_total)}</b></div>`).join('')}</div>
        <div class="history-total"><span>${esc(o.status||'Pending')}</span><b>${money(o.total)}</b></div>
      </div>`).join(''):'<p class="reward-empty">No orders found yet.</p>');
  }catch(e){
    console.warn('Order history unavailable until the optional rewards SQL is run:',e);
    box.innerHTML='<p class="reward-empty">Order history is not available yet. Please run the NuoNuo rewards SQL once.</p>';
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
async function renderCheckoutVouchers(subtotal){
  const box=$('#checkoutVouchers'),status=$('#voucherCheckoutStatus'),msg=$('#voucherMessage'),discount=$('#voucherDiscount');
  if(!box)return;
  box.innerHTML='';msg.textContent='';discount.textContent='';msg.dataset.valid='false';delete msg.dataset.code;
  status.textContent='Optional';status.classList.remove('is-disabled','is-selected');
  if(!currentProfile){
    box.innerHTML='<div class="checkout-voucher-empty">Sign in to see your available vouchers.</div>';
    return;
  }
  const rewards=await loadRewards();
  const vouchers=Array.isArray(rewards?.vouchers)?rewards.vouchers:[];
  const now=Date.now();
  const available=vouchers.filter(v=>!v.used_at && v.expires_at && new Date(v.expires_at).getTime()>now);
  if(!available.length){
    box.innerHTML='<div class="checkout-voucher-empty">No available vouchers.</div>';
    return;
  }
  const canUse=subtotal>=60;
  status.textContent=canUse?'Available':'Add RM '+Math.max(0,60-subtotal).toFixed(2)+' to use';
  if(!canUse)status.classList.add('is-disabled');
  box.innerHTML=available.map(v=>{
    const code=String(v.code||'');
    const expires=new Date(v.expires_at).toLocaleDateString('en-GB');
    return `<button type="button" class="checkout-voucher-card${canUse?'':' is-disabled'}" data-voucher-code="${esc(code)}" ${canUse?'':'disabled'}>
      <span class="checkout-voucher-ticket-icon">%</span>
      <span class="checkout-voucher-main"><b>RM ${Number(v.amount||10).toFixed(2)} off</b><small>Min. spend RM ${Number(v.minimum_spend||60).toFixed(2)} · Expires ${expires}</small></span>
      <span class="checkout-voucher-action">${canUse?'Use':'Locked'}</span>
    </button>`;
  }).join('');
  if(!canUse){msg.textContent='This voucher can be used when your order reaches RM 60.00.';return;}
  box.querySelectorAll('.checkout-voucher-card').forEach(card=>card.onclick=()=>applyCheckoutVoucher(card.dataset.voucherCode));
}
async function applyCheckoutVoucher(code){
  const msg=$('#voucherMessage'),discount=$('#voucherDiscount'),subtotal=cart.reduce((n,x)=>n+x.qty*x.price,0);
  msg.textContent='';discount.textContent='';msg.dataset.valid='false';delete msg.dataset.code;
  if(!currentProfile){msg.textContent='Please sign in to use a voucher.';return}
  if(subtotal<60){msg.textContent='Minimum spend is RM 60.00.';return}
  try{
    const {data,error}=await sb.rpc('check_nuonuo_voucher',{p_code:code,p_subtotal:subtotal});
    if(error)throw error;
    if(!data?.valid)throw new Error(data?.message||'Voucher is not valid.');
    const amount=Number(data.discount||10);
    discount.textContent=`RM ${amount.toFixed(2)} discount applied`;
    msg.dataset.valid='true';msg.dataset.code=code;msg.textContent='Voucher selected.';
    $('#checkoutTotal').textContent=money(Math.max(0,subtotal-amount));
    $('#voucherCheckoutStatus').textContent='Selected';$('#voucherCheckoutStatus').classList.add('is-selected');
    document.querySelectorAll('.checkout-voucher-card').forEach(card=>card.classList.toggle('is-selected',card.dataset.voucherCode===code));
  }catch(err){msg.textContent=errText(err);}
}
async function prepareCheckout(){if(!cart.length)return;$('#drawer').classList.add('hidden');$('#drawer').setAttribute('aria-hidden','true');document.body.classList.remove('cart-open');$('#date').value=new Date().toISOString().slice(0,10);$('#summary').innerHTML=cart.map(x=>`<div class="summary"><span>${esc(x.name)} × ${x.qty}${x.addons?.length?`<small>${x.addons.map(a=>`+ ${esc(a.name)}`).join(', ')}</small>`:''}</span><b>${money(cartItemTotal(x))}</b></div>`).join('');const subtotal=cart.reduce((n,x)=>n+cartItemTotal(x),0);$('#checkoutTotal').textContent=money(subtotal);$('#voucherMessage').textContent='';$('#voucherDiscount').textContent='';$('#voucherMessage').dataset.valid='false';delete $('#voucherMessage').dataset.code;document.querySelectorAll('#meBirthday,#birthdayCheckout').forEach(el=>el.setAttribute('lang','en-GB'));const {data:{session}}=await sb.auth.getSession();currentProfile=session?await getProfile():null;const p=currentProfile||{};$('#name').value=p.name||'';$('#phone').value=p.phone||session?.user?.phone||'';$('#email').value=p.email||'';$('#address').value=p.address||'';$('#birthdayCheckout').value=p.birthday||'';$('#checkoutProfileNote').textContent=session?(profileComplete(p)?'Your saved name and phone have been filled in. Address is only needed for delivery.':'Please complete your name and phone below. Address is only needed for delivery. Email and birthday are optional.'):'Guest checkout: name and phone are required. Address is required only for delivery. Email and birthday are optional.';$('#birthdayGiftNotice').classList.toggle('hidden',!birthdayMonthActive(p.birthday));updateCheckoutAddressRequirement();await renderCheckoutVouchers(subtotal);$('#modal').classList.remove('hidden')}
$('#checkout').onclick=prepareCheckout;$('#fulfil').onchange=updateCheckoutAddressRequirement;$('#x').onclick=()=>$('#modal').classList.add('hidden');$('#done').onclick=()=>{$('#success').classList.add('hidden');scrollToId('menu')};
$('#form').onsubmit=async e=>{e.preventDefault();$('#error').textContent='';$('#place').disabled=true;try{const subtotal=cart.reduce((n,x)=>n+cartItemTotal(x),0),name=$('#name').value.trim(),phone=$('#phone').value.trim(),email=$('#email').value.trim(),address=$('#address').value.trim(),birthday=$('#birthdayCheckout').value||null,fulfil=$('#fulfil').value,payment=$('#payment').value,note=$('#note').value.trim(),date=$('#date').value;const {data:{session}}=await sb.auth.getSession();if(!name||!phone)throw new Error('Name and phone number are required to place an order.');if(fulfil==='delivery'&&!address)throw new Error('Address is required for delivery orders.');if(!/^\+?[0-9]{8,15}$/.test(normalizePhone(phone)))throw new Error('Please enter a valid phone number.');if(session){await saveProfile({name,phone,email,address,birthday})}const items=cart.map(x=>({product_id:x.id,quantity:x.qty,addon_ids:(x.addons||[]).map(a=>a.id)}));
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
document.addEventListener('click',e=>{
  if(e.target.id==='productDetailModal') closeProductDetail();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape') closeProductDetail()});

async function initStore(){render();await load();if(sb){sb.auth.onAuthStateChange(()=>refreshAuth());await refreshAuth()}}
initStore();
