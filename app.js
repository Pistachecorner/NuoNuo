/* NUONUO MANAGEMENT FRONTEND V1
   Black / white / neutral UI only.
   Requires:
     SUPABASE_URL
     SUPABASE_ANON_KEY
   Set them in the two constants below before deployment.
*/
const SUPABASE_URL = window.NUONUO_SUPABASE_URL || "PASTE_SUPABASE_URL_HERE";
const SUPABASE_ANON_KEY = window.NUONUO_SUPABASE_ANON_KEY || "PASTE_SUPABASE_ANON_KEY_HERE";
// Optional: set this to the public Nuonuo storefront URL. Customer accounts are never allowed into Management.
const NUONUO_SITE_URL = window.NUONUO_SITE_URL || "";
const MANAGEMENT_ROLES = new Set(["owner", "staff"]);
let sb = null;

let session = null;
let profile = null;
let currentPage = "dashboard";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const money = (n) => `RM ${Number(n || 0).toFixed(2)}`;
const pct = (cost, price) => price > 0 ? (((price - cost) / price) * 100).toFixed(2) + "%" : "0.00%";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

// Costing helpers: ingredient.unit may be a purchase pack such as "500g" or "5kg".
// cost_per_unit stores the price of that purchase pack. Recipes use the base unit (g/ml/個).
function parseMeasureUnit(unit){
  // Ingredient Unit is the purchase pack, e.g. 5000g, 5kg, 500ml or 1個.
  // Recipe quantity is always entered in the base unit (g/ml/個).
  const raw=String(unit??'').trim().toLowerCase().replace(/\s+/g,'');
  const m=raw.match(/([0-9]+(?:\.[0-9]+)?)(kg|g|l|ml|pcs|pc|個|件|包|瓶|盒)$/i);
  if(!m) return {amount:1, unit:raw || 'unit', valid:false};
  const amount=Number(m[1]);
  const u=m[2].toLowerCase();
  if(u==='kg') return {amount:amount*1000, unit:'g', valid:true};
  if(u==='l') return {amount:amount*1000, unit:'ml', valid:true};
  if(['pcs','pc','個','件','包','瓶','盒'].includes(u)) return {amount,unit:'個',valid:true};
  return {amount,unit:u,valid:true};
}

function ingredientBaseCost(item){
  if(!item) return 0;
  const price=Number(item.cost_per_unit||0);
  const parsed=parseMeasureUnit(item.unit);
  // A unit such as 5000g means price is for the entire 5000g pack.
  // Therefore 1g costs pack price / 5000.
  return price/Math.max(Number(parsed.amount)||1,0.000001);
}
function ingredientBaseUnit(item){
  return parseMeasureUnit(item?.unit).unit;
}
function componentCostLabel(item,type){
  if(type==='ingredient'){
    const parsed=parseMeasureUnit(item?.unit);
    const base=ingredientBaseCost(item);
    const pack=esc(String(item?.unit||''));
    return parsed.valid ? `${money(base)}/${esc(parsed.unit)} · pack ${pack}` : `${money(base)}/${esc(parsed.unit)}`;
  }
  return `${money(subrecipeBaseCost(item))}/${esc(subrecipeBaseUnit(item))}`;
}

function yieldTotalBaseAmount(item){
  const parsed=parseMeasureUnit(item?.yield_unit);
  const qty=Number(item?.yield_quantity||1);
  // If yield_unit is "30g", yield_quantity=1 means one 30g yield.
  // If yield_unit is simply "g", yield_quantity=30 means 30g.
  return qty*Math.max(parsed.amount,0.000001);
}
function subrecipeBaseCost(item){
  return Number(item?.calculated_cost||0)/Math.max(yieldTotalBaseAmount(item),0.000001);
}
function subrecipeBaseUnit(item){
  return parseMeasureUnit(item?.yield_unit).unit;
}
function toast(msg){ const r=$("#toastRoot"); r.innerHTML=`<div class="toast">${esc(msg)}</div>`; setTimeout(()=>r.innerHTML="",2500); }
function errText(e){ return e?.message || "Something went wrong."; }
function pageTitle(name){ $("#pageTitle").textContent=name; }

async function getUser(){
  const {data,error}=await sb.auth.getUser();
  if(error) throw error;
  return data.user;
}
async function ensureProfile(user){
  // IMPORTANT: Management must never create a profile for an arbitrary
  // customer account. Nuonuo customers share Supabase Auth, so a missing
  // profile must be treated as NOT authorized for Management.
  const {data,error}=await sb.from("profiles").select("*").eq("id",user.id).maybeSingle();
  if(error) throw error;
  return data || null;
}

async function enforceManagementAccess(user, p){
  if(!p || !MANAGEMENT_ROLES.has(String(p.role||"").toLowerCase())){
    console.warn("Management access denied for non-management account:", user?.email, p?.role);
    try{ await sb.auth.signOut({scope:"local"}); }catch(_){}
    if(NUONUO_SITE_URL){
      window.location.replace(NUONUO_SITE_URL);
      return false;
    }
    throw new Error("This account is a Nuonuo customer account and does not have Pistaché Management access.");
  }
  return true;
}
function setLoginError(message){
  const el=$("#loginError");
  if(el) el.textContent=message || "";
}
function setLoginBusy(busy){
  const btn=$("#loginSubmit");
  if(btn){ btn.disabled=busy; btn.textContent=busy?"Signing in…":"Sign in"; }
}
function validateSupabaseConfig(){
  if(!SUPABASE_URL || SUPABASE_URL.includes("PASTE_") || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("PASTE_")){
    throw new Error("Supabase connection is not configured. Put your Supabase Project URL and anon/publishable key in config.js.");
  }
  if(!/^https:\/\/[^\s]+\.supabase\.co/.test(SUPABASE_URL)){
    throw new Error("Supabase Project URL looks invalid. It should look like https://your-project.supabase.co");
  }
}
async function init(){
  try{
    validateSupabaseConfig();
    if(!window.supabase || typeof window.supabase.createClient!=="function"){
      throw new Error("Supabase library did not load. Please refresh the page or check the Supabase CDN connection.");
    }
    sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data,error}=await sb.auth.getSession();
    if(error) throw error;
    if(data.session){
      await showApp(data.session);
    }else{
      showLogin();
    }
    sb.auth.onAuthStateChange((_event,s)=>{
      setTimeout(async()=>{
        try{
          if(s) await showApp(s); else showLogin();
        }catch(e){
          console.error("Auth state error:",e);
          showLogin();
          setLoginError(errText(e));
        }
      },0);
    });
  }catch(e){
    console.error("NUONUO initialization error:",e);
    showLogin();
    setLoginError(errText(e));
  }
}
async function showApp(s){
  session=s;
  try{
    profile=await ensureProfile(s.user);
    // NEVER fall back to owner. A missing profile is not an owner account.
    if(!(await enforceManagementAccess(s.user,profile))) return;
  }catch(e){
    console.error("Management access/profile error:",e);
    session=null;
    profile=null;
    $("#app").classList.add("hidden");
    $("#loginScreen").classList.remove("hidden");
    setLoginError(errText(e));
    return;
  }
  $("#loginScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#userEmail").textContent=s.user.email || "";
  await navigate(currentPage);
}
function showLogin(){
  session=null; profile=null;
  $("#app").classList.add("hidden");
  $("#loginScreen").classList.remove("hidden");
}

function bindCoreEvents(){
  const form=$("#loginForm");
  if(form && !form.dataset.bound){
    form.dataset.bound="1";
    form.addEventListener("submit",async e=>{
      e.preventDefault();
      setLoginError("");
      setLoginBusy(true);
      try{
        if(!sb) throw new Error("Supabase is not initialized yet. Please refresh once and try again.");
        const email=$("#loginEmail").value.trim();
        const password=$("#loginPassword").value;
        if(!email || !password) throw new Error("Please enter your email and password.");
        const {data,error}=await sb.auth.signInWithPassword({email,password});
        if(error) throw error;
        if(!data.session) throw new Error("Login succeeded but no session was returned. Check Supabase Auth settings.");
        await showApp(data.session);
      }catch(e){
        console.error("Login error:",e);
        setLoginError(errText(e));
      }finally{
        setLoginBusy(false);
      }
    });
  }
  const logout=$("#logoutBtn");
  if(logout && !logout.dataset.bound){ logout.dataset.bound="1"; logout.addEventListener("click",()=>sb?.auth.signOut()); }
  const mobile=$("#mobileMenuBtn");
  if(mobile && !mobile.dataset.bound){ mobile.dataset.bound="1"; mobile.addEventListener("click",()=>$(".sidebar").classList.toggle("open")); }
  const nav=$("#sidebarNav");
  if(nav && !nav.dataset.bound){
    nav.dataset.bound="1";
    nav.addEventListener("click",e=>{
      const b=e.target.closest("[data-page]"); if(!b)return;
      navigate(b.dataset.page); $(".sidebar").classList.remove("open");
    });
  }
}


const pages = {
  dashboard:"Dashboard", orders:"Orders", pending:"Pending Orders", menu:"Menu",
  ingredients:"Ingredients", inventory:"Inventory", customers:"Customers",
  sales:"Sales", expenses:"Expenses", invoices:"Invoices", reports:"Reports", settings:"Account Settings"
};
async function navigate(name){
  currentPage=name;
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===name));
  pageTitle(pages[name]);
  try{
    const fn=render[name] || render.dashboard;
    await fn();
  }catch(e){
    $("#page").innerHTML=`<div class="card"><h3>Unable to load this page</h3><p class="error">${esc(errText(e))}</p></div>`;
  }
}

async function count(table, extra=""){
  let q=sb.from(table).select("*",{count:"exact",head:true}).eq("user_id",session.user.id);
  return (await q).count || 0;
}
async function sum(table,column,filters=[]){
  let q=sb.from(table).select(column).eq("user_id",session.user.id);
  for(const f of filters) q=q.eq(f[0],f[1]);
  const {data,error}=await q; if(error) throw error;
  return (data||[]).reduce((a,r)=>a+Number(r[column]||0),0);
}

const render = {
  async dashboard(){
    const [sales,expenses,pending,orders]=await Promise.all([
      sum("sales","amount"),sum("expenses","amount"),count("orders"),count("orders")
    ]);
    const profit=await sum("sales","profit");
    const {data:recent}=await sb.from("orders").select("id,order_number,status,total,created_at").eq("user_id",session.user.id).order("created_at",{ascending:false}).limit(8);
    $("#page").innerHTML=`
      <div class="stats">
        <div class="stat"><div class="label">Sales</div><div class="value">${money(sales)}</div></div>
        <div class="stat"><div class="label">Orders</div><div class="value">${orders}</div></div>
        <div class="stat"><div class="label">Expenses</div><div class="value">${money(expenses)}</div></div>
        <div class="stat"><div class="label">Gross Profit</div><div class="value">${money(profit)}</div></div>
      </div>
      <div class="grid-2">
        <div class="card"><h4>Quick actions</h4><div class="actions">
          <button class="btn btn-dark" onclick="openOrderModal()">Add Order</button>
          <button class="btn" onclick="openProductModal()">Add Product</button>
          <button class="btn" onclick="openExpenseModal()">Add Expense</button>
        </div></div>
        <div class="card"><h4>Workspace</h4><p class="muted">Black, white and neutral UI. Menu costing includes gross profit and margin.</p></div>
      </div>
      <div class="card" style="margin-top:18px"><h4>Recent orders</h4>${orderTable(recent||[])}</div>`;
  },

  async menu(){
    const [{data:products,error:pe},{data:categories,error:ce},{data:addons,error:ae}]=await Promise.all([
      sb.from("products").select("*,categories(name)").eq("user_id",session.user.id).order("created_at",{ascending:false}),
      sb.from("categories").select("*").eq("user_id",session.user.id).order("sort_order").order("name"),
      sb.from("addons").select("*").eq("user_id",session.user.id).order("name")
    ]);
    if(pe)throw pe; if(ce)throw ce; if(ae)throw ae;

    const productHtml=(products||[]).map(p=>{
      const cost=Number(p.calculated_cost||0), price=Number(p.selling_price||0), profit=price-cost;
      return `<article class="product-card">
        ${p.image_url?`<img class="product-image" src="${esc(p.image_url)}" alt="">`:`<div class="product-image"></div>`}
        <div class="product-body"><h4>${esc(p.name)}</h4><p class="muted small">${esc(p.categories?.name||"Uncategorized")}</p>
        <div class="price-row"><span>Selling</span><strong>${money(price)}</strong></div>
        <div class="price-row"><span>Cost</span><span>${money(cost)}</span></div>
        <div class="price-row"><span>Profit</span><span>${money(profit)}</span></div>
        <div class="price-row"><span>Margin</span><span class="margin">${pct(cost,price)}</span></div>
        <div class="actions" style="margin-top:14px"><button class="btn" onclick='openProductModal(${JSON.stringify(p)})'>Edit</button><button class="btn btn-danger" onclick="deleteRow('products','${p.id}',render.menu)">Delete</button></div></div>
      </article>`;
    }).join("")||`<div class="card empty">No products yet.</div>`;

    const categoryHtml=(categories||[]).map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.description||"")}</td><td>${c.sort_order}</td><td><button class="btn" onclick='openCategoryModal(${JSON.stringify(c)})'>Edit</button> <button class="btn btn-danger" onclick="deleteRow('categories','${c.id}',render.menu)">Delete</button></td></tr>`).join("")||`<tr><td colspan="4" class="empty">No categories yet.</td></tr>`;

    const addonHtml=(addons||[]).map(a=>{const price=Number(a.price||0),cost=Number(a.cost||0);return `<tr><td>${esc(a.name)}</td><td>${money(price)}</td><td>${money(cost)}</td><td>${pct(cost,price)}</td><td><span class="badge">${a.active?"Active":"Inactive"}</span></td><td><button class="btn" onclick='openAddonModal(${JSON.stringify(a)})'>Edit</button> <button class="btn btn-danger" onclick="deleteRow('addons','${a.id}',render.menu)">Delete</button></td></tr>`}).join("")||`<tr><td colspan="6" class="empty">No add-ons yet.</td></tr>`;

    $("#page").innerHTML=`
      <div class="page-head"><div><h3>Menu</h3><p class="muted">Manage products, categories and add-ons in one place.</p></div>
        <div class="actions"><button class="btn btn-dark" onclick="openProductModal()">+ Product</button><button class="btn" onclick="openCategoryModal()">+ Category</button><button class="btn" onclick="openAddonModal()">+ Add-on</button></div>
      </div>

      <section class="card" style="margin-bottom:18px">
        <div class="page-head" style="margin-bottom:14px"><div><h3 style="margin:0">Products</h3><p class="muted small">Selling price, calculated cost, profit and margin.</p></div></div>
        <div class="product-grid">${productHtml}</div>
      </section>

      <section class="card" style="margin-bottom:18px">
        <div class="page-head" style="margin-bottom:14px"><div><h3 style="margin:0">Categories</h3><p class="muted small">Organise your menu.</p></div><button class="btn" onclick="openCategoryModal()">+ Category</button></div>
        <div class="table-wrap"><table><thead><tr><th>Name</th><th>Description</th><th>Order</th><th></th></tr></thead><tbody>${categoryHtml}</tbody></table></div>
      </section>

      <section class="card">
        <div class="page-head" style="margin-bottom:14px"><div><h3 style="margin:0">Add-ons</h3><p class="muted small">Optional extras and their costing.</p></div><button class="btn" onclick="openAddonModal()">+ Add-on</button></div>
        <div class="table-wrap"><table><thead><tr><th>Name</th><th>Price</th><th>Cost</th><th>Margin</th><th>Status</th><th></th></tr></thead><tbody>${addonHtml}</tbody></table></div>
      </section>`;
  },

  async categories(){
    const {data,error}=await sb.from("categories").select("*").eq("user_id",session.user.id).order("sort_order").order("name");
    if(error)throw error;
    $("#page").innerHTML=`<div class="page-head"><div><h3>Categories</h3><p class="muted">Organise your menu.</p></div><button class="btn btn-dark" onclick="openCategoryModal()">+ Category</button></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Description</th><th>Order</th><th></th></tr></thead><tbody>
      ${(data||[]).map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.description||"")}</td><td>${c.sort_order}</td><td><button class="btn" onclick='openCategoryModal(${JSON.stringify(c)})'>Edit</button> <button class="btn btn-danger" onclick="deleteRow('categories','${c.id}',render.categories)">Delete</button></td></tr>`).join("")||`<tr><td colspan="4" class="empty">No categories yet.</td></tr>`}
      </tbody></table></div>`;
  },

  async addons(){
    const {data,error}=await sb.from("addons").select("*").eq("user_id",session.user.id).order("name");
    if(error)throw error;
    $("#page").innerHTML=`<div class="page-head"><div><h3>Add-ons</h3><p class="muted">Optional extras and their costing.</p></div><button class="btn btn-dark" onclick="openAddonModal()">+ Add-on</button></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Price</th><th>Cost</th><th>Margin</th><th>Status</th><th></th></tr></thead><tbody>
      ${(data||[]).map(a=>{const price=Number(a.price||0),cost=Number(a.cost||0);return `<tr><td>${esc(a.name)}</td><td>${money(price)}</td><td>${money(cost)}</td><td>${pct(cost,price)}</td><td><span class="badge">${a.active?"Active":"Inactive"}</span></td><td><button class="btn" onclick='openAddonModal(${JSON.stringify(a)})'>Edit</button> <button class="btn btn-danger" onclick="deleteRow('addons','${a.id}',render.addons)">Delete</button></td></tr>`}).join("")||`<tr><td colspan="6" class="empty">No add-ons yet.</td></tr>`}
      </tbody></table></div>`;
  },

  async ingredients(){
    const {data,error}=await sb.from("ingredients").select("*").eq("user_id",session.user.id).order("name");
    if(error)throw error;
    const subrecipes=await loadSubrecipes();
    const subrecipeDbReady=window.__subrecipeDbReady!==false;
    const ingredients=(data||[]).filter(i=>i.item_type!=='packaging');
    const packaging=(data||[]).filter(i=>i.item_type==='packaging');
    $("#page").innerHTML=`<div class="page-head"><div><h3>Ingredients</h3><p class="muted">Raw materials and stock costing.</p></div><button class="btn btn-dark" onclick="openIngredientModal()">+ Ingredient</button></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Unit</th><th>Cost / Unit</th><th>Stock</th><th>Low Stock</th><th></th></tr></thead><tbody>
      ${ingredients.map(i=>`<tr><td>${esc(i.name)}</td><td>${esc(i.unit)}</td><td>${money(i.cost_per_unit)}</td><td>${Number(i.current_stock).toFixed(2)}</td><td>${Number(i.current_stock)<=Number(i.low_stock_threshold??i.minimum_stock??0)?'<span class="badge">Low</span>':'OK'}</td><td><button class="btn" onclick='openIngredientModal(${JSON.stringify(i)})'>Edit</button> <button class="btn btn-danger" onclick="deleteRow('ingredients','${i.id}',render.ingredients)">Delete</button></td></tr>`).join("")||`<tr><td colspan="6" class="empty">No ingredients yet.</td></tr>`}
      </tbody></table></div>
      <div class="card" style="margin-top:18px">
        <div class="page-head" style="margin:0 0 14px;padding:0;border:0">
          <div><h4 style="margin:0">Sub-ingredients / Sub-recipes</h4><p class="muted" style="margin:5px 0 0">Create reusable recipes such as pistachio cream, chocolate sauce or kunafa.</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn btn-dark" onclick="openSubrecipeModal()">+ Sub-ingredient</button><button class="btn btn-dark" onclick="openPackagingModal()">+ Packaging</button></div>
        </div>
        ${subrecipeDbReady ? '' : `<div class="notice" style="margin:0 0 14px;padding:12px 14px;border:1px solid #e4b7b7;border-radius:10px;background:#fff7f7;color:#8f2f2f"><strong>Sub-ingredients database setup is missing.</strong><div class="small" style="margin-top:4px;color:#8f2f2f">Run <b>SUPABASE_SUBINGREDIENTS_MIGRATION.sql</b> in Supabase SQL Editor once, then refresh this page.</div></div>`}
        <div class="table-wrap">
          <table><thead><tr><th>Name</th><th>Yield</th><th>Total Cost</th><th>Cost / Yield Unit</th><th></th></tr></thead><tbody>
          ${subrecipes.map(r=>`<tr><td>${esc(r.name)}</td><td>${Number(r.yield_quantity||0)} ${esc(r.yield_unit||'unit')}</td><td>${money(r.calculated_cost||0)}</td><td>${money((Number(r.calculated_cost||0)/Math.max(Number(r.yield_quantity||1),0.000001)))}</td><td><button class="btn" onclick='openSubrecipeModal(${JSON.stringify(r)})'>Edit</button> <button class="btn btn-danger" onclick="deleteSubrecipe('${r.id}')">Delete</button></td></tr>`).join('')||`<tr><td colspan="5" class="empty">No sub-ingredients yet. Click “+ Sub-ingredient” to create one.</td></tr>`}
          </tbody></table>
        </div>
      </div>
      <div class="card" style="margin-top:18px">
        <div class="page-head" style="margin:0 0 14px;padding:0;border:0"><div><h4 style="margin:0">Packaging</h4><p class="muted" style="margin:5px 0 0">Packaging cost is calculated per piece.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Name</th><th>Per Unit</th><th>Stock</th><th></th></tr></thead><tbody>
        ${packaging.map(i=>`<tr><td>${esc(i.name)}</td><td>${money(i.cost_per_unit)}</td><td>${Number(i.current_stock).toFixed(0)}</td><td><button class="btn" onclick='openPackagingModal(${JSON.stringify(i)})'>Edit</button> <button class="btn btn-danger" onclick="deleteRow('ingredients','${i.id}',render.ingredients)">Delete</button></td></tr>`).join('')||`<tr><td colspan="4" class="empty">No packaging yet. Click “+ Packaging” to add one.</td></tr>`}
        </tbody></table></div>
      </div>`;
  },

  async inventory(){
    const {data,error}=await sb.from("ingredients").select("*").eq("user_id",session.user.id).order("name");
    if(error)throw error;
    const totalValue=(data||[]).reduce((sum,i)=>sum+(Number(i.current_stock||0)*Number(i.cost_per_unit||0)),0);
    const lowCount=(data||[]).filter(i=>Number(i.current_stock||0)<=Number(i.low_stock_threshold||0)).length;
    $("#page").innerHTML=`<div class="page-head"><div><h3>Inventory</h3><p class="muted">Current stock and stock movements.</p></div></div>
      <div class="stats"><div class="stat"><div class="label">Total Inventory Value</div><div class="value">${money(totalValue)}</div></div><div class="stat"><div class="label">Ingredients</div><div class="value">${(data||[]).length}</div></div><div class="stat"><div class="label">Low Stock</div><div class="value">${lowCount}</div></div><div class="stat"><div class="label">Units Tracked</div><div class="value">${(data||[]).reduce((sum,i)=>sum+Number(i.current_stock||0),0).toFixed(2)}</div></div></div>
      <div class="table-wrap"><table><thead><tr><th>Ingredient</th><th>Stock</th><th>Unit</th><th>Value</th><th>Status</th></tr></thead><tbody>
      ${(data||[]).map(i=>{const low=Number(i.current_stock)<=Number(i.low_stock_threshold);return `<tr><td>${esc(i.name)}</td><td>${Number(i.current_stock).toFixed(2)}</td><td>${esc(i.unit)}</td><td>${money(Number(i.current_stock)*Number(i.cost_per_unit))}</td><td>${low?'<span class="badge">Low stock</span>':'<span class="badge">OK</span>'}</td></tr>`}).join("")||`<tr><td colspan="5" class="empty">No inventory yet.</td></tr>`}
      </tbody></table></div>`;
  },

  async customers(){
    const {data,error}=await sb.from("customers").select("*").eq("user_id",session.user.id).order("created_at",{ascending:false});
    if(error)throw error;
    $("#page").innerHTML=`<div class="page-head"><div><h3>Customers</h3></div><button class="btn btn-dark" onclick="openCustomerModal()">+ Customer</button></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th></th></tr></thead><tbody>
      ${(data||[]).map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.phone||"")}</td><td>${esc(c.email||"")}</td><td>${esc(c.address||"")}</td><td><button class="btn" onclick='openCustomerModal(${JSON.stringify(c)})'>Edit</button> <button class="btn btn-danger" onclick="deleteRow('customers','${c.id}',render.customers)">Delete</button></td></tr>`).join("")||`<tr><td colspan="5" class="empty">No customers yet.</td></tr>`}
      </tbody></table></div>`;
  },

  async orders(){
    const {data,error}=await sb.from("orders").select("*,customers(name)").eq("user_id",session.user.id).order("created_at",{ascending:false});
    if(error)throw error;
    $("#page").innerHTML=`<div class="page-head"><div><h3>Orders</h3><p class="muted">Completed and active orders.</p></div><button class="btn btn-dark" onclick="openOrderModal()">+ Order</button></div>
      ${orderTable(data||[],true)}`;
  },

  async pending(){
    const {data,error}=await sb.from("orders").select("*,customers(name)").eq("user_id",session.user.id).in("status",["pending","preparing","ready"]).order("created_at",{ascending:true});
    if(error)throw error;
    const orderIds=(data||[]).map(o=>o.id).filter(Boolean);
    let itemCounts={};
    if(orderIds.length){
      const {data:items,error:itemError}=await sb.from("order_items").select("order_id,quantity").eq("user_id",session.user.id).in("order_id",orderIds);
      if(itemError)throw itemError;
      for(const item of (items||[])){
        const qty=Math.max(0,Number(item.quantity||0));
        itemCounts[item.order_id]=(itemCounts[item.order_id]||0)+qty;
      }
    }
    window.__pendingItemCounts=itemCounts;
    const totalRemaining=Object.values(itemCounts).reduce((a,b)=>a+b,0);
    $("#page").innerHTML=`<div class="page-head"><div><h3>Pending Orders</h3><p class="muted">Orders here do not deduct inventory until completed.</p></div><div class="page-actions"><span class="pending-total-badge">${totalRemaining} item${totalRemaining===1?"":"s"} remaining</span><button class="btn btn-dark" onclick="printAllPendingKitchen()">Print Kitchen List</button><button class="btn btn-dark" onclick="openOrderModal()">+ Order</button></div></div>
      ${orderTable(data||[],true,true,itemCounts)}`;
  },

  async sales(){
    const {data,error}=await sb.from("sales").select("*").eq("user_id",session.user.id).order("sale_date",{ascending:false});
    if(error)throw error;
    $("#page").innerHTML=`<div class="page-head"><h3>Sales</h3></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Cost</th><th>Profit</th><th>Payment</th><th></th></tr></thead><tbody>
      ${(data||[]).map(s=>`<tr><td>${esc(s.sale_date)}</td><td>${money(s.amount)}</td><td>${money(s.cost)}</td><td>${money(s.profit)}</td><td>${esc(s.payment_method||"")}</td><td><button class="btn btn-danger" onclick="deleteSale('${s.id}')">Delete</button></td></tr>`).join("")||`<tr><td colspan="6" class="empty">No sales yet.</td></tr>`}</tbody></table></div>`;
  },

  async expenses(){
    const {data,error}=await sb.from("expenses").select("*").eq("user_id",session.user.id).order("expense_date",{ascending:false});
    if(error)throw error;
    $("#page").innerHTML=`<div class="page-head"><h3>Expenses</h3><button class="btn btn-dark" onclick="openExpenseModal()">+ Expense</button></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th></th></tr></thead><tbody>
      ${(data||[]).map(x=>`<tr><td>${esc(x.expense_date)}</td><td>${esc(x.category)}</td><td>${esc(x.description||"")}</td><td>${money(x.amount)}</td><td><button class="btn btn-danger" onclick="deleteRow('expenses','${x.id}',render.expenses)">Delete</button></td></tr>`).join("")||`<tr><td colspan="5" class="empty">No expenses yet.</td></tr>`}</tbody></table></div>`;
  },

  async invoices(){
    const {data,error}=await sb.from("invoices").select("*,customers(name),orders(order_number)").eq("user_id",session.user.id).order("invoice_date",{ascending:false});
    if(error)throw error;
    $("#page").innerHTML=`<div class="page-head"><div><h3>Invoices</h3><p class="muted">Create invoices from existing orders, then print or download them.</p></div><button class="btn btn-dark" onclick="openInvoiceModal()">+ Invoice</button></div>
      <div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Order</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
      ${(data||[]).map(i=>`<tr><td><strong>${esc(i.invoice_number)}</strong></td><td>${esc(i.invoice_date||"")}</td><td>${esc(i.customers?.name||"Walk-in")}</td><td>${esc(i.orders?.order_number||"")}</td><td>${money(i.total)}</td><td><span class="badge">${esc(i.status||"issued")}</span></td><td class="row-actions"><button class="btn" onclick="viewInvoice('${i.id}')">View</button><button class="btn" onclick="printInvoice('${i.id}')">Print</button><button class="btn btn-danger" onclick="deleteInvoice('${i.id}')">Delete</button></td></tr>`).join("")||`<tr><td colspan="7" class="empty">No invoices yet. Click + Invoice to create one from an order.</td></tr>`}</tbody></table></div>`;
  },

  async reports(){
    const sales=await sum("sales","amount"), cost=await sum("sales","cost"), expenses=await sum("expenses","amount");
    $("#page").innerHTML=`<div class="page-head"><div><h3>Reports</h3><p class="muted">Business-level summary.</p></div></div>
      <div class="stats"><div class="stat"><div class="label">Sales</div><div class="value">${money(sales)}</div></div>
      <div class="stat"><div class="label">COGS</div><div class="value">${money(cost)}</div></div>
      <div class="stat"><div class="label">Gross Profit</div><div class="value">${money(sales-cost)}</div></div>
      <div class="stat"><div class="label">Net Profit</div><div class="value">${money(sales-cost-expenses)}</div></div></div>
      <div class="card"><h4>Profit logic</h4><p class="muted">Gross Profit = Sales − product cost. Net Profit = Gross Profit − recorded expenses.</p></div>`;
  },

  async settings(){
    const p=profile||{};
    $("#page").innerHTML=`<div class="page-head"><div><h3>Account Settings</h3><p class="muted">Profile and account information.</p></div></div>
      <div class="card"><form id="settingsForm" class="form-grid">
        <label>Full name<input id="setName" value="${esc(p.full_name||"")}"></label>
        <label>Email<input value="${esc(p.email||session.user.email||"")}" disabled></label>
        <label>Role<input value="${esc(p.role||"")}" disabled></label>
        <div class="wide"><button class="btn btn-dark" type="submit">Save profile</button></div>
      </form></div>`;
    $("#settingsForm").onsubmit=async e=>{
      e.preventDefault();
      const {data,error}=await sb.from("profiles").update({full_name:$("#setName").value}).eq("id",session.user.id).select().single();
      if(error) return toast(errText(error));
      profile=data; toast("Profile saved.");
    };
  },

  async staff(){
    if(profile?.role!=="owner"){ $("#page").innerHTML=`<div class="card"><h3>Staff</h3><p class="error">Only the owner can manage staff.</p></div>`; return; }
    const {data,error}=await sb.from("profiles").select("id,email,full_name,role,avatar_url,created_at").order("created_at",{ascending:false});
    if(error)throw error;
    $("#page").innerHTML=`<div class="page-head"><div><h3>Staff</h3><p class="muted">Manage staff profiles and access.</p></div><button class="btn btn-dark" onclick="openStaffModal()">+ Create Staff</button></div>
      <div class="card" style="margin-bottom:18px"><p class="muted small">Staff login accounts must exist in Supabase Authentication. This page manages their profile and role. For a new login account, create the user in Authentication first, then add the profile here.</p></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th></th></tr></thead><tbody>
      ${(data||[]).map(st=>`<tr><td>${esc(st.full_name||"")}</td><td>${esc(st.email||"")}</td><td><span class="badge">${esc(st.role||"staff")}</span></td><td>${new Date(st.created_at).toLocaleDateString()}</td><td>${st.id!==session.user.id?`<button class="btn" onclick='openStaffModal(${JSON.stringify(st)})'>Edit</button> <button class="btn btn-danger" onclick="deleteStaff('${st.id}')">Delete</button>`:`<span class="muted small">Current user</span>`}</td></tr>`).join("")||`<tr><td colspan="5" class="empty">No staff profiles yet.</td></tr>`}
      </tbody></table></div>`;
  }
};

function orderTable(data,full=false,pending=false,itemCounts={}){
  return `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th>${pending?'<th>Remaining</th>':''}<th>Status</th><th>Total</th><th>Date</th>${full?'<th>Actions</th>':''}</tr></thead><tbody>
  ${data.map(o=>{const remaining=Number(itemCounts?.[o.id]||0);return `<tr><td><strong>${esc(o.order_number)}</strong></td><td>${esc(o.customers?.name||"Walk-in")}</td>${pending?`<td><span class="remaining-items-badge">${remaining} item${remaining===1?"":"s"}</span></td>`:''}<td><span class="badge">${esc(o.status)}</span></td><td>${money(o.total)}</td><td>${new Date(o.created_at).toLocaleString()}</td>${full?`<td class="row-actions">${pending&&o.status!=="completed"?`<button class="btn btn-dark" onclick="printKitchenOrder('${o.id}')">Print Kitchen</button><button class="btn btn-dark" onclick="completeOrder('${o.id}')">Complete</button>`:""} <button class="btn btn-danger" onclick="deleteOrder('${o.id}')">Delete</button></td>`:""}</tr>`}).join("")||`<tr><td colspan="${full?(pending?7:6):(pending?6:5)}" class="empty">No orders yet.</td></tr>`}
  </tbody></table></div>`;
}


function invoiceForOrder(orderId){
  return stateInvoices.find(x=>x.order_id===orderId)||null;
}

let stateInvoices=[];
async function loadInvoiceState(){
  const {data,error}=await sb.from("invoices").select("*,customers(name),orders(order_number)").eq("user_id",session.user.id).order("invoice_date",{ascending:false});
  if(error) throw error;
  stateInvoices=data||[];
  return stateInvoices;
}

function invoiceNumber(){
  return `INV-${Date.now().toString().slice(-8)}`;
}

function invoiceCustomer(invoice){
  return invoice?.customers || {};
}

async function fetchInvoiceItems(invoiceId){
  // Prefer saved invoice_items, but fall back to the source order so invoices
  // still render even when the optional line-item table/schema is unavailable.
  const {data:invoice,error:invoiceError}=await sb.from("invoices").select("order_id").eq("id",invoiceId).eq("user_id",session.user.id).single();
  if(invoiceError) throw invoiceError;
  const {data,error}=await sb.from("invoice_items").select("*").eq("invoice_id",invoiceId).eq("user_id",session.user.id).order("created_at");
  if(!error && (data||[]).length) return data||[];
  const {data:orderItems,error:orderError}=await sb.from("order_items").select("product_id,quantity,unit_price,line_total,addons_total").eq("order_id",invoice.order_id).eq("user_id",session.user.id);
  if(orderError) throw orderError;
  const ids=[...(new Set((orderItems||[]).map(x=>x.product_id).filter(Boolean)))];
  let products=[];
  if(ids.length){
    const {data:pd,error:pe}=await sb.from("products").select("id,name").in("id",ids).eq("user_id",session.user.id);
    if(pe) throw pe;
    products=pd||[];
  }
  return (orderItems||[]).map(x=>{
    const product=products.find(p=>p.id===x.product_id);
    const addons=Number(x.addons_total||0);
    const qty=Math.max(1,Number(x.quantity||1));
    return {product_name:product?.name||"Item",description:addons>0?`${product?.name||"Item"} + Add-ons`:product?.name||"Item",quantity:qty,unit_price:Number(x.unit_price||0)+addons/qty,addon_name:addons>0?"Add-ons":null,addon_price:addons,line_total:Number(x.line_total||0)};
  });
}

async function openInvoiceModal(){
  const [{data:orders,error:oe},{data:customers,error:ce}]=await Promise.all([
    sb.from("orders").select("id,order_number,customer_id,status,subtotal,discount,delivery_fee,total,created_at,notes").eq("user_id",session.user.id).order("created_at",{ascending:false}),
    sb.from("customers").select("id,name,phone,email,address").eq("user_id",session.user.id).order("name")
  ]);
  if(oe)return toast(errText(oe));
  if(ce)return toast(errText(ce));
  await loadInvoiceState();
  const available=(orders||[]).filter(o=>!invoiceForOrder(o.id));
  const customerMap=Object.fromEntries((customers||[]).map(c=>[c.id,c]));
  openModal("Add Invoice",`<form id="invoiceForm" class="form-grid" onsubmit="return false;">
    <label class="wide">Order<select id="invoiceOrder" required><option value="">Select an order</option>${available.map(o=>`<option value="${esc(o.id)}">${esc(o.order_number)} · ${esc(customerMap[o.customer_id]?.name||"Walk-in")} · ${money(o.total)}</option>`).join("")}</select></label>
    <label>Issue date<input id="invoiceDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label>
    <label>Status<select id="invoiceStatus"><option value="issued">Issued</option><option value="draft">Draft</option><option value="paid">Paid</option><option value="void">Void</option></select></label>
    <label class="wide">Notes<textarea id="invoiceNotes" placeholder="Optional invoice note..."></textarea></label>
    <div id="invoiceOrderPreview" class="wide invoice-form-preview"><div class="muted">Select an order to preview the customer and total.</div></div>
  </form>`,async()=>{
    const btn=document.getElementById("modalSubmit");
    const orderEl=document.getElementById("invoiceOrder");
    const dateEl=document.getElementById("invoiceDate");
    const statusEl=document.getElementById("invoiceStatus");
    const notesEl=document.getElementById("invoiceNotes");
    if(!orderEl||!dateEl||!statusEl||!notesEl){console.error("Invoice form element missing",{orderEl,dateEl,statusEl,notesEl});return toast("Invoice form could not be read. Please close and open it again.");}
    if(btn){btn.disabled=true;btn.textContent="Saving…";}
    try{
      const orderId=String(orderEl.value||"").trim();
      if(!orderId)throw new Error("Please select an order.");
      const order=(orders||[]).find(o=>String(o.id)===orderId);
      if(!order)throw new Error("Order not found. Please reopen the invoice form.");
      if(invoiceForOrder(orderId))throw new Error("This order already has an invoice.");
      const {data:orderItems,error:ie}=await sb.from("order_items").select("product_id,quantity,unit_price,line_total,addons_total").eq("order_id",orderId).eq("user_id",session.user.id);
      if(ie)throw new Error("Could not load order items: "+errText(ie));
      const ids=[...(new Set((orderItems||[]).map(x=>x.product_id).filter(Boolean)))];
      let products=[];
      if(ids.length){const {data:pd,error:pe}=await sb.from("products").select("id,name").in("id",ids).eq("user_id",session.user.id);if(pe)throw new Error("Could not load products: "+errText(pe));products=pd||[];}
      const subtotal=Number(order.subtotal||0),discount=Number(order.discount||0),delivery=Number(order.delivery_fee||0),total=Number(order.total||Math.max(0,subtotal-discount+delivery));
      const issueDate=String(dateEl.value||"").trim();if(!issueDate)throw new Error("Please select an issue date.");
      const invoicePayload={user_id:session.user.id,order_id:order.id,customer_id:order.customer_id||null,invoice_number:invoiceNumber(),invoice_date:issueDate,subtotal,discount,total,status:String(statusEl.value||"issued"),notes:String(notesEl.value||"").trim()||order.notes||null};
      console.log("Creating invoice",invoicePayload);
      const result=await sb.from("invoices").insert(invoicePayload).select("*").single();
      if(result.error)throw new Error("Could not save invoice: "+errText(result.error));
      const inv=result.data;if(!inv?.id)throw new Error("Invoice was created but no invoice ID was returned.");
      const itemPayload=(orderItems||[]).map(x=>{const product=products.find(p=>p.id===x.product_id);const addons=Number(x.addons_total||0),qty=Math.max(1,Number(x.quantity||1));return {invoice_id:inv.id,user_id:session.user.id,product_id:x.product_id,description:addons>0?`${product?.name||"Item"} + Add-ons`:product?.name||"Item",quantity:qty,unit_price:Number(x.unit_price||0)+addons/qty,line_total:Number(x.line_total||0)};});
      if(itemPayload.length){const lineResult=await sb.from("invoice_items").insert(itemPayload);if(lineResult.error)console.warn("Invoice saved, but invoice line items were not saved.",lineResult.error);}
      closeModal();toast("Invoice created successfully.");await navigate("invoices");
    }catch(e){console.error("Invoice save error",e);toast(e?.message||"Could not save invoice.");}
    finally{if(btn){btn.disabled=false;btn.textContent="Save";}}
  });
  document.getElementById("invoiceOrder")?.addEventListener("change",()=>{const orderEl=document.getElementById("invoiceOrder"),box=document.getElementById("invoiceOrderPreview");if(!orderEl||!box)return;const order=(orders||[]).find(o=>String(o.id)===String(orderEl.value||""));if(!order){box.innerHTML='<div class="muted">Select an order to preview the customer and total.</div>';return;}const c=customerMap[order.customer_id];box.innerHTML=`<div><span class="invoice-preview-label">CUSTOMER</span><strong>${esc(c?.name||"Walk-in")}</strong></div><div><span class="invoice-preview-label">ORDER</span><strong>${esc(order.order_number)}</strong></div><div><span class="invoice-preview-label">TOTAL</span><strong>${money(order.total)}</strong></div>`;});
  if(!available.length){const box=document.getElementById("invoiceOrderPreview");if(box)box.innerHTML='<div class="muted">All existing orders already have invoices.</div>';}
}

function invoiceHtml(invoice,items,forPrint=false){
  const customer=invoiceCustomer(invoice);
  const shop=profile?.shop_name||profile?.full_name||"NUONUO";
  const phone="+601113079717";
  const instagram="nuonuodessert";
  return `<div id="invoiceSheet" class="invoice-sheet ${forPrint?'print-invoice':''}">
    <div class="receipt-brand">${esc(shop)}</div>
    <div class="receipt-contact">${esc(phone)} · IG @${esc(instagram)}</div>
    <div class="receipt-title">INVOICE</div>
    <div class="receipt-meta">
      <div><span>Invoice</span><strong>${esc(invoice.invoice_number)}</strong></div>
      <div><span>Date</span><strong>${esc(invoice.invoice_date||"")}</strong></div>
      <div><span>Customer</span><strong>${esc(customer.name||"Walk-in")}</strong></div>
      ${customer.phone?`<div><span>Phone</span><strong>${esc(customer.phone)}</strong></div>`:""}
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-items">
      ${items.map(i=>{
        const name=i.product_name||i.description||"Item";
        const addon=i.addon_name?`<div class="receipt-addon">+ ${esc(i.addon_name)} · ${money(i.addon_price)}</div>`:"";
        return `<div class="receipt-item"><div class="receipt-item-main"><span class="receipt-item-name">${esc(name)}</span><span class="receipt-item-total">${money(i.line_total)}</span></div><div class="receipt-item-sub">${Number(i.quantity||0)} × ${money(Number(i.unit_price||0)+Number(i.addon_price||0))}</div>${addon}</div>`;
      }).join("")||`<div class="muted">No line items.</div>`}
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-totals">
      <div><span>Subtotal</span><strong>${money(invoice.subtotal)}</strong></div>
      <div><span>Discount</span><strong>${money(invoice.discount)}</strong></div>
      <div class="receipt-grand"><span>TOTAL</span><strong>${money(invoice.total)}</strong></div>
    </div>
    ${invoice.notes?`<div class="receipt-note"><strong>Note</strong><div>${esc(invoice.notes)}</div></div>`:""}
    <div class="receipt-footer">Thank you for your order ♡</div>
  </div>`;
}

async function viewInvoice(id){
  const {data:invoice,error}=await sb.from("invoices").select("*,customers(name,phone,email,address),orders(order_number)").eq("id",id).eq("user_id",session.user.id).single();
  if(error)return toast(errText(error));
  const items=await fetchInvoiceItems(id);
  openModal(`Invoice ${invoice.invoice_number}`,`${invoiceHtml(invoice,items)}<div class="invoice-toolbar"><button class="btn" onclick="printInvoice('${invoice.id}')">Print</button><button class="btn" onclick="downloadInvoicePDF('${invoice.id}')">Download PDF</button><button class="btn btn-dark" onclick="downloadInvoicePNG('${invoice.id}')">Download PNG</button></div>` ,null,"invoice-modal");
  $("#modalSubmit")?.remove();
}

async function printInvoice(id){
  const {data:invoice,error}=await sb.from("invoices").select("*,customers(name,phone,email,address),orders(order_number)").eq("id",id).eq("user_id",session.user.id).single();
  if(error)return toast(errText(error));
  const items=await fetchInvoiceItems(id);
  const w=window.open("","_blank","width=900,height=1000");
  if(!w)return toast("Please allow pop-ups to print the invoice.");
  w.document.write(`<!doctype html><html><head><title>${esc(invoice.invoice_number)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${invoicePrintCss()}</style></head><body>${invoiceHtml(invoice,items,true)}</body></html>`);
  w.document.close();w.focus();setTimeout(()=>w.print(),300);
}

function invoicePrintCss(){return `
@page{size:57mm auto;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;width:57mm;background:#fff;color:#222}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px}
.invoice-sheet{width:57mm;max-width:57mm;margin:0;padding:4mm 3.5mm 5mm;background:#fff;color:#222;overflow:hidden}
.receipt-brand{text-align:center;font-size:18px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;line-height:1.2}
.receipt-contact{text-align:center;font-size:8.5px;color:#555;margin-top:2mm;white-space:nowrap}
.receipt-title{text-align:center;font-size:10px;letter-spacing:.18em;font-weight:700;margin-top:2.5mm}
.receipt-meta{margin-top:3mm;font-size:9px}
.receipt-meta>div{display:flex;justify-content:space-between;gap:8px;padding:1.2mm 0}
.receipt-meta span{color:#777}
.receipt-meta strong{text-align:right;font-weight:600;max-width:34mm;overflow-wrap:anywhere}
.receipt-divider{border-top:1px dashed #999;margin:2.5mm 0}
.receipt-item{padding:1.8mm 0}
.receipt-item-main{display:flex;justify-content:space-between;gap:4px;align-items:flex-start}
.receipt-item-name{font-weight:700;max-width:37mm;overflow-wrap:anywhere}
.receipt-item-total{font-weight:700;white-space:nowrap}
.receipt-item-sub{font-size:8.5px;color:#777;margin-top:1mm}
.receipt-addon{font-size:8.5px;color:#555;margin-top:.8mm;padding-left:2mm}
.receipt-totals>div{display:flex;justify-content:space-between;padding:1.2mm 0;font-size:9px}
.receipt-grand{border-top:1px solid #222;margin-top:1mm;padding-top:2mm!important;font-size:12px!important;font-weight:800}
.receipt-note{margin-top:3mm;padding-top:2mm;border-top:1px solid #eee;font-size:8.5px;line-height:1.4}
.receipt-note strong{display:block;margin-bottom:1mm}
.receipt-footer{text-align:center;font-size:8.5px;color:#777;margin-top:5mm}
.muted{color:#888}
@media print{body{width:57mm}.invoice-sheet{width:57mm;max-width:57mm;margin:0;padding:4mm 3.5mm 5mm}}
`}

async function getInvoiceRender(id){
  const {data:invoice,error}=await sb.from("invoices").select("*,customers(name,phone,email,address),orders(order_number)").eq("id",id).eq("user_id",session.user.id).single();
  if(error)throw error;
  const items=await fetchInvoiceItems(id);
  const holder=document.createElement("div");holder.style.position="fixed";holder.style.left="-100000px";holder.style.top="0";holder.style.width="57mm";holder.style.maxWidth="57mm";holder.style.boxSizing="border-box";holder.style.background="#fff";holder.innerHTML=invoiceHtml(invoice,items);document.body.appendChild(holder);
  return {invoice,holder,sheet:holder.querySelector("#invoiceSheet")};
}

async function downloadInvoicePNG(id){
  try{
    const {invoice,holder,sheet}=await getInvoiceRender(id);
    const canvas=await html2canvas(sheet,{scale:2,backgroundColor:"#fff",useCORS:true});
    const a=document.createElement("a");a.download=`${invoice.invoice_number}.png`;a.href=canvas.toDataURL("image/png");a.click();holder.remove();
  }catch(e){toast("PNG export failed: "+errText(e));}
}

async function downloadInvoicePDF(id){
  try{
    const {invoice,holder,sheet}=await getInvoiceRender(id);
    const canvas=await html2canvas(sheet,{scale:2,backgroundColor:"#fff",useCORS:true});
    const {jsPDF}=window.jspdf||{};if(!jsPDF)throw new Error("PDF library is unavailable. Please refresh and try again.");
    const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:[57,Math.max(80,canvas.height*57/canvas.width)]});
    const pageW=57,pageH=Math.max(80,canvas.height*57/canvas.width),margin=3.5;
    const imgW=pageW-margin*2,imgH=canvas.height*imgW/canvas.width;
    let y=margin;
    pdf.addImage(canvas.toDataURL("image/jpeg",.95),"JPEG",margin,y,imgW,imgH);
    pdf.save(`${invoice.invoice_number}.pdf`);holder.remove();
  }catch(e){toast("PDF export failed: "+errText(e));}
}

async function deleteInvoice(id){
  if(!confirm("Delete this invoice?"))return;
  const {error}=await sb.from("invoices").delete().eq("id",id).eq("user_id",session.user.id);
  if(error)return toast(errText(error));
  toast("Invoice deleted.");await navigate("invoices");
}

async function deleteSale(id){
  if(!confirm("Delete this sale record? This will also remove it from Sales and profit calculations."))return;
  const {error}=await sb.from("sales").delete().eq("id",id).eq("user_id",session.user.id);
  if(error)return toast(errText(error));
  toast("Sale deleted.");
  await navigate("sales");
}

async function deleteRow(table,id,refresh){
  if(!confirm("Delete this item?"))return;
  const {error}=await sb.from(table).delete().eq("id",id).eq("user_id",session.user.id);
  if(error) return toast(errText(error));
  toast("Deleted."); await refresh();
}
async function deleteOrder(id){await deleteRow("orders",id,()=>navigate(currentPage));}
async function fetchKitchenOrder(orderId){
  const [{data:order,error:oe},{data:items,error:ie}]=await Promise.all([
    sb.from("orders").select("*,customers(name,phone,address)").eq("id",orderId).eq("user_id",session.user.id).single(),
    sb.from("order_items").select("product_id,quantity,unit_price,addons_total,line_total").eq("order_id",orderId).eq("user_id",session.user.id)
  ]);
  if(oe)throw oe;
  if(ie)throw ie;
  const ids=[...(new Set((items||[]).map(x=>x.product_id).filter(Boolean)))];
  let products=[];
  if(ids.length){
    const {data,error}=await sb.from("products").select("id,name").eq("user_id",session.user.id).in("id",ids);
    if(error)throw error;
    products=data||[];
  }
  return {order,items:(items||[]).map(x=>({...x,product:products.find(p=>p.id===x.product_id)}))};
}

function parseKitchenAddons(note){
  if(!note)return [];
  return note.split(";").map(part=>part.trim()).filter(Boolean).map(part=>{
    const m=part.match(/^(.*?):\s*(.*?)\s*\(\+?\s*(RM\s*[0-9,.]+)\)\s*x(\d+(?:\.\d+)?)$/i);
    if(!m)return null;
    const price=Number(String(m[3]).replace(/RM\s*/i,"").replace(/,/g,""))||0;
    const qty=Number(m[4]||1)||1;
    return {product:m[1].trim(),name:m[2].trim(),price,qty,total:price*qty};
  }).filter(Boolean);
}

function kitchenReceiptHtml(order,items){
  const qtyTotal=items.reduce((sum,i)=>sum+Number(i.quantity||0),0);
  const addonEntries=parseKitchenAddons(order.notes||"");
  let addonCursor=0;
  const itemHtml=items.map(i=>{
    const productName=i.product?.name||"Item";
    const addonTotal=Number(i.addons_total||0);
    const addons=[];
    if(addonTotal>0){
      let accumulated=0;
      for(let n=addonCursor;n<addonEntries.length;n++){
        const a=addonEntries[n];
        if(a.product!==productName)continue;
        addons.push(a);
        accumulated+=a.total;
        addonCursor=n+1;
        if(Math.abs(accumulated-addonTotal)<0.01 || accumulated>addonTotal+0.01)break;
      }
    }
    return `<div class="kitchen-item">
      <div class="kitchen-item-main">
        <div class="kitchen-item-row"><div class="kitchen-item-name">${esc(productName)}</div><div class="kitchen-item-qty">× ${Number(i.quantity||0)}</div></div>
        ${addons.length?`<div class="kitchen-addons">${addons.map(a=>`<div class="kitchen-addon"><span>+ ${esc(a.name)}</span><strong>× ${a.qty}</strong></div>`).join("")}</div>`:""}
      </div>
    </div>`;
  }).join("");
  return `<div class="kitchen-sheet">
    <div class="kitchen-brand">NUONUO</div>
    <div class="kitchen-title">KITCHEN ORDER</div>
    <div class="kitchen-rule"></div>
    <div class="kitchen-order-no">${esc(order.order_number||"")}</div>
    <div class="kitchen-meta">${new Date(order.created_at||Date.now()).toLocaleString()} · ${esc(order.status||"pending")}</div>
    <div class="kitchen-meta">Customer: ${esc(order.customers?.name||"Walk-in")}</div>
    <div class="kitchen-rule"></div>
    ${itemHtml||`<div class="muted">No items</div>`}
    <div class="kitchen-rule"></div>
    <div class="kitchen-total">TOTAL ITEMS <strong>${qtyTotal}</strong></div>
    <div class="kitchen-footer">Please prepare this order.</div>
  </div>`;
}

function kitchenPrintCss(){return `@page{size:57mm auto;margin:0}html,body{margin:0;padding:0;width:57mm;background:#fff;color:#111;font-family:Arial,sans-serif}.kitchen-sheet{box-sizing:border-box;width:57mm;max-width:57mm;padding:4mm 3.5mm 5mm;background:#fff}.kitchen-brand{text-align:center;font-size:16px;font-weight:800;letter-spacing:3px}.kitchen-title{text-align:center;font-size:13px;font-weight:800;margin-top:2px}.kitchen-rule{border-top:1px dashed #111;margin:3mm 0}.kitchen-order-no{text-align:center;font-size:20px;font-weight:800}.kitchen-meta{font-size:10px;line-height:1.35;text-align:center;margin-top:1mm}.kitchen-item{font-size:15px;font-weight:700;padding:2mm 0;border-bottom:1px dotted #aaa}.kitchen-item-main{width:100%}.kitchen-item-row{display:flex;justify-content:space-between;gap:3mm}.kitchen-item-name{flex:1;word-break:break-word}.kitchen-item-qty{white-space:nowrap;font-size:16px}.kitchen-addons{margin-top:1.2mm;padding-left:3mm;border-left:2px solid #111}.kitchen-addon{display:flex;justify-content:space-between;gap:2mm;font-size:10.5px;font-weight:600;line-height:1.35;padding:0.7mm 0}.kitchen-addon span{flex:1;word-break:break-word}.kitchen-addon strong{white-space:nowrap;font-size:10.5px}.kitchen-total{display:flex;justify-content:space-between;font-size:13px;font-weight:800}.kitchen-footer{text-align:center;font-size:9px;margin-top:4mm}@media print{body{width:57mm}.kitchen-sheet{width:57mm;max-width:57mm}}`}

async function printKitchenOrder(id){
  try{
    const {order,items}=await fetchKitchenOrder(id);
    const w=window.open("","_blank","width=420,height=700");
    if(!w)return toast("Please allow pop-ups to print the kitchen order.");
    w.document.write(`<!doctype html><html><head><title>Kitchen ${esc(order.order_number||"")}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${kitchenPrintCss()}</style></head><body>${kitchenReceiptHtml(order,items)}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(()=>w.print(),250);
  }catch(e){toast(errText(e));}
}

async function printAllPendingKitchen(){
  try{
    const {data,error}=await sb.from("orders").select("id").eq("user_id",session.user.id).in("status",["pending","preparing","ready"]).order("created_at",{ascending:true});
    if(error)throw error;
    if(!data?.length)return toast("No pending orders to print.");
    const packs=await Promise.all(data.map(o=>fetchKitchenOrder(o.id)));
    const w=window.open("","_blank","width=420,height=700");
    if(!w)return toast("Please allow pop-ups to print the kitchen list.");
    const html=packs.map((p,i)=>`${i?'<div class="page-break"></div>':''}${kitchenReceiptHtml(p.order,p.items)}`).join("");
    w.document.write(`<!doctype html><html><head><title>Nuonuo Kitchen Orders</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${kitchenPrintCss()}.page-break{break-after:page}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(()=>w.print(),250);
  }catch(e){toast(errText(e));}
}

async function completeOrder(id){
  if(!confirm("Complete this order? Inventory will be deducted."))return;
  const {error}=await sb.rpc("complete_order",{p_order_id:id,p_user_id:session.user.id});
  if(error)return toast(errText(error));
  toast("Order completed and inventory deducted.");
  await navigate(currentPage);
}

function openModal(title,body,submit,extraClass=""){
  const isOrder=extraClass.split(/\s+/).includes("order-modal");
  const submitLabel=isOrder?"Confirm Order":"Save";
  $("#modalRoot").innerHTML=`<div class="modal-backdrop"><div class="modal ${extraClass}"><div class="modal-head"><h3>${title}</h3><button class="close" onclick="closeModal()">×</button></div><div class="modal-body">${body}</div><div class="modal-foot"><button class="btn" onclick="closeModal()">Cancel</button><button id="modalSubmit" class="btn btn-dark">${submitLabel}</button></div></div></div>`;
  $("#modalSubmit").onclick=submit;
}
function closeModal(){$("#modalRoot").innerHTML=""}

function isMissingSupabaseTable(error, tableName){
  const code=String(error?.code||'');
  const msg=String(error?.message||'').toLowerCase();
  return code==='42P01' || code==='PGRST205' || msg.includes(`could not find the table 'public.${tableName.toLowerCase()}'`) || msg.includes(`relation "${tableName.toLowerCase()}" does not exist`);
}

async function loadSubrecipes(){
  window.__subrecipeDbReady=true;
  const [{data:subs,error:subErr},{data:items,error:itemErr}]=await Promise.all([
    sb.from("nuonuo_subrecipes").select("id,name,yield_quantity,yield_unit,created_at,updated_at").eq("user_id",session.user.id).order("name"),
    sb.from("nuonuo_subrecipe_items").select("id,subrecipe_id,ingredient_id,child_subrecipe_id,quantity").eq("user_id",session.user.id)
  ]);
  if(subErr || itemErr){
    const missing=subErr && isMissingSupabaseTable(subErr,'nuonuo_subrecipes') || itemErr && isMissingSupabaseTable(itemErr,'nuonuo_subrecipe_items');
    if(missing){
      window.__subrecipeDbReady=false;
      return [];
    }
    throw (subErr || itemErr);
  }
  const {data:ings,error:ingErr}=await sb.from("ingredients").select("id,name,unit,cost_per_unit").eq("user_id",session.user.id);
  if(ingErr)throw ingErr;
  const ingMap=new Map((ings||[]).map(x=>[x.id,x]));
  const subMap=new Map((subs||[]).map(x=>[x.id,x]));
  const itemMap=new Map();
  (items||[]).forEach(x=>{if(!itemMap.has(x.subrecipe_id))itemMap.set(x.subrecipe_id,[]);itemMap.get(x.subrecipe_id).push(x);});
  const memo=new Map(), visiting=new Set();
  const calc=(id)=>{
    if(memo.has(id))return memo.get(id);
    if(visiting.has(id))return 0;
    visiting.add(id);
    let total=0;
    for(const row of itemMap.get(id)||[]){
      const q=Number(row.quantity||0);
      if(row.ingredient_id) total+=q*ingredientBaseCost(ingMap.get(row.ingredient_id));
      else if(row.child_subrecipe_id){
        const child=subMap.get(row.child_subrecipe_id);
        total+=q*(calc(row.child_subrecipe_id)/Math.max(yieldTotalBaseAmount(child),0.000001));
      }
    }
    visiting.delete(id);memo.set(id,total);return total;
  };
  return (subs||[]).map(r=>({...r,calculated_cost:Number(calc(r.id).toFixed(4)),items:(itemMap.get(r.id)||[])}));
}

function renderSubrecipeRows(ingredients,subrecipes,items,currentId=''){
  const rows=items.length?items:[{ingredient_id:ingredients[0]?.id||'',child_subrecipe_id:null,quantity:1}];
  return rows.map((r,i)=>{
    const type=r.child_subrecipe_id?'subrecipe':'ingredient';
    const selectedId=r.child_subrecipe_id||r.ingredient_id||'';
    return `<div class="recipe-row subrecipe-row">
      <select class="subrecipe-type" onchange="changeSubrecipeType(this)">
        <option value="ingredient" ${type==='ingredient'?'selected':''}>Ingredient</option>
        <option value="subrecipe" ${type==='subrecipe'?'selected':''}>Sub-ingredient</option>
      </select>
      <select class="subrecipe-component" onchange="updateSubrecipeUnit(this);updateSubrecipePreview()">
        ${type==='ingredient'
          ? `<option value="">Select ingredient</option>${ingredients.map(x=>`<option value="${x.id}" ${x.id===selectedId?'selected':''}>${esc(x.name)} · ${componentCostLabel(x,'ingredient')}</option>`).join('')}`
          : `<option value="">Select sub-ingredient</option>${subrecipes.filter(x=>x.id!==currentId).map(x=>`<option value="${x.id}" ${x.id===selectedId?'selected':''}>${esc(x.name)} · ${componentCostLabel(x,'subrecipe')}</option>`).join('')}`}
      </select>
      <span class="qty-wrap" style="display:flex;align-items:center;gap:8px"><input class="subrecipe-qty" type="number" min="0.0001" step="0.001" value="${Number(r.quantity||1)}" placeholder="Qty" oninput="updateSubrecipePreview()" style="width:100%"><span class="qty-unit" style="white-space:nowrap;color:#666">${type==='ingredient'?esc(ingredientBaseUnit(ingredients.find(x=>x.id===selectedId))):esc(subrecipeBaseUnit(subrecipes.find(x=>x.id===selectedId)))}</span></span>
      <button type="button" class="recipe-remove" onclick="this.closest('.recipe-row').remove();updateSubrecipePreview()">×</button>
    </div>`;
  }).join('');
}

function changeSubrecipeType(select){
  const row=select.closest('.subrecipe-row');
  const type=select.value, ingredients=window.__subrecipeIngredients||[], subs=(window.__subrecipeList||[]).filter(x=>x.id!==window.__editingSubrecipeId);
  row.querySelector('.subrecipe-component').innerHTML=type==='ingredient'
    ? `<option value="">Select ingredient</option>${ingredients.map(x=>`<option value="${x.id}">${esc(x.name)} · ${componentCostLabel(x,'ingredient')}</option>`).join('')}`
    : `<option value="">Select sub-ingredient</option>${subs.map(x=>`<option value="${x.id}">${esc(x.name)} · ${componentCostLabel(x,'subrecipe')}</option>`).join('')}`;
  const unitEl=row.querySelector('.qty-unit');
  if(unitEl) unitEl.textContent=type==='ingredient' ? ingredientBaseUnit(ingredients.find(x=>x.id===row.querySelector('.subrecipe-component')?.value)||ingredients[0]) : subrecipeBaseUnit(subs.find(x=>x.id===row.querySelector('.subrecipe-component')?.value)||subs[0]);
  updateSubrecipePreview();
}

function updateSubrecipeUnit(select){
  const row=select.closest('.subrecipe-row');
  const type=row?.querySelector('.subrecipe-type')?.value;
  const id=select.value;
  const unitEl=row?.querySelector('.qty-unit');
  if(!unitEl)return;
  const ingredients=window.__subrecipeIngredients||[], subs=(window.__subrecipeList||[]);
  unitEl.textContent=type==='ingredient' ? ingredientBaseUnit(ingredients.find(x=>x.id===id)) : subrecipeBaseUnit(subs.find(x=>x.id===id));
}

function readSubrecipeRows(){
  return [...document.querySelectorAll('#subrecipeRows .subrecipe-row')].map(row=>({
    type:row.querySelector('.subrecipe-type')?.value,
    id:row.querySelector('.subrecipe-component')?.value,
    quantity:Number(row.querySelector('.subrecipe-qty')?.value||0)
  })).filter(r=>r.id&&r.quantity>0);
}

function updateSubrecipePreview(){
  const rows=readSubrecipeRows(), ingredients=window.__subrecipeIngredients||[], subs=window.__subrecipeList||[];
  const cost=rows.reduce((sum,r)=>sum+(r.type==='ingredient'
    ? r.quantity*ingredientBaseCost(ingredients.find(x=>x.id===r.id))
    : r.quantity*subrecipeBaseCost(subs.find(x=>x.id===r.id))),0);
  const el=$("#subrecipeCostSummary"); if(el)el.textContent=money(Number(cost.toFixed(4)));
}

function addSubrecipeRow(){
  const wrap=$("#subrecipeRows");if(!wrap)return;
  const ingredients=window.__subrecipeIngredients||[], subs=(window.__subrecipeList||[]).filter(x=>x.id!==window.__editingSubrecipeId);
  const row=document.createElement('div');row.className='recipe-row subrecipe-row';
  row.innerHTML=`<select class="subrecipe-type" onchange="changeSubrecipeType(this)"><option value="ingredient">Ingredient</option><option value="subrecipe">Sub-ingredient</option></select><select class="subrecipe-component" onchange="updateSubrecipeUnit(this);updateSubrecipePreview()"><option value="">Select ingredient</option>${ingredients.map(x=>`<option value="${x.id}">${esc(x.name)} · ${componentCostLabel(x,'ingredient')}</option>`).join('')}</select><span class="qty-wrap" style="display:flex;align-items:center;gap:8px"><input class="subrecipe-qty" type="number" min="0.0001" step="0.001" value="1" placeholder="Qty" oninput="updateSubrecipePreview()" style="width:100%"><span class="qty-unit" style="white-space:nowrap;color:#666">${esc(ingredientBaseUnit(ingredients[0]))}</span></span><button type="button" class="recipe-remove" onclick="this.closest('.recipe-row').remove();updateSubrecipePreview()">×</button>`;
  wrap.appendChild(row);updateSubrecipePreview();
}

async function openSubrecipeModal(item=null){
  const check=await loadSubrecipes();
  if(window.__subrecipeDbReady===false){
    return toast('Sub-ingredient tables are missing. Run SUPABASE_SUBINGREDIENTS_MIGRATION.sql in Supabase SQL Editor, then refresh.');
  }
  const [ings,subs]=await Promise.all([
    sb.from('ingredients').select('id,name,unit,cost_per_unit').eq('user_id',session.user.id).order('name'),
    loadSubrecipes()
  ]);
  if(ings.error)return toast(errText(ings.error));
  const ingredients=ings.data||[];
  const current=subs.find(x=>x.id===item?.id);
  window.__subrecipeIngredients=ingredients;window.__subrecipeList=subs;window.__editingSubrecipeId=item?.id||'';
  const items=current?.items||[];
  openModal(item?'Edit Sub-ingredient':'Add Sub-ingredient',`<form id="subrecipeForm" class="form-grid">
    <label>Name<input id="srName" required value="${esc(item?.name||'')}"></label>
    <label>Yield quantity<input id="srYield" type="number" min="0.0001" step="0.0001" value="${item?.yield_quantity??1}"></label>
    <label>Yield unit<input id="srYieldUnit" value="${esc(item?.yield_unit||'g')}"></label>
    <div class="wide recipe-section"><div class="recipe-head"><div><strong>Recipe</strong><div class="muted small">Choose ingredients or another sub-ingredient and enter the quantity used.</div></div><button type="button" id="addSubrecipeComponentBtn" class="btn" data-action="add-subrecipe-component">+ Component</button></div><div id="subrecipeRows">${renderSubrecipeRows(ingredients,subs,items,item?.id||'')}</div><div class="recipe-summary"><span>Total cost <strong id="subrecipeCostSummary">RM 0.00</strong></span></div></div>
  </form>`,async()=>{
    const name=$("#srName").value.trim(),yieldQuantity=Number($("#srYield").value||0),yieldUnit=$("#srYieldUnit").value.trim()||'g';
    if(!name)return toast('Sub-ingredient name is required.');
    if(yieldQuantity<=0)return toast('Yield quantity must be greater than 0.');
    const rows=readSubrecipeRows();
    if(!rows.length)return toast('Add at least one ingredient or sub-ingredient.');
    const payload={user_id:session.user.id,name,yield_quantity:yieldQuantity,yield_unit:yieldUnit};
    const q=item?sb.from('nuonuo_subrecipes').update(payload).eq('id',item.id).eq('user_id',session.user.id):sb.from('nuonuo_subrecipes').insert(payload).select('id').single();
    const {data,error}=await q;if(error)return toast(errText(error));
    const subrecipeId=item?.id||data?.id;if(!subrecipeId)return toast('Unable to save sub-ingredient.');
    const del=await sb.from('nuonuo_subrecipe_items').delete().eq('subrecipe_id',subrecipeId).eq('user_id',session.user.id);if(del.error)return toast(errText(del.error));
    const itemPayload=rows.map(r=>({user_id:session.user.id,subrecipe_id:subrecipeId,ingredient_id:r.type==='ingredient'?r.id:null,child_subrecipe_id:r.type==='subrecipe'?r.id:null,quantity:r.quantity}));
    const ins=await sb.from('nuonuo_subrecipe_items').insert(itemPayload);if(ins.error)return toast(errText(ins.error));
    closeModal();toast('Sub-ingredient saved.');await render.ingredients();
  });
  updateSubrecipePreview();
  const addBtn=$("#addSubrecipeComponentBtn");
  if(addBtn){
    addBtn.type="button";
    addBtn.onclick=function(event){
      event.preventDefault();
      event.stopPropagation();
      window.addSubrecipeRow();
      return false;
    };
  }
}

// Robust delegated handler for dynamically-created Sub-ingredient modal buttons.
document.addEventListener("click", function(event){
  const btn=event.target.closest && event.target.closest("#addSubrecipeComponentBtn");
  if(!btn) return;
  event.preventDefault();
  event.stopPropagation();
  if(typeof window.addSubrecipeRow === "function") window.addSubrecipeRow();
}, true);

async function deleteSubrecipe(id){
  if(!confirm('Delete this sub-ingredient? Products using it may lose their recipe component.'))return;
  const {error}=await sb.from('nuonuo_subrecipes').delete().eq('id',id).eq('user_id',session.user.id);
  if(error)return toast(errText(error));toast('Sub-ingredient deleted.');await render.ingredients();
}

async function loadProductCosting(productId){
  const [ings, subs, recipes] = await Promise.all([
    sb.from("ingredients").select("id,name,unit,cost_per_unit,item_type").eq("user_id",session.user.id).order("name"),
    loadSubrecipes(),
    sb.from("nuonuo_product_recipe_items").select("id,ingredient_id,subrecipe_id,quantity").eq("user_id",session.user.id).eq("product_id",productId)
  ]);
  return {ingredients:ings.data||[],subrecipes:subs||[],recipes:recipes.data||[]};
}

function recipeCostValue(type,id,qty,ingredients,subrecipes){
  const q=Number(qty||0);
  if(!id || q<=0)return 0;
  if(type==='ingredient'){
    const i=ingredients.find(x=>x.id===id);
    return q*ingredientBaseCost(i);
  }
  const r=subrecipes.find(x=>x.id===id);
  const yieldQty=Number(r?.yield_quantity||1);
  return q*subrecipeBaseCost(r);
}

function renderRecipeRows(ingredients,subrecipes,recipes){
  const rows=recipes.length?recipes:[{ingredient_id:ingredients.find(x=>x.item_type!=='packaging')?.id||"",sub_recipe_id:null,quantity:1}];
  return rows.map((r,i)=>{
    const selectedId=r.subrecipe_id||r.sub_recipe_id||r.ingredient_id||'';
    const selectedIngredient=ingredients.find(x=>x.id===selectedId);
    const type=(r.subrecipe_id||r.sub_recipe_id)?'subrecipe':(selectedIngredient?.item_type==='packaging'?'packaging':'ingredient');
    const unit=type==='subrecipe'?subrecipeBaseUnit(subrecipes.find(x=>x.id===selectedId)):ingredientBaseUnit(selectedIngredient);
    return `<div class="recipe-row" data-index="${i}">
      <select class="recipe-type" onchange="changeRecipeType(this)">
        <option value="ingredient" ${type==='ingredient'?'selected':''}>Ingredient</option>
        <option value="subrecipe" ${type==='subrecipe'?'selected':''}>Sub-recipe</option>
        <option value="packaging" ${type==='packaging'?'selected':''}>Packaging</option>
      </select>
      <select class="recipe-component" onchange="updateProductRecipeComponent(this)">
        ${type==='ingredient'
          ? `<option value="">Select ingredient</option>${ingredients.filter(x=>x.item_type!=='packaging').map(x=>`<option value="${x.id}" ${x.id===selectedId?'selected':''}>${esc(x.name)} · ${componentCostLabel(x,'ingredient')}</option>`).join('')}`
          : type==='packaging'
          ? `<option value="">Select packaging</option>${ingredients.filter(x=>x.item_type==='packaging').map(x=>`<option value="${x.id}" ${x.id===selectedId?'selected':''}>${esc(x.name)} · ${componentCostLabel(x,'ingredient')}</option>`).join('')}`
          : `<option value="">Select sub-recipe</option>${subrecipes.map(x=>`<option value="${x.id}" ${x.id===selectedId?'selected':''}>${esc(x.name)} · ${componentCostLabel(x,'subrecipe')}</option>`).join('')}`}
      </select>
      <div class="recipe-qty-wrap"><input class="recipe-qty" type="number" min="0.0001" step="0.001" value="${Number(r.quantity||1)}" oninput="updateProductRecipePreview()" placeholder="Qty"><span class="recipe-qty-unit">${esc(unit||'unit')}</span></div>
      <button type="button" class="recipe-remove" onclick="this.closest('.recipe-row').remove();updateProductRecipePreview()">×</button>
    </div>`;
  }).join('');
}

function changeRecipeType(select){
  const row=select.closest('.recipe-row');
  const ingredients=window.__productIngredients||[], subrecipes=window.__productSubrecipes||[];
  const type=select.value;
  const component=row.querySelector('.recipe-component');
  if(type==='ingredient'){
    component.innerHTML=`<option value="">Select ingredient</option>${ingredients.filter(x=>x.item_type!=='packaging').map(x=>`<option value="${x.id}">${esc(x.name)} · ${componentCostLabel(x,'ingredient')}</option>`).join('')}`;
  }else if(type==='packaging'){
    component.innerHTML=`<option value="">Select packaging</option>${ingredients.filter(x=>x.item_type==='packaging').map(x=>`<option value="${x.id}">${esc(x.name)} · ${componentCostLabel(x,'ingredient')}</option>`).join('')}`;
  }else{
    component.innerHTML=`<option value="">Select sub-recipe</option>${subrecipes.map(x=>`<option value="${x.id}">${esc(x.name)} · ${componentCostLabel(x,'subrecipe')}</option>`).join('')}`;
  }
  updateProductRecipeUnit(row);
  updateProductRecipePreview();
}

function updateProductRecipeUnit(row){
  const type=row?.querySelector('.recipe-type')?.value||'ingredient';
  const id=row?.querySelector('.recipe-component')?.value||'';
  const ingredients=window.__productIngredients||[], subrecipes=window.__productSubrecipes||[];
  const item=ingredients.find(x=>x.id===id);
  const unit=type==='subrecipe' ? subrecipeBaseUnit(subrecipes.find(x=>x.id===id)) : ingredientBaseUnit(item);
  const el=row?.querySelector('.recipe-qty-unit');
  if(el)el.textContent=unit||'unit';
}

function updateProductRecipeComponent(select){
  const row=select.closest('.recipe-row');
  updateProductRecipeUnit(row);
  updateProductRecipePreview();
}

function readProductRecipeRows(){
  return [...document.querySelectorAll('#productRecipeRows .recipe-row')].map(row=>{
    const type=row.querySelector('.recipe-type')?.value;
    const id=row.querySelector('.recipe-component')?.value;
    const quantity=Number(row.querySelector('.recipe-qty')?.value||0);
    return {type,id,quantity};
  }).filter(x=>x.id && x.quantity>0);
}

function updateProductRecipePreview(){
  const rows=readProductRecipeRows();
  const ingredients=window.__productIngredients||[], subrecipes=window.__productSubrecipes||[];
  const cost=rows.reduce((sum,r)=>sum+recipeCostValue(r.type,r.id,r.quantity,ingredients,subrecipes),0);
  const costRounded=Math.round(cost*100)/100;
  const costEl=$("#pCost"); if(costEl)costEl.value=costRounded.toFixed(2);
  const summary=$("#recipeCostSummary"); if(summary)summary.textContent=money(costRounded);
  const price=Number($("#pPrice")?.value||0);
  const profit=$("#recipeProfitSummary"); if(profit)profit.textContent=money(price-costRounded);
}

async function openProductModal(item=null){
  const {data:cats}=await sb.from("categories").select("*").eq("user_id",session.user.id).order("name");
  let costing={ingredients:[],subrecipes:[],recipes:[]};
  if(item?.id){
    try{costing=await loadProductCosting(item.id);}catch(e){return toast("Unable to load recipe costing: "+errText(e));}
  }else{
    const [ings,subs]=await Promise.all([
      sb.from("ingredients").select("id,name,unit,cost_per_unit,item_type").eq("user_id",session.user.id).order("name"),
      loadSubrecipes()
    ]);
    costing.ingredients=ings.data||[]; costing.subrecipes=subs||[];
  }
  window.__productIngredients=costing.ingredients;
  window.__productSubrecipes=costing.subrecipes;
  const recipeHtml=`<div class="wide recipe-section">
    <div class="recipe-head"><div><strong>Recipe costing</strong><div class="muted small">Enter the quantity used for <b>one product</b>. Cost is calculated automatically.</div></div><button type="button" class="btn" onclick="addProductRecipeRow()">+ Component</button></div>
    <div id="productRecipeRows">${renderRecipeRows(costing.ingredients,costing.subrecipes,costing.recipes)}</div>
    <div class="recipe-summary"><span>Calculated cost <strong id="recipeCostSummary">${money(item?.calculated_cost||0)}</strong></span><span>Profit <strong id="recipeProfitSummary">${money(Number(item?.selling_price||0)-Number(item?.calculated_cost||0))}</strong></span></div>
  </div>`;
  openModal(item?"Edit Product":"Add Product",`
    <form id="productForm" class="form-grid">
      <label>Name<input id="pName" required value="${esc(item?.name||"")}"></label>
      <label>Selling price<input id="pPrice" type="number" step="0.01" required value="${item?.selling_price??""}" oninput="updateProductRecipePreview()"></label>
      <label>Category<select id="pCat"><option value="">Uncategorized</option>${(cats||[]).map(c=>`<option value="${c.id}" ${item?.category_id===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label>Calculated cost<input id="pCost" type="number" step="0.01" value="${item?.calculated_cost??0}" readonly></label>
      <label class="wide">Description<textarea id="pDesc">${esc(item?.description||"")}</textarea></label>
      ${recipeHtml}
      <div class="wide upload-row"><div id="imagePreview">${item?.image_url?`<img class="preview" src="${esc(item.image_url)}">`:`<div class="preview"></div>`}</div><label>Product photo<input id="pImage" type="file" accept="image/*"></label></div>
    </form>`,async()=>{
      const name=$("#pName").value.trim(), price=Number($("#pPrice").value||0);
      if(!name)return toast("Product name is required.");
      const rows=readProductRecipeRows();
      const cost=rows.reduce((sum,r)=>sum+recipeCostValue(r.type,r.id,r.quantity,window.__productIngredients||[],window.__productSubrecipes||[]),0);
      let imageUrl=item?.image_url||null;
      const file=$("#pImage").files[0];
      if(file){try{imageUrl=await uploadCompressed(file,"product-images");}catch(e){return toast("Photo upload failed: "+errText(e));}}
      let productId=item?.id;
      const payload={user_id:session.user.id,name,description:$("#pDesc").value,category_id:$("#pCat").value||null,selling_price:price,calculated_cost:Number(cost.toFixed(2)),image_url:imageUrl};
      const q=item?sb.from("products").update(payload).eq("id",item.id).eq("user_id",session.user.id):sb.from("products").insert(payload).select("id").single();
      const {data,error}=await q;if(error)return toast(errText(error));
      if(!productId)productId=data.id;
      const del=await sb.from("nuonuo_product_recipe_items").delete().eq("product_id",productId).eq("user_id",session.user.id);
      if(del.error)return toast(errText(del.error));
      if(rows.length){
        const recipePayload=rows.map(r=>({user_id:session.user.id,product_id:productId,ingredient_id:r.type==='ingredient'?r.id:null,subrecipe_id:r.type==='subrecipe'?r.id:null,quantity:r.quantity}));
        const ins=await sb.from("nuonuo_product_recipe_items").insert(recipePayload);
        if(ins.error)return toast(errText(ins.error));
      }
      closeModal();toast("Product saved with recipe costing.");await render.menu();
    });
  updateProductRecipePreview();
  $("#pImage")?.addEventListener("change",async(e)=>{
    const file=e.target.files[0];if(!file)return;
    try{const url=await uploadCompressed(file,"product-images");$("#imagePreview").innerHTML=`<img class="preview" src="${esc(url)}">`;window.__productPendingImage=url;}
    catch(err){toast("Photo upload failed: "+errText(err));}
  });
}

function addProductRecipeRow(){
  const wrap=$("#productRecipeRows"); if(!wrap)return;
  const row=document.createElement("div"); row.className="recipe-row";
  const ingredients=window.__productIngredients||[];
  row.innerHTML=`<select class="recipe-type" onchange="changeRecipeType(this)"><option value="ingredient">Ingredient</option><option value="subrecipe">Sub-recipe</option><option value="packaging">Packaging</option></select><select class="recipe-component" onchange="updateProductRecipeComponent(this)"><option value="">Select ingredient</option>${ingredients.filter(x=>x.item_type!=='packaging').map(x=>`<option value="${x.id}">${esc(x.name)} · ${componentCostLabel(x,'ingredient')}</option>`).join('')}</select><div class="recipe-qty-wrap"><input class="recipe-qty" type="number" min="0.0001" step="0.001" value="1" oninput="updateProductRecipePreview()" placeholder="Qty"><span class="recipe-qty-unit">${esc(ingredientBaseUnit(ingredients.find(x=>x.item_type!=='packaging'))||'unit')}</span></div><button type="button" class="recipe-remove" onclick="this.closest('.recipe-row').remove();updateProductRecipePreview()">×</button>`;
  wrap.appendChild(row);updateProductRecipePreview();
}

async function uploadCompressed(file,bucket){
  const blob=await compressImage(file,1000,1000,.76);
  const path=`${session.user.id}/${crypto.randomUUID()}.jpg`;
  const {error}=await sb.storage.from(bucket).upload(path,blob,{contentType:"image/jpeg",upsert:false});
  if(error)throw error;
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
function compressImage(file,maxW,maxH,quality){
  return new Promise((resolve,reject)=>{
    const img=new Image(), url=URL.createObjectURL(file);
    img.onload=()=>{
      let w=img.width,h=img.height,scale=Math.min(1,maxW/w,maxH/h);w=Math.round(w*scale);h=Math.round(h*scale);
      const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);
      c.toBlob(b=>{URL.revokeObjectURL(url);b?resolve(b):reject(new Error("Compression failed"));},"image/jpeg",quality);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Invalid image"));};img.src=url;
  });
}
async function openCategoryModal(item=null){
  openModal(item?"Edit Category":"Add Category",`<form id="categoryForm" class="form-grid"><label>Name<input id="catName" required value="${esc(item?.name||"")}"></label><label>Sort order<input id="catSort" type="number" value="${item?.sort_order??0}"></label><label class="wide">Description<textarea id="catDesc">${esc(item?.description||"")}</textarea></label></form>`,async()=>{
    const payload={user_id:session.user.id,name:$("#catName").value.trim(),description:$("#catDesc").value,sort_order:Number($("#catSort").value||0)};
    const q=item?sb.from("categories").update(payload).eq("id",item.id).eq("user_id",session.user.id):sb.from("categories").insert(payload); const {error}=await q; if(error)return toast(errText(error)); closeModal(); toast("Category saved."); await render.menu();
  });
}
async function openAddonModal(item=null){
  openModal(item?"Edit Add-on":"Add Add-on",`<form id="addonForm" class="form-grid"><label>Name<input id="aName" required value="${esc(item?.name||"")}"></label><label>Price<input id="aPrice" type="number" step="0.01" value="${item?.price??0}"></label><label>Cost<input id="aCost" type="number" step="0.01" value="${item?.cost??0}"></label><label>Active<select id="aActive"><option value="true" ${item?.active!==false?"selected":""}>Active</option><option value="false" ${item?.active===false?"selected":""}>Inactive</option></select></label></form>`,async()=>{
    const payload={user_id:session.user.id,name:$("#aName").value.trim(),price:Number($("#aPrice").value||0),cost:Number($("#aCost").value||0),active:$("#aActive").value==="true"};
    const q=item?sb.from("addons").update(payload).eq("id",item.id).eq("user_id",session.user.id):sb.from("addons").insert(payload); const {error}=await q; if(error)return toast(errText(error)); closeModal(); toast("Add-on saved."); await render.menu();
  });
}
async function openStaffModal(item=null){
  if(profile?.role!=="owner")return toast("Only the owner can manage staff.");
  if(!item){ return toast("Create the staff login in Supabase Authentication first, then add/edit the staff profile here."); }
  openModal("Edit Staff",`<form id="staffForm" class="form-grid"><label>Name<input id="stName" value="${esc(item.full_name||"")}"></label><label>Email<input value="${esc(item.email||"")}" disabled></label><label>Role<select id="stRole"><option value="staff" ${item.role==="staff"?"selected":""}>Staff</option><option value="owner" ${item.role==="owner"?"selected":""}>Owner</option></select></label></form>`,async()=>{
    const {error}=await sb.from("profiles").update({full_name:$("#stName").value.trim(),role:$("#stRole").value}).eq("id",item.id); if(error)return toast(errText(error)); closeModal(); toast("Staff profile updated."); await render.staff();
  });
}
async function deleteStaff(id){
  if(profile?.role!=="owner")return toast("Only the owner can delete staff.");
  if(id===session.user.id)return toast("You cannot delete the current account here.");
  if(!confirm("Delete this staff profile? The Auth account will not be deleted from this page."))return;
  const {error}=await sb.from("profiles").delete().eq("id",id); if(error)return toast(errText(error)); toast("Staff profile deleted."); await render.staff();
}
async function openIngredientModal(item=null){
  const defaultUnit=item?.unit||'g';
  openModal(item?'Edit Ingredient':'Add Ingredient',`<form id="ingredientForm" class="form-grid">
    <label>Name<input id="iName" required value="${esc(item?.name||"")}"></label>
    <label>Unit<input id="iUnit" value="${esc(defaultUnit)}"></label>
    <label>Cost / Unit<input id="iCost" type="number" step="0.000001" value="${item?.cost_per_unit??0}"></label>
    <label>Current Stock<input id="iStock" type="number" step="0.0001" value="${item?.current_stock??0}"></label>
    <label>Low Stock Threshold<input id="iLow" type="number" step="0.0001" value="${item?.low_stock_threshold??0}"></label>
    <label>Supplier<input id="iSupplier" value="${esc(item?.supplier||"")}"></label>
    <div class="wide muted small">Ingredients are raw materials and can use g, kg, ml, 個, or any unit you use for costing.</div>
  </form>`,async()=>{
    const payload={user_id:session.user.id,name:$("#iName").value.trim(),item_type:'ingredient',unit:$("#iUnit").value.trim()||'g',cost_per_unit:Number($("#iCost").value||0),current_stock:Number($("#iStock").value||0),low_stock_threshold:Number($("#iLow").value||0),supplier:$("#iSupplier").value};
    const q=item?sb.from("ingredients").update(payload).eq("id",item.id).eq("user_id",session.user.id):sb.from("ingredients").insert(payload);
    const {error}=await q;if(error)return toast(errText(error));closeModal();toast("Ingredient saved.");await render.ingredients();
  });
}

async function openPackagingModal(item=null){
  openModal(item?'Edit Packaging':'Add Packaging',`<form id="packagingForm" class="form-grid">
    <label>Name<input id="pName" required value="${esc(item?.name||"")}"></label>
    <label>Per Unit (RM)<input id="pCost" type="number" min="0" step="0.0001" value="${item?.cost_per_unit??0}"></label>
    <label>Current Stock (pcs)<input id="pStock" type="number" min="0" step="1" value="${item?.current_stock??0}"></label>
    <div class="wide muted small">Packaging is counted by piece. Per Unit means the cost of 1 piece.</div>
  </form>`,async()=>{
    const payload={user_id:session.user.id,name:$("#pName").value.trim(),item_type:'packaging',unit:'個',cost_per_unit:Number($("#pCost").value||0),current_stock:Number($("#pStock").value||0),low_stock_threshold:0,supplier:''};
    const q=item?sb.from("ingredients").update(payload).eq("id",item.id).eq("user_id",session.user.id):sb.from("ingredients").insert(payload);
    const {error}=await q;if(error)return toast(errText(error));closeModal();toast("Packaging saved.");await render.ingredients();
  });
}
async function openCustomerModal(item=null){
  openModal(item?"Edit Customer":"Add Customer",`<form id="customerForm" class="form-grid">
    <label>Name<input id="cName" required value="${esc(item?.name||"")}"></label>
    <label>Phone<input id="cPhone" value="${esc(item?.phone||"")}"></label>
    <label>Email<input id="cEmail" type="email" value="${esc(item?.email||"")}"></label>
    <label>Address<input id="cAddress" value="${esc(item?.address||"")}"></label>
    <label class="wide">Notes<textarea id="cNotes">${esc(item?.notes||"")}</textarea></label>
  </form>`,async()=>{
    const payload={user_id:session.user.id,name:$("#cName").value.trim(),phone:$("#cPhone").value,email:$("#cEmail").value,address:$("#cAddress").value,notes:$("#cNotes").value};
    const q=item?sb.from("customers").update(payload).eq("id",item.id).eq("user_id",session.user.id):sb.from("customers").insert(payload);
    const {error}=await q;if(error)return toast(errText(error));closeModal();toast("Customer saved.");await render.customers();
  });
}
async function openExpenseModal(){
  openModal("Add Expense",`<form id="expenseForm" class="form-grid">
    <label>Date<input id="eDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label>
    <label>Category<input id="eCat" required placeholder="Rent, labour, utilities..."></label>
    <label class="wide">Description<input id="eDesc"></label>
    <label>Amount<input id="eAmount" type="number" step="0.01" required></label>
  </form>`,async()=>{
    const {error}=await sb.from("expenses").insert({user_id:session.user.id,expense_date:$("#eDate").value,category:$("#eCat").value,description:$("#eDesc").value,amount:Number($("#eAmount").value||0)});
    if(error)return toast(errText(error));closeModal();toast("Expense added.");await render.expenses();
  });
}

let orderCart=[];
let orderAddonDrafts={};
function orderAddonTotal(item){ return (item.addons||[]).reduce((sum,a)=>sum+Number(a.price||0),0); }
function orderCartTotal(){ return orderCart.reduce((sum,item)=>sum + item.qty*(Number(item.price||0)+orderAddonTotal(item)),0); }
function orderCartQty(){ return orderCart.reduce((sum,item)=>sum+item.qty,0); }
function addonIds(addons){ return (addons||[]).map(a=>a.id).sort().join(','); }
function addConfiguredOrderProduct(productId,addons=[]){
  const card=window.__orderProducts?.find(p=>p.id===productId); if(!card)return;
  const normalized=[...(addons||[])].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const sig=`${productId}|${addonIds(normalized)}`;
  const item=orderCart.find(x=>x.signature===sig);
  if(item)item.qty+=1;
  else orderCart.push({signature:sig,productId:card.id,name:card.name,price:Number(card.selling_price||0),cost:Number(card.calculated_cost||0),qty:1,availableAddons:productAddons(card.id),addons:normalized});
  renderOrderCart();
}
function addOrderProduct(productId){ addConfiguredOrderProduct(productId,[]); }
function changeOrderQty(index,delta){
  const item=orderCart[index]; if(!item)return;
  item.qty+=delta;
  if(item.qty<=0)orderCart.splice(index,1);
  renderOrderCart();
}
function productAddons(productId){
  const links=(window.__orderAddonLinks||[]).filter(x=>x.product_id===productId);
  const mapped=links.map(x=>window.__orderAddons?.find(a=>a.id===x.addon_id)).filter(Boolean);
  return mapped.length?mapped:(window.__orderAddons||[]);
}
function toggleOrderAddonPanel(productId){
  const panel=$("#addonPanel-"+productId); if(!panel)return;
  panel.classList.toggle('hidden');
  const card=panel.closest('.order-product-card');
  if(card)card.classList.toggle('addon-open',!panel.classList.contains('hidden'));
  if(panel.classList.contains('hidden'))return;
  const available=productAddons(productId);
  const draft=orderAddonDrafts[productId]||[];
  panel.innerHTML=`<div class="addon-panel-head"><span>Add-ons</span><button type="button" class="addon-close-btn" onclick="toggleOrderAddonPanel('${productId}')">Done</button></div>
    ${available.length?`<div class="addon-picker-list">${available.map(a=>`<label class="addon-picker-option"><input type="checkbox" ${draft.some(x=>x.id===a.id)?'checked':''} onchange="setOrderAddonDraft('${productId}','${a.id}',this.checked)"><span>${esc(a.name)}</span><strong>+${money(a.price)}</strong></label>`).join('')}</div>
    <button type="button" class="addon-confirm-btn" onclick="addDraftedOrderProduct('${productId}')">Add to order</button>`:`<div class="muted small">No active add-ons yet.</div>`}`;
}
function setOrderAddonDraft(productId,addonId,checked){
  const available=productAddons(productId);
  let draft=orderAddonDrafts[productId]||[];
  const addon=available.find(a=>a.id===addonId); if(!addon)return;
  if(checked && !draft.some(a=>a.id===addonId))draft=[...draft,addon];
  if(!checked)draft=draft.filter(a=>a.id!==addonId);
  orderAddonDrafts[productId]=draft;
}
function addDraftedOrderProduct(productId){
  addConfiguredOrderProduct(productId,orderAddonDrafts[productId]||[]);
  orderAddonDrafts[productId]=[];
  const panel=$("#addonPanel-"+productId);
  if(panel){panel.classList.add('hidden');panel.innerHTML='';const card=panel.closest('.order-product-card');if(card)card.classList.remove('addon-open');}
}
function renderOrderMenu(){
  const root=$("#orderMenuGrid"); if(!root)return;
  const term=($("#orderSearch")?.value||"").toLowerCase();
  const category=$("#orderCategory")?.value||"";
  const rows=(window.__orderProducts||[]).filter(p=>(p.name||"").toLowerCase().includes(term)&&(!category||p.category_id===category));
  root.innerHTML=rows.map(p=>`<div class="order-product-card">
      ${p.image_url?`<img src="${esc(p.image_url)}" alt="" class="order-product-image" loading="lazy" decoding="async">`:`<div class="order-product-image order-product-placeholder"></div>`}
      <div class="order-product-info"><div class="order-product-copy"><h4>${esc(p.name)}</h4><div class="muted small">${money(p.selling_price)}</div></div><div class="order-product-actions"><button type="button" class="order-add-btn" onclick="addOrderProduct('${p.id}')">+1</button><button type="button" class="order-addon-btn" onclick="toggleOrderAddonPanel('${p.id}')">Add-ons</button></div></div>
      <div id="addonPanel-${p.id}" class="addon-picker-inline hidden"></div>
    </div>`).join("") || `<div class="order-empty">No products found.</div>`;
}
function renderOrderCart(){
  const root=$("#orderCart"); if(!root)return;
  root.innerHTML=orderCart.length?orderCart.map((item,index)=>`<div class="order-cart-item">
    <div class="order-cart-top"><div><strong>${esc(item.name)}</strong><div class="muted small">${money(item.price)} each${item.addons.length?` · ${item.addons.map(a=>esc(a.name)).join(', ')}`:''}</div></div><div class="qty-control"><button type="button" onclick="changeOrderQty(${index},-1)">−</button><strong>${item.qty}</strong><button type="button" onclick="changeOrderQty(${index},1)">+</button></div></div>
    ${item.addons.length?`<div class="order-addon-summary">${item.addons.map(a=>`<span>${esc(a.name)} +${money(a.price)}</span>`).join('')}</div>`:''}
  </div>`).join(""):`<div class="order-empty">Select items from the menu.<br><span class="muted">Use +1 to add without add-ons, or Add-on to customise one.</span></div>`;
  const subtotal=orderCartTotal();
  $("#orderSubtotal").textContent=money(subtotal);
  $("#orderTotal").textContent=money(Math.max(0,subtotal-Number($("#oDiscount")?.value||0)+Number($("#oDelivery")?.value||0)));
  $("#orderCount").textContent=`${orderCartQty()} item${orderCartQty()===1?"":"s"}`;
}
async function openOrderModal(){
  const [{data:customers,error:ce},{data:products,error:pe},{data:categories,error:cate},{data:addons,error:ae},{data:links,error:le}]=await Promise.all([
    sb.from("customers").select("id,name").eq("user_id",session.user.id).order("name"),
    sb.from("products").select("id,name,selling_price,calculated_cost,image_url,category_id").eq("user_id",session.user.id).eq("active",true).order("name"),
    sb.from("categories").select("id,name").eq("user_id",session.user.id).order("sort_order").order("name"),
    sb.from("addons").select("id,name,price,cost,active").eq("user_id",session.user.id).eq("active",true).order("name"),
    sb.from("product_addons").select("product_id,addon_id").eq("user_id",session.user.id)
  ]);
  for(const e of [ce,pe,cate,ae,le]) if(e) throw e;
  window.__orderProducts=products||[];
  window.__orderAddons=addons||[];
  window.__orderAddonLinks=links||[];
  orderCart=[];

  const today=new Date().toISOString().slice(0,10);
  openModal("Add Order",`<div class="order-builder">
    <section class="order-menu-panel">
      <div class="order-meta-grid">
        <label>Order date<input id="oDate" type="date" value="${today}"></label>
        <label>Quick status<select id="oStatus"><option value="pending">Pending</option><option value="preparing">Preparing</option><option value="ready">Ready</option><option value="completed">Completed</option></select></label>
        <label class="wide">Note<input id="oNote" placeholder="Delivery details, payment note, special request..."></label>
      </div>
      <div class="order-menu-toolbar">
        <input id="orderSearch" class="order-search" placeholder="Search products..." oninput="renderOrderMenu()">
        <select id="orderCategory" onchange="renderOrderMenu()"><option value="">All categories</option>${(categories||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      </div>
      <div id="orderMenuGrid" class="order-menu-grid"></div>
    </section>
    <aside class="order-cart-panel">
      <div class="order-cart-head"><div><h4>Your order</h4><span id="orderCount" class="muted small">0 items</span></div></div>
      <div id="orderCart" class="order-cart"></div>
      <div class="order-checkout">
        <label>Customer<select id="oCustomer"><option value="">Walk-in</option>${(customers||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
        <label>Payment method<select id="oPayment"><option value="">Not set</option><option>Cash</option><option>Bank transfer</option><option>Card</option></select></label>
        <div class="order-inline-fields"><label>Discount<input id="oDiscount" type="number" step="0.01" value="0"></label><label>Delivery<input id="oDelivery" type="number" step="0.01" value="0"></label></div>
        <div class="order-total-row"><span>Subtotal</span><strong id="orderSubtotal">RM 0.00</strong></div>
        <div class="order-total-row total"><span>Total</span><strong id="orderTotal">RM 0.00</strong></div>
      </div>
    </aside>
  </div>`,async()=>{
    if(!orderCart.length)return toast("Please add at least one menu item.");
    const discount=Number($("#oDiscount").value||0),delivery=Number($("#oDelivery").value||0),subtotal=orderCartTotal(),total=Math.max(0,subtotal-discount+delivery);
    const userNote=$("#oNote").value.trim();
    const addonNote=orderCart.flatMap(i=>i.addons.map(a=>`${i.name}: ${a.name} (+${money(a.price)}) x${i.qty}`)).join("; ");
    const notes=[userNote,addonNote].filter(Boolean).join(" | ");
    const {data:order,error}=await sb.from("orders").insert({user_id:session.user.id,customer_id:$("#oCustomer").value||null,order_number:`ORD-${Date.now().toString().slice(-6)}`,status:$("#oStatus").value,subtotal,discount,delivery_fee:delivery,total,payment_status:"unpaid",payment_method:$("#oPayment").value||null,notes:notes||null}).select().single();
    if(error)return toast(errText(error));
    for(const item of orderCart){
      const addonUnit=orderAddonTotal(item), lineTotal=item.qty*(item.price+addonUnit);
      const {error:ie}=await sb.from("order_items").insert({user_id:session.user.id,order_id:order.id,product_id:item.productId,quantity:item.qty,unit_price:item.price,unit_cost:item.cost,addons_total:item.qty*addonUnit,line_total:lineTotal});
      if(ie){await sb.from("orders").delete().eq("id",order.id);return toast(errText(ie));}
    }
    closeModal();toast("Order created.");await navigate(currentPage);
  },"order-modal");
  renderOrderMenu();
  renderOrderCart();
  $("#oDiscount").addEventListener("input",renderOrderCart);
  $("#oDelivery").addEventListener("input",renderOrderCart);
}

window.openInvoiceModal=openInvoiceModal;window.viewInvoice=viewInvoice;window.printInvoice=printInvoice;window.downloadInvoicePDF=downloadInvoicePDF;window.downloadInvoicePNG=downloadInvoicePNG;window.deleteInvoice=deleteInvoice;window.toggleOrderAddonPanel=toggleOrderAddonPanel;window.setOrderAddonDraft=setOrderAddonDraft;window.addDraftedOrderProduct=addDraftedOrderProduct;window.addOrderProduct=addOrderProduct;window.changeOrderQty=changeOrderQty;window.openProductModal=openProductModal;window.openCategoryModal=openCategoryModal;window.openAddonModal=openAddonModal;window.openStaffModal=openStaffModal;window.deleteStaff=deleteStaff;window.openIngredientModal=openIngredientModal;window.openPackagingModal=openPackagingModal;window.openSubrecipeModal=openSubrecipeModal;window.deleteSubrecipe=deleteSubrecipe;window.addSubrecipeRow=addSubrecipeRow;window.changeSubrecipeType=changeSubrecipeType;window.updateSubrecipePreview=updateSubrecipePreview;window.openCustomerModal=openCustomerModal;window.openExpenseModal=openExpenseModal;window.openOrderModal=openOrderModal;window.closeModal=closeModal;window.deleteRow=deleteRow;window.deleteOrder=deleteOrder;window.completeOrder=completeOrder;
window.render=render;window.printKitchenOrder=printKitchenOrder;window.printAllPendingKitchen=printAllPendingKitchen;

window.addEventListener("error",e=>{ console.error("NUONUO runtime error:",e.error||e.message); });
window.addEventListener("unhandledrejection",e=>{ console.error("NUONUO promise error:",e.reason); });
bindCoreEvents();
init();
