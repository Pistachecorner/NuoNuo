/* V53 TOTAL REMAINING BY DATE - fresh build */
/* NUONUO MANAGEMENT FRONTEND V1
   Black / white / neutral UI only.
   Requires:
     SUPABASE_URL
     SUPABASE_ANON_KEY
   Set them in the two constants below before deployment.
*/
const SUPABASE_URL = window.NUONUO_SUPABASE_URL || "PASTE_SUPABASE_URL_HERE";
const SUPABASE_ANON_KEY = window.NUONUO_SUPABASE_ANON_KEY || "PASTE_SUPABASE_ANON_KEY_HERE";
const NUONUO_BUILD = "2026-08-25-daily-total-order-v61";
let sb = null;

let session = null;
let profile = null;
let currentPage = "dashboard";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const money = (n) => `RM ${Number(n || 0).toFixed(2)}`;
const pct = (cost, price) => price > 0 ? (((price - cost) / price) * 100).toFixed(2) + "%" : "0.00%";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
// Nuonuo business time is always based on Malaysia time, regardless of the
// computer/browser timezone. This keeps Daily Sales and order dates aligned
// with the shop's actual local day.
const SHOP_TIMEZONE = "Asia/Kuala_Lumpur";
const shopDateParts = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP_TIMEZONE, year:"numeric", month:"2-digit", day:"2-digit"
}).formatToParts(new Date()).reduce((o,p)=>{ if(p.type!=="literal") o[p.type]=p.value; return o; }, {});
const localDate = () => {
  const p = shopDateParts();
  return `${p.year}-${p.month}-${p.day}`;
};
const localMonth = () => localDate().slice(0, 7);
const isoAddDays = (iso, days) => { const d=new Date(`${iso}T00:00:00+08:00`); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };
const reportPeriodState = () => {
  const type=window.__reportPeriodType||"monthly";
  const now=localDate(), y=Number(now.slice(0,4)), m=Number(now.slice(5,7));
  const selected=window.__reportPeriodValue||"";
  let start=now.slice(0,7)+"-01", end=now, label=now.slice(0,7);
  if(type==="quarterly"){
    let q=selected?Number(String(selected).slice(-1))-1:Math.floor((m-1)/3), yy=selected?Number(String(selected).slice(0,4)):y;
    if(!Number.isFinite(q)||q<0||q>3)q=Math.floor((m-1)/3); if(!Number.isFinite(yy))yy=y;
    const sm=q*3+1; start=`${yy}-${String(sm).padStart(2,"0")}-01`;
    const nextM=sm+3, ey=nextM>12?yy+1:yy, em=nextM>12?nextM-12:nextM;
    end=isoAddDays(`${ey}-${String(em).padStart(2,"0")}-01`,-1); label=`Q${q+1} ${yy}`;
  } else if(type==="yearly"){ const yy=Number(selected)||y; start=`${yy}-01-01`; end=`${yy}-12-31`; label=String(yy);
  } else if(type==="custom"){ start=validDateString(window.__reportCustomStart||"")||now.slice(0,7)+"-01"; end=validDateString(window.__reportCustomEnd||"")||now; if(end<start){const t=start;start=end;end=t;} label=`${start} → ${end}`;
  } else {
    const mm=/^(\d{4})-(\d{2})$/.exec(selected)||/^(\d{4})-(\d{2})$/.exec(now.slice(0,7)); const yy=Number(mm[1]), mon=Number(mm[2]);
    start=`${yy}-${String(mon).padStart(2,"0")}-01`; const nm=mon+1, ey=nm>12?yy+1:yy, em=nm>12?1:nm; end=isoAddDays(`${ey}-${String(em).padStart(2,"0")}-01`,-1); label=`${yy}-${String(mon).padStart(2,"0")}`;
  }
  return {type,start,end,label};
};
const reportPeriodOptions = type => {
  const now=localDate(), y=Number(now.slice(0,4)), m=Number(now.slice(5,7)), out=[];
  if(type==="monthly"){ for(let i=0;i<24;i++){const d=new Date(`${y}-${String(m).padStart(2,"0")}-01T00:00:00+08:00`);d.setMonth(d.getMonth()-i);const yy=d.getFullYear(),mm=String(d.getMonth()+1).padStart(2,"0"),v=`${yy}-${mm}`;out.push([v,v]);} }
  else if(type==="quarterly"){let q=Math.floor((m-1)/3);for(let i=0;i<12;i++){let qq=q-i,yy=y;while(qq<0){qq+=4;yy--;}out.push([`${yy}-Q${qq+1}`,`Q${qq+1} ${yy}`]);}}
  else if(type==="yearly"){for(let yy=y;yy>=Math.max(2020,y-9);yy--)out.push([String(yy),String(yy)]);}
  return out;
};
const reportDateInRange = (date,start,end) => { const d=String(date||"").slice(0,10); return !!d && d>=start && d<=end; };
const reportPeriodDays = (start,end) => { const a=new Date(`${start}T00:00:00+08:00`), b=new Date(`${end}T00:00:00+08:00`); return Math.max(1,Math.round((b-a)/86400000)+1); };

const EXPENSE_CATEGORIES = [
  {name:"Ingredients", subs:["Raw Ingredients","Other"]},
  {name:"Packaging", subs:["Boxes","Bags","Labels & Stickers","Cards & Inserts","Other"]},
  {name:"Salary", subs:["Full-time","Part-time","Founder Salary","Overtime"]},
  {name:"EPF / SOCSO / EIS", subs:["EPF","SOCSO","EIS","Other"]},
  {name:"Rental", subs:["Shop","Kitchen","Warehouse","Other"]},
  {name:"Utilities", subs:["Electricity","Water","Gas","Internet","Phone"]},
  {name:"Equipment & Repairs", subs:["Equipment Purchase","Repairs & Maintenance","Parts","Other"]},
  {name:"Delivery", subs:["Self Delivery - Petrol","Self Delivery - Toll","Self Delivery - Parking","Grab","Lalamove","Other Courier"]},
  {name:"Marketing & Promotion", subs:["Instagram / Meta Ads","TikTok Ads","Influencer / KOL","Giveaway","Printing","Photography","Other"]},
  {name:"Platform & Payment Fees", subs:["Payment Gateway","Bank Transaction","E-wallet","Marketplace","Other"]},
  {name:"Professional Services", subs:["Accounting","Tax","Audit","Legal","Company Secretary","IT / Software","Consulting","Other"]},
  {name:"Staff Meals", subs:["Breakfast","Lunch","Dinner","Drinks","Other"]},
  {name:"Company Meals & Events", subs:["Team Meal","Celebration","Company Event","Annual Dinner","Other"]},
  {name:"Office & Cleaning", subs:["Cleaning Supplies","Toilet Supplies","Stationery","Printing Supplies","Other"]},
  {name:"Insurance", subs:["Business Insurance","Public Liability","Vehicle Insurance","Equipment Insurance","Other"]},
  {name:"Licenses & Government Fees", subs:["Business License","Local Council","Permit","Government Fees","Other"]},
  {name:"Bank & Finance", subs:["Bank Charges","Loan Interest","Financing Charges","Other"]},
  {name:"Training & Staff Development", subs:["Course","Workshop","Food Handling","Other"]},
  {name:"Wastage", subs:["Spoilage","Damaged","Overproduction","Expired","Testing","Other"]},
  {name:"Miscellaneous", subs:["Other"]}
];
const EXPENSE_CATEGORY_MAP = Object.fromEntries(EXPENSE_CATEGORIES.map(c=>[c.name,c]));
const LEGACY_EXPENSE_CATEGORY_ALIASES = {
  "Ingredients / 食材原料":"Ingredients",
  "Packaging":"Packaging",
  "Salary":"Salary",
  "EPF / SOCSO / EIS":"EPF / SOCSO / EIS",
  "Rental":"Rental",
  "Utilities / 水電瓦斯":"Utilities",
  "Equipment & Repairs / 設備維修":"Equipment & Repairs",
  "Delivery / 配送費":"Delivery",
  "Marketing & Promotion / 行銷推廣":"Marketing & Promotion",
  "Platform & Payment Fees / 平台及支付手續費":"Platform & Payment Fees",
  "Professional Services / 專業服務":"Professional Services",
  "Staff Meals / 員工餐飲":"Staff Meals",
  "Company Meals & Events / 公司聚餐及活動":"Company Meals & Events",
  "Office & Cleaning / 辦公及清潔":"Office & Cleaning",
  "Insurance / 保險":"Insurance",
  "Licenses & Government Fees / 執照及政府費用":"Licenses & Government Fees",
  "Bank & Finance / 銀行及金融費用":"Bank & Finance",
  "Training & Staff Development / 員工培訓":"Training & Staff Development",
  "Wastage / 損耗":"Wastage",
  "Miscellaneous / 雜項開支":"Miscellaneous",
  "Fuel / Vehicle / 车油":"Delivery",
  "Platform Fees / 平台手续费":"Platform & Payment Fees",
  "Professional Services / 专业服务":"Professional Services",
  "Miscellaneous / 杂项开支":"Miscellaneous"
};
const expenseTopCategory = (value) => {
  const v=String(value||"");
  const base=v.split(" · ")[0];
  if(EXPENSE_CATEGORY_MAP[base]) return base;
  if(LEGACY_EXPENSE_CATEGORY_ALIASES[base]) return LEGACY_EXPENSE_CATEGORY_ALIASES[base];
  return base.split(" / ")[0] || "Miscellaneous";
};
const expenseSubcategory = (value) => {
  const v=String(value||"");
  if(!v.includes(" · ")) return "";
  const sub=v.split(" · ").slice(1).join(" · ");
  return sub.split(" / ")[0] || sub;
};


function updateLiveClock(){
  const el = $("#liveClock");
  if(!el) return;
  el.textContent = new Intl.DateTimeFormat("en-MY", {
    timeZone: SHOP_TIMEZONE, weekday:"short", day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false
  }).format(new Date());
}
setInterval(updateLiveClock, 1000);

// Costing helpers: ingredient.unit may be a purchase pack such as "500g" or "5kg".
// cost_per_unit stores the price of that purchase pack. Recipes use the base unit (g/ml/個).
function parseMeasureUnit(unit){
  // Supports simple purchase packs such as 500g / 1kg / 500ml / 63pcs,
  // plus a compound box definition such as 63pcs/box. In the compound form,
  // `amount` is the number of base units contained in one purchase unit.
  const raw=String(unit??'').trim().toLowerCase().replace(/\s+/g,'');
  const compound=raw.match(/^([0-9]+(?:\.[0-9]+)?)(kg|g|l|ml|pcs|pc|個|件|包|瓶|盒)\/(box|boxes|pack|packs)$/i);
  if(compound){
    const amount=Number(compound[1]);
    const baseRaw=compound[2].toLowerCase();
    let baseUnit=baseRaw;
    if(baseRaw==='kg') return {amount:amount*1000,unit:'g',purchaseUnit:'box',valid:true,compound:true};
    if(baseRaw==='l') return {amount:amount*1000,unit:'ml',purchaseUnit:'box',valid:true,compound:true};
    if(['pcs','pc','個','件','包','瓶','盒'].includes(baseRaw)) baseUnit='pcs';
    return {amount,unit:baseUnit,purchaseUnit:'box',valid:true,compound:true};
  }
  const m=raw.match(/([0-9]+(?:\.[0-9]+)?)(kg|g|l|ml|pcs|pc|box|boxes|個|件|包|瓶|盒)$/i);
  if(!m) return {amount:1, unit:raw || 'unit', purchaseUnit:null, valid:false};
  const amount=Number(m[1]);
  const u=m[2].toLowerCase();
  if(u==='kg') return {amount:amount*1000, unit:'g', purchaseUnit:'kg', valid:true};
  if(u==='l') return {amount:amount*1000, unit:'ml', purchaseUnit:'l', valid:true};
  if(['pcs','pc','個','件','包','瓶','盒'].includes(u)) return {amount,unit:'pcs',purchaseUnit:'pcs',valid:true};
  if(['box','boxes'].includes(u)) return {amount,unit:'box',purchaseUnit:'box',valid:true};
  return {amount,unit:u,purchaseUnit:u,valid:true};
}
function inventoryPurchaseUnit(item){
  const p=parseMeasureUnit(item?.unit);
  if(p.compound) return 'box';
  if(p.purchaseUnit) return p.purchaseUnit;
  return String(item?.unit||'unit');
}
function inventoryUnitSummary(item){
  const p=parseMeasureUnit(item?.unit);
  if(p.compound) return `${p.amount}${p.unit}/box`;
  return String(item?.unit||'unit');
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
function recipeIngredientUnit(item){
  // Packaging is always displayed and entered in pcs. Keep existing DB rows
  // such as unit='個' compatible, while presenting a consistent English UI.
  if(item?.item_type==='packaging') return 'pcs';
  return ingredientBaseUnit(item);
}
function inventoryBaseAmount(item){
  if(!item) return 0;
  const stock=Number(item.current_stock||0);
  if(item.item_type==='packaging') return stock;
  const parsed=parseMeasureUnit(item.unit);
  return stock*Math.max(Number(parsed.amount)||1,0.000001);
}
function inventoryBaseUnit(item){
  return item?.item_type==='packaging' ? 'pcs' : ingredientBaseUnit(item);
}
function inventoryDisplayStock(item, decimals=2){
  const amount=inventoryBaseAmount(item);
  const unit=inventoryBaseUnit(item);
  const digits=['pcs','box'].includes(unit) ? 0 : decimals;
  return `${amount.toFixed(digits)} ${unit}`;
}
function inventoryDisplayThreshold(item, decimals=2){
  const amount=Number(item?.low_stock_threshold||0)*(item?.item_type==='packaging'?1:Math.max(Number(parseMeasureUnit(item?.unit).amount)||1,0.000001));
  const unit=inventoryBaseUnit(item);
  const digits=['pcs','box'].includes(unit) ? 0 : decimals;
  return `${amount.toFixed(digits)} ${unit}`;
}
function inventoryPackLabel(item){
  if(item?.item_type==='packaging') return 'pcs';
  return inventoryPurchaseUnit(item);
}
function componentCostLabel(item,type){
  if(type==='ingredient'){
    const parsed=parseMeasureUnit(item?.unit);
    const base=ingredientBaseCost(item);
    const pack=esc(inventoryUnitSummary(item));
    const displayUnit=item?.item_type==='packaging' ? 'pcs' : parsed.unit;
    if(item?.item_type==='packaging') return `${money(base)}/pcs`;
    return parsed.valid ? `${money(base)}/${esc(displayUnit)} · pack ${pack}` : `${money(base)}/${esc(displayUnit)}`;
  }
  return `${money(subrecipeBaseCost(item))}/${esc(subrecipeBaseUnit(item))}`;
}

function inventoryTypeLabel(type){
  const map={
    ingredient:'Ingredients',
    packaging:'Packaging',
    kitchenware:'Kitchenware / Utensils',
    electronic:'Electronic Equipment',
    equipment:'Equipment',
    other:'Other'
  };
  return map[String(type||'ingredient')]||String(type||'Other');
}
function inventoryTypeBadge(type){
  return `<span class="badge">${esc(inventoryTypeLabel(type))}</span>`;
}
function inventoryUsesBaseMeasure(type){
  return String(type||'ingredient')==='ingredient';
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
function isOwner(){ return String(profile?.role||"").toLowerCase()==="owner"; }
function isStaff(){ return String(profile?.role||"").toLowerCase()==="staff"; }
// All business data belongs to the Owner account. Staff accounts use the
// Owner's user_id for shared business data while keeping their own Auth/profile id.
function dataUserId(){
  return isStaff() && profile?.owner_id ? profile.owner_id : session?.user?.id;
}

async function getUser(){
  const {data,error}=await sb.auth.getUser();
  if(error) throw error;
  return data.user;
}
async function ensureProfile(user){
  const {data,error}=await sb.from("profiles").select("*").eq("id",user.id).maybeSingle();
  if(error) throw error;
  if(data) return data;
  const {data:created,error:e}=await sb.from("profiles").insert({id:user.id,email:user.email,full_name:""}).select().single();
  if(e) throw e;
  return created;
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
    const debugFetch = async (input, initOptions) => {
      const response = await window.fetch(input, initOptions);
      if (!response.ok) {
        try {
          const body = await response.clone().text();
          console.error("[NUONUO Supabase HTTP error]", response.status, input?.url || input, body);
        } catch (e) {
          console.error("[NUONUO Supabase HTTP error]", response.status, input?.url || input, e);
        }
      }
      return response;
    };
    sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},global:{fetch:debugFetch}});
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
  }catch(e){
    // Login itself is valid even if profile creation/read is blocked by RLS.
    // Keep the user inside the app and show the real profile error in the UI.
    console.error("Profile load error:",e);
    profile={id:s.user.id,email:s.user.email,full_name:"",role:""};
    toast("Signed in. Profile setup needs attention: "+errText(e));
  }
  $("#loginScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#app").classList.toggle("staff-mode", isStaff());
  $("#userEmail").textContent=s.user.email || "";
  updateLiveClock();
  await navigate(currentPage);
}
function showLogin(){
  session=null; profile=null;
  $("#app").classList.remove("staff-mode");
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
  ingredients:"Ingredients", inventory:"Inventory", wastage:"Wastage", customers:"Customers",
  sales:"Sales", expenses:"Expenses", invoices:"Invoices", purchasing:"Purchasing", suppliers:"Suppliers", movements:"Inventory Movements", audit:"Audit Log", reports:"Reports", settings:"Account Settings", staff:"Staff"
};
async function navigate(name){
  currentPage=name;
  const pageEl=$("#page");
  if(pageEl) pageEl.className = name === "reports" ? "report-host" : "page";
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===name));
  pageTitle(pages[name]);
  try{
    const fn=render[name] || render.dashboard;
    await fn();
    installPageSearch(name);
  }catch(e){
    $("#page").innerHTML=`<div class="card"><h3>Unable to load this page</h3><p class="error">${esc(errText(e))}</p></div>`;
  }
}

async function count(table, extra=""){
  let q=sb.from(table).select("*",{count:"exact",head:true}).eq("user_id",dataUserId());
  return (await q).count || 0;
}
async function sum(table,column,filters=[]){
  let q=sb.from(table).select(column).eq("user_id",dataUserId());
  for(const f of filters) q=q.eq(f[0],f[1]);
  const {data,error}=await q; if(error) throw error;
  return (data||[]).reduce((a,r)=>a+Number(r[column]||0),0);
}

function installPageSearch(pageName){
  const pageEl=$("#page");
  if(!pageEl)return;
  const existing=pageEl.querySelector(".page-search-wrap");
  if(existing) return;
  const wrap=document.createElement("div");
  wrap.className="page-search-wrap";
  wrap.innerHTML=`<div class="page-search-box"><span class="page-search-icon">⌕</span><input id="pageSearchInput" type="search" autocomplete="off" placeholder="Search ${esc(pages[pageName]||"this page")}..." value="${esc(window.__pageSearchValues?.[pageName]||"")}"><button type="button" class="page-search-clear" title="Clear search" aria-label="Clear search">×</button></div>`;
  pageEl.insertBefore(wrap,pageEl.firstChild);
  const input=wrap.querySelector("#pageSearchInput");
  const clear=wrap.querySelector(".page-search-clear");
  const values=window.__pageSearchValues||(window.__pageSearchValues={});
  const apply=()=>{
    const term=String(input.value||"").trim().toLowerCase();
    values[pageName]=input.value||"";
    clear.classList.toggle("hidden",!term);

    // Tables: hide matching rows only. Pending-order detail rows stay attached
    // to their order row so searching by an item also finds the whole order.
    pageEl.querySelectorAll("tbody").forEach(tbody=>{
      const rows=[...tbody.querySelectorAll(":scope > tr")];
      rows.forEach((row,index)=>{
        if(row.classList.contains("pending-order-details-row"))return;
        const detail=rows[index+1]?.classList.contains("pending-order-details-row")?rows[index+1]:null;
        const hay=(row.textContent+" "+(detail?.textContent||"")).toLowerCase();
        const show=!term||hay.includes(term);
        row.style.display=show?"":"none";
        if(detail)detail.style.display=show?"":"none";
      });
    });

    // Menu/product cards.
    pageEl.querySelectorAll(".menu-draggable-product").forEach(card=>{
      card.style.display=!term||card.textContent.toLowerCase().includes(term)?"":"none";
    });
    pageEl.querySelectorAll(".menu-category-section").forEach(section=>{
      const sectionText=section.textContent.toLowerCase();
      const cards=[...section.querySelectorAll(".menu-draggable-product")];
      const hasVisibleCard=cards.some(c=>c.style.display!=="none");
      const show=!term||sectionText.includes(term)&&(!cards.length||hasVisibleCard)||hasVisibleCard;
      section.style.display=show?"":"none";
    });

    // Dashboard/summary cards and other standalone blocks.
    pageEl.querySelectorAll(".page-search-wrap ~ .stats .stat, .page-search-wrap ~ .grid-2 > .card, .page-search-wrap ~ .card").forEach(block=>{
      if(block.querySelector("table, .menu-draggable-product, .page-search-wrap"))return;
      block.style.display=!term||block.textContent.toLowerCase().includes(term)?"":"none";
    });

    const anyVisible=[...pageEl.querySelectorAll("tbody > tr:not(.pending-order-details-row), .menu-draggable-product")].some(el=>el.style.display!=="none"&&el.textContent.trim());
    let empty=pageEl.querySelector(".page-search-empty");
    if(term&&!anyVisible){
      if(!empty){empty=document.createElement("div");empty.className="page-search-empty card";empty.innerHTML=`<strong>No matching results</strong><p class="muted">Try another keyword.</p>`;pageEl.appendChild(empty);}
    }else if(empty){empty.remove();}
  };
  input.addEventListener("input",apply);
  clear.addEventListener("click",()=>{input.value="";input.focus();apply();});
  apply();
}

function renderReportChart(){
  const host=$("#reportChart"); if(!host)return; const rows=window.__reportRows||{sales:[],expenses:[]}; const range=Math.max(1,Number(window.__reportRange||30)); const series=window.__reportSeries||{sales:true,cogs:true,gross:true,net:true};
  const today=new Date(); today.setHours(0,0,0,0); const start=new Date(window.__reportChartStart||today); start.setHours(0,0,0,0);
  const key=d=>{const x=new Date(d); if(Number.isNaN(x.getTime()))return ""; return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;}; const sm={},em={};
  (rows.sales||[]).forEach(r=>{const k=key(r.sale_date); if(!k)return; if(!sm[k])sm[k]={sales:0,cogs:0}; sm[k].sales+=Number(r.amount||0); sm[k].cogs+=Number(r.cost||0);}); (rows.expenses||[]).forEach(r=>{const k=key(r.expense_date); if(k)em[k]=(em[k]||0)+Number(r.amount||0);});
  const pts=[]; for(let i=0;i<range;i++){const d=new Date(start); d.setDate(start.getDate()+i); const k=key(d),a=sm[k]?.sales||0,c=sm[k]?.cogs||0,e=em[k]||0; pts.push({date:d,sales:a,cogs:c,gross:a-c,net:a-c-e});}
  const keys=["sales","cogs","gross","net"].filter(k=>series[k]); const labels={sales:"Sales",cogs:"COGS",gross:"Gross Profit",net:"Net Profit"}; const colors={sales:"#8B5CF6",cogs:"#EF4444",gross:"#22C55E",net:"#3B82F6"}; const W=900,H=340,L=54,R=18,T=18,B=44,iw=W-L-R,ih=H-T-B; const max=Math.max(1,...pts.flatMap(p=>keys.map(k=>p[k]))); const top=Math.max(1,Math.ceil(max/10)*10); const x=i=>L+(pts.length===1?iw/2:i/(pts.length-1)*iw); const y=v=>T+ih-(Number(v||0)/top)*ih; const fmt=v=>`RM ${Number(v||0).toLocaleString("en-MY",{maximumFractionDigits:0})}`; const df=d=>d.toLocaleDateString("en-MY",{day:"numeric",month:"short"});
  let svg=`<svg class="report-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales and profit trend chart">`; for(let i=0;i<=4;i++){const yy=T+ih-i/4*ih; svg+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" class="report-gridline"/><text x="${L-8}" y="${yy+4}" text-anchor="end" class="report-axis">${fmt(top*i/4)}</text>`;} const lc=Math.min(6,pts.length); for(let j=0;j<lc;j++){const idx=lc===1?0:Math.round(j*(pts.length-1)/(lc-1)); svg+=`<text x="${x(idx)}" y="${H-14}" text-anchor="middle" class="report-axis">${df(pts[idx].date)}</text>`;} if(!keys.length)svg+=`<text x="${W/2}" y="${H/2}" text-anchor="middle" class="report-empty-text">Select a line above to display it</text>`;
  keys.forEach(k=>{const path=pts.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" "); svg+=`<path d="${path}" fill="none" stroke="${colors[k]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`; if(pts.length<=31)pts.forEach((p,i)=>{if(p[k]>0)svg+=`<circle cx="${x(i).toFixed(1)}" cy="${y(p[k]).toFixed(1)}" r="2.7" fill="${colors[k]}"/>`;});}); svg+=`</svg>`; const summary=keys.map(k=>`<span><strong>${labels[k]}</strong> ${fmt(pts.reduce((a,p)=>a+p[k],0))}</span>`).join(""); host.innerHTML=svg+`<div class="report-chart-summary">${summary}</div>`;
}

function renderReportProductChart(){
  const host=$("#reportProductChart"); if(!host)return;
  const raw=Array.isArray(window.__reportProductMix)?window.__reportProductMix:[];
  const total=raw.reduce((a,r)=>a+Number(r.quantity||0),0);
  if(!total){host.innerHTML=`<div class="report-product-empty">No completed product sales yet.</div>`;return;}
  const top=raw.slice(0,8);
  const otherRows=raw.slice(8).slice().sort((a,b)=>Number(a.quantity||0)-Number(b.quantity||0));
  const rest=otherRows.reduce((a,r)=>a+Number(r.quantity||0),0);
  if(rest>0)top.push({name:"Other",quantity:rest,isOther:true});
  const shades=["#FF4D4F","#FF8A00","#FADB14","#52C41A","#13C2C2","#1677FF","#722ED1","#EB2F96","#A0D911"];
  const cx=140,cy=140,r=104,inner=58;
  const point=(angle,rad)=>({x:cx+Math.cos(angle)*rad,y:cy+Math.sin(angle)*rad});
  const sector=(start,end)=>{
    const a=point(start,r),b=point(end,r),ia=point(end,inner),ib=point(start,inner),large=end-start>Math.PI?1:0;
    return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)} L ${ia.x.toFixed(2)} ${ia.y.toFixed(2)} A ${inner} ${inner} 0 ${large} 0 ${ib.x.toFixed(2)} ${ib.y.toFixed(2)} Z`;
  };
  let angle=-Math.PI/2,paths="",legend="";
  top.forEach((row,i)=>{
    const qty=Number(row.quantity||0), pct=qty/total, end=angle+pct*Math.PI*2;
    const otherClass=row.isOther?' report-pie-other':'';
    paths+=`<path d="${sector(angle,end)}" fill="${shades[i%shades.length]}" stroke="#fff" stroke-width="2" class="report-pie-segment${otherClass}" data-other="${row.isOther?'1':'0'}"><title>${esc(row.name)}: ${qty} pcs (${(pct*100).toFixed(1)}%)</title></path>`;
    legend+=`<div class="report-product-row${row.isOther?' report-product-other':''}" data-other="${row.isOther?'1':'0'}" role="${row.isOther?'button':'presentation'}" tabindex="${row.isOther?'0':'-1'}"><span class="report-product-swatch" style="background:${shades[i%shades.length]}"></span><span class="report-product-name" title="${esc(row.name)}">${esc(row.name)}${row.isOther?'<span class="report-other-hint"> · click to view</span>':''}</span><strong>${qty} pcs</strong><span class="report-product-pct">${(pct*100).toFixed(1)}%</span></div>`;
    angle=end;
  });
  const topName=top[0]?.name||"-", topQty=Number(top[0]?.quantity||0), topPct=topQty/total*100;
  const leastHtml=otherRows.length?`<div id="reportOtherDetails" class="report-other-details" hidden><div class="report-other-title">Least-Selling Products</div><div class="report-other-subtitle">Products grouped under Other, ranked from least sold to most sold.</div>${otherRows.map((row,idx)=>{const qty=Number(row.quantity||0),pct=qty/total*100;return `<div class="report-other-row"><span class="report-other-rank">${idx+1}</span><span class="report-other-name">${esc(row.name)}</span><strong>${qty} pcs</strong><span class="report-product-pct">${pct.toFixed(1)}%</span></div>`}).join("")}</div>`:"";
  host.innerHTML=`<div class="report-product-layout"><div class="report-pie-wrap"><svg class="report-pie" viewBox="0 0 280 280" role="img" aria-label="Product sales share pie chart">${paths}<text x="140" y="132" text-anchor="middle" class="report-pie-center-label">TOP SELLER</text><text x="140" y="154" text-anchor="middle" class="report-pie-center-name">${esc(topName).slice(0,22)}</text><text x="140" y="174" text-anchor="middle" class="report-pie-center-pct">${topPct.toFixed(1)}%</text></svg></div><div class="report-product-legend">${legend}</div></div>${leastHtml}`;
  const otherRow=host.querySelector('.report-product-other');
  const otherDetails=host.querySelector('#reportOtherDetails');
  const toggleOther=()=>{if(!otherDetails)return; otherDetails.hidden=!otherDetails.hidden; otherRow?.classList.toggle('expanded',!otherDetails.hidden);};
  if(otherRow&&otherDetails){otherRow.addEventListener('click',toggleOther);otherRow.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleOther();}});host.querySelectorAll('.report-pie-other').forEach(el=>el.addEventListener('click',toggleOther));}
}

function renderInventoryTable(){
  const items=window.__inventoryItems||[];
  const filter=window.__inventoryFilter||'ingredient';
  const labels={ingredient:'Ingredients',packaging:'Packaging',kitchenware:'Kitchenware / Utensils',electronic:'Electronic Equipment',equipment:'Equipment',other:'Other'};
  const filtered=items.filter(i=>(i.item_type||'other')===filter);
  const rows=filtered.map(i=>{
    const low=Number(i.current_stock||0)<=Number(i.low_stock_threshold||0);
    const isIngredient=i.item_type==='ingredient';
    const stockLabel=inventoryDisplayStock(i);
    const purchaseUnit=isIngredient?inventoryPackLabel(i):'pcs';
    const value=Number(i.current_stock||0)*Number(i.cost_per_unit||0);
    return `<tr><td><strong>${esc(i.name)}</strong></td><td>${esc(stockLabel)}</td><td>${esc(purchaseUnit)}</td><td>${money(Number(i.cost_per_unit||0))}</td><td>${money(value)}</td><td>${low?'<span class="badge inventory-status-low">Low stock</span>':'<span class="badge inventory-status-ok">OK</span>'}</td><td><button class="btn" type="button" onclick="openInventoryItemModalById('${i.id}')">Edit</button> <button class="btn btn-danger" type="button" onclick="deleteInventoryItem('${i.id}')">Delete</button></td></tr>`;
  }).join('');
  const counts={ingredient:0,packaging:0,kitchenware:0,electronic:0,equipment:0,other:0};
  items.forEach(i=>{const t=counts[i.item_type]!=null?i.item_type:'other';counts[t]++;});
  const totalValue=items.reduce((sum,i)=>sum+(Number(i.current_stock||0)*Number(i.cost_per_unit||0)),0);
  const lowCount=items.filter(i=>Number(i.current_stock||0)<=Number(i.low_stock_threshold||0)).length;
  const tabs=['ingredient','packaging','kitchenware','electronic','equipment','other'].map(k=>`<button type="button" class="inventory-tab ${filter===k?'active':''}" onclick="setInventoryFilter('${k}')">${esc(labels[k])} <span>${counts[k]}</span></button>`).join('');
  $("#page").innerHTML=`<div class="rpt-head"><div><h3>Inventory</h3><p class="muted">Inventory is separated by category so ingredients, packaging, kitchenware and equipment are easy to manage.</p></div><button class="btn btn-dark" onclick="openInventoryItemModal()">+ Inventory Item</button></div>
    <div class="stats">
      <div class="stat"><div class="label">Total Inventory Value</div><div class="value">${money(totalValue)}</div></div>
      <div class="stat"><div class="label">Ingredients</div><div class="value">${counts.ingredient}</div></div>
      <div class="stat"><div class="label">Packaging</div><div class="value">${counts.packaging}</div></div>
      <div class="stat"><div class="label">Kitchenware</div><div class="value">${counts.kitchenware}</div></div>
      <div class="stat"><div class="label">Electronic Equipment</div><div class="value">${counts.electronic}</div></div>
      <div class="stat"><div class="label">Equipment</div><div class="value">${counts.equipment}</div></div>
      <div class="stat"><div class="label">Low Stock</div><div class="value">${lowCount}</div></div>
    </div>
    <div class="inventory-tabs">${tabs}</div>
    <div class="card"><div class="rpt-head" style="margin:0 0 14px;padding:0;border:0"><div><h4 style="margin:0">${esc(labels[filter])}</h4><p class="muted" style="margin:5px 0 0">${filtered.length} item${filtered.length===1?'':'s'} in this category.</p></div></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Stock</th><th>Purchase Unit</th><th>Cost / Pack</th><th>Value</th><th>Status</th><th></th></tr></thead><tbody>${rows||`<tr><td colspan="7" class="empty">No ${esc(labels[filter]).toLowerCase()} yet.</td></tr>`}</tbody></table></div></div>`;
  installPageSearch("inventory");
}
function setInventoryFilter(type){window.__inventoryFilter=type;renderInventoryTable();}

const render = {
  async dashboard(){
    const today=localDate();
    // Dashboard Daily Sales uses paid orders as the source of truth and
    // uses Malaysia time for the business day.
    const [{data:todayOrders,error:toError},{data:pendingOrders,error:poError},{data:inventory,error:invError}]=await Promise.all([
      sb.from("orders").select("id,total").eq("user_id",dataUserId()).ilike("payment_status","paid").eq("order_date",today),
      sb.from("orders").select("id,order_number,status,total,payment_status,payment_method,created_at,order_date,customer_id,customers(name)").eq("user_id",dataUserId()).in("status",["pending","preparing","ready"]).order("order_date",{ascending:true}).order("created_at",{ascending:true}),
      sb.from("ingredients").select("*").eq("user_id",dataUserId()).order("item_type",{ascending:true}).order("name")
    ]);
    if(toError)throw toError;
    if(poError)throw poError;
    if(invError)throw invError;

    const dailySales=(todayOrders||[]).reduce((sum,row)=>sum+Number(row.total||0),0);
    const lowStockItems=(inventory||[]).filter(i=>Number(i.current_stock||0)<=Number(i.low_stock_threshold||0));

    const pendingIds=(pendingOrders||[]).map(o=>o.id).filter(Boolean);
    let itemCounts={};
    if(pendingIds.length){
      const {data:items,error:itemError}=await sb.from("order_items").select("order_id,quantity").eq("user_id",dataUserId()).in("order_id",pendingIds);
      if(itemError)throw itemError;
      for(const item of (items||[])){
        const qty=Math.max(0,Number(item.quantity||0));
        itemCounts[item.order_id]=(itemCounts[item.order_id]||0)+qty;
      }
    }
    const pendingCount=(pendingOrders||[]).length;

    $("#page").innerHTML=`
      <div class="stats dashboard-stats">
        <div class="stat"><div class="label">Daily Sales</div><div class="value">${money(dailySales)}</div></div>
        <div class="stat"><div class="label">Pending Orders</div><div class="value">${pendingCount}</div></div>
        <div class="stat"><div class="label">Low Stock</div><div class="value">${lowStockItems.length}</div></div>
      </div>
      <div class="grid-2">
        <div class="card"><h4>Quick actions</h4><div class="actions">
          <button class="btn btn-dark" onclick="openOrderModal()">Add Order</button>
          <button class="btn" onclick="openWastageModal()">Add Wastage</button>
          <button class="btn" onclick="openInvoiceModal()">Add Invoice</button>
          <button class="btn" onclick="openExpenseModal()">Add Expenses</button>
        </div></div>
        <div class="card"><h4>Workspace</h4><p class="muted">Black, white and neutral UI. Menu costing includes gross profit and margin.</p></div>
      </div>
      <div class="grid-2 dashboard-details">
        <div class="card"><div class="page-head compact"><div><h4>Pending Orders</h4><p class="muted">Orders waiting to be completed.</p></div><span class="pending-total-badge">${Object.values(itemCounts).reduce((a,b)=>a+b,0)} items</span></div>
          ${orderTable(pendingOrders||[],true,false,itemCounts)}
        </div>
        <div class="card"><div class="page-head compact"><div><h4>Low Stock Details</h4><p class="muted">Items at or below their stock threshold.</p></div><span class="pending-total-badge">${lowStockItems.length} item${lowStockItems.length===1?"":"s"}</span></div>
          <div class="table-wrap"><table><thead><tr><th>Name</th><th>Stock</th><th>Threshold</th><th>Status</th></tr></thead><tbody>
          ${lowStockItems.map(i=>`<tr><td><strong>${esc(i.name)}</strong></td><td>${inventoryDisplayStock(i)}</td><td>${inventoryDisplayThreshold(i)}</td><td><span class="badge inventory-status-low">Low stock</span></td></tr>`).join("")||`<tr><td colspan="4" class="empty">No low-stock items.</td></tr>`}
          </tbody></table></div>
        </div>
      </div>`;
  },

  async menu(){
    const [{data:products,error:pe},{data:categories,error:ce},{data:addons,error:ae}]=await Promise.all([
      sb.from("products").select("*,categories(name)").eq("user_id",dataUserId()).order("sort_order",{ascending:true}).order("created_at",{ascending:false}),
      sb.from("categories").select("*").eq("user_id",dataUserId()).order("sort_order").order("name"),
      sb.from("addons").select("*").eq("user_id",dataUserId()).order("name")
    ]);
    if(pe)throw pe; if(ce)throw ce; if(ae)throw ae;

    window.__menuProducts=products||[];
    window.__menuCategories=categories||[];
    window.__menuAddons=addons||[];
    window.__menuCategoryId=null;
    renderMenuCategories();
  },


  async categories(){
    const {data,error}=await sb.from("categories").select("*").eq("user_id",dataUserId()).order("sort_order").order("name");
    if(error)throw error;
    $("#page").innerHTML=`<div class="rpt-page"><div class="rpt-head"><div><h3>Categories</h3><p class="muted">Organise your menu.</p></div><button class="btn btn-dark" onclick="openCategoryModal()">+ Category</button></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Description</th><th>Order</th><th></th></tr></thead><tbody>
      ${(data||[]).map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.description||"")}</td><td>${c.sort_order}</td><td><button class="btn" onclick='openCategoryModal(${JSON.stringify(c)})'>Edit</button> <button class="btn btn-danger" onclick="deleteRow('categories','${c.id}',render.categories)">Delete</button></td></tr>`).join("")||`<tr><td colspan="4" class="empty">No categories yet.</td></tr>`}
      </tbody></table></div>`;
  },

  async addons(){
    const {data,error}=await sb.from("addons").select("*").eq("user_id",dataUserId()).order("name");
    if(error)throw error;
    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Add-ons</h3><p class="muted">Optional extras and their costing.</p></div><button class="btn btn-dark" onclick="openAddonModal()">+ Add-on</button></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Price</th><th>Cost</th><th>Margin</th><th>Status</th><th></th></tr></thead><tbody>
      ${(data||[]).map(a=>{const price=Number(a.price||0),cost=Number(a.cost||0);return `<tr><td>${esc(a.name)}</td><td>${money(price)}</td><td>${money(cost)}</td><td>${pct(cost,price)}</td><td><span class="badge">${a.active?"Active":"Inactive"}</span></td><td><button class="btn" onclick='openAddonModal(${JSON.stringify(a)})'>Edit</button> <button class="btn btn-danger" onclick="deleteRow('addons','${a.id}',render.addons)">Delete</button></td></tr>`}).join("")||`<tr><td colspan="6" class="empty">No add-ons yet.</td></tr>`}
      </tbody></table></div>`;
  },

  async ingredients(){
    const {data,error}=await sb.from("ingredients").select("*").eq("user_id",dataUserId()).order("name");
    if(error)throw error;
    const subrecipes=await loadSubrecipes();
    const subrecipeDbReady=window.__subrecipeDbReady!==false;
    const ingredients=(data||[]).filter(i=>i.item_type==='ingredient');
    const packaging=(data||[]).filter(i=>i.item_type==='packaging');
    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Ingredients</h3><p class="muted">Raw materials and stock costing.</p></div><button class="btn btn-dark" onclick="openIngredientModal()">+ Ingredient</button></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Unit</th><th>Cost / Unit</th><th>Stock</th><th>Low Stock</th><th></th></tr></thead><tbody>
      ${ingredients.map(i=>`<tr><td>${esc(i.name)}</td><td>${esc(i.unit)}</td><td>${money(i.cost_per_unit)}</td><td>${inventoryDisplayStock(i)}</td><td>${Number(i.current_stock)<=Number(i.low_stock_threshold??i.minimum_stock??0)?'<span class="badge">Low</span>':'OK'}</td><td><button class="btn" type="button" onclick="openIngredientModalById('${i.id}')">Edit</button> <button class="btn btn-danger" onclick="deleteRow('ingredients','${i.id}',render.ingredients)">Delete</button></td></tr>`).join("")||`<tr><td colspan="6" class="empty">No ingredients yet.</td></tr>`}
      </tbody></table></div>
      <div class="card" style="margin-top:18px">
        <div class="rpt-head" style="margin:0 0 14px;padding:0;border:0">
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
        <div class="rpt-head" style="margin:0 0 14px;padding:0;border:0"><div><h4 style="margin:0">Packaging</h4><p class="muted" style="margin:5px 0 0">Packaging cost is calculated per piece.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Name</th><th>Per Unit</th><th>Stock</th><th>Low Stock</th><th></th></tr></thead><tbody>
        ${packaging.map(i=>{
          const low=Number(i.current_stock||0)<=Number(i.low_stock_threshold||0);
          return `<tr><td>${esc(i.name)}</td><td>${money(i.cost_per_unit)}</td><td>${Number(i.current_stock||0).toFixed(0)} pcs</td><td>${low?'<span class="badge">Low</span>':'OK'}</td><td><button class="btn" type="button" onclick="openPackagingModalById('${i.id}')">Edit</button> <button class="btn btn-danger" onclick="deleteRow('ingredients','${i.id}',render.ingredients)">Delete</button></td></tr>`;
        }).join('')||`<tr><td colspan="5" class="empty">No packaging yet. Click “+ Packaging” to add one.</td></tr>`}
        </tbody></table></div>
      </div>`;
  },

  async inventory(){
    const {data,error}=await sb.from("ingredients").select("*").eq("user_id",dataUserId()).order("item_type",{ascending:true}).order("name");
    if(error)throw error;
    const items=data||[];
    const totalValue=items.reduce((sum,i)=>sum+(Number(i.current_stock||0)*Number(i.cost_per_unit||0)),0);
    const lowCount=items.filter(i=>Number(i.current_stock||0)<=Number(i.low_stock_threshold||0)).length;
    const counts={ingredient:0,packaging:0,kitchenware:0,electronic:0,equipment:0,other:0};
    items.forEach(i=>{const t=counts[i.item_type]!=null?i.item_type:'other';counts[t]++;});
    window.__inventoryItems=items;
    window.__inventoryFilter=window.__inventoryFilter||'ingredient';
    renderInventoryTable();
  },

  async wastage(){
    const [{data:records,error:re},{data:items,error:ie}]=await Promise.all([
      sb.from("wastage_records").select("*,ingredients(name,unit,item_type)").eq("user_id",dataUserId()).order("wastage_date",{ascending:false}).order("created_at",{ascending:false}),
      sb.from("ingredients").select("*").eq("user_id",dataUserId()).order("item_type",{ascending:true}).order("name")
    ]);
    if(re)throw re; if(ie)throw ie;
    const rows=records||[];
    const monthKey=localMonth();
    const monthRows=rows.filter(r=>String(r.wastage_date||"").slice(0,7)===monthKey);
    const totalCost=rows.reduce((a,r)=>a+Number(r.waste_cost||0),0);
    const monthCost=monthRows.reduce((a,r)=>a+Number(r.waste_cost||0),0);
    const byIngredient={};
    rows.forEach(r=>{const name=r.ingredients?.name||"Unknown";byIngredient[name]=(byIngredient[name]||0)+Number(r.waste_cost||0);});
    const topWaste=Object.entries(byIngredient).sort((a,b)=>b[1]-a[1])[0];
    const options=(items||[]).map(i=>{
      const base=recipeIngredientUnit(i);
      const parsed=parseMeasureUnit(i.unit);
      const baseAmount=parsed.valid?parsed.amount:1;
      const baseCost=ingredientBaseCost(i);
      return `<option value="${i.id}" data-base-unit="${esc(base)}" data-pack-amount="${baseAmount}" data-base-cost="${baseCost}" data-stock="${Number(i.current_stock||0)}">${esc(i.name)} · ${esc(i.item_type==='packaging'?'pcs':base)} · stock ${inventoryDisplayStock(i)}</option>`;
    }).join("");
    const reasons=["Spoiled","Expired","Burnt","Damaged","Preparation loss","Overproduction","Wrong recipe","Other"];
    window.__wastageItems=items||[];
    window.__wastageRecords=rows;
    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Wastage</h3><p class="muted">Record ingredient and inventory losses. Stock is deducted automatically.</p></div><button class="btn btn-dark" onclick="openWastageModal()">+ Record Wastage</button></div>
      <div class="stats">
        <div class="stat"><div class="label">Total Wastage Cost</div><div class="value">${money(totalCost)}</div></div>
        <div class="stat"><div class="label">This Month</div><div class="value">${money(monthCost)}</div></div>
        <div class="stat"><div class="label">Records</div><div class="value">${rows.length}</div></div>
        <div class="stat"><div class="label">Most Wasted</div><div class="value" style="font-size:17px">${esc(topWaste?.[0]||"-")}</div></div>
      </div>
      <div class="card" style="margin-bottom:18px"><div class="rpt-head" style="margin:0 0 12px;padding:0;border:0"><div><h4 style="margin:0">Wastage Analysis</h4><p class="muted" style="margin:5px 0 0">See which ingredients are costing you the most through wastage.</p></div></div>
        <div class="wastage-analysis">${Object.entries(byIngredient).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,cost])=>{const pct=totalCost?cost/totalCost*100:0;return `<div class="wastage-bar-row"><div class="wastage-bar-head"><span>${esc(name)}</span><strong>${money(cost)} · ${pct.toFixed(1)}%</strong></div><div class="wastage-bar-track"><span style="width:${Math.min(100,pct)}%"></span></div></div>`}).join("")||'<div class="empty">No wastage recorded yet.</div>'}</div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Ingredient / Item</th><th>Wasted</th><th>Cost</th><th>Reason</th><th>Note</th><th>Action</th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td>${esc(r.wastage_date||"")}</td><td><strong>${esc(r.ingredients?.name||"Unknown")}</strong></td><td>${Number(r.quantity_base||0).toFixed(r.base_unit==='pcs'||r.base_unit==='個'?0:2)} ${esc(r.base_unit||'unit')}</td><td>${money(r.waste_cost)}</td><td>${esc(r.reason||"Other")}</td><td>${esc(r.note||"")}</td><td>${isOwner()?`<button class="btn btn-danger" onclick="deleteWastage('${r.id}')">Delete</button>`:'-'}</td></tr>`).join("")||'<tr><td colspan="7" class="empty">No wastage records yet.</td></tr>'}
      </tbody></table></div>`;
    window.__wastageModalOptions=options;
    window.__wastageReasons=reasons;
  },

  async customers(){
    const [{data,error},{data:orders,error:oe}]=await Promise.all([
      sb.from("customers").select("*").eq("user_id",dataUserId()).order("created_at",{ascending:false}),
      sb.from("orders").select("customer_id,total,status,payment_status,order_date,created_at").eq("user_id",dataUserId())
    ]);
    if(error)throw error;
    if(oe)throw oe;
    const spendingMap={};
    const ordersByCustomer={};
    (orders||[]).forEach(o=>{
      if(!o.customer_id)return;
      (ordersByCustomer[o.customer_id]||(ordersByCustomer[o.customer_id]=[])).push(o);
      if(String(o.payment_status||"").toLowerCase()!=="paid")return;
      spendingMap[o.customer_id]=(spendingMap[o.customer_id]||0)+Number(o.total||0);
    });
    const customers=data||[];
    const today=localDate();
    const birthdayGiftStatus=(c)=>{
      const birthday=String(c.birthday||"").slice(0,10);
      if(!birthday)return {label:"No birthday",cls:"badge",detail:"Add birthday"};
      const birthdayMonth=Number(birthday.slice(5,7));
      const currentMonth=Number(today.slice(5,7));
      if(birthdayMonth!==currentMonth)return {label:"Not this month",cls:"badge",detail:""};
      const hasOrder=(ordersByCustomer[c.id]||[]).some(o=>{
        const d=String(o.order_date||String(o.created_at||"").slice(0,10)).slice(0,10);
        return d.slice(0,7)===today.slice(0,7);
      });
      return hasOrder ? {label:"Gift Given",cls:"badge badge-success",detail:"Birthday-month order found"} : {label:"Gift Pending",cls:"badge badge-warning",detail:"Give gift when they order"};
    };
    const fmtBirthday=d=>{const v=String(d||"").slice(0,10);if(!v)return "-";const x=new Date(`${v}T00:00:00`);return Number.isNaN(x.getTime())?v:x.toLocaleDateString("en-MY",{year:"numeric",month:"short",day:"numeric"});};
    window.__customerBirthdayGiftStatus=birthdayGiftStatus;
    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Customers</h3><p class="muted">Customer profiles, order history and spending.</p></div><button class="btn btn-dark" onclick="openCustomerModal()">+ Customer</button></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>Birthday</th><th>Birthday Gift</th><th>Total Spending</th><th></th></tr></thead><tbody>
      ${customers.map(c=>{const gift=birthdayGiftStatus(c);return `<tr><td><button class="customer-name-link" onclick="openCustomerDetail('${c.id}')">${esc(c.name)}</button></td><td>${esc(c.phone||"")}</td><td>${esc(c.email||"")}</td><td>${esc(c.address||"")}</td><td>${fmtBirthday(c.birthday)}</td><td><span class="${gift.cls}" title="${esc(gift.detail)}">${esc(gift.label)}</span></td><td><strong>${money(spendingMap[c.id]||0)}</strong></td><td class="row-actions"><button class="btn" onclick="openCustomerDetail('${c.id}')">View</button> <button class="btn" onclick='openCustomerModal(${JSON.stringify(c).replace(/</g,"\u003c")})'>Edit</button> <button class="btn btn-danger" onclick="deleteRow('customers','${c.id}',render.customers)">Delete</button></td></tr>`;}).join("")||`<tr><td colspan="8" class="empty">No customers yet.</td></tr>`}
      </tbody></table></div>`;
  },

  async orders(){
    const {data,error}=await sb.from("orders").select("*,customers(name)").eq("user_id",dataUserId()).order("order_date",{ascending:false}).order("created_at",{ascending:false});
    if(error)throw error;
    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Orders</h3><p class="muted">Completed and active orders.</p></div><button class="btn btn-dark" onclick="openOrderModal()">+ Order</button></div>
      ${orderTable(data||[],true)}`;
  },

  async pending(){
    const {data,error}=await sb.from("orders").select("*,customers(name)").eq("user_id",dataUserId()).in("status",["pending","preparing","ready"]);
    if(error)throw error;
    const today=localDate();
    const allPending=(data||[]);
    // Pending Walk-ins are always TODAY. Do not filter by the legacy order_date,
    // because older records may contain a different date. Clone the row with a
    // display-only today date so the Pending table also shows today's date.
    const walkInOrders=allPending
      .filter(o=>orderTypeOf(o)==="walk_in")
      .map(o=>({...o,order_date:today,scheduled_date:null}))
      .sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||"")));
    const preOrders=allPending.filter(o=>orderTypeOf(o)==="pre_order").sort((a,b)=>{
      const da=orderScheduleDate(a), db=orderScheduleDate(b);
      return da.localeCompare(db)||String(a.created_at||"").localeCompare(String(b.created_at||""));
    });
    const orders=[...walkInOrders,...preOrders];
    const orderIds=orders.map(o=>o.id).filter(Boolean);
    let pendingItems=[];
    let addonRows=[];
    if(orderIds.length){
      const {data:items,error:itemError}=await sb.from("order_items").select("id,order_id,product_id,quantity").eq("user_id",dataUserId()).in("order_id",orderIds);
      if(itemError)throw itemError;
      pendingItems=items||[];
      const itemIds=pendingItems.map(i=>i.id).filter(Boolean);
      if(itemIds.length){
        const {data:rows,error:addonError}=await sb.from("order_item_addons").select("order_item_id,addon_id,quantity").eq("user_id",dataUserId()).in("order_item_id",itemIds);
        if(addonError)throw addonError;
        addonRows=rows||[];
      }
    }

    const productIds=[...new Set(pendingItems.map(i=>i.product_id).filter(Boolean))];
    let productMap={};
    if(productIds.length){
      const {data:products,error:productError}=await sb.from("products").select("id,name").eq("user_id",dataUserId()).in("id",productIds);
      if(productError)throw productError;
      productMap=Object.fromEntries((products||[]).map(p=>[p.id,p.name]));
    }

    const addonIds=[...new Set(addonRows.map(a=>a.addon_id).filter(Boolean))];
    let addonMapById={};
    if(addonIds.length){
      const {data:addons,error:addonError}=await sb.from("addons").select("id,name").eq("user_id",dataUserId()).in("id",addonIds);
      if(addonError)throw addonError;
      addonMapById=Object.fromEntries((addons||[]).map(a=>[a.id,{name:a.name}]));
    }

    const addonsByItem={};
    for(const row of addonRows){
      const name=String(addonMapById[row.addon_id]?.name||'').trim();
      const qty=Math.max(0,Number(row.quantity||0));
      if(!name||qty<=0)continue;
      (addonsByItem[row.order_item_id]||(addonsByItem[row.order_item_id]=[])).push({name,qty});
    }

    // Older orders may have their add-ons preserved only in orders.notes.
    // Fall back to that legacy format so existing pending orders also show add-ons.
    function parseLegacyAddons(order, productName, itemQty){
      const notes=String(order?.notes||'');
      if(!notes||!productName||!itemQty)return [];
      const out=[];
      for(const part of notes.split(' | ')){
        const prefix=productName+':';
        if(!part.startsWith(prefix))continue;
        const body=part.slice(prefix.length).trim();
        const m=body.match(/^(.*?)\s*\(\+[^)]*\)\s*x(\d+(?:\.\d+)?)\s*$/i);
        if(!m)continue;
        const name=String(m[1]||'').trim();
        const qty=Math.min(itemQty,Math.max(0,Number(m[2]||0)));
        if(name&&qty>0)out.push({name,qty});
      }
      return out;
    }

    // For Pending Orders, show the exact unfinished items UNDER each order.
    // IMPORTANT: an add-on belongs only to the specific order item that carries
    // an add-on charge / saved addon row. Do not reuse a legacy note for every
    // duplicate product in the same order.
    const remainingByOrder={};
    const itemCounts={};
    const pendingItemsByOrder={};
    for(const item of pendingItems){
      (pendingItemsByOrder[item.order_id]||(pendingItemsByOrder[item.order_id]=[])).push(item);
    }
    for(const item of pendingItems){
      const itemQty=Math.max(0,Number(item.quantity||0));
      if(!itemQty)continue;
      const productName=productMap[item.product_id]||'Deleted product';
      const orderForItem=(orders||[]).find(o=>o.id===item.order_id);

      // Only use saved addon rows when this order item actually has addon
      // charges. This prevents stale/empty addon rows from turning a plain
      // product into an addon variant.
      const hasAddonCharge=Number(item.addons_total||0)>0;
      let exactAddons=hasAddonCharge && addonsByItem[item.id] && addonsByItem[item.id].length
        ? addonsByItem[item.id]
        : [];

      // Legacy orders stored addon details in order.notes. Because notes are
      // order-level, only let the LAST duplicate product item consume that
      // legacy addon note. Otherwise the same addon is displayed twice.
      if(!exactAddons.length && !hasAddonCharge){
        const siblings=pendingItemsByOrder[item.order_id]||[];
        const sameProduct=siblings.filter(x=>x.product_id===item.product_id);
        const isLastDuplicate=sameProduct.length>0 && sameProduct[sameProduct.length-1].id===item.id;
        if(isLastDuplicate) exactAddons=parseLegacyAddons(orderForItem,productName,itemQty);
      }
      const variants=[];

      if(exactAddons.length){
        const groups=new Map();
        for(const a of exactAddons){
          const q=Math.min(itemQty,Math.max(0,Number(a.qty||0)));
          if(!q)continue;
          const key=String(q);
          if(!groups.has(key))groups.set(key,[]);
          groups.get(key).push(a.name);
        }
        let addonQtyTotal=0;
        for(const [qText,names] of groups){
          const q=Number(qText);
          const unique=[...new Set(names.map(n=>String(n).trim()).filter(Boolean))];
          if(!unique.length)continue;
          variants.push({name:`${productName} Add ${unique.join(' + ')}`,qty:q});
          addonQtyTotal+=q;
        }
        const baseQty=Math.max(0,itemQty-addonQtyTotal);
        if(baseQty)variants.unshift({name:productName,qty:baseQty});
      }else{
        variants.push({name:productName,qty:itemQty});
      }

      itemCounts[item.order_id]=(itemCounts[item.order_id]||0)+itemQty;
      const list=remainingByOrder[item.order_id]||(remainingByOrder[item.order_id]=[]);
      for(const v of variants){
        const existing=list.find(x=>x.name===v.name);
        if(existing)existing.qty+=v.qty;
        else list.push({...v});
      }
    }

    window.__pendingItemCounts=itemCounts;
    window.__pendingRemainingByOrder=remainingByOrder;
    // DAILY TOTAL ORDER
    // Build a completely separate daily production summary.
    // IMPORTANT: group only by the actual production / collection date.
    // Walk-ins use today; pre-orders use scheduled_date.
    // The summary never decides whether a date is "Today" from the
    // presence of another order. It always shows the actual calendar date.
    const dailyGroups={};
    for(const order of orders){
      const date=orderTypeOf(order)==="walk_in" ? today : orderScheduleDate(order);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const variants=remainingByOrder[order.id]||[];
      if(!variants.length) continue;
      const group=dailyGroups[date]||(dailyGroups[date]={orders:0,total:0,variants:new Map()});
      group.orders+=1;
      for(const v of variants){
        const name=String(v.name||'').trim();
        const qty=Math.max(0,Number(v.qty||0));
        if(!name||!qty) continue;
        group.total+=qty;
        group.variants.set(name,(group.variants.get(name)||0)+qty);
      }
    }

    const dailyTotalHtml=Object.entries(dailyGroups)
      .filter(([,group])=>group.total>0)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([date,group])=>{
        const x=new Date(`${date}T00:00:00`);
        const label=Number.isNaN(x.getTime())?date:x.toLocaleDateString('en-MY',{day:'numeric',month:'short',year:'numeric'});
        const rows=[...group.variants.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
        return `<section class="pending-total-day">
          <div class="pending-total-date-head">
            <h4>${esc(label)}</h4>
            <span class="pending-total-badge">${group.orders} order${group.orders===1?'':'s'} · ${group.total} item${group.total===1?'':'s'} remaining</span>
          </div>
          <div class="pending-total-list">${rows.map(([name,qty])=>`<div class="pending-total-row"><strong>${qty} ×</strong><span>${esc(name)}</span></div>`).join('')}</div>
        </section>`;
      }).join('') || `<div class="empty">No unfinished products.</div>`;

    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Pending Orders</h3><p class="muted">Walk-ins show today's orders. Pre-orders are sorted by their scheduled date.</p></div><div class="page-actions"><button class="btn btn-dark" onclick="printAllPendingKitchen()">Print Kitchen List</button><button class="btn btn-dark" onclick="openOrderModal()">+ Order</button></div></div>
      <section class="pending-group"><div class="pending-group-head"><div><h4>Walk-in · Today</h4><span class="muted small">${walkInOrders.length} order${walkInOrders.length===1?'':'s'}</span></div></div>${orderTable(walkInOrders,true,true,itemCounts,remainingByOrder)}</section>
      <section class="pending-group"><div class="pending-group-head"><div><h4>Pre-orders</h4><span class="muted small">Sorted by scheduled date</span></div></div>${orderTable(preOrders,true,true,itemCounts,remainingByOrder)}</section>
      <div class="card pending-total-card"><div class="page-head compact"><div><h4>Daily Total Order</h4><p class="muted">Unfinished products grouped by each production / collection date.</p></div></div><div class="pending-total-days">${dailyTotalHtml}</div></div>`;
  },

  async sales(){
    try{await syncCompletedOrdersToSales();}catch(e){console.error("Sales sync failed:",e);}
    const {data,error}=await sb.from("sales").select("*").eq("user_id",dataUserId()).order("sale_date",{ascending:false});
    if(error)throw error;

    const salesRows=data||[];
    const orderIds=[...new Set(salesRows.map(s=>s.order_id).filter(Boolean))];
    let orderMap={};
    if(orderIds.length){
      const {data:orders,error:oe}=await sb.from("orders").select("id,order_number,customer_id").eq("user_id",dataUserId()).in("id",orderIds);
      if(oe)throw oe;
      const customerIds=[...new Set((orders||[]).map(o=>o.customer_id).filter(Boolean))];
      let customerMap={};
      if(customerIds.length){
        const {data:customers,error:ce}=await sb.from("customers").select("id,name").eq("user_id",dataUserId()).in("id",customerIds);
        if(ce)throw ce;
        customerMap=Object.fromEntries((customers||[]).map(c=>[c.id,c.name]));
      }
      orderMap=Object.fromEntries((orders||[]).map(o=>[o.id,{orderNumber:o.order_number||"",customer:customerMap[o.customer_id]||"Walk-in"}]));
    }

    const daily={};
    const monthly={};
    salesRows.forEach(s=>{
      const date=String(s.sale_date||"");
      const month=date.slice(0,7);
      const amount=Number(s.amount||0);
      if(date)daily[date]=(daily[date]||0)+amount;
      if(month)monthly[month]=(monthly[month]||0)+amount;
    });
    const dailyRows=Object.entries(daily).sort((a,b)=>b[0].localeCompare(a[0]));
    const monthlyRows=Object.entries(monthly).sort((a,b)=>b[0].localeCompare(a[0]));
    const totalSales=salesRows.reduce((sum,s)=>sum+Number(s.amount||0),0);
    const todayKey=localDate();
    const monthKey=todayKey.slice(0,7);
    const todaySales=daily[todayKey]||0;
    const currentMonthSales=monthly[monthKey]||0;

    const monthLabel=k=>{const [y,m]=String(k).split("-");return new Date(Number(y),Number(m)-1,1).toLocaleDateString("en-MY",{month:"long",year:"numeric"});};

    $("#page").innerHTML=`
      <div class="rpt-head"><div><h3>Sales</h3><p class="muted">Track sales by customer, day, and month.</p></div></div>
      <div class="stats sales-summary-stats">
        <div class="stat"><div class="label">Total Sales</div><div class="value">${money(totalSales)}</div></div>
        <div class="stat"><div class="label">Today</div><div class="value">${money(todaySales)}</div></div>
        <div class="stat"><div class="label">This Month</div><div class="value">${money(currentMonthSales)}</div></div>
        <div class="stat"><div class="label">Sales Records</div><div class="value">${salesRows.length}</div></div>
      </div>

      <div class="sales-summary-grid">
        <div class="card"><div class="sales-section-head"><div><h4>Daily Total Sales</h4><p class="muted">Total sales for each day.</p></div></div>
          <div class="table-wrap"><table><thead><tr><th>Date</th><th>Total Sales</th></tr></thead><tbody>
            ${dailyRows.map(([date,total])=>`<tr><td>${esc(date)}</td><td><strong>${money(total)}</strong></td></tr>`).join("")||`<tr><td colspan="2" class="empty">No sales yet.</td></tr>`}
          </tbody></table></div>
        </div>
        <div class="card"><div class="sales-section-head"><div><h4>Monthly Total Sales</h4><p class="muted">Total sales for each month.</p></div></div>
          <div class="table-wrap"><table><thead><tr><th>Month</th><th>Total Sales</th></tr></thead><tbody>
            ${monthlyRows.map(([month,total])=>`<tr><td>${esc(monthLabel(month))}</td><td><strong>${money(total)}</strong></td></tr>`).join("")||`<tr><td colspan="2" class="empty">No sales yet.</td></tr>`}
          </tbody></table></div>
        </div>
      </div>

      <div class="card sales-records-card"><div class="sales-section-head"><div><h4>Sales Records</h4><p class="muted">See which customer made each sale.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>Date</th><th>Customer</th><th>Order</th><th>Amount</th><th>Cost</th><th>Profit</th><th>Payment</th><th></th></tr></thead><tbody>
          ${salesRows.map(s=>{const link=orderMap[s.order_id]||{};return `<tr><td>${esc(s.sale_date)}</td><td><strong>${esc(link.customer||"Walk-in")}</strong></td><td>${esc(link.orderNumber||"")}</td><td>${money(s.amount)}</td><td>${money(s.cost)}</td><td>${money(s.profit)}</td><td>${esc(s.payment_method||"")}</td><td><button class="btn btn-danger" onclick="deleteSale('${s.id}')">Delete</button></td></tr>`;}).join("")||`<tr><td colspan="8" class="empty">No sales yet.</td></tr>`}
        </tbody></table></div>
      </div>`;
  },

  async expenses(){
    const {data,error}=await sb.from("expenses").select("*").eq("user_id",dataUserId()).order("expense_date",{ascending:false});
    if(error)throw error;
    const rows=data||[];
    const today=localDate(); const month=localMonth();
    const monthRows=rows.filter(x=>String(x.expense_date||"").slice(0,7)===month);
    const total=rows.reduce((a,x)=>a+Number(x.amount||0),0);
    const monthTotal=monthRows.reduce((a,x)=>a+Number(x.amount||0),0);
    const totals={}; monthRows.forEach(x=>{const key=expenseTopCategory(x.category);totals[key]=(totals[key]||0)+Number(x.amount||0);});
    const breakdown=Object.entries(totals).sort((a,b)=>b[1]-a[1]);
    const biggest=breakdown[0]||["-",0];
    const delivery=monthRows.filter(x=>expenseTopCategory(x.category)==="Delivery").reduce((a,x)=>a+Number(x.amount||0),0);
    const staff=monthRows.filter(x=>["Salary","EPF / SOCSO / EIS","Staff Meals"].includes(expenseTopCategory(x.category))).reduce((a,x)=>a+Number(x.amount||0),0);
    const wastage=monthRows.filter(x=>expenseTopCategory(x.category)==="Wastage").reduce((a,x)=>a+Number(x.amount||0),0);
    const categoryRows=breakdown.map(([c,v])=>`<tr><td>${esc(c)}</td><td>${money(v)}</td><td>${monthTotal?((v/monthTotal)*100).toFixed(1):"0.0"}%</td></tr>`).join("")||`<tr><td colspan="3" class="empty">No expenses this month.</td></tr>`;
    const recent=rows.map(x=>`<tr><td>${esc(x.expense_date||"")}</td><td>${esc(expenseTopCategory(x.category))}</td><td>${esc(expenseSubcategory(x.category))}</td><td>${esc(x.description||"")}</td><td>${money(x.amount)}</td><td><button class="btn btn-danger" onclick="deleteRow('expenses','${x.id}',render.expenses)">Delete</button></td></tr>`).join("")||`<tr><td colspan="6" class="empty">No expenses yet.</td></tr>`;
    const options=EXPENSE_CATEGORIES.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("");
    const barRows=breakdown.slice(0,8).map(([c,v])=>{const w=monthTotal?Math.max(3,(v/monthTotal)*100):0;return `<div class="expense-bar-row"><div class="expense-bar-label"><span>${esc(c)}</span><strong>${money(v)}</strong></div><div class="expense-bar-track"><div class="expense-bar-fill" style="width:${w}%"></div></div></div>`}).join("");
    const subcategoryScript=JSON.stringify(Object.fromEntries(EXPENSE_CATEGORIES.map(c=>[c.name,c.subs]))).replace(/</g,"\u003c");
    window.__expenseSubcategories=Object.fromEntries(EXPENSE_CATEGORIES.map(c=>[c.name,c.subs]));
    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Expenses</h3><p class="muted">Track company spending, operating costs and wastage.</p></div><button class="btn btn-dark" onclick="openExpenseModal()">+ Expense</button></div>
      <div class="stats"><div class="stat"><div class="label">All-time Expenses</div><div class="value">${money(total)}</div></div><div class="stat"><div class="label">This Month</div><div class="value">${money(monthTotal)}</div></div><div class="stat"><div class="label">Largest Category</div><div class="value" style="font-size:20px">${esc(biggest[0])}</div><div class="muted">${money(biggest[1])} this month</div></div><div class="stat"><div class="label">Categories Used</div><div class="value">${breakdown.length}</div></div></div>
      <div class="stats"><div class="stat"><div class="label">Delivery Cost</div><div class="value">${money(delivery)}</div></div><div class="stat"><div class="label">Staff-related Cost</div><div class="value">${money(staff)}</div></div><div class="stat"><div class="label">Wastage Cost</div><div class="value">${money(wastage)}</div></div></div>
      <div class="grid-2"><div class="card"><div class="rpt-head" style="margin-bottom:10px"><div><h4>${esc(month)} Expense Breakdown</h4><p class="muted">Where this month's money is going.</p></div></div><div class="table-wrap"><table><thead><tr><th>Category</th><th>Amount</th><th>%</th></tr></thead><tbody>${categoryRows}</tbody></table></div></div>
      <div class="card"><div class="rpt-head" style="margin-bottom:10px"><div><h4>Expense Distribution</h4><p class="muted">Top spending categories this month.</p></div></div>${barRows||`<div class="empty">No expenses this month.</div>`}</div></div>
      <div class="card"><div class="rpt-head" style="margin-bottom:10px"><div><h4>Expense Records</h4><p class="muted">Latest expenses are shown first.</p></div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Subcategory</th><th>Description</th><th>Amount</th><th></th></tr></thead><tbody>${recent}</tbody></table></div></div>`;
  },

  async invoices(){
    const {data,error}=await sb.from("invoices").select("*,customers(name),orders(order_number)").eq("user_id",dataUserId()).order("created_at",{ascending:false}).order("invoice_date",{ascending:false});
    if(error)throw error;
    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Invoices</h3><p class="muted">Create invoices from existing orders, then print or download them.</p></div><button class="btn btn-dark" onclick="openInvoiceModal()">+ Invoice</button></div>
      <div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Order</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
      ${(data||[]).map(i=>`<tr><td><strong>${esc(i.invoice_number)}</strong></td><td>${esc(i.invoice_date||"")}</td><td>${esc(i.customers?.name||"Walk-in")}</td><td>${esc(i.orders?.order_number||"")}</td><td>${money(i.total)}</td><td><span class="badge">${esc(i.status||"issued")}</span></td><td class="row-actions"><button class="btn" onclick="viewInvoice('${i.id}')">View</button><button class="btn" onclick="printInvoice('${i.id}')">Print</button><button class="btn btn-danger" onclick="deleteInvoice('${i.id}')">Delete</button></td></tr>`).join("")||`<tr><td colspan="7" class="empty">No invoices yet. Click + Invoice to create one from an order.</td></tr>`}</tbody></table></div>`;
  },

  async printReport(){
    const root=$("#page.report-host > .report-root");
    if(!root){ toast("Please open Reports first."); return; }
    const periodLabel=root.querySelector(".report-period-pill")?.textContent?.split(" · Updated")[0]||"Selected period";
    const previousTitle=document.title;
    document.title=`NUONUO Report - ${periodLabel}`;
    document.body.classList.add("report-printing");
    // Give charts and layout one frame to settle before the browser captures the print preview.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      window.print();
      setTimeout(()=>{
        document.body.classList.remove("report-printing");
        document.title=previousTitle;
      },500);
    }));
  },
  async reports(){
    try{await syncCompletedOrdersToSales();}catch(e){console.error("Reports sales sync failed:",e);}
    const uid=dataUserId(), today=localDate();
    const period=reportPeriodState(), {start:periodStart,end:periodEnd,label:periodLabel}=period;
    const inPeriod=d=>reportDateInRange(d,periodStart,periodEnd);
    const [{data:salesRows,error:se},{data:expenseRows,error:ee},{data:orders,error:oe},{data:ingredients,error:ie},{data:wastageRows,error:we}]=await Promise.all([
      sb.from("sales").select("sale_date,amount,cost,order_id,payment_method").eq("user_id",uid).order("sale_date",{ascending:true}),
      sb.from("expenses").select("expense_date,amount,category,description").eq("user_id",uid).order("expense_date",{ascending:true}),
      sb.from("orders").select("id,order_number,status,total,subtotal,discount,delivery_fee,customer_id,payment_status,payment_method,order_date,created_at,customers(name)").eq("user_id",uid).order("order_date",{ascending:true}).order("created_at",{ascending:true}),
      sb.from("ingredients").select("id,name,item_type,current_stock,low_stock_threshold,cost_per_unit,unit").eq("user_id",uid).order("name"),
      sb.from("wastage_records").select("waste_cost,quantity_base,base_unit,wastage_date,reason,ingredient_id,ingredients(name)").eq("user_id",uid).order("wastage_date",{ascending:true})
    ]);
    if(se)throw se;if(ee)throw ee;if(oe)throw oe;if(ie)throw ie;if(we)throw we;

    const expensesData=expenseRows||[], allOrders=orders||[], inv=ingredients||[], wastes=wastageRows||[];
    const allPaid=allOrders.filter(o=>String(o.payment_status||'').toLowerCase()==='paid');
    const completed=allPaid.filter(o=>inPeriod(o.order_date||String(o.created_at||'').slice(0,10)));
    const completedIds=completed.map(o=>o.id).filter(Boolean);
    let orderItems=[], addonRows=[];
    if(completedIds.length){
      const oi=await sb.from('order_items').select('id,order_id,product_id,quantity,unit_price,unit_cost,addons_total,line_total').eq('user_id',uid).in('order_id',completedIds);
      if(oi.error)throw oi.error; orderItems=oi.data||[];
      // Fetch add-ons only when there are order item ids. This avoids an invalid empty IN query.
      const oiIds=orderItems.map(x=>x.id).filter(Boolean);
      if(oiIds.length){const ar=await sb.from('order_item_addons').select('order_item_id,quantity,unit_price,unit_cost,addon_id').eq('user_id',uid).in('order_item_id',oiIds);if(ar.error)throw ar.error;addonRows=ar.data||[];}
    }
    const productIds=[...new Set(orderItems.map(i=>i.product_id).filter(Boolean))];
    let products=[];
    if(productIds.length){const pr=await sb.from('products').select('id,name').eq('user_id',uid).in('id',productIds);if(pr.error)throw pr.error;products=pr.data||[];}
    const productMap=Object.fromEntries(products.map(p=>[p.id,p.name]));
    const productStats={};
    const orderCostMap={};
    orderItems.forEach(i=>{
      const name=productMap[i.product_id]||'Deleted / Unknown Product', qty=Number(i.quantity||0), addonRevenue=Number(i.addons_total||0), revenue=Math.max(0,Number(i.line_total||0)-addonRevenue), baseCost=qty*Number(i.unit_cost||0);
      if(!productStats[name])productStats[name]={qty:0,sales:0,cost:0,profit:0};
      productStats[name].qty+=qty;productStats[name].sales+=revenue;productStats[name].cost+=baseCost;productStats[name].profit+=revenue-baseCost;
      orderCostMap[i.order_id]=(orderCostMap[i.order_id]||0)+baseCost;
    });
    addonRows.forEach(a=>{
      const oi=orderItems.find(i=>i.id===a.order_item_id); if(!oi)return;
      const name=productMap[oi.product_id]||'Deleted / Unknown Product';
      if(!productStats[name])productStats[name]={qty:0,sales:0,cost:0,profit:0};
      const q=Number(a.quantity||0), rev=q*Number(a.unit_price||0), c=q*Number(a.unit_cost||0);
      productStats[name].sales+=rev;productStats[name].cost+=c;productStats[name].profit+=rev-c;
      orderCostMap[oi.order_id]=(orderCostMap[oi.order_id]||0)+c;
    });
    const productList=Object.entries(productStats).map(([name,v])=>({name,...v,margin:v.sales? v.profit/v.sales*100:0})).sort((a,b)=>b.sales-a.sales);
    window.__reportProductMix=productList.map(x=>({name:x.name,quantity:x.qty}));

    // Reports use paid Orders as the source of truth. The Sales table remains a ledger,
    // but duplicates or stale rows cannot inflate company-level reports anymore.
    const orderSalesRows=completed.map(o=>({amount:Number(o.total||0),cost:Number(orderCostMap[o.id]||0),profit:Number(o.total||0)-Number(orderCostMap[o.id]||0),sale_date:String(o.order_date||String(o.created_at||'').slice(0,10)),payment_method:o.payment_method,payment_status:o.payment_status,order_id:o.id}));
    const salesData=orderSalesRows;
    const expenses=expensesData.reduce((a,r)=>a+Number(r.amount||0),0);
    const sales=salesData.reduce((a,r)=>a+Number(r.amount||0),0), cogs=salesData.reduce((a,r)=>a+Number(r.cost||0),0);
    const gross=sales-cogs, net=gross-expenses, grossMargin=sales?gross/sales*100:0, netMargin=sales?net/sales*100:0;
    const monthSales=salesData.filter(r=>inPeriod(r.sale_date)).reduce((a,r)=>a+Number(r.amount||0),0);
    const monthCogs=salesData.filter(r=>inPeriod(r.sale_date)).reduce((a,r)=>a+Number(r.cost||0),0);
    const monthExpenses=expensesData.filter(r=>inPeriod(r.expense_date)).reduce((a,r)=>a+Number(r.amount||0),0);
    const monthGross=monthSales-monthCogs, monthNet=monthGross-monthExpenses, monthGrossMargin=monthSales?monthGross/monthSales*100:0, monthNetMargin=monthSales?monthNet/monthSales*100:0;
    const ordersCount=completed.length, aov=ordersCount?sales/ordersCount:0, monthOrders=completed.filter(o=>inPeriod(o.order_date)).length, monthAov=monthOrders?monthSales/monthOrders:0;
    const unpaid=allOrders.filter(o=>String(o.status||'').toLowerCase()!=='cancelled' && String(o.payment_status||'').toLowerCase()!=='paid').reduce((a,o)=>a+Number(o.total||0),0);

    const daily={}; salesData.forEach(r=>{const d=String(r.sale_date||'').slice(0,10);if(d)daily[d]=(daily[d]||0)+Number(r.amount||0);});
    const monthly={}; salesData.forEach(r=>{const d=String(r.sale_date||'').slice(0,7);if(d)monthly[d]=(monthly[d]||0)+Number(r.amount||0);});
    const expenseBy={}; expensesData.filter(r=>inPeriod(r.expense_date)).forEach(r=>{const c=expenseTopCategory(r.category);expenseBy[c]=(expenseBy[c]||0)+Number(r.amount||0);});
    const expenseSorted=Object.entries(expenseBy).sort((a,b)=>b[1]-a[1]);

    const invValue=inv.reduce((a,i)=>a+Number(i.current_stock||0)*Number(i.cost_per_unit||0),0);
    const lowStock=inv.filter(i=>Number(i.current_stock||0)<=Number(i.low_stock_threshold||0));
    const outStock=inv.filter(i=>Number(i.current_stock||0)<=0);
    const monthWastes=wastes.filter(r=>inPeriod(r.wastage_date));
    const totalWaste=wastes.reduce((a,r)=>a+Number(r.waste_cost||0),0), monthWaste=monthWastes.reduce((a,r)=>a+Number(r.waste_cost||0),0);
    const wastageRate=monthCogs?monthWaste/monthCogs*100:0;

    const customerMap={}; completed.forEach(o=>{if(!o.customer_id)return;const k=o.customer_id;if(!customerMap[k])customerMap[k]={name:o.customers?.name||'Walk-in',orders:0,spending:0};customerMap[k].orders++;customerMap[k].spending+=Number(o.total||0);});
    const customerList=Object.values(customerMap).sort((a,b)=>b.spending-a.spending), returning=customerList.filter(x=>x.orders>1).length, customerCount=customerList.length;
    const firstCompletedByCustomer={}; allPaid.forEach(o=>{if(!o.customer_id)return;const d=String(o.order_date||String(o.created_at||'').slice(0,10));if(!firstCompletedByCustomer[o.customer_id]||d<firstCompletedByCustomer[o.customer_id])firstCompletedByCustomer[o.customer_id]=d;});
    const newCustomersThisPeriod=Object.values(firstCompletedByCustomer).filter(d=>inPeriod(d)).length;
    const deliveryRevenue=completed.filter(o=>inPeriod(o.order_date)).reduce((a,o)=>a+Number(o.delivery_fee||0),0);

    const deliveryRows=expensesData.filter(r=>inPeriod(r.expense_date) && expenseTopCategory(r.category)==='Delivery');
    const deliveryCost=deliveryRows.reduce((a,r)=>a+Number(r.amount||0),0);
    const deliveryBy={};deliveryRows.forEach(r=>{const s=expenseSubcategory(r.category)||r.description||'Delivery';deliveryBy[s]=(deliveryBy[s]||0)+Number(r.amount||0);});
    const labourCats=['Salary','EPF / SOCSO / EIS'];
    const labourCost=expensesData.filter(r=>inPeriod(r.expense_date) && labourCats.includes(expenseTopCategory(r.category))).reduce((a,r)=>a+Number(r.amount||0),0);
    const partTimerCost=expensesData.filter(r=>inPeriod(r.expense_date) && expenseTopCategory(r.category)==='Salary' && expenseSubcategory(r.category)==='Part-time').reduce((a,r)=>a+Number(r.amount||0),0);
    const staffMeals=expensesData.filter(r=>inPeriod(r.expense_date) && ['Staff Meals','Company Meals & Events'].includes(expenseTopCategory(r.category))).reduce((a,r)=>a+Number(r.amount||0),0);
    const fixedCats=['Salary','EPF / SOCSO / EIS','Rental','Utilities','Professional Services','Insurance','Licenses & Government Fees','Bank & Finance','Training & Staff Development'];
    const variableExpenseCats=['Delivery','Platform & Payment Fees','Wastage'];
    const fixedCosts=expensesData.filter(r=>inPeriod(r.expense_date) && fixedCats.includes(expenseTopCategory(r.category))).reduce((a,r)=>a+Number(r.amount||0),0);
    const variableExpenses=expensesData.filter(r=>inPeriod(r.expense_date) && variableExpenseCats.includes(expenseTopCategory(r.category))).reduce((a,r)=>a+Number(r.amount||0),0);
    const contributionPerRm=monthSales?Math.max(0,(monthSales-monthCogs-variableExpenses)/monthSales):0;
    const breakEvenSales=contributionPerRm>0?fixedCosts/contributionPerRm:0, breakEvenOrders=monthAov>0?breakEvenSales/monthAov:0;
    const expenseRatio=monthSales?monthExpenses/monthSales*100:0;
    const wastageBy={};monthWastes.forEach(r=>{const n=r.ingredients?.name||'Unknown';wastageBy[n]=(wastageBy[n]||0)+Number(r.waste_cost||0);});
    const topWastes=Object.entries(wastageBy).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const lowRows=lowStock.slice().sort((a,b)=>Number(a.current_stock||0)-Number(b.current_stock||0)).slice(0,8);
    const topProducts=productList.slice(0,8), lowMarginProducts=productList.filter(x=>x.sales>0).slice().sort((a,b)=>a.margin-b.margin).slice(0,5);
    const topCustomers=customerList.slice(0,8);
    const topExpenses=expenseSorted.slice(0,8);
    const topMonths=Object.entries(monthly).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,12);
    const health=[];
    health.push({label:'Sales vs Expenses',ok:monthSales>=monthExpenses,msg:monthSales>=monthExpenses?'Sales cover recorded operating expenses.':'Expenses are higher than sales this month.'});
    health.push({label:'Gross Margin',ok:monthGrossMargin>=50,msg:`${monthGrossMargin.toFixed(1)}% gross margin`});
    health.push({label:'Inventory',ok:lowStock.length<=5,msg:`${lowStock.length} low-stock item${lowStock.length===1?'':'s'}`});
    health.push({label:'Wastage',ok:wastageRate<=5,msg:`${wastageRate.toFixed(1)}% of COGS`});
    health.push({label:'Receivables',ok:unpaid<=0,msg:unpaid>0?`${money(unpaid)} unpaid orders`:'No unpaid orders'});
    health.push({label:'Delivery',ok:monthSales?deliveryCost/monthSales<=.08:true,msg:`${monthSales?(deliveryCost/monthSales*100).toFixed(1):'0.0'}% of sales`});

    window.__reportRows={sales:salesData,expenses:expensesData.filter(r=>inPeriod(r.expense_date))}; window.__reportChartStart=periodStart; window.__reportRange=reportPeriodDays(periodStart,periodEnd); window.__reportSeries={sales:true,cogs:true,gross:true,net:true};
    const metric=(label,value,sub='')=>`<div class="stat"><div class="label">${label}</div><div class="value">${value}</div>${sub?`<div class="muted report-stat-sub">${sub}</div>`:''}</div>`;
    const bar=(label,value,total)=>{const w=total?Math.min(100,value/total*100):0;return `<div class="report-bar-row"><div><span>${esc(label)}</span><strong>${money(value)}</strong></div><div class="report-bar-track"><span style="width:${w}%"></span></div></div>`;};
    const tableRows=(rows,empty,cols)=>rows||`<tr><td colspan="${cols}" class="empty">${empty}</td></tr>`;

    const trendText=`${periodLabel} selected`;

    const overviewHealth=health.map(h=>`<div class="health-row"><span class="health-dot ${h.ok?'good':'warn'}"></span><strong>${esc(h.label)}</strong><span class="muted">${esc(h.msg)}</span></div>`).join('');
    const productRows=topProducts.map(p=>`<tr><td><strong>${esc(p.name)}</strong></td><td>${p.qty.toFixed(p.qty%1?1:0)} pcs</td><td>${money(p.sales)}</td><td>${money(p.cost)}</td><td>${money(p.profit)}</td><td>${p.margin.toFixed(1)}%</td></tr>`).join('');
    const marginRows=lowMarginProducts.map(p=>`<tr><td>${esc(p.name)}</td><td>${money(p.sales)}</td><td>${money(p.profit)}</td><td><span class="report-margin ${p.margin<40?'bad':''}">${p.margin.toFixed(1)}%</span></td></tr>`).join('');
    const customerRows=topCustomers.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${c.orders}</td><td>${money(c.spending)}</td><td>${money(c.orders?c.spending/c.orders:0)}</td></tr>`).join('');
    const inventoryRows=lowRows.map(i=>`<tr><td><strong>${esc(i.name)}</strong></td><td>${inventoryDisplayStock(i)}</td><td>${inventoryDisplayStock({...i,current_stock:i.low_stock_threshold})}</td><td>${money(Number(i.current_stock||0)*Number(i.cost_per_unit||0))}</td></tr>`).join('');
    const wasteRows=topWastes.map(([n,v])=>`<tr><td>${esc(n)}</td><td>${money(v)}</td><td>${totalWaste?((v/totalWaste)*100).toFixed(1):'0.0'}%</td></tr>`).join('');
    const deliveryRowsHtml=Object.entries(deliveryBy).sort((a,b)=>b[1]-a[1]).map(([n,v])=>`<tr><td>${esc(n)}</td><td>${money(v)}</td><td>${monthSales?(v/monthSales*100).toFixed(1):'0.0'}%</td></tr>`).join('');

    const dailyRows=Object.entries(daily).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,14).map(([d,v])=>`<tr><td>${esc(d)}</td><td><strong>${money(v)}</strong></td></tr>`).join('');
    const monthlyRows=topMonths.map(([m,v])=>`<tr><td>${esc(m)}</td><td><strong>${money(v)}</strong></td></tr>`).join('');

    const fixedContribution=monthSales-cogs;
    const cashCollected=sales;
    const cashNet=cashCollected-monthExpenses;

    $("#page").innerHTML=`<div class="report-root"><div class="rpt-head"><div><h3>Reports</h3><p class="muted">Complete business health, profitability, customers, inventory and operating analysis.</p></div><div class="report-period-controls"><label>Period<select id="reportPeriodType"><option value="monthly" ${period.type==="monthly"?"selected":""}>Monthly</option><option value="quarterly" ${period.type==="quarterly"?"selected":""}>Quarterly</option><option value="yearly" ${period.type==="yearly"?"selected":""}>Yearly</option><option value="custom" ${period.type==="custom"?"selected":""}>Custom Range</option></select></label><label id="reportPeriodPickerWrap" ${period.type==="custom"?"hidden":""}>Select<select id="reportPeriodPicker">${reportPeriodOptions(period.type).map(([v,l])=>`<option value="${v}" ${v===(window.__reportPeriodValue||reportPeriodOptions(period.type)[0]?.[0])?"selected":""}>${l}</option>`).join("")}</select></label><div id="reportCustomControls" class="report-custom-controls" ${period.type==="custom"?"":"hidden"}><div class="english-date-field"><input id="reportCustomStart" type="text" inputmode="numeric" maxlength="10" placeholder="YYYY-MM-DD" value="${esc(periodStart)}"><button type="button" class="date-picker-btn" data-date-target="reportCustomStart" aria-label="Choose start date" title="Choose start date">▣</button></div><span>→</span><div class="english-date-field"><input id="reportCustomEnd" type="text" inputmode="numeric" maxlength="10" placeholder="YYYY-MM-DD" value="${esc(periodEnd)}"><button type="button" class="date-picker-btn" data-date-target="reportCustomEnd" aria-label="Choose end date" title="Choose end date">▣</button></div><button id="applyReportCustom" class="btn" type="button">Apply</button></div><button class="btn btn-dark print-report-btn" id="printReportBtn" type="button">Print Report</button><div class="report-period-pill">${esc(periodLabel)} · Updated ${esc(today)}</div></div></div>
      <div class="rpt-section"><h4>Business Overview</h4><span class="muted">Selected period</span></div>
      <div class="rpt-kpis">${metric('Sales',money(monthSales),trendText)}${metric('COGS',money(monthCogs),`${monthSales?((monthCogs/monthSales)*100).toFixed(1):'0.0'}% of sales`)}${metric('Gross Profit',money(monthGross),`${monthGrossMargin.toFixed(1)}% gross margin`)}${metric('Expenses',money(monthExpenses),`${expenseRatio.toFixed(1)}% of sales`)}${metric('Net Profit',money(monthNet),`${monthNetMargin.toFixed(1)}% net margin`)}${metric('Orders',String(monthOrders),`AOV ${money(monthAov)}`)}</div>
      <div class="rpt-kpis rpt-kpis-secondary">${metric('All-time Sales',money(sales))}${metric('All-time Net Profit',money(net))}${metric('Inventory Value',money(invValue))}${metric('Receivables',money(unpaid),unpaid?'Orders not marked paid':'All orders marked paid')}${metric('Wastage',money(monthWaste),`${wastageRate.toFixed(1)}% of COGS`)}${metric('Customers',String(customerCount),`${returning} returning customers`)}</div>

      <div class="rpt-row2"><div class="card report-chart-card"><div class="report-chart-head"><div><h4>Sales & Profit Trend</h4><p class="muted">Daily business performance.</p></div></div><div class="report-legend"><button class="report-legend-item active" data-series="sales"><span class="report-dot sales"></span>Sales</button><button class="report-legend-item active" data-series="cogs"><span class="report-dot cogs"></span>COGS</button><button class="report-legend-item active" data-series="gross"><span class="report-dot gross"></span>Gross Profit</button><button class="report-legend-item active" data-series="net"><span class="report-dot net"></span>Net Profit</button></div><div id="reportChart" class="report-chart"></div></div>
      <div class="card"><div class="report-card-head"><div><h4>Business Health</h4><p class="muted">Quick warning radar.</p></div></div>${overviewHealth}</div></div>

      <div class="rpt-section"><h4>Profitability</h4><span class="muted">Know what actually makes money</span></div>
      <div class="rpt-row2"><div class="card"><div class="report-card-head"><h4>Profit & Loss</h4></div><div class="pnl"><div><span>Sales</span><strong>${money(monthSales)}</strong></div><div><span>− COGS</span><strong>${money(monthCogs)}</strong></div><div class="pnl-total"><span>Gross Profit</span><strong>${money(monthGross)}</strong></div><div><span>− Operating Expenses</span><strong>${money(monthExpenses)}</strong></div><div class="pnl-total final"><span>NET PROFIT</span><strong>${money(monthNet)}</strong></div></div></div>
      <div class="card"><div class="report-card-head"><h4>Break-even Analysis</h4><p class="muted">Estimate based on the selected period's cost structure.</p></div><div class="break-even-grid"><div><span>Fixed Cost Estimate</span><strong>${money(fixedCosts)}</strong></div><div><span>Contribution Margin</span><strong>${(contributionPerRm*100).toFixed(1)}%</strong></div><div><span>Break-even Sales</span><strong>${money(breakEvenSales)}</strong></div><div><span>Break-even Orders</span><strong>${breakEvenOrders.toFixed(1)}</strong></div><div><span>Current Sales</span><strong>${money(monthSales)}</strong></div><div><span>Safety Above Break-even</span><strong>${money(Math.max(0,monthSales-breakEvenSales))}</strong></div></div></div></div>

      <div class="rpt-row2"><div class="card"><div class="report-card-head"><h4>Product Performance</h4><p class="muted">Sales, cost and profit by paid-order product.</p></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>Sold</th><th>Sales</th><th>COGS</th><th>Profit</th><th>Margin</th></tr></thead><tbody>${tableRows(productRows,'No completed product sales yet.',6)}</tbody></table></div></div>
      <div class="card"><div class="report-card-head"><h4>Low-Margin Products</h4><p class="muted">Products that sell but keep less profit per ringgit.</p></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>Sales</th><th>Profit</th><th>Margin</th></tr></thead><tbody>${tableRows(marginRows,'No product margin data yet.',4)}</tbody></table></div></div></div>
      <div class="card report-product-card"><div class="report-chart-head"><div><h4>Product Sales Mix</h4><p class="muted">Share of total units sold.</p></div><div class="report-product-total">${window.__reportProductMix.reduce((a,r)=>a+r.quantity,0)} pcs</div></div><div id="reportProductChart" class="report-product-chart"></div></div>

      <div class="rpt-section"><h4>Expenses & Operations</h4><span class="muted">Where company money is going</span></div>
      <div class="rpt-row2"><div class="card"><div class="report-card-head"><h4>Expense Breakdown</h4><p class="muted">Operating expenses in the selected period.</p></div>${topExpenses.map(([c,v])=>bar(c,v,monthExpenses)).join('')||'<div class="empty">No expenses this month.</div>'}</div>
      <div class="card"><div class="report-card-head"><h4>Expense Ratios</h4></div><div class="ratio-list">${topExpenses.map(([c,v])=>`<div><span>${esc(c)}</span><strong>${monthExpenses?(v/monthExpenses*100).toFixed(1):'0.0'}%</strong></div>`).join('')||'<div class="empty">No expenses this month.</div>'}</div></div></div>
      <div class="rpt-row2"><div class="card"><div class="report-card-head"><h4>Delivery Analysis</h4><p class="muted">Self delivery, Grab, Lalamove and other courier costs.</p></div><div class="table-wrap"><table><thead><tr><th>Type</th><th>Cost</th><th>% of Sales</th></tr></thead><tbody>${tableRows(deliveryRowsHtml,'No delivery expenses recorded this month.',3)}</tbody></table></div><div class="report-callout"><strong>${money(deliveryCost)}</strong><span>Total delivery cost · ${monthOrders?money(deliveryCost/monthOrders):money(0)} per completed order · Delivery revenue ${money(deliveryRevenue)} · Delivery P/L ${money(deliveryRevenue-deliveryCost)}</span></div></div>
      <div class="card"><div class="report-card-head"><h4>Labour Cost</h4><p class="muted">Salary, part-time and statutory employment costs.</p></div><div class="big-number">${money(labourCost)}</div><div class="mini-stat-grid"><div><span>Part-time</span><strong>${money(partTimerCost)}</strong></div><div><span>Staff Meals</span><strong>${money(staffMeals)}</strong></div><div><span>% of Sales</span><strong>${monthSales?(labourCost/monthSales*100).toFixed(1):'0.0'}%</strong></div></div></div></div>

      <div class="rpt-section"><h4>Inventory & Wastage</h4><span class="muted">Prevent stock from silently eating profit</span></div>
      <div class="rpt-row2"><div class="card"><div class="report-card-head"><h4>Inventory Health</h4><p class="muted">Current inventory position.</p></div><div class="mini-stat-grid"><div><span>Inventory Value</span><strong>${money(invValue)}</strong></div><div><span>Low Stock</span><strong>${lowStock.length}</strong></div><div><span>Out of Stock</span><strong>${outStock.length}</strong></div><div><span>Total Items</span><strong>${inv.length}</strong></div></div><div class="table-wrap"><table><thead><tr><th>Item</th><th>Current</th><th>Reorder Level</th><th>Value</th></tr></thead><tbody>${tableRows(inventoryRows,'Inventory is empty.',4)}</tbody></table></div></div>
      <div class="card"><div class="report-card-head"><h4>Wastage Analysis</h4><p class="muted">Waste cost and biggest losses in the selected period.</p></div><div class="mini-stat-grid"><div><span>Selected Period</span><strong>${money(monthWaste)}</strong></div><div><span>All-time</span><strong>${money(totalWaste)}</strong></div><div><span>Wastage Rate</span><strong>${wastageRate.toFixed(1)}%</strong></div></div><div class="table-wrap"><table><thead><tr><th>Ingredient</th><th>Cost</th><th>Share</th></tr></thead><tbody>${tableRows(wasteRows,'No wastage recorded this month.',3)}</tbody></table></div></div></div>

      <div class="rpt-section"><h4>Customers</h4><span class="muted">Who is actually driving revenue</span></div>
      <div class="rpt-kpis rpt-kpis-secondary">${metric('Total Customers',String(customerCount))}${metric('New Customers',String(newCustomersThisPeriod),'First completed order in selected period')}${metric('Returning Customers',String(returning),`${customerCount?((returning/customerCount)*100).toFixed(1):'0.0'}% of active customers`)}${metric('Average Order Value',money(aov))}${metric('Top Customer',topCustomers[0]?money(topCustomers[0].spending):money(0),topCustomers[0]?.name||'No customer sales yet')}</div>
      <div class="card"><div class="report-card-head"><h4>Top Customers by Spending</h4><p class="muted">Completed orders only.</p></div><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Orders</th><th>Total Spending</th><th>Average Order</th></tr></thead><tbody>${tableRows(customerRows,'No customer orders yet.',4)}</tbody></table></div></div>

      <div class="rpt-section"><h4>Cash & Sales Activity</h4><span class="muted">Money collected versus recorded sales</span></div>
      <div class="rpt-kpis rpt-kpis-secondary">${metric('Cash Collected',money(cashCollected),'Paid completed orders in selected period')}${metric('Receivables',money(unpaid),'Completed orders not marked paid')}${metric('Cash Out',money(monthExpenses),'Recorded operating expenses')}${metric('Net Cash Flow',money(cashCollected-monthExpenses),'Cash collected minus expenses')}${metric('Monthly AOV',money(monthAov),`${monthOrders} completed orders`)}</div>
      <div class="rpt-row2"><div class="card"><div class="report-card-head"><h4>Daily Sales</h4><p class="muted">Sales days in the selected period.</p></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Total Sales</th></tr></thead><tbody>${tableRows(dailyRows,'No sales yet.',2)}</tbody></table></div></div><div class="card"><div class="report-card-head"><h4>Monthly Sales</h4><p class="muted">Monthly sales within the selected period.</p></div><div class="table-wrap"><table><thead><tr><th>Month</th><th>Total Sales</th></tr></thead><tbody>${tableRows(monthlyRows,'No sales yet.',2)}</tbody></table></div></div></div>

      <div class="card report-alert-card"><div class="report-card-head"><div><h4>Management Alerts</h4><p class="muted">Things worth checking before making the next business decision.</p></div></div><div class="alert-grid">${health.map(h=>`<div class="alert-box ${h.ok?'good':'warn'}"><strong>${h.ok?'GOOD':'WATCH'}</strong><span>${esc(h.label)}</span><p>${esc(h.msg)}</p></div>`).join('')}</div></div></div></div>`;
    $$(".report-legend-item").forEach(b=>b.addEventListener("click",()=>{const key=b.dataset.series;window.__reportSeries[key]=!window.__reportSeries[key];b.classList.toggle("active",window.__reportSeries[key]);renderReportChart();}));
    const rptType=$("#reportPeriodType"), rptPicker=$("#reportPeriodPicker"), rptPickerWrap=$("#reportPeriodPickerWrap"), rptCustom=$("#reportCustomControls");
    rptType?.addEventListener("change",()=>{window.__reportPeriodType=rptType.value; if(rptCustom)rptCustom.hidden=rptType.value!=="custom"; if(rptPickerWrap)rptPickerWrap.hidden=rptType.value==="custom"; if(rptType.value!=="custom"){const opts=reportPeriodOptions(rptType.value);window.__reportPeriodValue=opts[0]?.[0]||"";} render.reports();});
    rptPicker?.addEventListener("change",()=>{window.__reportPeriodValue=rptPicker.value;render.reports();});
    const applyCustomReportRange = async (ev) => {
      if(ev){ ev.preventDefault(); ev.stopPropagation(); }
      const rawStart=$("#reportCustomStart")?.value||"";
      const rawEnd=$("#reportCustomEnd")?.value||"";
      const start=validDateString(rawStart);
      const end=validDateString(rawEnd);
      if(!start || !end){ toast("Please enter valid dates in YYYY-MM-DD format."); return; }
      window.__reportCustomStart=start;
      window.__reportCustomEnd=end;
      window.__reportPeriodType="custom";
      window.__reportPeriodValue="";
      try { await render.reports(); } catch(e) { console.error("Custom report range failed:",e); toast(errText(e)); }
    };
    window.applyCustomReportRange=applyCustomReportRange;
    $("#applyReportCustom")?.addEventListener("click",applyCustomReportRange);
    $("#printReportBtn")?.addEventListener("click",()=>render.printReport());
    initAllEnglishDateFields();
    initEnglishDateField("reportCustomStart");
    initEnglishDateField("reportCustomEnd");
    renderReportChart();renderReportProductChart();
  },

  async purchasing(){
    const uid=dataUserId();
    const [{data:rows,error:pe},{data:suppliers,error:se},{data:ingredients,error:ie}]=await Promise.all([
      sb.from("purchase_orders").select("id,purchase_number,purchase_date,status,payment_status,subtotal,created_at,suppliers(name),purchase_items(quantity,received_quantity,unit_cost,ingredients(name,unit))").eq("user_id",uid).order("purchase_date",{ascending:false}).order("created_at",{ascending:false}),
      sb.from("suppliers").select("id,name").eq("user_id",uid).order("name"),
      sb.from("ingredients").select("id,name,unit,cost_per_unit,item_type,current_stock").eq("user_id",uid).order("name")
    ]);
    if(pe)throw pe;if(se)throw se;if(ie)throw ie;
    const list=rows||[], month=localMonth();
    const monthSpend=list.filter(r=>String(r.purchase_date||'').slice(0,7)===month && r.status!=='cancelled').reduce((a,r)=>a+Number(r.subtotal||0),0);
    const outstanding=list.filter(r=>r.payment_status!=='paid'&&r.status!=='cancelled').reduce((a,r)=>a+Number(r.subtotal||0),0);
    const open=list.filter(r=>['draft','ordered','partial'].includes(r.status)).length;
    const statusBadge=x=>`<span class="badge">${esc(x||'draft')}</span>`;
    const rowsHtml=list.map(r=>{const computedTotal=Number((r.purchase_items||[]).reduce((a,i)=>a+Number(i.quantity||0)*Number(i.unit_cost||0),0).toFixed(2));return `<tr><td><strong>${esc(r.purchase_number)}</strong></td><td>${esc(r.purchase_date||'')}</td><td>${esc(r.suppliers?.name||'No supplier')}</td><td>${statusBadge(r.status)}</td><td>${esc(r.payment_status||'unpaid')}</td><td>${money(computedTotal)}</td><td class="row-actions"><button class="btn" onclick="viewPurchase('${r.id}')">View</button><button class="btn" onclick="editPurchase('${r.id}')">Edit</button>${['draft','ordered','partial'].includes(r.status)?`<button class="btn btn-dark" onclick="receivePurchase('${r.id}')">Receive</button>`:''}${isOwner()?`<button class="btn btn-danger" onclick="deletePurchase('${r.id}')">Delete</button>`:''}</td></tr>`}).join('')||`<tr><td colspan="7" class="empty">No purchases yet.</td></tr>`;
    window.__purchaseIngredients=ingredients||[];window.__purchaseSuppliers=suppliers||[];
    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Purchasing</h3><p class="muted">Track purchases, supplier costs and stock receipts.</p></div><button class="btn btn-dark" onclick="openPurchaseModal()">+ Purchase</button></div>
      <div class="stats"><div class="stat"><div class="label">This Month</div><div class="value">${money(monthSpend)}</div></div><div class="stat"><div class="label">Open Purchases</div><div class="value">${open}</div></div><div class="stat"><div class="label">Outstanding</div><div class="value">${money(outstanding)}</div></div><div class="stat"><div class="label">Suppliers</div><div class="value">${(suppliers||[]).length}</div></div></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Purchase</th><th>Date</th><th>Supplier</th><th>Status</th><th>Payment</th><th>Total</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
  },

  async suppliers(){
    const {data,error}=await sb.from('suppliers').select('*').eq('user_id',dataUserId()).order('name'); if(error)throw error;
    const rows=data||[];
    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Suppliers</h3><p class="muted">Supplier contacts, payment terms and purchasing history.</p></div><button class="btn btn-dark" onclick="openSupplierModal()">+ Supplier</button></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Email</th><th>Payment Terms</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td>${esc(r.contact_person||'-')}</td><td>${esc(r.phone||'-')}</td><td>${esc(r.email||'-')}</td><td>${esc(r.payment_terms||'-')}</td><td class="row-actions"><button class="btn" onclick='openSupplierModal(${JSON.stringify(r).replace(/</g,"\\u003c")})'>Edit</button>${isOwner()?`<button class="btn btn-danger" onclick="deleteSupplier('${r.id}')">Delete</button>`:''}</td></tr>`).join('')||`<tr><td colspan="6" class="empty">No suppliers yet.</td></tr>`}</tbody></table></div></div>`;
  },

  async movements(){
    const {data,error}=await sb.from('inventory_movements').select('*,ingredients(name)').eq('user_id',dataUserId()).order('created_at',{ascending:false}).limit(300);if(error)throw error;
    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Inventory Movements</h3><p class="muted">Every stock increase and decrease with its source.</p></div></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Quantity</th><th>Reference</th><th>Note</th></tr></thead><tbody>${(data||[]).map(r=>`<tr><td>${new Date(r.created_at).toLocaleString('en-MY',{timeZone:SHOP_TIMEZONE})}</td><td><strong>${esc(r.ingredients?.name||'Unknown')}</strong></td><td>${esc(r.movement_type)}</td><td>${Number(r.quantity||0).toFixed(3)} ${esc(r.unit||'')}</td><td>${esc(r.reference_type||'-')}</td><td>${esc(r.note||'-')}</td></tr>`).join('')||`<tr><td colspan="6" class="empty">No inventory movements recorded yet.</td></tr>`}</tbody></table></div></div>`;
  },

  async audit(){
    const {data,error}=await sb.from('audit_logs').select('*').eq('user_id',dataUserId()).order('created_at',{ascending:false}).limit(300);if(error)throw error;
    const logs=data||[];
    const actorIds=[...new Set(logs.map(r=>r.actor_id).filter(Boolean))];
    let actorMap={};
    if(actorIds.length){
      const {data:profiles,error:profileError}=await sb.from('profiles').select('id,full_name,role').in('id',actorIds);
      if(!profileError){(profiles||[]).forEach(p=>{actorMap[p.id]=p;});}
    }

    const actorLabel=(r)=>{
      const p=actorMap[r.actor_id];
      if(p) return `${esc(p.full_name||'Unknown user')} <span class="muted small">· ${esc(p.role||'Staff')}</span>`;
      return r.actor_id ? `<span class="muted small">Unknown user</span>` : '-';
    };

    const actionLabel=(a)=>{const x=String(a||'').toUpperCase();return x==='UPDATE'?'Edit':x==='INSERT'?'Create':x==='DELETE'?'Delete':String(a||'');};

    // Resolve the UUID into a human-readable description of the affected record.
    const tableIds={};
    logs.forEach(r=>{if(r.record_id&&r.table_name){(tableIds[r.table_name]??=[]).push(r.record_id);}});
    const recordMap={};
    const tables=Object.keys(tableIds);
    await Promise.all(tables.map(async table=>{
      const ids=[...new Set(tableIds[table])];
      try{
        const {data:rows}=await sb.from(table).select('*').in('id',ids);
        (rows||[]).forEach(row=>{recordMap[`${table}:${row.id}`]=row;});
      }catch(e){}
    }));

    const moneyValue=v=>{const n=Number(v);return Number.isFinite(n)?`RM ${n.toFixed(2)}`:String(v||'');};
    const recordLabel=(r)=>{
      const row=recordMap[`${r.table_name}:${r.record_id}`];
      const t=String(r.table_name||'');
      if(!row){
        if(String(r.action||'').toUpperCase()==='DELETE') return '<span class="muted">Deleted record</span>';
        return '<span class="muted">Record unavailable</span>';
      }
      if(t==='suppliers') return `<strong>${esc(row.name||'Supplier')}</strong>${row.contact_person?` <span class="muted small">· ${esc(row.contact_person)}</span>`:''}`;
      if(t==='expenses') return `<strong>${esc(row.description||row.category||'Expense')}</strong> <span class="muted small">· ${moneyValue(row.amount)}</span>`;
      if(t==='orders') return `<strong>${esc(row.order_number||'Order')}</strong>${row.customer_name?` <span class="muted small">· ${esc(row.customer_name)}</span>`:''}${row.total!=null?` <span class="muted small">· ${moneyValue(row.total)}</span>`:''}`;
      if(t==='customers') return `<strong>${esc(row.name||row.full_name||'Customer')}</strong>${row.phone?` <span class="muted small">· ${esc(row.phone)}</span>`:''}`;
      if(t==='ingredients') return `<strong>${esc(row.name||'Ingredient')}</strong>${row.unit?` <span class="muted small">· ${esc(row.unit)}</span>`:''}`;
      if(t==='products') return `<strong>${esc(row.name||row.product_name||'Product')}</strong>${row.price!=null?` <span class="muted small">· ${moneyValue(row.price)}</span>`:''}`;
      if(t==='addons') return `<strong>${esc(row.name||row.addon_name||'Add-on')}</strong>${row.price!=null?` <span class="muted small">· ${moneyValue(row.price)}</span>`:''}`;
      if(t==='invoices') return `<strong>${esc(row.invoice_number||row.invoice_no||'Invoice')}</strong>${row.total!=null?` <span class="muted small">· ${moneyValue(row.total)}</span>`:''}`;
      if(t==='purchase_orders') return `<strong>${esc(row.purchase_number||'Purchase Order')}</strong>${row.subtotal!=null?` <span class="muted small">· ${moneyValue(row.subtotal)}</span>`:''}`;
      if(t==='wastage_records') return `<strong>${esc(row.reason||'Wastage')}</strong>${row.quantity_base!=null?` <span class="muted small">· ${esc(String(row.quantity_base))} ${esc(row.base_unit||'')}</span>`:''}`;
      if(t==='sales') return `<strong>${esc(row.sale_number||row.order_number||'Sale')}</strong>${row.total!=null?` <span class="muted small">· ${moneyValue(row.total)}</span>`:''}`;
      const preferred=['name','description','title','number','code','category'];
      const key=preferred.find(k=>row[k]!=null&&String(row[k]).trim()!=='');
      return key?`<strong>${esc(String(row[key]))}</strong>`:`<span class="muted">${esc(t.replace(/_/g,' '))}</span>`;
    };

    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Audit Log</h3><p class="muted">See what was added, edited or deleted, by whom and when.</p></div></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Action</th><th>Table</th><th>What Changed</th><th>Edited / Changed By</th></tr></thead><tbody>${logs.map(r=>`<tr><td>${new Date(r.created_at).toLocaleString('en-MY',{timeZone:SHOP_TIMEZONE})}</td><td><span class="badge">${esc(actionLabel(r.action))}</span></td><td>${esc(r.table_name)}</td><td>${recordLabel(r)}</td><td>${actorLabel(r)}</td></tr>`).join('')||`<tr><td colspan="5" class="empty">No audit events yet.</td></tr>`}</tbody></table></div></div>`;
  },

  async settings(){
    const p=profile||{};
    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Account Settings</h3><p class="muted">Profile and account information.</p></div></div>
      <div class="card"><form id="settingsForm" class="form-grid">
        <label>Full name<input id="setName" value="${esc(p.full_name||"")}"></label>
        <label>Email<input value="${esc(p.email||session.user.email||"")}" disabled></label>
        <label>Role<input value="${esc(p.role||"owner")}" disabled></label>
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
    if(!isOwner()){ $("#page").innerHTML=`<div class="card"><h3>Staff</h3><p class="error">Only the owner can manage staff.</p></div>`; return; }
    const {data,error}=await sb.from("profiles").select("id,email,full_name,role,avatar_url,created_at").order("created_at",{ascending:false});
    if(error)throw error;
    $("#page").innerHTML=`<div class="rpt-head"><div><h3>Staff</h3><p class="muted">Manage staff profiles and access.</p></div><button class="btn btn-dark" onclick="openStaffModal()">+ Create Staff</button></div>
      <div class="card" style="margin-bottom:18px"><p class="muted small">Create a staff login directly here. The staff member can use the email and password you set to sign in.</p></div>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th></th></tr></thead><tbody>
      ${(data||[]).map(st=>`<tr><td>${esc(st.full_name||"")}</td><td>${esc(st.email||"")}</td><td><span class="badge">${esc(st.role||"staff")}</span></td><td>${new Date(st.created_at).toLocaleDateString()}</td><td>${st.id!==session.user.id?`<button class="btn" onclick='openStaffModal(${JSON.stringify(st)})'>Edit</button> <button class="btn btn-danger" onclick="deleteStaff('${st.id}')">Delete</button>`:`<span class="muted small">Current user</span>`}</td></tr>`).join("")||`<tr><td colspan="5" class="empty">No staff profiles yet.</td></tr>`}
      </tbody></table></div>`;
  }
};

function renderMenuProductCards(products, categoryId=null){
  const ordered=[...(products||[])].sort((a,b)=>{
    const sa=Number.isFinite(Number(a.sort_order))?Number(a.sort_order):0;
    const sb=Number.isFinite(Number(b.sort_order))?Number(b.sort_order):0;
    return sa-sb || String(a.created_at||"").localeCompare(String(b.created_at||""));
  });
  const productHtml=ordered.map((p,index)=>{
    const cost=Number(p.calculated_cost||0), price=Number(p.selling_price||0), profit=price-cost;
    return `<article class="product-card menu-draggable-product" draggable="true" data-product-id="${p.id}" ondragstart="menuDragStart(event,'${p.id}')" ondragend="menuDragEnd(event)" ondragover="menuDragOver(event)" ondrop="menuDrop(event,'${categoryId||""}')">
      <div class="menu-drag-handle" title="Drag to reorder">⋮⋮</div>
      ${p.image_url?`<img class="product-image" src="${esc(p.image_url)}" alt="">`:`<div class="product-image"></div>`}
      <div class="product-body"><h4>${esc(p.name)}</h4><p class="muted small">${esc(p.categories?.name||"Uncategorized")}</p>
      <div class="price-row"><span>Selling</span><strong>${money(price)}</strong></div>
      <div class="price-row"><span>Cost</span><span>${money(cost)}</span></div>
      <div class="price-row"><span>Profit</span><span>${money(profit)}</span></div>
      <div class="price-row"><span>Margin</span><span class="margin">${pct(cost,price)}</span></div>
      <div class="actions" style="margin-top:14px"><button class="btn" onclick='openProductModal(${JSON.stringify(p)})'>Edit</button><button class="btn btn-danger" onclick="deleteRow('products','${p.id}',render.menu)">Delete</button></div>
      <div class="menu-reorder-buttons"><button class="btn" type="button" onclick="moveProductByOffset('${p.id}',-1)" title="Move left/up">↑</button><button class="btn" type="button" onclick="moveProductByOffset('${p.id}',1)" title="Move right/down">↓</button></div>
      </div>
    </article>`;
  }).join("")||`<div class="card empty">No products in this category yet.</div>`;
  return `<div class="product-grid menu-product-dropzone" data-category-id="${categoryId||""}" ondragover="menuDragOver(event)" ondrop="menuDrop(event,'${categoryId||""}')">${productHtml}</div>`;
}

function menuDragStart(event,id){
  window.__menuDraggingProductId=id;
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',id);
  event.currentTarget.classList.add('menu-dragging');
}
function menuDragEnd(event){
  event.currentTarget.classList.remove('menu-dragging');
  document.querySelectorAll('.menu-drag-over').forEach(x=>x.classList.remove('menu-drag-over'));
  window.__menuDraggingProductId=null;
}
function menuDragOver(event){
  event.preventDefault();
  event.dataTransfer.dropEffect='move';
  const card=event.target.closest('.menu-draggable-product');
  document.querySelectorAll('.menu-drag-over').forEach(x=>x.classList.remove('menu-drag-over'));
  if(card)card.classList.add('menu-drag-over');
  else event.currentTarget.classList.add('menu-drag-over');
}
async function persistMenuOrder(groups){
  const updates=[];
  for(const g of groups){
    g.ids.forEach((id,i)=>updates.push(sb.from('products').update({sort_order:i,category_id:g.categoryId||null}).eq('id',id).eq('user_id',dataUserId())));
  }
  const results=await Promise.all(updates);
  const error=results.find(r=>r.error)?.error;
  if(error){toast('Could not save product order: '+errText(error));return false;}
  return true;
}
async function menuDrop(event,targetCategoryId=''){
  event.preventDefault();
  const draggedId=window.__menuDraggingProductId||event.dataTransfer?.getData('text/plain');
  if(!draggedId)return;
  const targetGrid=event.currentTarget.closest('.menu-product-dropzone')||event.target.closest('.menu-product-dropzone');
  if(!targetGrid)return;
  const targetCategory=targetGrid.dataset.categoryId||targetCategoryId||'';
  const targetCard=event.target.closest('.menu-draggable-product');
  const allGrids=[...document.querySelectorAll('.menu-product-dropzone')];
  const affected=[];
  allGrids.forEach(grid=>{
    const ids=[...grid.querySelectorAll('.menu-draggable-product')].map(x=>x.dataset.productId).filter(Boolean);
    const cat=grid.dataset.categoryId||'';
    if(ids.includes(draggedId)||grid===targetGrid)affected.push({grid,cat,ids});
  });
  const source=affected.find(g=>g.ids.includes(draggedId));
  if(!source)return;
  source.ids=source.ids.filter(id=>id!==draggedId);
  let target=affected.find(g=>g.grid===targetGrid);
  if(!target){target={grid:targetGrid,cat:targetCategory,ids:[]};affected.push(target);}
  const cleanTarget=target.ids.filter(id=>id!==draggedId);
  let insertAt=cleanTarget.length;
  if(targetCard){const targetId=targetCard.dataset.productId;const idx=cleanTarget.indexOf(targetId);if(idx>=0)insertAt=idx;}
  cleanTarget.splice(insertAt,0,draggedId);
  target.ids=cleanTarget;
  const groups=affected.filter(g=>g.ids.length).map(g=>({categoryId:g.cat,ids:g.ids}));
  document.querySelectorAll('.menu-drag-over').forEach(x=>x.classList.remove('menu-drag-over'));
  const ok=await persistMenuOrder(groups);
  if(ok){toast('Menu order saved.');await render.menu();}
  window.__menuDraggingProductId=null;
}
async function moveProductByOffset(id,delta){
  const card=document.querySelector(`.menu-draggable-product[data-product-id="${id}"]`);
  const grid=card?.closest('.menu-product-dropzone');
  if(!grid)return;
  const cards=[...grid.querySelectorAll('.menu-draggable-product')];
  const ids=cards.map(x=>x.dataset.productId);const i=ids.indexOf(id);const j=i+delta;
  if(i<0||j<0||j>=ids.length)return;
  [ids[i],ids[j]]=[ids[j],ids[i]];
  const ok=await persistMenuOrder([{categoryId:grid.dataset.categoryId||'',ids}]);
  if(ok){toast('Menu order saved.');await render.menu();}
}

function renderMenuCategories(){
  const products=window.__menuProducts||[];
  const categories=window.__menuCategories||[];
  const addons=window.__menuAddons||[];

  const categorySections=categories.map(c=>{
    const categoryProducts=products.filter(p=>p.category_id===c.id);
    return `<section class="menu-category-section">
      <div class="menu-category-row">
        <div class="menu-category-title-wrap">
          <h3>${esc(c.name)}</h3>
          <span class="muted small">${categoryProducts.length} product${categoryProducts.length===1?"":"s"}</span>
          ${c.description?`<span class="menu-category-description muted small">${esc(c.description)}</span>`:""}
        </div>
        <div class="menu-category-row-actions">
          <button class="btn" type="button" onclick='openCategoryModal(${JSON.stringify(c)})'>Edit</button>
          <button class="btn btn-danger" type="button" onclick="deleteRow('categories','${c.id}',render.menu)">Delete</button>
        </div>
      </div>
      ${renderMenuProductCards(categoryProducts,c.id)}
    </section>`;
  }).join("");

  const uncategorized=products.filter(p=>!p.category_id);
  const uncategorizedSection=uncategorized.length?`<section class="menu-category-section">
    <div class="menu-category-row">
      <div class="menu-category-title-wrap">
        <h3>Uncategorized</h3>
        <span class="muted small">${uncategorized.length} product${uncategorized.length===1?"":"s"}</span>
      </div>
    </div>
    ${renderMenuProductCards(uncategorized,null)}
  </section>`:"";

  const addonRows=addons.map(a=>{
    const price=Number(a.price||0),cost=Number(a.cost||0);
    return `<tr>
      <td><strong>${esc(a.name)}</strong></td>
      <td>${money(price)}</td>
      <td>${money(cost)}</td>
      <td>${pct(cost,price)}</td>
      <td><span class="badge">${a.active?"Active":"Inactive"}</span></td>
      <td class="row-actions"><button class="btn" type="button" onclick='openAddonModal(${JSON.stringify(a)})'>Edit</button> <button class="btn btn-danger" type="button" onclick="deleteRow('addons','${a.id}',render.menu)">Delete</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" class="empty">No add-ons yet.</td></tr>`;

  const empty=!categories.length && !uncategorized.length;

  $("#page").innerHTML=`
    <div class="rpt-head">
      <div><h3>Categories</h3><p class="muted">Your menu is grouped by category.</p></div>
      <div class="actions">
        <button class="btn" type="button" onclick="openAddonModal()">+ Add-on</button>
        <button class="btn btn-dark" type="button" onclick="openCategoryModal()">+ Category</button>
        <button class="btn btn-dark" type="button" onclick="openProductModal()">+ Product</button>
      </div>
    </div>
    ${empty?`<div class="card empty">No categories or products yet. Add a category or product to get started.</div>`:""}
    ${categorySections}${uncategorizedSection}

    <section class="menu-addons-section">
      <div class="menu-category-row">
        <div class="menu-category-title-wrap">
          <h3>Add-ons</h3>
          <span class="muted small">${addons.length} add-on${addons.length===1?"":"s"}</span>
        </div>
        <button class="btn" type="button" onclick="openAddonModal()">+ Add-on</button>
      </div>
      <div class="table-wrap menu-addons-table">
        <table>
          <thead><tr><th>Name</th><th>Price</th><th>Cost</th><th>Margin</th><th>Status</th><th></th></tr></thead>
          <tbody>${addonRows}</tbody>
        </table>
      </div>
    </section>`;
  installPageSearch("menu");
}

async function openMenuCategory(categoryId){
  window.__menuCategoryId=categoryId;
  const products=window.__menuProducts||[];
  const categories=window.__menuCategories||[];
  const category=categoryId?categories.find(c=>c.id===categoryId):null;
  const filtered=products.filter(p=>categoryId?(p.category_id===categoryId):!p.category_id);
  const title=category?.name||"Uncategorized";
  $("#page").innerHTML=`
    <div class="rpt-head"><div><button class="btn" type="button" onclick="renderMenuCategories()">← Categories</button><div style="margin-top:12px"><h3 style="margin:0">${esc(title)}</h3><p class="muted">${filtered.length} product${filtered.length===1?"":"s"}</p></div></div>
      <div class="actions"><button class="btn btn-dark" onclick="openProductModal()">+ Product</button></div>
    </div>
    ${renderMenuProductCards(filtered)}`;
  installPageSearch("menu");
}


function orderTypeOf(order){
  // IMPORTANT: order_type is the only source of truth. Customer name/value
  // must NEVER affect whether an order is Walk-in or Pre-order.
  // Normalize all legacy spellings too, because older builds may have saved
  // values such as "pre-order", "preorder", or "pre order".
  const raw=String(order?.order_type??"walk_in").toLowerCase().trim();
  const normalized=raw.replace(/[-\s]/g,"_");
  return normalized==="pre_order" || normalized==="preorder" ? "pre_order" : "walk_in";
}
function orderScheduleDate(order){
  return orderTypeOf(order)==="pre_order"
    ? String(order?.scheduled_date||order?.order_date||String(order?.created_at||"").slice(0,10))
    : String(order?.order_date||String(order?.created_at||"").slice(0,10));
}
function orderTypeLabel(order){ return orderTypeOf(order)==="pre_order"?"Pre-order":"Walk-in"; }

function orderTable(data,full=false,pending=false,itemCounts={},remainingByOrder={}){
  const rows=(data||[]).map(o=>{
    const remaining=Number(itemCounts[o.id]||0);
    const paymentStatus=String(o.payment_status||o.payment||"unpaid").toLowerCase();
    const paymentLabel=paymentStatus==="paid"?"Paid":paymentStatus==="partial"?"Partial":"Unpaid";
    const details=remainingByOrder[o.id]||[];
    const type=orderTypeOf(o), scheduleDate=orderScheduleDate(o);
    const detailsHtml=pending?`<tr class="pending-order-details-row"><td colspan="${full?9:pending?7:6}"><div class="pending-order-details"><div class="pending-order-details-title">Not completed yet</div>${details.length?details.map(x=>`<div class="pending-order-detail"><strong class="pending-order-detail-qty">${x.qty} ×</strong><span>${esc(x.name)}</span></div>`).join(""):`<div class="muted small">No remaining items.</div>`}</div></td></tr>`:"";
    const row=`<tr><td><strong>${esc(o.order_number)}</strong></td><td>${esc(o.customers?.name||"Walk-in")}</td><td><span class="order-type-badge order-type-${type}">${orderTypeLabel(o)}</span></td>${pending?`<td><span class="remaining-items-badge">${remaining} item${remaining===1?"":"s"}</span></td>`:''}<td><span class="badge status-badge status-${esc(String(o.status||"").toLowerCase())}">${esc(o.status)}</span></td>${full?`<td><span class="badge payment-status-badge payment-${paymentStatus}">${paymentLabel}</span></td>`:''}<td>${money(o.total)}</td><td>${esc(scheduleDate)}</td>${full?`<td class="row-actions"><button class="btn" onclick="openOrderEditModal('${o.id}')">Edit</button>${pending&&o.status!=="completed"?`<button class="btn btn-dark" onclick="printKitchenOrder('${o.id}')">Print Kitchen</button><button class="btn btn-dark" onclick="completeOrder('${o.id}')">Complete</button>`:""}${isOwner()?` <button class="btn btn-danger" onclick="deleteOrder('${o.id}')">Delete</button>`:""}</td>`:""}</tr>`;
    return row+detailsHtml;
  }).join("")||`<tr><td colspan="${full?(pending?9:8):(pending?7:6)}" class="empty">No orders yet.</td></tr>`;
  return `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Type</th>${pending?'<th>Remaining</th>':''}<th>Status</th>${full?'<th>Payment</th>':''}<th>Total</th><th>${pending?'Date':'Date'}</th>${full?'<th>Actions</th>':''}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function invoiceForOrder(orderId){
  return stateInvoices.find(x=>x.order_id===orderId)||null;
}

let stateInvoices=[];
async function loadInvoiceState(){
  const {data,error}=await sb.from("invoices").select("*,customers(name),orders(order_number)").eq("user_id",dataUserId()).order("created_at",{ascending:false}).order("invoice_date",{ascending:false});
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
  const {data:invoice,error:invoiceError}=await sb.from("invoices").select("order_id").eq("id",invoiceId).eq("user_id",dataUserId()).single();
  if(invoiceError) throw invoiceError;
  const {data,error}=await sb.from("invoice_items").select("*").eq("invoice_id",invoiceId).eq("user_id",dataUserId()).order("created_at");
  if(!error && (data||[]).length) return data||[];
  const {data:orderItems,error:orderError}=await sb.from("order_items").select("product_id,quantity,unit_price,line_total,addons_total").eq("order_id",invoice.order_id).eq("user_id",dataUserId());
  if(orderError) throw orderError;
  const ids=[...(new Set((orderItems||[]).map(x=>x.product_id).filter(Boolean)))];
  let products=[];
  if(ids.length){
    const {data:pd,error:pe}=await sb.from("products").select("id,name").in("id",ids).eq("user_id",dataUserId());
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
    sb.from("orders").select("id,order_number,customer_id,status,subtotal,discount,delivery_fee,total,created_at,order_date,notes").eq("user_id",dataUserId()).order("created_at",{ascending:false}),
    sb.from("customers").select("id,name,phone,email,address").eq("user_id",dataUserId()).order("name")
  ]);
  if(oe)return toast(errText(oe));
  if(ce)return toast(errText(ce));
  await loadInvoiceState();
  const available=(orders||[]).filter(o=>!invoiceForOrder(o.id));
  const customerMap=Object.fromEntries((customers||[]).map(c=>[c.id,c]));
  openModal("Add Invoice",`<form id="invoiceForm" class="form-grid" onsubmit="return false;">
    <label class="wide">Order<select id="invoiceOrder" required><option value="">Select an order</option>${available.map(o=>`<option value="${esc(o.id)}">${esc(o.order_number)} · ${esc(customerMap[o.customer_id]?.name||"Walk-in")} · ${money(o.total)} · ${esc(o.order_date||String(o.created_at||"").slice(0,10))}</option>`).join("")}</select></label>
    <label>Issue date<div class="english-date-field"><input id="invoiceDate" type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="YYYY-MM-DD" value="${localDate()}" required><button type="button" class="date-picker-btn" data-date-target="invoiceDate" aria-label="Choose date" title="Choose date">▣</button></div></label>
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
      const {data:orderItems,error:ie}=await sb.from("order_items").select("product_id,quantity,unit_price,line_total,addons_total").eq("order_id",orderId).eq("user_id",dataUserId());
      if(ie)throw new Error("Could not load order items: "+errText(ie));
      const ids=[...(new Set((orderItems||[]).map(x=>x.product_id).filter(Boolean)))];
      let products=[];
      if(ids.length){const {data:pd,error:pe}=await sb.from("products").select("id,name").in("id",ids).eq("user_id",dataUserId());if(pe)throw new Error("Could not load products: "+errText(pe));products=pd||[];}
      const subtotal=Number(order.subtotal||0),discount=Number(order.discount||0),delivery=Number(order.delivery_fee||0),total=Number(order.total||Math.max(0,subtotal-discount+delivery));
      const issueDate=String(dateEl.value||"").trim();if(!issueDate)throw new Error("Please select an issue date.");
      const invoicePayload={user_id:dataUserId(),order_id:order.id,customer_id:order.customer_id||null,invoice_number:invoiceNumber(),invoice_date:issueDate,subtotal,discount,total,status:String(statusEl.value||"issued"),notes:String(notesEl.value||"").trim()||order.notes||null};
      console.log("Creating invoice",invoicePayload);
      const result=await sb.from("invoices").insert(invoicePayload).select("*").single();
      if(result.error)throw new Error("Could not save invoice: "+errText(result.error));
      const inv=result.data;if(!inv?.id)throw new Error("Invoice was created but no invoice ID was returned.");
      const itemPayload=(orderItems||[]).map(x=>{const product=products.find(p=>p.id===x.product_id);const addons=Number(x.addons_total||0),qty=Math.max(1,Number(x.quantity||1));return {invoice_id:inv.id,user_id:dataUserId(),product_id:x.product_id,description:addons>0?`${product?.name||"Item"} + Add-ons`:product?.name||"Item",quantity:qty,unit_price:Number(x.unit_price||0)+addons/qty,line_total:Number(x.line_total||0)};});
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
  const {data:invoice,error}=await sb.from("invoices").select("*,customers(name,phone,email,address),orders(order_number)").eq("id",id).eq("user_id",dataUserId()).single();
  if(error)return toast(errText(error));
  const items=await fetchInvoiceItems(id);
  openModal(`Invoice ${invoice.invoice_number}`,`${invoiceHtml(invoice,items)}<div class="invoice-toolbar"><button class="btn" onclick="printInvoice('${invoice.id}')">Print</button><button class="btn" onclick="downloadInvoicePDF('${invoice.id}')">Download PDF</button><button class="btn btn-dark" onclick="downloadInvoicePNG('${invoice.id}')">Download PNG</button></div>` ,null,"invoice-modal");
  $("#modalSubmit")?.remove();
}

async function printInvoice(id){
  const {data:invoice,error}=await sb.from("invoices").select("*,customers(name,phone,email,address),orders(order_number)").eq("id",id).eq("user_id",dataUserId()).single();
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
  const {data:invoice,error}=await sb.from("invoices").select("*,customers(name,phone,email,address),orders(order_number)").eq("id",id).eq("user_id",dataUserId()).single();
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
  if(!isOwner())return toast("Only the owner can delete invoices.");
  if(!confirm("Delete this invoice?"))return;
  const {error}=await sb.from("invoices").delete().eq("id",id).eq("user_id",dataUserId());
  if(error)return toast(errText(error));
  toast("Invoice deleted.");await navigate("invoices");
}

async function deleteSale(id){
  if(!isOwner())return toast("Only the owner can delete sales.");
  if(!confirm("Delete this sale record? This will also remove it from Sales and profit calculations."))return;
  const {error}=await sb.from("sales").delete().eq("id",id).eq("user_id",dataUserId());
  if(error)return toast(errText(error));
  toast("Sale deleted.");
  await navigate("sales");
}

function openWastageModal(){
  const items=window.__wastageItems||[];
  if(!items.length)return toast("Please add an inventory item first.");
  const options=items.map(i=>{
    const parsed=parseMeasureUnit(i.unit);
    const base=recipeIngredientUnit(i);
    const amount=parsed.valid?parsed.amount:1;
    const baseCost=ingredientBaseCost(i);
    return `<option value="${i.id}" data-base-unit="${esc(base)}" data-pack-amount="${amount}" data-base-cost="${baseCost}" data-stock="${Number(i.current_stock||0)}">${esc(i.name)} · ${esc(i.item_type==='packaging'?'pcs':base)} · stock ${inventoryDisplayStock(i)}</option>`;
  }).join("");
  const reasons=["Spoiled","Expired","Burnt","Damaged","Preparation loss","Overproduction","Wrong recipe","Other"];
  const today=localDate();
  openModal("Record Wastage",`<div class="form-grid"><label class="wide">Inventory item<select id="wItem" onchange="updateWastagePreview()">${options}</select></label><label>Wastage quantity<input id="wQty" type="number" min="0.0001" step="0.01" value="1" oninput="updateWastagePreview()"><span id="wUnitHint" class="muted small"></span></label><label>Date<div class="english-date-field"><input id="wDate" type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="YYYY-MM-DD" value="${today}"><button type="button" class="date-picker-btn" data-date-target="wDate" aria-label="Choose date" title="Choose date">▣</button></div></label><label>Reason<select id="wReason">${reasons.map(r=>`<option>${r}</option>`).join("")}</select></label><label>Note<input id="wNote" placeholder="e.g. overbaked, expired, damaged..."></label></div><div class="wastage-preview" id="wPreview"></div>`,async()=>{
    const select=$("#wItem"),opt=select?.selectedOptions?.[0];
    const qty=Number($("#wQty")?.value||0),packAmount=Number(opt?.dataset.packAmount||1),baseCost=Number(opt?.dataset.baseCost||0),stock=Number(opt?.dataset.stock||0);
    if(!opt||qty<=0)return toast("Enter a wastage quantity greater than 0.");
    const stockDelta=qty/Math.max(packAmount,0.000001);
    const stockBase=stock*Math.max(packAmount,0.000001);
    if(qty>stockBase+0.0000001)return toast(`Not enough stock. Available stock is ${stockBase.toFixed(opt.dataset.baseUnit==='pcs'?0:2)} ${opt.dataset.baseUnit||'unit'}.`);
    const {error}=await sb.rpc("record_wastage",{p_ingredient_id:opt.value,p_quantity_base:qty,p_base_unit:opt.dataset.baseUnit||"unit",p_stock_delta:stockDelta,p_waste_cost:qty*baseCost,p_reason:$("#wReason").value,p_note:$("#wNote").value.trim(),p_wastage_date:$("#wDate").value||today,p_user_id:dataUserId()});
    if(error)return toast(errText(error));
    closeModal();toast("Wastage recorded and inventory deducted.");await navigate("wastage");
  });
  updateWastagePreview();
}
function updateWastagePreview(){
  const select=$("#wItem"),opt=select?.selectedOptions?.[0],qty=Number($("#wQty")?.value||0); if(!opt)return;
  const unit=opt.dataset.baseUnit||"unit",packAmount=Number(opt.dataset.packAmount||1),baseCost=Number(opt.dataset.baseCost||0),stock=Number(opt.dataset.stock||0); const delta=qty/Math.max(packAmount,0.000001),remainingBase=(stock-delta)*Math.max(packAmount,0.000001);
  const hint=$("#wUnitHint"); if(hint)hint.textContent=`Enter amount in ${unit}.`;
  const preview=$("#wPreview"); if(preview)preview.innerHTML=`<div><span>Wastage cost</span><strong>${money(qty*baseCost)}</strong></div><div><span>Stock deduction</span><strong>${qty.toFixed(unit==='pcs'?0:2)} ${unit}</strong></div><div><span>Estimated remaining</span><strong class="${remainingBase<0?'wastage-negative':''}">${remainingBase.toFixed(unit==='pcs'?0:2)} ${unit}</strong></div>`;
}
async function deleteWastage(id){
  if(!isOwner())return toast("Only the owner can delete wastage records.");
  if(!confirm("Delete this wastage record and restore the deducted stock?"))return;
  const {error}=await sb.rpc("delete_wastage",{p_wastage_id:id,p_user_id:dataUserId()});
  if(error)return toast(errText(error));
  toast("Wastage deleted and stock restored.");await navigate("wastage");
}

async function deleteRow(table,id,refresh){
  if(!isOwner())return toast("Only the owner can delete this item.");
  if(!confirm("Delete this item?"))return;
  const {error}=await sb.from(table).delete().eq("id",id).eq("user_id",dataUserId());
  if(error) return toast(errText(error));
  toast("Deleted."); await refresh();
}
async function deleteOrder(id){
  if(!isOwner())return toast("Only the owner can delete orders.");
  if(!confirm("Delete this order? Any inventory deducted by this order will be restored."))return;
  const {data:order,error:oe}=await sb.from("orders").select("id,status,order_number").eq("id",id).eq("user_id",dataUserId()).single();
  if(oe||!order)return toast(errText(oe||new Error("Order not found.")));

  // Preferred path: one atomic database transaction restores stock and deletes the order.
  const {data:rpcResult,error}=await sb.rpc("delete_order_and_restore_inventory",{p_order_id:id,p_user_id:dataUserId()});
  if(!error){
    const restored=Number(rpcResult?.product_inventory_items_restored||0)+Number(rpcResult?.addon_inventory_items_restored||0);
    toast(restored>0?`Order deleted. ${restored} inventory item${restored===1?"":"s"} restored.`:"Order deleted.");
    await navigate(currentPage);
    return;
  }

  // Compatibility fallback for databases where the new RPC has not been installed yet.
  // We restore the exact deduction ledger first, then delete the order.
  const [{data:productRows,error:pe},{data:addonRows,error:ae}]=await Promise.all([
    sb.from("product_inventory_deductions").select("ingredient_id,stock_delta").eq("order_id",id).eq("user_id",dataUserId()),
    sb.from("addon_inventory_deductions").select("ingredient_id,quantity_used").eq("order_id",id).eq("user_id",dataUserId())
  ]);
  if(pe||ae){return toast(`Delete failed: ${errText(error)}. Please run the latest inventory restore SQL once in Supabase.`);}

  const restores=new Map();
  for(const r of (productRows||[])){
    const key=r.ingredient_id;
    restores.set(key,(restores.get(key)||0)+Number(r.stock_delta||0));
  }
  for(const r of (addonRows||[])){
    const key=r.ingredient_id;
    restores.set(key,(restores.get(key)||0)+Number(r.quantity_used||0));
  }
  if(String(order.status).toLowerCase()==="completed" && restores.size===0){
    return toast(`Delete blocked: this completed order has no inventory deduction record. Please run the latest inventory restore SQL in Supabase first.`);
  }

  for(const [ingredientId,delta] of restores){
    const {data:ing,error:ie}=await sb.from("ingredients").select("id,current_stock").eq("id",ingredientId).eq("user_id",dataUserId()).single();
    if(ie||!ing)return toast(`Delete stopped: could not restore inventory for one item. ${errText(ie||new Error("Inventory item not found."))}`);
    const {error:ue}=await sb.from("ingredients").update({current_stock:Number(ing.current_stock||0)+delta}).eq("id",ingredientId).eq("user_id",dataUserId());
    if(ue)return toast(`Delete stopped: inventory could not be restored. ${errText(ue)}`);
  }
  const {error:de}=await sb.from("orders").delete().eq("id",id).eq("user_id",dataUserId());
  if(de)return toast(`Inventory was restored, but the order could not be deleted: ${errText(de)}`);
  toast("Order deleted and inventory restored.");
  await navigate(currentPage);
}
async function fetchKitchenOrder(orderId){
  const [{data:order,error:oe},{data:items,error:ie}]=await Promise.all([
    sb.from("orders").select("*,customers(name,phone,address)").eq("id",orderId).eq("user_id",dataUserId()).single(),
    sb.from("order_items").select("product_id,quantity,unit_price,addons_total,line_total").eq("order_id",orderId).eq("user_id",dataUserId())
  ]);
  if(oe)throw oe;
  if(ie)throw ie;
  const ids=[...(new Set((items||[]).map(x=>x.product_id).filter(Boolean)))];
  let products=[];
  if(ids.length){
    const {data,error}=await sb.from("products").select("id,name").eq("user_id",dataUserId()).in("id",ids);
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
    const {data,error}=await sb.from("orders").select("id").eq("user_id",dataUserId()).in("status",["pending","preparing","ready"]).order("created_at",{ascending:true});
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

async function syncCompletedOrdersToSales(){
  const {data:orders,error:oe}=await sb.from("orders").select("id,status,total,payment_status,payment_method,created_at,order_date").eq("user_id",dataUserId()).ilike("payment_status","paid").order("created_at",{ascending:true});
  if(oe)throw oe;
  if(!orders?.length)return;

  // Prefer exact order_id matching when the migration is installed.
  const probe=await sb.from("sales").select("id,order_id,amount,sale_date,payment_method").eq("user_id",dataUserId());
  if(probe.error){
    const msg=String(probe.error.message||"").toLowerCase();
    if(!(msg.includes("order_id")&&(msg.includes("column")||msg.includes("schema cache"))))throw probe.error;
  }
  const sales=probe.data||[];
  const hasOrderId=!probe.error;
  const used=new Set();
  const exactIds=new Set(hasOrderId?sales.map(x=>x.order_id).filter(Boolean):[]);

  for(const order of orders){
    if(hasOrderId && exactIds.has(order.id)){
      const existing=sales.find(x=>x.order_id===order.id);
      const desired=String(order.order_date||String(order.created_at||"").slice(0,10));
      if(existing && desired && String(existing.sale_date||"")!==desired){
        const {error:updateError}=await sb.from("sales").update({sale_date:desired}).eq("id",existing.id).eq("user_id",dataUserId());
        if(updateError)console.error("Could not update Sales date for order",order.id,updateError);
      }
      continue;
    }
    if(!hasOrderId){
      const date=String(order.order_date||String(order.created_at||"").slice(0,10)),amount=Number(order.total||0),payment=String(order.payment_method||"");
      const match=sales.find((x,i)=>!used.has(i)&&String(x.sale_date||"")===date&&Math.abs(Number(x.amount||0)-amount)<0.0001&&String(x.payment_method||"")===payment);
      if(match){used.add(sales.indexOf(match));continue;}
    }
    try{await createSaleForCompletedOrder(order.id);}catch(e){console.error("Could not sync completed order to Sales",order.id,e);}
  }
}

async function createSaleForCompletedOrder(orderId){
  // Sales are generated from paid orders. Payment is the source of truth for sales recognition.
  const {data:order,error:oe}=await sb.from("orders").select("id,user_id,status,total,payment_status,payment_method,created_at,order_date").eq("id",orderId).eq("user_id",dataUserId()).single();
  if(oe)throw oe;
  if(!order)throw new Error("Order not found.");
  if(String(order.payment_status||"").toLowerCase()!=="paid")return {created:false,reason:"not_paid"};

  // Avoid duplicate sales when Complete is clicked more than once.
  // Newer databases may have order_id on sales; older ones are handled without it.
  let existing=null;
  const byOrder=await sb.from("sales").select("id,order_id").eq("user_id",dataUserId()).eq("order_id",orderId).maybeSingle();
  if(!byOrder.error){
    existing=byOrder.data;
  }else{
    const msg=String(byOrder.error.message||"").toLowerCase();
    const missingOrderId=msg.includes("order_id")&&(msg.includes("column")||msg.includes("schema cache"));
    if(!missingOrderId)throw byOrder.error;
    // Backward-compatible fallback for databases that do not yet have sales.order_id.
    // A matching sale created for the same completed order amount/date is treated as existing.
    const saleDate=String(order.order_date||String(order.created_at||"").slice(0,10));
    const {data:possible,error:pe}=await sb.from("sales").select("id,amount,sale_date").eq("user_id",dataUserId()).eq("sale_date",saleDate);
    if(pe)throw pe;
    existing=(possible||[]).find(x=>Math.abs(Number(x.amount||0)-Number(order.total||0))<0.0001)||null;
  }
  if(existing)return {created:false,reason:"exists",saleId:existing.id};

  const {data:items,error:ie}=await sb.from("order_items").select("quantity,unit_cost").eq("order_id",orderId).eq("user_id",dataUserId());
  if(ie)throw ie;
  const cost=(items||[]).reduce((sum,x)=>sum+Number(x.quantity||0)*Number(x.unit_cost||0),0);
  const amount=Number(order.total||0);
  const saleDate=String(order.order_date||String(order.created_at||new Date().toISOString()).slice(0,10));
  const payload={user_id:dataUserId(),sale_date:saleDate,amount:Number(amount.toFixed(2)),cost:Number(cost.toFixed(2)),profit:Number((amount-cost).toFixed(2)),payment_method:order.payment_method||null};
  const insertWithOrder=await sb.from("sales").insert({...payload,order_id:orderId}).select("id").single();
  if(!insertWithOrder.error)return {created:true,saleId:insertWithOrder.data?.id};
  const msg=String(insertWithOrder.error.message||"").toLowerCase();
  const missingOrderId=msg.includes("order_id")&&(msg.includes("column")||msg.includes("schema cache"));
  if(!missingOrderId)throw insertWithOrder.error;
  const fallback=await sb.from("sales").insert(payload).select("id").single();
  if(fallback.error)throw fallback.error;
  return {created:true,saleId:fallback.data?.id};
}

async function openOrderEditModal(orderId){
  const [{data:order,error:oe},{data:customers,error:ce},{data:items,error:ie},{data:allProducts,error:pe}]=await Promise.all([
    sb.from("orders").select("*").eq("id",orderId).eq("user_id",dataUserId()).single(),
    sb.from("customers").select("id,name").eq("user_id",dataUserId()).order("name"),
    sb.from("order_items").select("id,order_id,product_id,quantity,unit_price,unit_cost,addons_total,line_total").eq("order_id",orderId).eq("user_id",dataUserId()),
    sb.from("products").select("id,name,selling_price,calculated_cost,active").eq("user_id",dataUserId()).eq("active",true).order("name")
  ]);
  if(oe)return toast(errText(oe)); if(ce)return toast(errText(ce)); if(ie)return toast(errText(ie)); if(pe)return toast(errText(pe));
  const products=allProducts||[];
  const productMap=Object.fromEntries(products.map(p=>[p.id,p.name]));
  window.__orderEditNewItems=[];
  window.__orderEditProducts=products;
  const status=String(order.status||"pending");
  const itemRows=(items||[]).map((i,idx)=>`<div class="order-edit-item order-edit-existing-item" data-item-id="${i.id}" data-old-qty="${Number(i.quantity||0)}" data-unit-price="${Number(i.unit_price||0)}" data-addons-total="${Number(i.addons_total||0)}">
    <div><strong>${esc(productMap[i.product_id]||"Product")}</strong><div class="muted small">${money(i.unit_price)} each${Number(i.addons_total||0)?` · add-ons ${money(Number(i.addons_total||0)/Math.max(1,Number(i.quantity||1)))}/pcs`:""}</div></div>
    <input class="order-edit-qty" type="number" min="${isStaff()?Math.max(0,Number(i.quantity||0)):0}" step="1" value="${Number(i.quantity||0)}" ${isStaff()?'data-staff-protected="1"':''} aria-label="Quantity for ${esc(productMap[i.product_id]||"Product")}" ${isStaff()?'title="Staff can only increase quantities"':''}>
  </div>`).join("") || `<div class="empty order-edit-empty">No items in this order.</div>`;
  const completed=status==="completed";
  // New items are allowed even for completed orders. For completed orders,
  // inventory is deducted only for the newly-added product quantity. Existing
  // inventory deductions are never repeated.
  openModal(`Edit Order · ${esc(order.order_number)}`,`<form id="orderEditForm" class="form-grid order-edit-form">
    <label>Order type<select id="eoOrderType" onchange="toggleEditOrderTypeFields()"><option value="walk_in" ${orderTypeOf(order)==="walk_in"?"selected":""}>Walk-in</option><option value="pre_order" ${orderTypeOf(order)==="pre_order"?"selected":""}>Pre-order</option></select></label>
    <label id="eoScheduledWrap" class="${orderTypeOf(order)==="pre_order"?"":"hidden"}">Pre-order date<div class="english-date-field"><input id="eoScheduledDate" type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="YYYY-MM-DD" value="${esc(order.scheduled_date||order.order_date||String(order.created_at||"").slice(0,10))}"><button type="button" class="date-picker-btn" data-date-target="eoScheduledDate" aria-label="Choose date" title="Choose date">▣</button></div></label>
    <label>Customer<select id="eoCustomer"><option value="">Walk-in</option>${(customers||[]).map(c=>`<option value="${c.id}" ${String(c.id)===String(order.customer_id||"")?"selected":""}>${esc(c.name)}</option>`).join("")}</select></label>
    <label>Status<select id="eoStatus" ${completed?'disabled title="Completed orders cannot be moved back because inventory has already been deducted."':''}><option value="pending" ${status==="pending"?"selected":""}>Pending</option><option value="preparing" ${status==="preparing"?"selected":""}>Preparing</option><option value="ready" ${status==="ready"?"selected":""}>Ready</option><option value="completed" ${status==="completed"?"selected":""}>Completed</option></select></label>
    <label>Payment method<select id="eoPayment"><option value="">Not set</option><option ${order.payment_method==="Cash"?"selected":""}>Cash</option><option ${order.payment_method==="Bank transfer"?"selected":""}>Bank transfer</option><option ${order.payment_method==="Card"?"selected":""}>Card</option></select></label>
    <label>Payment status<select id="eoPaymentStatus"><option value="unpaid" ${String(order.payment_status||"unpaid").toLowerCase()==="unpaid"?"selected":""}>Unpaid</option><option value="paid" ${String(order.payment_status||"").toLowerCase()==="paid"?"selected":""}>Paid</option><option value="partial" ${String(order.payment_status||"")==="partial"?"selected":""}>Partial</option></select></label>
    <label>Discount<input id="eoDiscount" type="number" step="0.01" min="${isStaff()?Number(order.discount||0):0}" value="${Number(order.discount||0)}" ${isStaff()?'disabled title="Staff cannot reduce an order discount"':''}></label>
    <label>Delivery<input id="eoDelivery" type="number" step="0.01" min="${isStaff()?Number(order.delivery_fee||0):0}" value="${Number(order.delivery_fee||0)}" ${isStaff()?'title="Staff cannot reduce the delivery fee"':''}></label>
    <label class="wide">Note<textarea id="eoNote">${esc(order.notes||"")}</textarea></label>
    <div class="wide order-edit-items-section"><div class="order-edit-section-head"><div><strong>Order items</strong><span class="muted small">${isStaff()?"Staff can increase item quantities, but cannot reduce or remove existing items.":"Edit quantities here. Set 0 to remove an item."} Add-ons already saved on each item are preserved.</span></div><strong id="eoSubtotal">Subtotal ${money(order.subtotal)}</strong></div><div class="order-edit-items">${itemRows}</div></div>
    <div class="wide order-edit-items-section" style="margin-top:12px;"><div class="order-edit-section-head"><div><strong>Add new items</strong><span class="muted small">${completed?'Completed order: newly added items will deduct inventory once.':'Add another product directly to this order.'}</span></div></div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) 110px auto;gap:10px;align-items:end;">
        <label>Product<select id="eoNewProduct"><option value="">Select product...</option>${products.map(p=>`<option value="${p.id}">${esc(p.name)} · ${money(p.selling_price)}</option>`).join('')}</select></label>
        <label>Qty<input id="eoNewQty" type="number" min="1" step="1" value="1"></label>
        <button type="button" class="btn btn-dark" onclick="addEditOrderItem()">+ Add item</button>
      </div>
      <div id="eoNewItems" class="order-edit-items" style="margin-top:10px;"></div>
    </div>
    <div class="wide order-edit-total"><span>Total</span><strong id="eoTotal">${money(order.total)}</strong></div>
  </form>`,async()=>{
    const saveOrderId=String(orderId??"").trim();
    const saveUserId=String(dataUserId()??"").trim();
    const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if(!uuidPattern.test(saveOrderId)) return toast("Cannot save: this order has an invalid ID. Please close and reopen the order.");
    if(!uuidPattern.test(saveUserId)) return toast("Cannot save: your account session is invalid. Please log in again.");
    const discount=Math.max(0,Number($("#eoDiscount").value||0)),delivery=Math.max(0,Number($("#eoDelivery").value||0));
    if(isStaff() && discount < Number(order.discount||0)) return toast("Staff cannot reduce the order discount.");
    if(isStaff() && delivery < Number(order.delivery_fee||0)) return toast("Staff cannot reduce the delivery fee.");
    const itemEls=[...document.querySelectorAll(".order-edit-existing-item")];
    let subtotal=0;
    for(const el of itemEls){
      const itemId=el.dataset.itemId, oldQty=Math.max(0,Number(el.dataset.oldQty||0)), unitPrice=Number(el.dataset.unitPrice||0), oldAddonsTotal=Number(el.dataset.addonsTotal||0), qty=Math.max(0,Math.floor(Number(el.querySelector(".order-edit-qty")?.value||0)));
      if(isStaff() && qty<oldQty) return toast("Staff cannot reduce or remove existing order items.");
      const addonPerUnit=oldQty>0?oldAddonsTotal/oldQty:0;
      const addonsTotal=qty*addonPerUnit, lineTotal=qty*(unitPrice+addonPerUnit);
      subtotal+=lineTotal;
      if(qty===0){
        if(!isOwner()) return toast("Staff cannot remove order items.");
        const {error}=await sb.from("order_items").delete().eq("id",itemId).eq("user_id",dataUserId());if(error)return toast(errText(error));
      } else {
        const {error}=await sb.from("order_items").update({quantity:qty,addons_total:Number(addonsTotal.toFixed(2)),line_total:Number(lineTotal.toFixed(2))}).eq("id",itemId).eq("user_id",dataUserId());if(error)return toast(errText(error));
      }
    }
    const insertedNewItemIds=[];
    for(const item of (window.__orderEditNewItems||[])){
      const uid=dataUserId();
      const productId=String(item?.productId||"").trim();
      if(!uid) return toast("Your session has expired. Please log in again.");
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) return toast(`Could not add ${item?.name||"item"}: product ID is invalid.`);
      const qty=Math.max(1,Math.floor(Number(item.qty||1)));
      const unitPrice=Number(item.price||0), unitCost=Number(item.cost||0);
      const lineTotal=Number((qty*unitPrice).toFixed(2));
      const {data:inserted,error}=await sb.from("order_items").insert({user_id:uid,order_id:orderId,product_id:productId,quantity:qty,unit_price:unitPrice,unit_cost:unitCost,addons_total:0,line_total:lineTotal}).select("id").single();
      if(error){
        if(insertedNewItemIds.length) await sb.from("order_items").delete().in("id",insertedNewItemIds).eq("user_id",dataUserId());
        return toast(errText(error));
      }
      insertedNewItemIds.push(inserted.id);
      // A completed order already had its original inventory deducted.
      // Deduct inventory only for this newly inserted product quantity.
      if(completed){
        const invResult=await deductInventoryForAddedProduct(orderId,item.productId,qty);
        if(invResult.error){
          if(insertedNewItemIds.length) await sb.from("order_items").delete().in("id",insertedNewItemIds).eq("user_id",dataUserId());
          return toast(`Could not add item: ${errText(invResult.error)}`);
        }
      }
      subtotal+=lineTotal;
    }
    subtotal=Number(subtotal.toFixed(2));
    const total=Number(Math.max(0,subtotal-discount+delivery).toFixed(2));
    const newStatus=completed?"completed":String($("#eoStatus").value||status);
    const shouldComplete=!completed && newStatus==="completed";
    // Keep the order in its current non-completed state until complete_order runs,
    // so inventory is deducted exactly once by the existing completion RPC.
    // Sanitize UUID-backed form values before sending them to Postgres.
    // Some older customer records/forms can surface the literal string "undefined";
    // sending that to a UUID column makes Supabase reject the entire save.
    const isUuidValue=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||"").trim());
    const selectedCustomer=String($("#eoCustomer")?.value||"").trim();
    const safeCustomerId=isUuidValue(selectedCustomer)?selectedCustomer:null;
    const safeOrderId=saveOrderId;
    const safeUserId=saveUserId;
    const editOrderType=orderTypeOf({order_type:String($("#eoOrderType")?.value||orderTypeOf(order))});
    const editScheduledDate=String($("#eoScheduledDate")?.value||order.scheduled_date||order.order_date||localDate()).trim();
    if(editOrderType==="pre_order" && !/^\d{4}-\d{2}-\d{2}$/.test(editScheduledDate)) return toast("Please enter the pre-order date as YYYY-MM-DD.");
    // Walk-in always belongs to today's business date. Never preserve an old
    // order_date when the order is saved as Walk-in.
    const rawDate=editOrderType==="walk_in"?localDate():editScheduledDate;
    const payload={customer_id:safeCustomerId,order_type:editOrderType,scheduled_date:editOrderType==="pre_order"?editScheduledDate:null,order_date:rawDate,status:shouldComplete?status:newStatus,payment_method:$("#eoPayment").value||null,payment_status:$("#eoPaymentStatus").value||"unpaid",discount,delivery_fee:delivery,subtotal,total,notes:$("#eoNote").value.trim()||null};
    const {data:updated,error}=await sb.from("orders").update(payload).eq("id",safeOrderId).eq("user_id",safeUserId).select().single();
    if(error)return toast(errText(error));
    if(shouldComplete){
      const {error:completeError}=await sb.rpc("complete_order_and_deduct_inventory",{p_order_id:orderId,p_user_id:dataUserId()});
      if(completeError)return toast("Order updated, but completion failed: "+errText(completeError));
          }
    if(String(payload.payment_status||"").toLowerCase()==="paid"){
      try{await createSaleForCompletedOrder(orderId);}catch(e){console.error(e);toast("Order saved, but Sales sync failed: "+errText(e));}
      const linked=await sb.from("sales").select("id").eq("user_id",dataUserId()).eq("order_id",orderId);
      if(!linked.error && linked.data?.length){
        const {data:oi}=await sb.from("order_items").select("quantity,unit_cost").eq("order_id",orderId).eq("user_id",dataUserId());
        const cost=(oi||[]).reduce((sum,x)=>sum+Number(x.quantity||0)*Number(x.unit_cost||0),0);
        await sb.from("sales").update({sale_date:payload.order_date,amount:total,cost:Number(cost.toFixed(2)),profit:Number((total-cost).toFixed(2)),payment_method:payload.payment_method||null}).eq("order_id",orderId).eq("user_id",dataUserId());
      }
    }
    closeModal();toast("Order updated.");await navigate(currentPage);
  },"order-edit-modal");
  const refreshEditOrderTotals=()=>{
    let subtotal=0;
    document.querySelectorAll(".order-edit-item").forEach(row=>{const qty=Math.max(0,Number(row.querySelector(".order-edit-qty")?.value||0));const unit=Number(row.dataset.unitPrice||0);const old=Number(row.dataset.oldQty||0);const addons=Number(row.dataset.addonsTotal||0);subtotal+=qty*(unit+(old>0?addons/old:0));});
    (window.__orderEditNewItems||[]).forEach(item=>subtotal+=Number(item.qty||0)*Number(item.price||0));
    subtotal=Number(subtotal.toFixed(2));const total=Math.max(0,subtotal-Number($("#eoDiscount")?.value||0)+Number($("#eoDelivery")?.value||0));$("#eoSubtotal").textContent=`Subtotal ${money(subtotal)}`;$("#eoTotal").textContent=money(total);
  };
  window.__refreshEditOrderTotals=refreshEditOrderTotals;
  document.querySelectorAll(".order-edit-qty,#eoDiscount,#eoDelivery").forEach(el=>el.addEventListener("input",refreshEditOrderTotals));
}

function addEditOrderItem(){
  const select=$("#eoNewProduct"), qtyEl=$("#eoNewQty");
  if(!select||!select.value)return toast("Please select a product.");
  const p=(window.__orderEditProducts||[]).find(x=>String(x.id)===String(select.value));
  if(!p)return toast("Product not found.");
  const qty=Math.max(1,Math.floor(Number(qtyEl?.value||1)));
  const existing=(window.__orderEditNewItems||[]).find(x=>x.productId===p.id);
  if(existing) existing.qty+=qty; else (window.__orderEditNewItems||[]).push({productId:p.id,name:p.name,price:Number(p.selling_price||0),cost:Number(p.calculated_cost||0),qty});
  renderEditOrderNewItems();
  if(window.__refreshEditOrderTotals)window.__refreshEditOrderTotals();
  select.value=""; if(qtyEl)qtyEl.value="1";
}
function renderEditOrderNewItems(){
  const root=$("#eoNewItems"); if(!root)return;
  root.innerHTML=(window.__orderEditNewItems||[]).length?(window.__orderEditNewItems||[]).map((item,i)=>`<div class="order-edit-item order-edit-new-item"><div><strong>${esc(item.name)}</strong><div class="muted small">${money(item.price)} each · New item</div></div><div style="display:flex;align-items:center;gap:10px"><input class="order-edit-qty" type="number" min="1" step="1" value="${item.qty}" onchange="updateEditOrderNewQty(${i},this.value)"><button type="button" class="btn btn-danger" onclick="removeEditOrderNewItem(${i})">Remove</button></div></div>`).join(""):'';
}
function updateEditOrderNewQty(index,value){const item=(window.__orderEditNewItems||[])[index];if(!item)return;item.qty=Math.max(1,Math.floor(Number(value||1)));renderEditOrderNewItems();if(window.__refreshEditOrderTotals)window.__refreshEditOrderTotals();}
function removeEditOrderNewItem(index){(window.__orderEditNewItems||[]).splice(index,1);renderEditOrderNewItems();if(window.__refreshEditOrderTotals)window.__refreshEditOrderTotals();}

async function deductInventoryForAddedProduct(orderId,productId,quantity){
  try{
    const uid=dataUserId();
    const pid=String(productId??'').trim();
    const oid=String(orderId??'').trim();
    if(!uid) throw new Error('Your session has expired. Please log in again.');
    if(!pid || pid==='undefined' || pid==='null') throw new Error('The selected product has no valid product ID. Please select the product again.');
    if(!oid || oid==='undefined' || oid==='null') throw new Error('This order has no valid order ID. Please close and reopen the order.');
    const qty=Math.max(1,Math.floor(Number(quantity||1)));

    const {data:recipes,error:recipeError}=await sb.from('nuonuo_product_recipe_items')
      .select('id,ingredient_id,subrecipe_id,component_type,quantity')
      .eq('user_id',uid).eq('product_id',pid);
    if(recipeError) throw new Error('Recipe lookup failed: '+errText(recipeError));
    if(!recipes?.length) return {ok:true};

    const [{data:subItems,error:subError},{data:subrecipes,error:subrecipeError}]=await Promise.all([
      sb.from('nuonuo_subrecipe_items').select('id,subrecipe_id,ingredient_id,child_subrecipe_id,quantity').eq('user_id',uid),
      sb.from('nuonuo_subrecipes').select('id,name,yield_quantity,yield_unit').eq('user_id',uid)
    ]);
    if(subError && !isMissingSupabaseTable(subError,'nuonuo_subrecipe_items')) throw new Error('Sub-recipe lookup failed: '+errText(subError));
    if(subrecipeError && !isMissingSupabaseTable(subrecipeError,'nuonuo_subrecipes')) throw new Error('Sub-recipe definition lookup failed: '+errText(subrecipeError));

    const subMap=new Map();
    for(const r of (subItems||[])){
      const sid=String(r.subrecipe_id??'').trim();
      if(!sid || sid==='undefined' || sid==='null') continue;
      if(!subMap.has(sid)) subMap.set(sid,[]);
      subMap.get(sid).push(r);
    }
    const subMeta=new Map((subrecipes||[]).map(r=>[String(r.id),r]));
    const expanded=new Map();
    const visiting=new Set();
    const addIngredient=(id,amount)=>{
      const iid=String(id??'').trim();
      if(iid && iid!=='undefined' && iid!=='null' && amount>0) expanded.set(iid,(expanded.get(iid)||0)+amount);
    };
    // A sub-recipe's component quantities describe the FULL yield/batch of that
    // sub-recipe. When a product uses only a few grams of it, scale every
    // component by requestedAmount / subRecipeYieldBaseAmount.
    const expandSubrecipe=(subId,requestedBaseAmount)=>{
      const sid=String(subId??'').trim();
      if(!sid || sid==='undefined' || sid==='null' || requestedBaseAmount<=0)return;
      if(visiting.has(sid))throw new Error('A circular sub-recipe was detected. Please fix the recipe before adding this item.');
      const meta=subMeta.get(sid);
      const yieldAmount=yieldTotalBaseAmount(meta);
      if(!meta || !Number.isFinite(yieldAmount) || yieldAmount<=0){
        throw new Error('Sub-recipe yield is missing or invalid. Please open the sub-recipe and set a valid yield quantity and unit.');
      }
      const factor=Number(requestedBaseAmount)/yieldAmount;
      if(!Number.isFinite(factor) || factor<=0)return;
      visiting.add(sid);
      for(const r of (subMap.get(sid)||[])){
        const componentAmount=Number(r.quantity||0)*factor;
        if(r.ingredient_id)addIngredient(r.ingredient_id,componentAmount);
        else if(r.child_subrecipe_id)expandSubrecipe(r.child_subrecipe_id,componentAmount);
      }
      visiting.delete(sid);
    };
    for(const r of recipes){
      const q=Number(r.quantity||0)*qty;
      const type=String(r.component_type||((r.subrecipe_id||r.sub_recipe_id)?'subrecipe':'ingredient')).toLowerCase();
      if(type==='subrecipe' || r.subrecipe_id || r.sub_recipe_id) expandSubrecipe(r.subrecipe_id||r.sub_recipe_id,q);
      else addIngredient(r.ingredient_id,q);
    }
    if(!expanded.size)return {ok:true};

    const ids=[...expanded.keys()];
    const {data:ingredients,error:ingError}=await sb.from('ingredients')
      .select('id,name,unit,item_type,current_stock').eq('user_id',uid).in('id',ids);
    if(ingError) throw new Error('Inventory lookup failed: '+errText(ingError));
    const byId=Object.fromEntries((ingredients||[]).map(x=>[String(x.id),x]));
    const deductions=[];
    for(const [id,baseQty] of expanded){
      const ing=byId[id];
      if(!ing) throw new Error('Inventory item not found for this product recipe.');
      const stockDelta=ing.item_type==='packaging' ? Number(baseQty) : Number(baseQty)/Math.max(Number(parseMeasureUnit(ing.unit).amount)||1,0.000001);
      if(!Number.isFinite(stockDelta)||stockDelta<0) throw new Error(`Invalid inventory quantity for ${ing.name}.`);
      const stock=Number(ing.current_stock||0);
      if(stock+1e-9<stockDelta) throw new Error(`Not enough inventory for ${ing.name}. Required ${stockDelta.toFixed(3)} pack/unit, available ${stock.toFixed(3)}.`);
      deductions.push({ingredientId:id,stockDelta:Number(stockDelta.toFixed(6)),oldStock:stock});
    }

    const changed=[];
    try{
      for(const d of deductions){
        const {error}=await sb.from('ingredients').update({current_stock:Number((d.oldStock-d.stockDelta).toFixed(6))}).eq('id',d.ingredientId).eq('user_id',uid);
        if(error) throw new Error('Inventory update failed: '+errText(error));
        changed.push(d);
      }
    }catch(error){
      for(const c of changed){
        await sb.from('ingredients').update({current_stock:c.oldStock}).eq('id',c.ingredientId).eq('user_id',uid);
      }
      throw error;
    }

    // Do not let an optional history/ledger table prevent the order itself from saving.
    // The actual stock deduction above is the source of truth for this newly-added item.
    for(const d of deductions){
      try{
        await sb.from('product_inventory_deductions').insert({user_id:uid,order_id:oid,ingredient_id:d.ingredientId,stock_delta:d.stockDelta});
      }catch(e){ console.warn('Optional inventory deduction ledger unavailable:',e); }
    }
    return {ok:true};
  }catch(error){return {ok:false,error};}
}
async function openOrderDateEditor(orderId,currentDate){
  const current=String(currentDate||localDate()).slice(0,10);
  const value=window.prompt("Order date (YYYY-MM-DD)",current);
  if(value===null)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return toast("Please enter the date as YYYY-MM-DD.");
  const {error}=await sb.from("orders").update({order_date:value}).eq("id",orderId).eq("user_id",dataUserId());
  if(error)return toast(errText(error));
  // Keep Sales aligned with the business/order date immediately.
  const linked=await sb.from("sales").select("id").eq("user_id",dataUserId()).eq("order_id",orderId);
  if(!linked.error && linked.data?.length){
    const {error:saleError}=await sb.from("sales").update({sale_date:value}).eq("order_id",orderId).eq("user_id",dataUserId());
    if(saleError)console.error("Could not update linked Sales date:",saleError);
  }
  toast("Order date updated. Sales will use this date.");
  await navigate(currentPage);
}

async function deductAddonInventoryForOrder(orderId){
  const {data,error}=await sb.rpc("deduct_addon_inventory",{p_order_id:orderId,p_user_id:dataUserId()});
  if(error)throw error;
  return data;
}

async function completeOrder(id){
  if(!confirm("Complete this order? Inventory will be deducted."))return;
  const {data:completion,error}=await sb.rpc("complete_order_and_deduct_inventory",{p_order_id:id,p_user_id:dataUserId()});
  if(error)return toast(errText(error));
    try{
    await createSaleForCompletedOrder(id);
  }catch(e){
    console.error("Sale creation failed after completing order:",e);
    return toast("Order completed, but Sales could not be created: "+errText(e));
  }
  toast(completion?.components_deducted ? `Order completed. ${completion.components_deducted} inventory item${completion.components_deducted===1?"":"s"} deducted.` : "Order completed. No inventory recipe was found.");
  await navigate(currentPage);
}


function purchaseLineHtml(idx, item={}){
  const ingredients=window.__purchaseIngredients||[];
  return `<div class="purchase-line" data-purchase-line="${idx}"><div style="display:flex;gap:8px;align-items:center;flex:1"><select class="purchase-ing" style="flex:1">${ingredients.map(i=>`<option value="${i.id}" ${String(i.id)===String(item.ingredient_id||'')?'selected':''}>${esc(i.name)} · ${esc(inventoryTypeLabel(i.item_type))} · ${esc(i.item_type==='ingredient'?(i.unit||'unit'):'pcs')}</option>`).join('')}</select><button type="button" class="btn" onclick="openQuickPurchaseItemModal()">+ New Item</button></div><input class="purchase-qty" type="number" min="0.001" step="0.001" value="${Number(item.quantity||1)}" placeholder="Qty"><input class="purchase-cost" type="number" min="0" step="0.0001" value="${Number(item.unit_cost||0)}" placeholder="Unit cost"><label class="inline-check"><input class="purchase-update-cost" type="checkbox" ${item.update_current_cost!==false?'checked':''}> Update current cost</label><button type="button" class="btn btn-danger" onclick="this.closest('.purchase-line').remove();updatePurchaseTotal()">×</button></div>`;
}
function updatePurchaseTotal(){const rows=[...document.querySelectorAll('.purchase-line')];const total=rows.reduce((a,r)=>a+Number(r.querySelector('.purchase-qty')?.value||0)*Number(r.querySelector('.purchase-cost')?.value||0),0);const el=document.getElementById('purchaseTotal');if(el)el.textContent=money(total);}
function bindPurchaseInputs(){document.querySelectorAll('.purchase-qty,.purchase-cost').forEach(x=>x.addEventListener('input',updatePurchaseTotal));initEnglishDateField('pDate');}
function snapshotPurchaseDraft(){
  return {
    number:$('#pNumber')?.value||`PO-${Date.now().toString().slice(-6)}`,
    date:$('#pDate')?.value||localDate(),supplier:$('#pSupplier')?.value||'',status:$('#pStatus')?.value||'ordered',payment:$('#pPayment')?.value||'unpaid',notes:$('#pNotes')?.value||'',
    lines:[...document.querySelectorAll('.purchase-line')].map(r=>({ingredient_id:r.querySelector('.purchase-ing')?.value||'',quantity:Number(r.querySelector('.purchase-qty')?.value||1),unit_cost:Number(r.querySelector('.purchase-cost')?.value||0),update_current_cost:!!r.querySelector('.purchase-update-cost')?.checked}))
  };
}
async function openPurchaseModal(draft=null){
  const suppliers=window.__purchaseSuppliers||[]; const ingredients=window.__purchaseIngredients||[];
  if(!ingredients.length){
    const body=`<div class="notice"><strong>No inventory items yet.</strong><div class="small muted" style="margin-top:6px">Add your first ingredient, packaging, kitchenware, electronic equipment or equipment below, then continue the purchase.</div></div>`;
    openModal('New Purchase',body,async()=>{closeModal();await openInventoryItemModal({returnToPurchase:true});},'purchase-modal');
    return;
  }
  const d=draft||{}; const defaultSupplier=d.supplier||suppliers[0]?.id||'';
  const initialLines=d.lines?.length?d.lines:[{}];
  const body=`<form id="purchaseForm" class="form-grid"><label>Purchase Number<input id="pNumber" value="${esc(d.number||`PO-${Date.now().toString().slice(-6)}`)}" required></label><label>Date<div class="english-date-field"><input id="pDate" type="text" inputmode="numeric" maxlength="10" placeholder="YYYY-MM-DD" value="${esc(d.date||localDate())}" required><button type="button" class="date-picker-btn">▣</button></div></label><label>Supplier<select id="pSupplier"><option value="">No supplier</option>${suppliers.map(s=>`<option value="${s.id}" ${s.id===defaultSupplier?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>Status<select id="pStatus"><option value="draft" ${d.status==='draft'?'selected':''}>Draft</option><option value="ordered" ${!d.status||d.status==='ordered'?'selected':''}>Ordered</option><option value="partial" ${d.status==='partial'?'selected':''}>Partial</option><option value="received" ${d.status==='received'?'selected':''}>Received</option></select></label><label>Payment Status<select id="pPayment"><option value="unpaid" ${d.payment==='unpaid'?'selected':''}>Unpaid</option><option value="partial" ${d.payment==='partial'?'selected':''}>Partial</option><option value="paid" ${d.payment==='paid'?'selected':''}>Paid</option></select></label><label class="wide">Notes<textarea id="pNotes">${esc(d.notes||'')}</textarea></label><div class="wide"><div class="page-head compact"><div><strong>Items</strong><div class="muted small">Change quantity or unit cost. Total updates automatically.</div></div><button type="button" class="btn" onclick="addPurchaseLine()">+ Item</button></div><div id="purchaseLines">${initialLines.map((x,i)=>purchaseLineHtml(i,x)).join('')}</div><div class="purchase-total-row"><span>Total</span><strong id="purchaseTotal">RM 0.00</strong></div></div></form>`;
  openModal(d.editId?'Edit Purchase':'New Purchase',body,async()=>{
    const lines=[...document.querySelectorAll('.purchase-line')].map(r=>({ingredient_id:r.querySelector('.purchase-ing')?.value,quantity:Number(r.querySelector('.purchase-qty')?.value||0),unit_cost:Number(r.querySelector('.purchase-cost')?.value||0),update_current_cost:!!r.querySelector('.purchase-update-cost')?.checked})).filter(x=>x.ingredient_id&&x.quantity>0);
    if(!lines.length)return toast('Add at least one purchase item.');
    const total=Number(lines.reduce((a,x)=>a+x.quantity*x.unit_cost,0).toFixed(2));
    const payload={user_id:dataUserId(),supplier_id:$('#pSupplier').value||null,purchase_number:$('#pNumber').value.trim(),purchase_date:$('#pDate').value,status:$('#pStatus').value,payment_status:$('#pPayment').value,subtotal:total,notes:$('#pNotes').value.trim()||null,updated_at:new Date().toISOString()};
    if(d.editId){
      const {error:pe}=await sb.from('purchase_orders').update(payload).eq('id',d.editId).eq('user_id',dataUserId());
      if(pe)return toast(errText(pe));
      const {error:de}=await sb.from('purchase_items').delete().eq('purchase_id',d.editId).eq('user_id',dataUserId());
      if(de)return toast(errText(de));
      const {error:ie}=await sb.from('purchase_items').insert(lines.map(x=>({...x,user_id:dataUserId(),purchase_id:d.editId})));if(ie)return toast(errText(ie));
      closeModal();toast('Purchase updated.');await navigate('purchasing');return;
    }
    const {data:po,error:pe}=await sb.from('purchase_orders').insert(payload).select().single();
    if(pe)return toast(errText(pe));
    const {error:ie}=await sb.from('purchase_items').insert(lines.map(x=>({...x,user_id:dataUserId(),purchase_id:po.id})));if(ie){await sb.from('purchase_orders').delete().eq('id',po.id).eq('user_id',dataUserId());return toast(errText(ie));}
    closeModal();toast('Purchase saved. Receive it when the stock arrives.');await navigate('purchasing');
  },'purchase-modal');bindPurchaseInputs();updatePurchaseTotal();
}
function addPurchaseLine(){const host=document.getElementById('purchaseLines');if(!host)return;host.insertAdjacentHTML('beforeend',purchaseLineHtml(document.querySelectorAll('.purchase-line').length,{}));bindPurchaseInputs();}
function addQuickPurchaseLineWithItem(id){
  const host=document.getElementById('purchaseLines');if(!host)return;
  host.insertAdjacentHTML('beforeend',purchaseLineHtml(document.querySelectorAll('.purchase-line').length,{ingredient_id:id,quantity:1,unit_cost:0,update_current_cost:true}));
  bindPurchaseInputs();
  const rows=document.querySelectorAll('.purchase-line');rows[rows.length-1]?.scrollIntoView({behavior:'smooth',block:'center'});
}
async function openQuickPurchaseItemModal(){
  const draft=snapshotPurchaseDraft();
  await openInventoryItemModal({returnToPurchase:true,purchaseDraft:draft});
}
async function editPurchase(id){
  const {data:p,error}=await sb.from('purchase_orders').select('*,suppliers(name)').eq('id',id).eq('user_id',dataUserId()).single();
  if(error)return toast(errText(error));
  const {data:items,error:ie}=await sb.from('purchase_items').select('*').eq('purchase_id',id).eq('user_id',dataUserId()).order('created_at',{ascending:true});
  if(ie)return toast(errText(ie));
  const draft={editId:p.id,number:p.purchase_number,date:p.purchase_date,supplier:p.supplier_id||'',status:p.status||'ordered',payment:p.payment_status||'unpaid',notes:p.notes||'',lines:(items||[]).map(i=>({ingredient_id:i.ingredient_id,quantity:Number(i.quantity||0),unit_cost:Number(i.unit_cost||0),update_current_cost:i.update_current_cost!==false}))};
  await openPurchaseModal(draft);
}
async function viewPurchase(id){
  const {data:p,error}=await sb.from('purchase_orders').select('*,suppliers(name)').eq('id',id).eq('user_id',dataUserId()).single();if(error)return toast(errText(error));
  const {data:items,error:ie}=await sb.from('purchase_items').select('*,ingredients(name,unit)').eq('purchase_id',id).eq('user_id',dataUserId());if(ie)return toast(errText(ie));
  const rows=(items||[]).map(i=>`<tr><td>${esc(i.ingredients?.name||'')}</td><td>${Number(i.quantity||0)}</td><td>${Number(i.received_quantity||0)}</td><td>${money(i.unit_cost)}</td><td>${money(i.total_cost)}</td></tr>`).join('');
  openModal(`Purchase ${esc(p.purchase_number)}`,`<div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Received</th><th>Unit Cost</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div><div class="mini-stat-grid"><div><span>Supplier</span><strong>${esc(p.suppliers?.name||'No supplier')}</strong></div><div><span>Date</span><strong>${esc(p.purchase_date)}</strong></div><div><span>Status</span><strong>${esc(p.status)}</strong></div><div><span>Total</span><strong>${money(p.subtotal)}</strong></div></div>`,closeModal,'view-modal purchase-detail-modal');
}
async function receivePurchase(id){
  if(!confirm('Receive this purchase? Inventory will increase by the outstanding quantities.'))return;
  const {data,error}=await sb.rpc('nuonuo_purchase_receive',{p_purchase_id:id});if(error)return toast(errText(error));
  toast(`Purchase received. Inventory increased by ${money(data?.received_cost||0)} of stock cost.`);await navigate('purchasing');
}
async function deletePurchase(id){if(!isOwner())return toast('Only the owner can delete purchases.');if(!confirm('Delete this purchase? Received inventory will not be reversed automatically.'))return;const {error}=await sb.from('purchase_orders').delete().eq('id',id).eq('user_id',dataUserId());if(error)return toast(errText(error));toast('Purchase deleted.');await navigate('purchasing');}
async function openSupplierModal(item=null){
  const x=item||{};
  openModal(item?'Edit Supplier':'Add Supplier',`<form id="supplierForm" class="form-grid"><label>Name<input id="sName" value="${esc(x.name||'')}" required></label><label>Contact Person<input id="sContact" value="${esc(x.contact_person||'')}"></label><label>Phone<input id="sPhone" value="${esc(x.phone||'')}"></label><label>Email<input id="sEmail" type="email" value="${esc(x.email||'')}"></label><label>Payment Terms<input id="sTerms" placeholder="e.g. COD / 30 days" value="${esc(x.payment_terms||'')}"></label><label class="wide">Address<textarea id="sAddress">${esc(x.address||'')}</textarea></label><label class="wide">Notes<textarea id="sNotes">${esc(x.notes||'')}</textarea></label></form>`,async()=>{const payload={user_id:dataUserId(),name:$('#sName').value.trim(),contact_person:$('#sContact').value.trim()||null,phone:$('#sPhone').value.trim()||null,email:$('#sEmail').value.trim()||null,payment_terms:$('#sTerms').value.trim()||null,address:$('#sAddress').value.trim()||null,notes:$('#sNotes').value.trim()||null,updated_at:new Date().toISOString()};if(!payload.name)return toast('Supplier name is required.');const q=item?sb.from('suppliers').update(payload).eq('id',item.id).eq('user_id',dataUserId()):sb.from('suppliers').insert(payload);const {error}=await q;if(error)return toast(errText(error));closeModal();toast('Supplier saved.');await navigate('suppliers');});
}
async function deleteSupplier(id){if(!isOwner())return toast('Only the owner can delete suppliers.');if(!confirm('Delete this supplier? Existing purchases will keep their records.'))return;const {error}=await sb.from('suppliers').delete().eq('id',id).eq('user_id',dataUserId());if(error)return toast(errText(error));toast('Supplier deleted.');await navigate('suppliers');}

function openModal(title,body,submit,extraClass=""){
  const classes=extraClass.split(/\s+/).filter(Boolean);
  const isOrder=classes.includes("order-modal");
  const isView=classes.includes("view-modal");
  const submitLabel=isOrder?"Confirm Order":isView?"Close":"Save";
  const footer=isView?`<div class="modal-foot"><button id="modalSubmit" class="btn btn-dark">Close</button></div>`:`<div class="modal-foot"><button class="btn" onclick="closeModal()">Cancel</button><button id="modalSubmit" class="btn btn-dark">${submitLabel}</button></div>`;
  $("#modalRoot").innerHTML=`<div class="modal-backdrop"><div class="modal ${extraClass}"><div class="modal-head"><h3>${title}</h3><button class="close" onclick="closeModal()">×</button></div><div class="modal-body">${body}</div>${footer}</div></div>`;
  $("#modalSubmit").onclick=submit;
}

async function openCustomerDetail(id){
  const [{data:customer,error:ce},{data:orders,error:oe}]=await Promise.all([
    sb.from("customers").select("*").eq("id",id).eq("user_id",dataUserId()).single(),
    sb.from("orders").select("id,order_number,status,total,order_date,created_at,customer_id").eq("customer_id",id).eq("user_id",dataUserId()).order("order_date",{ascending:false}).order("created_at",{ascending:false})
  ]);
  if(ce)return toast(errText(ce)); if(oe)return toast(errText(oe));
  const orderRows=orders||[], orderIds=orderRows.map(o=>o.id);
  let items=[];
  if(orderIds.length){const {data,error}=await sb.from("order_items").select("order_id,product_id,quantity,unit_price,addons_total,line_total").eq("user_id",dataUserId()).in("order_id",orderIds);if(error)return toast(errText(error));items=data||[];}
  // Customer history should show a clean product summary, not every raw order_items row.
  // Older order-edit versions could leave duplicate one-unit rows behind, so merge
  // identical product/price/add-on lines for display only. This does not mutate data.
  const displayItemsByOrder={};
  items.forEach(i=>{
    const key=`${i.order_id}__${i.product_id||""}__${Number(i.unit_price||0).toFixed(2)}__${Number(i.addons_total||0).toFixed(2)}`;
    const list=displayItemsByOrder[i.order_id]||(displayItemsByOrder[i.order_id]=[]);
    const existing=list.find(x=>x.key===key);
    if(existing){
      existing.quantity+=Number(i.quantity||0);
      existing.lineTotal+=Number(i.line_total||0);
    }else{
      list.push({key,product_id:i.product_id,quantity:Number(i.quantity||0),unit_price:Number(i.unit_price||0),addons_total:Number(i.addons_total||0),lineTotal:Number(i.line_total||0)});
    }
  });
  const productIds=[...new Set(items.map(i=>i.product_id).filter(Boolean))]; let products=[];
  if(productIds.length){const {data,error}=await sb.from("products").select("id,name").eq("user_id",dataUserId()).in("id",productIds);if(error)return toast(errText(error));products=data||[];}
  const productMap=Object.fromEntries(products.map(p=>[p.id,p.name]));
  const completed=orderRows.filter(o=>String(o.status).toLowerCase()==="completed");
  const totalSpent=completed.reduce((sum,o)=>sum+Number(o.total||0),0), lastOrder=orderRows[0];
  const fmtDate=d=>{if(!d)return "-";const x=new Date(`${String(d).slice(0,10)}T00:00:00`);return Number.isNaN(x.getTime())?String(d):x.toLocaleDateString("en-MY",{year:"numeric",month:"short",day:"numeric"});};
  const today=localDate();
  const birthday=String(customer.birthday||"").slice(0,10);
  const birthdayThisMonth=!!birthday && Number(birthday.slice(5,7))===Number(today.slice(5,7));
  const birthdayMonthOrder=birthdayThisMonth && orderRows.some(o=>String(o.order_date||String(o.created_at||"").slice(0,10)).slice(0,7)===today.slice(0,7));
  const birthdayGiftLabel=!birthday?"No birthday set":birthdayThisMonth?(birthdayMonthOrder?"Gift Given":"Gift Pending"):"Not this month";
  const birthdayGiftClass=birthdayThisMonth?(birthdayMonthOrder?"badge badge-success":"badge badge-warning"):"badge";
  const orderHistory=orderRows.map(o=>{
    const lines=(displayItemsByOrder[o.id]||[]).map(i=>{
      const name=esc(productMap[i.product_id]||"Product");
      const qty=Number(i.quantity||0);
      return `${name} × ${qty}`;
    }).join(", ");
    return `<tr><td><strong>${esc(o.order_number)}</strong></td><td>${fmtDate(o.order_date||String(o.created_at||"").slice(0,10))}</td><td class="customer-history-items">${lines||"-"}</td><td><span class="badge">${esc(o.status||"")}</span></td><td>${money(o.total)}</td></tr>`;
  }).join("")||`<tr><td colspan="5" class="empty">No orders for this customer yet.</td></tr>`;
  openModal("Customer Details",`
    <div class="customer-detail">
      <div class="customer-profile-card"><div><div class="eyebrow">CUSTOMER</div><h4>${esc(customer.name||"-")}</h4></div><button class="btn" onclick="closeModal();openCustomerModal(${JSON.stringify(customer).replace(/</g,"\u003c")})">Edit</button>
        <div class="customer-contact-grid"><div><span>Phone</span><strong>${esc(customer.phone||"-")}</strong></div><div><span>Email</span><strong>${esc(customer.email||"-")}</strong></div><div><span>Birthday</span><strong>${esc(birthday?fmtDate(birthday):"-")}</strong></div><div><span>Birthday Gift</span><strong><span class="${birthdayGiftClass}">${esc(birthdayGiftLabel)}</span></strong></div><div class="wide"><span>Address</span><strong>${esc(customer.address||"-")}</strong></div>${customer.notes?`<div class="wide"><span>Notes</span><strong>${esc(customer.notes)}</strong></div>`:""}</div>
      </div>
      <div class="customer-stats"><div class="customer-stat"><span>Total Spent</span><strong>${money(totalSpent)}</strong><small>Completed orders</small></div><div class="customer-stat"><span>Total Orders</span><strong>${orderRows.length}</strong><small>All recorded orders</small></div><div class="customer-stat"><span>Last Order</span><strong>${fmtDate(lastOrder?.order_date||String(lastOrder?.created_at||"").slice(0,10))}</strong><small>${lastOrder?esc(lastOrder.order_number):"No orders yet"}</small></div></div>
      <div class="customer-history"><div class="customer-history-head"><h4>Order History</h4><p class="muted">Every order placed by this customer.</p></div><div class="table-wrap"><table><thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Status</th><th>Total</th></tr></thead><tbody>${orderHistory}</tbody></table></div></div>
    </div>`,closeModal,"view-modal customer-detail-modal");
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
    sb.from("nuonuo_subrecipes").select("id,name,yield_quantity,yield_unit,created_at,updated_at").eq("user_id",dataUserId()).order("name"),
    sb.from("nuonuo_subrecipe_items").select("id,subrecipe_id,ingredient_id,child_subrecipe_id,quantity").eq("user_id",dataUserId())
  ]);
  if(subErr || itemErr){
    const missing=subErr && isMissingSupabaseTable(subErr,'nuonuo_subrecipes') || itemErr && isMissingSupabaseTable(itemErr,'nuonuo_subrecipe_items');
    if(missing){
      window.__subrecipeDbReady=false;
      return [];
    }
    throw (subErr || itemErr);
  }
  const {data:ings,error:ingErr}=await sb.from("ingredients").select("id,name,unit,cost_per_unit").eq("user_id",dataUserId());
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
    sb.from('ingredients').select('id,name,unit,cost_per_unit,item_type').eq('user_id',dataUserId()).in('item_type',['ingredient','packaging']).order('name'),
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
    const payload={user_id:dataUserId(),name,yield_quantity:yieldQuantity,yield_unit:yieldUnit};
    const q=item?sb.from('nuonuo_subrecipes').update(payload).eq('id',item.id).eq('user_id',dataUserId()):sb.from('nuonuo_subrecipes').insert(payload).select('id').single();
    const {data,error}=await q;if(error)return toast(errText(error));
    const subrecipeId=item?.id||data?.id;if(!subrecipeId)return toast('Unable to save sub-ingredient.');
    const del=await sb.from('nuonuo_subrecipe_items').delete().eq('subrecipe_id',subrecipeId).eq('user_id',dataUserId());if(del.error)return toast(errText(del.error));
    const itemPayload=rows.map(r=>({user_id:dataUserId(),subrecipe_id:subrecipeId,ingredient_id:r.type==='ingredient'?r.id:null,child_subrecipe_id:r.type==='subrecipe'?r.id:null,quantity:r.quantity}));
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
  if(!isOwner())return toast('Only the owner can delete sub-ingredients.');
  if(!confirm('Delete this sub-ingredient? Products using it may lose their recipe component.'))return;
  const {error}=await sb.from('nuonuo_subrecipes').delete().eq('id',id).eq('user_id',dataUserId());
  if(error)return toast(errText(error));toast('Sub-ingredient deleted.');await render.ingredients();
}

async function loadProductCosting(productId){
  const [ings, subs, recipes] = await Promise.all([
    sb.from("ingredients").select("id,name,unit,cost_per_unit,item_type").eq("user_id",dataUserId()).order("name"),
    loadSubrecipes(),
    sb.from("nuonuo_product_recipe_items").select("id,ingredient_id,subrecipe_id,component_type,quantity").eq("user_id",dataUserId()).eq("product_id",productId)
  ]);
  return {ingredients:ings.data||[],subrecipes:subs||[],recipes:recipes.data||[]};
}

function recipeCostValue(type,id,qty,ingredients,subrecipes){
  const q=Number(qty||0);
  if(!id || q<=0)return 0;

  // Packaging is stored in the ingredients table with item_type='packaging'.
  // In Recipe costing, both Ingredient and Packaging therefore use
  // ingredientBaseCost(), while only Sub-recipe uses subrecipeBaseCost().
  if(type==='ingredient' || type==='packaging'){
    const i=ingredients.find(x=>x.id===id);
    return q*ingredientBaseCost(i);
  }

  const r=subrecipes.find(x=>x.id===id);
  return q*subrecipeBaseCost(r);
}

function renderRecipeRows(ingredients,subrecipes,recipes){
  const rows=recipes.length?recipes:[{ingredient_id:ingredients.find(x=>x.item_type!=='packaging')?.id||"",sub_recipe_id:null,quantity:1}];
  return rows.map((r,i)=>{
    const selectedId=r.subrecipe_id||r.sub_recipe_id||r.ingredient_id||'';
    const selectedIngredient=ingredients.find(x=>x.id===selectedId);
    const type=r.component_type || ((r.subrecipe_id||r.sub_recipe_id)?'subrecipe':(selectedIngredient?.item_type==='packaging'?'packaging':'ingredient'));
    const unit=type==='subrecipe'?subrecipeBaseUnit(subrecipes.find(x=>x.id===selectedId)):recipeIngredientUnit(selectedIngredient);
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
  const unit=type==='subrecipe' ? subrecipeBaseUnit(subrecipes.find(x=>x.id===id)) : recipeIngredientUnit(item);
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
  const {data:cats}=await sb.from("categories").select("*").eq("user_id",dataUserId()).order("name");
  let costing={ingredients:[],subrecipes:[],recipes:[]};
  if(item?.id){
    try{costing=await loadProductCosting(item.id);}catch(e){return toast("Unable to load recipe costing: "+errText(e));}
  }else{
    const [ings,subs]=await Promise.all([
      sb.from("ingredients").select("id,name,unit,cost_per_unit,item_type").eq("user_id",dataUserId()).order("name"),
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
  openModal(item?"Edit Product":"Add Wastage",`
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
      const selectedCategory=$("#pCat").value||null;
      const existingSort=item?.sort_order;
      const payload={user_id:dataUserId(),name,description:$("#pDesc").value,category_id:selectedCategory,selling_price:price,calculated_cost:Number(cost.toFixed(2)),image_url:imageUrl,sort_order:item?Number(existingSort||0):Number((window.__menuProducts||[]).filter(x=>(x.category_id||null)===selectedCategory).length)};
      const q=item?sb.from("products").update(payload).eq("id",item.id).eq("user_id",dataUserId()):sb.from("products").insert(payload).select("id").single();
      const {data,error}=await q;if(error)return toast(errText(error));
      if(!productId)productId=data.id;
      const del=await sb.from("nuonuo_product_recipe_items").delete().eq("product_id",productId).eq("user_id",dataUserId());
      if(del.error)return toast(errText(del.error));
      if(rows.length){
        const recipePayload=rows.map(r=>({
          user_id:dataUserId(),
          product_id:productId,
          // component_type is required by the database CHECK constraint.
          component_type:r.type,
          // Ingredient + Packaging both reference ingredient_id.
          ingredient_id:(r.type==='ingredient'||r.type==='packaging') ? r.id : null,
          subrecipe_id:r.type==='subrecipe' ? r.id : null,
          quantity:r.quantity
        }));
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
  row.innerHTML=`<select class="recipe-type" onchange="changeRecipeType(this)"><option value="ingredient">Ingredient</option><option value="subrecipe">Sub-recipe</option><option value="packaging">Packaging</option></select><select class="recipe-component" onchange="updateProductRecipeComponent(this)"><option value="">Select ingredient</option>${ingredients.filter(x=>x.item_type!=='packaging').map(x=>`<option value="${x.id}">${esc(x.name)} · ${componentCostLabel(x,'ingredient')}</option>`).join('')}</select><div class="recipe-qty-wrap"><input class="recipe-qty" type="number" min="0.0001" step="0.001" value="1" oninput="updateProductRecipePreview()" placeholder="Qty"><span class="recipe-qty-unit">${esc(recipeIngredientUnit(ingredients.find(x=>x.item_type!=='packaging'))||'unit')}</span></div><button type="button" class="recipe-remove" onclick="this.closest('.recipe-row').remove();updateProductRecipePreview()">×</button>`;
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
    const payload={user_id:dataUserId(),name:$("#catName").value.trim(),description:$("#catDesc").value,sort_order:Number($("#catSort").value||0)};
    const q=item?sb.from("categories").update(payload).eq("id",item.id).eq("user_id",dataUserId()):sb.from("categories").insert(payload); const {error}=await q; if(error)return toast(errText(error)); closeModal(); toast("Category saved."); await render.menu();
  });
}
async function loadAddonRecipeRows(addonId){
  if(!addonId)return [];
  const {data,error}=await sb.from("addon_recipe_items").select("id,addon_id,ingredient_id,quantity").eq("addon_id",addonId).eq("user_id",dataUserId()).order("id");
  if(error){
    if(isMissingSupabaseTable(error,"addon_recipe_items"))return [];
    throw error;
  }
  return data||[];
}
function readAddonRecipeRows(){
  return [...document.querySelectorAll('#addonRecipeRows .addon-recipe-row')].map(row=>({
    ingredient_id:row.querySelector('.addon-recipe-component')?.value||'',
    quantity:Number(row.querySelector('.addon-recipe-qty')?.value||0)
  })).filter(r=>r.ingredient_id&&r.quantity>0);
}
function updateAddonRecipePreview(){
  const rows=readAddonRecipeRows(), ingredients=window.__addonIngredients||[];
  const recipeCost=rows.reduce((sum,r)=>sum+r.quantity*ingredientBaseCost(ingredients.find(x=>x.id===r.ingredient_id)),0);
  const cost=rows.length?recipeCost:Number(window.__editingAddonCost||0);
  const costEl=$("#aCost");
  if(costEl)costEl.value=Number(cost.toFixed(2));
  const summary=$("#addonRecipeCostSummary");
  if(summary)summary.textContent=money(Number(cost.toFixed(2)));
}
function addAddonRecipeRow(){
  const wrap=$("#addonRecipeRows");if(!wrap)return;
  const ingredients=(window.__addonIngredients||[]).filter(x=>x.item_type==='ingredient'||x.item_type==='packaging');
  const row=document.createElement('div');row.className='recipe-row addon-recipe-row';
  row.innerHTML=`<select class="addon-recipe-component" onchange="updateAddonRecipePreview()"><option value="">Select inventory item</option>${ingredients.map(x=>`<option value="${x.id}">${esc(x.name)} · ${esc(x.item_type==='packaging'?'pcs':(x.unit||'unit'))} · ${money(x.cost_per_unit)}/unit</option>`).join('')}</select><div class="recipe-qty-wrap"><input class="addon-recipe-qty" type="number" min="0.0001" step="0.001" value="1" oninput="updateAddonRecipePreview()" placeholder="Qty"><span class="recipe-qty-unit">per add-on</span></div><button type="button" class="recipe-remove" onclick="this.closest('.addon-recipe-row').remove();updateAddonRecipePreview()">×</button>`;
  wrap.appendChild(row);updateAddonRecipePreview();
}
async function openAddonModal(item=null){
  const {data:ingredients,error:ingError}=await sb.from('ingredients').select('id,name,unit,cost_per_unit,item_type').eq('user_id',dataUserId()).order('name');
  if(ingError)return toast(errText(ingError));
  const rows=item?await loadAddonRecipeRows(item.id):[];
  window.__addonIngredients=(ingredients||[]).filter(x=>x.item_type==='ingredient'||x.item_type==='packaging');
  window.__editingAddonCost=Number(item?.cost||0);
  const recipeRows=rows.length?rows:[{ingredient_id:'',quantity:1}];
  const recipeHtml=`<div class="wide recipe-section"><div class="recipe-head"><div><strong>Inventory usage</strong><div class="muted small">Set how much inventory is used for <b>1 add-on</b>. Stock will be deducted automatically when an order is completed.</div></div><button type="button" class="btn" onclick="addAddonRecipeRow()">+ Component</button></div><div id="addonRecipeRows">${recipeRows.map(r=>`<div class="recipe-row addon-recipe-row"><select class="addon-recipe-component" onchange="updateAddonRecipePreview()"><option value="">Select inventory item</option>${(ingredients||[]).filter(x=>x.item_type==='ingredient'||x.item_type==='packaging').map(x=>`<option value="${x.id}" ${x.id===r.ingredient_id?'selected':''}>${esc(x.name)} · ${esc(x.item_type==='packaging'?'pcs':(x.unit||'unit'))} · ${money(x.cost_per_unit)}/unit</option>`).join('')}</select><div class="recipe-qty-wrap"><input class="addon-recipe-qty" type="number" min="0.0001" step="0.001" value="${Number(r.quantity||1)}" oninput="updateAddonRecipePreview()" placeholder="Qty"><span class="recipe-qty-unit">per add-on</span></div><button type="button" class="recipe-remove" onclick="this.closest('.addon-recipe-row').remove();updateAddonRecipePreview()">×</button></div>`).join('')}</div><div class="recipe-summary"><span>Calculated cost <strong id="addonRecipeCostSummary">${money(item?.cost||0)}</strong></span></div></div>`;
  openModal(item?"Edit Add-on":"Add Add-on",`<form id="addonForm" class="form-grid"><label>Name<input id="aName" required value="${esc(item?.name||"")}"></label><label>Price<input id="aPrice" type="number" step="0.01" value="${item?.price??0}"></label><label>Cost<input id="aCost" type="number" step="0.01" value="${item?.cost??0}" readonly></label><label>Active<select id="aActive"><option value="true" ${item?.active!==false?"selected":""}>Active</option><option value="false" ${item?.active===false?"selected":""}>Inactive</option></select></label>${recipeHtml}</form>`,async()=>{
    const name=$("#aName").value.trim();
    if(!name)return toast("Add-on name is required.");
    const rows=readAddonRecipeRows();
    const recipeCost=rows.reduce((sum,r)=>sum+r.quantity*ingredientBaseCost(window.__addonIngredients.find(x=>x.id===r.ingredient_id)),0);
    const cost=rows.length?recipeCost:Number(item?.cost||0);
    const payload={user_id:dataUserId(),name,price:Number($("#aPrice").value||0),cost:Number(cost.toFixed(2)),active:$("#aActive").value==="true"};
    let addonId=item?.id;
    const q=item?sb.from("addons").update(payload).eq("id",item.id).eq("user_id",dataUserId()):sb.from("addons").insert(payload).select('id').single();
    const {data,error}=await q; if(error)return toast(errText(error));
    if(!addonId)addonId=data.id;
    const del=await sb.from('addon_recipe_items').delete().eq('addon_id',addonId).eq('user_id',dataUserId());
    if(del.error)return toast(errText(del.error));
    if(rows.length){
      const ins=await sb.from('addon_recipe_items').insert(rows.map(r=>({user_id:dataUserId(),addon_id:addonId,ingredient_id:r.ingredient_id,quantity:r.quantity})));
      if(ins.error)return toast(errText(ins.error));
    }
    closeModal();toast("Add-on saved with inventory usage.");await render.menu();
  });
  updateAddonRecipePreview();
}
async function openStaffModal(item=null){
  if(!isOwner())return toast("Only the owner can manage staff.");
  if(item){
    openModal("Edit Staff",`<form id="staffForm" class="form-grid"><label>Name<input id="stName" value="${esc(item.full_name||"")}"></label><label>Email<input value="${esc(item.email||"")}" disabled></label><label>Role<select id="stRole"><option value="staff" ${item.role==="staff"?"selected":""}>Staff</option><option value="owner" ${item.role==="owner"?"selected":""}>Owner</option></select></label></form>`,async()=>{
      const {error}=await sb.from("profiles").update({full_name:$("#stName").value.trim(),role:$("#stRole").value}).eq("id",item.id);
      if(error)return toast(errText(error));
      closeModal(); toast("Staff profile updated."); await render.staff();
    });
    return;
  }

  openModal("Create Staff",`<form id="staffForm" class="form-grid">
    <label>Name<input id="stName" required placeholder="Staff name"></label>
    <label>Email<input id="stEmail" type="email" required placeholder="staff@example.com" autocomplete="off"></label>
    <label>Password<input id="stPassword" type="password" required minlength="6" placeholder="At least 6 characters" autocomplete="new-password"></label>
    <label>Role<select id="stRole"><option value="staff" selected>Staff</option><option value="owner">Owner</option></select></label>
  </form>`,async()=>{
    const name=$("#stName").value.trim();
    const email=$("#stEmail").value.trim().toLowerCase();
    const password=$("#stPassword").value;
    const role=$("#stRole").value;
    if(!name || !email || !password) return toast("Please complete all staff fields.");
    if(password.length<6) return toast("Password must be at least 6 characters.");

    const ownerSession=session;
    const ownerUserId=session?.user?.id;
    if(!ownerSession?.access_token || !ownerUserId) return toast("Owner session is missing. Please sign in again.");

    const btn=$("#modalSubmit");
    if(btn){btn.disabled=true;btn.textContent="Creating…";}
    try{
      // Staff accounts are created through the Vercel serverless endpoint with
      // Supabase Auth Admin privileges. This keeps the service_role key off the
      // browser, creates the account with email_confirm=true, and avoids
      // Supabase confirmation-email rate limits entirely.
      const response=await fetch("/api/create-staff",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":`Bearer ${ownerSession.access_token}`
        },
        body:JSON.stringify({name,email,password,role})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error || `Unable to create staff (${response.status}).`);

      closeModal();
      toast("Staff created successfully. They can sign in with the email and password you set.");
      await render.staff();
    }catch(e){
      toast(errText(e));
    }finally{
      const b=$("#modalSubmit"); if(b){b.disabled=false;b.textContent="Save";}
    }
  });
}
async function deleteStaff(id){
  if(!isOwner())return toast("Only the owner can delete staff.");
  if(id===session.user.id)return toast("You cannot delete the current account here.");
  if(!confirm("Delete this staff profile? The Auth account will not be deleted from this page."))return;
  const {error}=await sb.from("profiles").delete().eq("id",id); if(error)return toast(errText(error)); toast("Staff profile deleted."); await render.staff();
}
async function deleteInventoryItem(id){
  if(!isOwner())return toast('Only the owner can delete inventory items.');
  const {data:item,error:loadError}=await sb.from('ingredients').select('id,name,item_type,current_stock').eq('id',id).eq('user_id',dataUserId()).single();
  if(loadError)return toast(errText(loadError));
  if(!confirm(`Delete inventory item \"${item.name}\"? This cannot be undone.`))return;
  const {error}=await sb.from('ingredients').delete().eq('id',id).eq('user_id',dataUserId());
  if(error)return toast(`Delete failed: ${errText(error)}. If this item is used by a recipe, purchase or other record, remove that reference first.`);
  toast('Inventory item deleted.');
  await navigate('inventory');
}
async function openInventoryItemModalById(id){
  const {data,error}=await sb.from('ingredients').select('*').eq('id',id).eq('user_id',dataUserId()).single();
  if(error)return toast(errText(error));
  return openInventoryItemModal({item:data});
}
async function openInventoryItemModal(options={}){
  const item=options.item||null;
  const defaultType=item?.item_type||'ingredient';
  const ingredientType=defaultType==='ingredient';
  const unit=item?.unit||(ingredientType?'500g':'pcs');
  const parsed=parseMeasureUnit(unit);
  const packAmount=parsed.valid?Math.max(parsed.amount,0.000001):1;
  const baseUnit=ingredientType?(parsed.valid?parsed.unit:unit):'pcs';
  const currentBase=item?(ingredientType?Number(item.current_stock||0)*packAmount:Number(item.current_stock||0)):0;
  const lowBase=item?(ingredientType?Number(item.low_stock_threshold||0)*packAmount:Number(item.low_stock_threshold||0)):0;
  const typeOptions=[['ingredient','Ingredients'],['packaging','Packaging'],['kitchenware','Kitchenware / Utensils'],['electronic','Electronic Equipment'],['equipment','Equipment'],['other','Other']];
  const unitChoices=[['g','g'],['kg','kg'],['ml','ml'],['pcs','pcs'],['box','box']];
  const rawUnit=String(unit||'500g').trim().toLowerCase().replace(/\s+/g,'');
  const simpleMatch=rawUnit.match(/^([0-9]+(?:\.[0-9]+)?)(kg|g|ml|pcs|pc|box|boxes)$/i);
  let purchaseAmount=1, purchaseUnit='g', containsAmount=packAmount, containsUnit=baseUnit;
  if(parsed.compound){
    purchaseAmount=1; purchaseUnit='box'; containsAmount=packAmount; containsUnit=baseUnit;
  }else if(simpleMatch){
    purchaseAmount=Number(simpleMatch[1]);
    purchaseUnit=({pc:'pcs',boxes:'box'}[simpleMatch[2].toLowerCase()]||simpleMatch[2].toLowerCase());
    containsAmount=parsed.amount;
    containsUnit=baseUnit;
  }else if(!ingredientType){
    purchaseAmount=1; purchaseUnit='pcs'; containsAmount=1; containsUnit='pcs';
  }
  const whole=['pcs','box'].includes(baseUnit);
  const body=`<form id="inventoryItemForm" class="form-grid">
    <label>Name<input id="invName" required value="${esc(item?.name||'')}"></label>
    <label>Category<select id="invType" onchange="updateInventoryItemFields()">${typeOptions.map(([v,l])=>`<option value="${v}" ${defaultType===v?'selected':''}>${l}</option>`).join('')}</select></label>
    <label id="invUnitWrap">Purchase Unit<div style="display:flex;gap:8px;align-items:center"><input id="invUnitAmount" type="number" min="0.000001" step="0.001" value="${purchaseAmount}" oninput="updateInventoryItemFields()" style="flex:1"><select id="invUnitType" onchange="updateInventoryItemFields()" style="width:120px">${unitChoices.map(([v,l])=>`<option value="${v}" ${purchaseUnit===v?'selected':''}>${l}</option>`).join('')}</select></div></label>
    <label id="invContainsWrap" ${purchaseUnit==='box'?'':'hidden'}>Quantity per Purchase Unit<div style="display:flex;gap:8px;align-items:center"><input id="invContainsAmount" type="number" min="0.000001" step="0.001" value="${containsAmount}" oninput="updateInventoryItemFields()" style="flex:1"><select id="invContainsUnit" onchange="updateInventoryItemFields()" style="width:120px"><option value="g" ${containsUnit==='g'?'selected':''}>g</option><option value="kg" ${containsUnit==='g'&&containsAmount>=1000?'selected':''}>kg</option><option value="ml" ${containsUnit==='ml'?'selected':''}>ml</option><option value="pcs" ${containsUnit==='pcs'?'selected':''}>pcs</option></select></div><div class="muted small" style="margin-top:6px">Example: 1 box contains 63 pcs.</div></label>
    <input id="invUnit" type="hidden" value="${esc(unit)}">
    <label>Cost / Purchase Unit<input id="invCost" type="number" min="0" step="0.0001" value="${item?.cost_per_unit??0}"></label>
    <label>Current Stock <span id="invStockUnit">(${esc(baseUnit)})</span><input id="invStock" type="number" min="0" step="${whole?'1':'0.01'}" value="${currentBase.toFixed(whole?0:2)}"></label>
    <label>Low Stock Threshold <span id="invLowUnit">(${esc(baseUnit)})</span><input id="invLow" type="number" min="0" step="${whole?'1':'0.01'}" value="${lowBase.toFixed(whole?0:2)}"></label>
    <label>Supplier<input id="invSupplier" value="${esc(item?.supplier||'')}"></label>
    <div id="invUnitPreview" class="wide notice">${ingredientType?`<strong>${esc(inventoryUnitSummary(item||{unit}) )}</strong> · Inventory is tracked in ${esc(baseUnit)}.`:'Inventory is tracked in pcs.'}</div>
  </form>`;
  openModal(item?'Edit Inventory Item':'Add Inventory Item',body,async()=>{
    const type=$('#invType').value, name=$('#invName').value.trim();if(!name)return toast('Item name is required.');
    let saveUnit='pcs',stock=Number($('#invStock').value||0),low=Number($('#invLow').value||0);
    if(type==='ingredient'){
      const purchaseAmount=Math.max(Number($('#invUnitAmount').value||0),0.000001);
      const purchaseUnit=String($('#invUnitType').value||'g');
      if(purchaseUnit==='box'){
        const containsAmount=Math.max(Number($('#invContainsAmount').value||0),0.000001);
        const containsUnit=String($('#invContainsUnit').value||'pcs');
        let baseAmount=containsAmount, baseUnit=containsUnit;
        if(containsUnit==='kg') baseAmount*=1000,baseUnit='g';
        saveUnit=`${baseAmount}${baseUnit}/box`;
        stock=stock/Math.max(baseAmount,0.000001);
        low=low/Math.max(baseAmount,0.000001);
      }else{
        saveUnit=`${purchaseAmount}${purchaseUnit}`;
        const p=parseMeasureUnit(saveUnit);const amount=p.valid?Math.max(p.amount,0.000001):1;stock=stock/amount;low=low/amount;
      }
    }
    const payload={user_id:dataUserId(),name,item_type:type,unit:saveUnit,cost_per_unit:Number($('#invCost').value||0),current_stock:stock,low_stock_threshold:low,supplier:$('#invSupplier').value.trim()||''};
    const q=item?sb.from('ingredients').update(payload).eq('id',item.id).eq('user_id',dataUserId()):sb.from('ingredients').insert(payload).select('id,*').single();
    const {data,error}=await q;if(error)return toast(errText(error));
    const newItem=item?{...item,...payload}:data;
    closeModal();toast(item?'Inventory item updated.':'Inventory item added.');
    if(options.returnToPurchase){
      const {data:ings,error:ie}=await sb.from('ingredients').select('id,name,unit,cost_per_unit,item_type,current_stock').eq('user_id',dataUserId()).order('name');
      if(ie)return toast(errText(ie));window.__purchaseIngredients=ings||[];
      await openPurchaseModal(options.purchaseDraft||null);
      addQuickPurchaseLineWithItem(newItem.id);
    }else{await navigate('inventory');}
  },'inventory-item-modal');
  updateInventoryItemFields();
}
function updateInventoryItemFields(){
  const type=$('#invType')?.value||'ingredient', isIng=type==='ingredient';
  const unitWrap=$('#invUnitWrap'), amountEl=$('#invUnitAmount'), unitTypeEl=$('#invUnitType'), hiddenUnit=$('#invUnit'), containsWrap=$('#invContainsWrap'), containsAmount=$('#invContainsAmount'), containsUnitEl=$('#invContainsUnit'), stockUnit=$('#invStockUnit'), lowUnit=$('#invLowUnit'), stock=$('#invStock'), low=$('#invLow'), preview=$('#invUnitPreview');
  if(unitWrap)unitWrap.style.display=isIng?'':'none';
  if(!isIng){
    if(stockUnit)stockUnit.textContent='(pcs)'; if(lowUnit)lowUnit.textContent='(pcs)'; if(stock)stock.step='1'; if(low)low.step='1'; if(containsWrap)containsWrap.hidden=true; return;
  }
  const selectedUnit=String(unitTypeEl?.value||'g');
  const amount=Math.max(Number(amountEl?.value||0),0.000001);
  if(containsWrap)containsWrap.hidden=selectedUnit!=='box';
  let baseAmount=amount, baseUnit=selectedUnit;
  if(selectedUnit==='box'){
    baseAmount=Math.max(Number(containsAmount?.value||0),0.000001);
    baseUnit=String(containsUnitEl?.value||'pcs');
    if(baseUnit==='kg')baseAmount*=1000,baseUnit='g';
    if(hiddenUnit)hiddenUnit.value=`${baseAmount}${baseUnit}/box`;
  }else{
    if(hiddenUnit)hiddenUnit.value=`${amount}${selectedUnit}`;
    const parsed=parseMeasureUnit(`${amount}${selectedUnit}`);baseUnit=parsed.valid?parsed.unit:selectedUnit;baseAmount=parsed.amount;
  }
  if(stockUnit)stockUnit.textContent=`(${baseUnit})`; if(lowUnit)lowUnit.textContent=`(${baseUnit})`;
  const whole=baseUnit==='pcs'; if(stock)stock.step=whole?'1':'0.01'; if(low)low.step=whole?'1':'0.01';
  if(preview)preview.innerHTML=selectedUnit==='box'?`<strong>1 box = ${Number(baseAmount).toLocaleString()} ${esc(baseUnit)}</strong> · Inventory is tracked in ${esc(baseUnit)}.`:`<strong>Purchase: ${Number(amount).toLocaleString()} ${esc(selectedUnit)}</strong> · Inventory is tracked in ${esc(baseUnit)}.`;
}

async function openIngredientModalById(id){
  const {data,error}=await sb.from('ingredients').select('*').eq('id',id).eq('user_id',dataUserId()).single();
  if(error)return toast(errText(error));
  return openIngredientModal(data);
}

async function openIngredientModal(item=null){
  const defaultUnit=item?.unit||'g';
  const parsed=parseMeasureUnit(defaultUnit);
  const packAmount=parsed.valid?Math.max(parsed.amount,0.000001):1;
  const baseUnit=parsed.valid?parsed.unit:defaultUnit;
  const currentBase=item?Number(item.current_stock||0)*packAmount:0;
  const lowBase=item?Number(item.low_stock_threshold||0)*packAmount:0;
  const baseDigits=baseUnit==='pcs'||baseUnit==='個'?0:2;
  openModal(item?'Edit Ingredient':'Add Ingredient',`<form id="ingredientForm" class="form-grid">
    <label>Name<input id="iName" required value="${esc(item?.name||"")}"></label>
    <label>Purchase Unit<input id="iUnit" value="${esc(defaultUnit)}"></label>
    <label>Cost / Pack<input id="iCost" type="number" step="0.000001" value="${item?.cost_per_unit??0}"></label>
    <label>Current Stock (${esc(baseUnit)})<input id="iStock" type="number" step="${baseUnit==='pcs'||baseUnit==='個'?'1':'0.01'}" value="${currentBase.toFixed(baseDigits)}"></label>
    <label>Low Stock Threshold (${esc(baseUnit)})<input id="iLow" type="number" step="${baseUnit==='pcs'||baseUnit==='個'?'1':'0.01'}" value="${lowBase.toFixed(baseDigits)}"></label>
    <label>Supplier<input id="iSupplier" value="${esc(item?.supplier||"")}"></label>
    <div class="wide muted small">Stock is tracked in the actual base unit. Example: a 5000g pack with 0.5 pack in the database is shown as 2500 g. Recipes, add-ons and wastage will deduct g / ml / pcs automatically.</div>
  </form>`,async()=>{
    const unit=$("#iUnit").value.trim()||'g';
    const parsedSave=parseMeasureUnit(unit);
    const savePackAmount=parsedSave.valid?Math.max(parsedSave.amount,0.000001):1;
    const payload={user_id:dataUserId(),name:$("#iName").value.trim(),item_type:'ingredient',unit,cost_per_unit:Number($("#iCost").value||0),current_stock:Number($("#iStock").value||0)/savePackAmount,low_stock_threshold:Number($("#iLow").value||0)/savePackAmount,supplier:$("#iSupplier").value};
    const q=item?sb.from("ingredients").update(payload).eq("id",item.id).eq("user_id",dataUserId()):sb.from("ingredients").insert(payload);
    const {error}=await q;if(error)return toast(errText(error));closeModal();toast("Ingredient saved.");await render.ingredients();
  });
}

async function openPackagingModalById(id){
  const {data,error}=await sb.from('ingredients').select('*').eq('id',id).eq('user_id',dataUserId()).single();
  if(error)return toast(errText(error));
  return openPackagingModal(data);
}
async function openPackagingModal(item=null){
  openModal(item?'Edit Packaging':'Add Packaging',`<form id="packagingForm" class="form-grid">
    <label>Name<input id="pName" required value="${esc(item?.name||"")}"></label>
    <label>Per Unit (RM)<input id="pCost" type="number" min="0" step="0.0001" value="${item?.cost_per_unit??0}"></label>
    <label>Current Stock (pcs)<input id="pStock" type="number" min="0" step="1" value="${item?.current_stock??0}"></label>
    <label>Low Stock Threshold (pcs)<input id="pLow" type="number" min="0" step="1" value="${item?.low_stock_threshold??0}"></label>
    <div class="wide muted small">Packaging is counted by piece. Low Stock will be triggered when current stock is at or below this number.</div>
  </form>`,async()=>{
    const payload={
      user_id:dataUserId(),
      name:$("#pName").value.trim(),
      item_type:'packaging',
      unit:'pcs',
      cost_per_unit:Number($("#pCost").value||0),
      current_stock:Number($("#pStock").value||0),
      low_stock_threshold:Number($("#pLow").value||0),
      supplier:''
    };
    const q=item?sb.from("ingredients").update(payload).eq("id",item.id).eq("user_id",dataUserId()):sb.from("ingredients").insert(payload);
    const {error}=await q;
    if(error)return toast(errText(error));
    closeModal();toast("Packaging saved.");await render.ingredients();
  });
}
async function openCustomerModal(item=null){
  openModal(item?"Edit Customer":"Add Customer",`<form id="customerForm" class="form-grid">
    <label>Name<input id="cName" required value="${esc(item?.name||"")}"></label>
    <label>Phone<input id="cPhone" value="${esc(item?.phone||"")}"></label>
    <label>Email<input id="cEmail" type="email" value="${esc(item?.email||"")}"></label>
    <label>Birthday<div class="english-date-field"><input id="cBirthday" type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="YYYY-MM-DD" value="${esc(String(item?.birthday||"").slice(0,10))}"><button type="button" class="date-picker-btn" aria-label="Choose birthday" title="Choose birthday">▣</button></div><span class="muted small">Used to track birthday-month gifts.</span></label>
    <label>Address<input id="cAddress" value="${esc(item?.address||"")}"></label>
    <label class="wide">Notes<textarea id="cNotes">${esc(item?.notes||"")}</textarea></label>
  </form>`,async()=>{
    const birthdayRaw=String($("#cBirthday")?.value||"").trim();
    const birthday=birthdayRaw?validDateString(birthdayRaw):null;
    if(birthdayRaw&&!birthday)return toast("Please enter a valid birthday in YYYY-MM-DD format.");
    const payload={user_id:dataUserId(),name:$("#cName").value.trim(),phone:$("#cPhone").value,email:$("#cEmail").value,address:$("#cAddress").value,notes:$("#cNotes").value,birthday};
    const q=item?sb.from("customers").update(payload).eq("id",item.id).eq("user_id",dataUserId()):sb.from("customers").insert(payload);
    const {error}=await q;if(error)return toast(errText(error));closeModal();toast("Customer saved.");await render.customers();
  });
}

// English-only calendar picker. It replaces the browser/Windows native date popup so
// the calendar UI is always English, while the saved value remains YYYY-MM-DD.
const EN_MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const EN_WEEKDAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
let activeEnglishDateInput=null;
let englishCalendarView=null;
function validDateString(value){
  const m=String(value||"").trim().replace(/[.\/]/g,"-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if(!m)return null;
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]); const x=new Date(y,mo-1,d);
  return x.getFullYear()===y&&x.getMonth()===mo-1&&x.getDate()===d?`${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`:null;
}
function englishTodayDate(){return localDate();}
function parseDateString(value){const v=validDateString(value)||englishTodayDate();const [y,m,d]=v.split("-").map(Number);return new Date(y,m-1,d);}
function formatDateString(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function ensureEnglishCalendar(){
  let el=document.getElementById("englishDateCalendar");if(el)return el;
  el=document.createElement("div");el.id="englishDateCalendar";el.className="english-date-calendar hidden";
  el.innerHTML=`<div class="english-calendar-head"><button type="button" data-cal-action="prev" aria-label="Previous month">‹</button><strong data-cal-title></strong><button type="button" data-cal-action="next" aria-label="Next month">›</button></div><div class="english-calendar-weekdays">${EN_WEEKDAYS.map(d=>`<span>${d}</span>`).join("")}</div><div class="english-calendar-grid" data-cal-grid></div><div class="english-calendar-foot"><button type="button" data-cal-action="clear">Clear</button><button type="button" data-cal-action="today">Today</button></div>`;
  document.body.appendChild(el);
  el.addEventListener("click",e=>{const btn=e.target.closest("button[data-cal-action]");if(!btn||!activeEnglishDateInput)return;const action=btn.dataset.calAction;if(action==="prev"){englishCalendarView=new Date(englishCalendarView.getFullYear(),englishCalendarView.getMonth()-1,1);renderEnglishCalendar();}else if(action==="next"){englishCalendarView=new Date(englishCalendarView.getFullYear(),englishCalendarView.getMonth()+1,1);renderEnglishCalendar();}else if(action==="today"){setEnglishDateValue(englishTodayDate());closeEnglishCalendar();}else{activeEnglishDateInput.value="";activeEnglishDateInput.dispatchEvent(new Event("input",{bubbles:true}));closeEnglishCalendar();}});
  document.addEventListener("mousedown",e=>{if(!el.classList.contains("hidden")&&!el.contains(e.target)&&!e.target.closest(".date-picker-btn"))closeEnglishCalendar();});
  window.addEventListener("resize",positionEnglishCalendar);window.addEventListener("scroll",positionEnglishCalendar,true);return el;
}
function positionEnglishCalendar(){const cal=document.getElementById("englishDateCalendar"),input=activeEnglishDateInput;if(!cal||cal.classList.contains("hidden")||!input)return;const r=input.closest(".english-date-field")?.getBoundingClientRect()||input.getBoundingClientRect();const w=cal.offsetWidth||286,h=cal.offsetHeight||330;let left=Math.min(Math.max(8,r.left),window.innerWidth-w-8),top=r.bottom+8;if(top+h>window.innerHeight-8)top=Math.max(8,r.top-h-8);cal.style.left=`${left}px`;cal.style.top=`${top}px`;}
function renderEnglishCalendar(){const cal=ensureEnglishCalendar(),title=cal.querySelector("[data-cal-title]"),grid=cal.querySelector("[data-cal-grid]"),y=englishCalendarView.getFullYear(),m=englishCalendarView.getMonth();title.textContent=`${EN_MONTHS[m]} ${y}`;const first=new Date(y,m,1),start=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate(),prevDays=new Date(y,m,0).getDate(),selected=validDateString(activeEnglishDateInput?.value||"");const cells=[];for(let i=0;i<start;i++)cells.push({date:new Date(y,m-1,prevDays-start+i+1),muted:true});for(let d=1;d<=days;d++)cells.push({date:new Date(y,m,d),muted:false});while(cells.length<42){const d=cells.length-start-days+1;cells.push({date:new Date(y,m+1,d),muted:true});}const today=englishTodayDate();grid.innerHTML=cells.map(({date,muted})=>{const value=formatDateString(date),cls=["english-cal-day",muted?"muted-day":"",value===selected?"selected":"",value===today?"today":""].filter(Boolean).join(" ");return `<button type="button" class="${cls}" data-date-value="${value}">${date.getDate()}</button>`;}).join("");grid.querySelectorAll("button[data-date-value]").forEach(btn=>btn.addEventListener("click",()=>{setEnglishDateValue(btn.dataset.dateValue);closeEnglishCalendar();}));positionEnglishCalendar();}
function setEnglishDateValue(value){if(!activeEnglishDateInput)return;const normalized=validDateString(value);if(!normalized)return;activeEnglishDateInput.value=normalized;activeEnglishDateInput.dispatchEvent(new Event("input",{bubbles:true}));activeEnglishDateInput.dispatchEvent(new Event("change",{bubbles:true}));}
function openEnglishCalendar(input){activeEnglishDateInput=input;englishCalendarView=parseDateString(input.value);englishCalendarView=new Date(englishCalendarView.getFullYear(),englishCalendarView.getMonth(),1);const cal=ensureEnglishCalendar();cal.classList.remove("hidden");renderEnglishCalendar();positionEnglishCalendar();}
function closeEnglishCalendar(){const cal=document.getElementById("englishDateCalendar");if(cal)cal.classList.add("hidden");activeEnglishDateInput=null;}
function initEnglishDateField(id){const input=document.getElementById(id);if(!input||input.dataset.englishDateReady)return;input.dataset.englishDateReady="1";input.setAttribute("lang","en");input.setAttribute("dir","ltr");input.addEventListener("blur",()=>{const v=validDateString(input.value);if(v)input.value=v;else if(input.value.trim())input.value=localDate();});input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();input.blur();}});const btn=input.closest(".english-date-field")?.querySelector(".date-picker-btn");if(btn&&!btn.dataset.englishCalendarReady){btn.dataset.englishCalendarReady="1";btn.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openEnglishCalendar(input);});}}
function initAllEnglishDateFields(){["invoiceDate","wDate","eoDate","eDate","oDate","eoScheduledDate","oScheduledDate"].forEach(initEnglishDateField);}

async function openExpenseModal(){
  const categoryOptions=EXPENSE_CATEGORIES.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("");
  openModal("Add Expense",`<form id="expenseForm" class="form-grid">
    <label>Date<div class="english-date-field"><input id="eDate" type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="YYYY-MM-DD" value="${localDate()}" aria-label="Date"><button type="button" class="date-picker-btn" data-date-target="eDate" aria-label="Choose date" title="Choose date">▣</button></div></label>
    <label>Category<select id="eCat" required><option value="" disabled selected>Select category</option>${categoryOptions}</select></label>
    <label>Subcategory<select id="eSub"><option value="">Select category first</option></select></label>
    <label id="eHoursWrap" style="display:none">Hours Worked<input id="eHours" type="number" min="0" step="0.25" placeholder="0.00"></label>
    <label id="eRateWrap" style="display:none">Hourly Rate (RM)<input id="eRate" type="number" min="0" step="0.01" placeholder="0.00"></label>
    <label>Amount (RM)<input id="eAmount" type="number" min="0" step="0.01" required placeholder="0.00"></label>
    <label class="wide">Description<input id="eDesc" placeholder="Supplier, order number, purpose, notes..."></label>
  </form>`,async()=>{
    const category=$("#eCat").value;
    const sub=$("#eSub").value;
    if(!category)return toast("Please select an expense category.");
    const storedCategory=sub?`${category} · ${sub}`:category;
    const hours=Number($("#eHours").value||0);
    const rate=Number($("#eRate").value||0);
    if(category==="Salary" && sub==="Part-time" && hours>0 && rate>0){
      const computed=hours*rate;
      if(Math.abs(Number($("#eAmount").value||0)-computed)>0.01)return toast(`Part-time amount should be RM ${computed.toFixed(2)} (${hours}h × RM ${rate.toFixed(2)}).`);
    }
    const expenseDate=validDateString($("#eDate").value);
    if(!expenseDate)return toast("Please enter a valid date in YYYY-MM-DD format.");
    const payload={user_id:dataUserId(),expense_date:expenseDate,category:storedCategory,description:$("#eDesc").value,amount:Number($("#eAmount").value||0)};
    if(category==="Salary" && sub==="Part-time"){payload.hours_worked=hours||null;payload.hourly_rate=rate||null;}
    const {error}=await sb.from("expenses").insert(payload);
    if(error)return toast(errText(error));closeModal();toast("Expense added.");await render.expenses();
  });
  initEnglishDateField("eDate");
  const cat=$("#eCat"), sub=$("#eSub");
  const updatePartTimerFields=()=>{const isPT=cat.value==="Salary" && sub.value==="Part-time"; $("#eHoursWrap").style.display=isPT?"block":"none"; $("#eRateWrap").style.display=isPT?"block":"none";};
  const refreshSubs=()=>{const list=window.__expenseSubcategories?.[cat.value]||[];sub.innerHTML=`<option value="">Select subcategory</option>`+list.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join(""); updatePartTimerFields();};
  sub.addEventListener("change",updatePartTimerFields); cat.addEventListener("change",refreshSubs); refreshSubs();
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
function toggleNewOrderTypeFields(){
  const type=String($("#oOrderType")?.value||"walk_in");
  const wrap=$("#oScheduledWrap");
  if(wrap)wrap.classList.toggle("hidden",type!=="pre_order");
}

function toggleEditOrderTypeFields(){
  const type=String($("#eoOrderType")?.value||"walk_in");
  const wrap=$("#eoScheduledWrap");
  if(wrap)wrap.classList.toggle("hidden",type!=="pre_order");
}

async function openOrderModal(){
  const [{data:customers,error:ce},{data:products,error:pe},{data:categories,error:cate},{data:addons,error:ae},{data:links,error:le}]=await Promise.all([
    sb.from("customers").select("id,name").eq("user_id",dataUserId()).order("name"),
    sb.from("products").select("id,name,selling_price,calculated_cost,image_url,category_id").eq("user_id",dataUserId()).eq("active",true).order("name"),
    sb.from("categories").select("id,name").eq("user_id",dataUserId()).order("sort_order").order("name"),
    sb.from("addons").select("id,name,price,cost,active").eq("user_id",dataUserId()).eq("active",true).order("name"),
    sb.from("product_addons").select("product_id,addon_id").eq("user_id",dataUserId())
  ]);
  for(const e of [ce,pe,cate,ae,le]) if(e) throw e;
  window.__orderProducts=products||[];
  window.__orderAddons=addons||[];
  window.__orderAddonLinks=links||[];
  orderCart=[];

  const today=localDate();
  openModal("Add Order",`<div class="order-builder">
    <section class="order-menu-panel">
      <div class="order-meta-grid">
        <label>Order type<select id="oOrderType" onchange="toggleNewOrderTypeFields()"><option value="walk_in">Walk-in</option><option value="pre_order">Pre-order</option></select></label>
        <label id="oScheduledWrap" class="hidden">Pre-order date<div class="english-date-field"><input id="oScheduledDate" type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="YYYY-MM-DD" value="${today}"><button type="button" class="date-picker-btn" data-date-target="oScheduledDate" aria-label="Choose date" title="Choose date">▣</button></div></label>
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
        <label>Payment status<select id="oPaymentStatus"><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="partial">Partial</option></select></label>
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
    const orderType=orderTypeOf({order_type:String($("#oOrderType")?.value||"walk_in")});
    const scheduledDate=String($("#oScheduledDate")?.value||localDate()).trim();
    if(orderType==="pre_order" && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) return toast("Please enter the pre-order date as YYYY-MM-DD.");
    const orderDate=orderType==="walk_in"?localDate():scheduledDate;
    const {data:order,error}=await sb.from("orders").insert({user_id:dataUserId(),customer_id:$("#oCustomer").value||null,order_number:`ORD-${Date.now().toString().slice(-6)}`,order_type:orderType,scheduled_date:orderType==="pre_order"?scheduledDate:null,order_date:orderDate,status:$("#oStatus").value,subtotal,discount,delivery_fee:delivery,total,payment_status:$("#oPaymentStatus").value||"unpaid",payment_method:$("#oPayment").value||null,notes:notes||null}).select().single();
    if(error)return toast(errText(error));
    for(const item of orderCart){
      const addonUnit=orderAddonTotal(item), lineTotal=item.qty*(item.price+addonUnit);
      const {data:orderItem,error:ie}=await sb.from("order_items").insert({user_id:dataUserId(),order_id:order.id,product_id:item.productId,quantity:item.qty,unit_price:item.price,unit_cost:item.cost,addons_total:item.qty*addonUnit,line_total:lineTotal}).select('id').single();
      if(ie){await sb.from("orders").delete().eq("id",order.id);return toast(errText(ie));}
      if(item.addons?.length){
        const addonRows=item.addons.map(a=>({user_id:dataUserId(),order_item_id:orderItem.id,addon_id:a.id,quantity:item.qty,unit_price:Number(a.price||0),unit_cost:Number(a.cost||0)}));
        const {error:ae}=await sb.from('order_item_addons').insert(addonRows);
        if(ae){await sb.from("orders").delete().eq("id",order.id);return toast(errText(ae));}
      }
    }
    // Payment is the trigger for Sales. Completion still only controls inventory deduction.
    if(String(order.payment_status||"").toLowerCase()==="paid") {
      try{
        await createSaleForCompletedOrder(order.id);
      }catch(e){
        console.error("Auto sales creation failed:",e);
        return toast("Order was created, but Sales could not be created: "+errText(e));
      }
    }
    if(String(order.status)==="completed") {
      const {error:completeError}=await sb.rpc("complete_order_and_deduct_inventory",{p_order_id:order.id,p_user_id:dataUserId()});
      if(completeError){
        console.error("Auto-complete failed:",completeError);
        return toast("Order was created, but completion failed: "+errText(completeError));
      }
    }
    closeModal();toast(String(order.payment_status||"").toLowerCase()==="paid"?"Order created and Sales updated.":"Order created.");await navigate(currentPage);
  },"order-modal");
  renderOrderMenu();
  renderOrderCart();
  $("#oDiscount").addEventListener("input",renderOrderCart);
  $("#oDelivery").addEventListener("input",renderOrderCart);
}

window.openInvoiceModal=openInvoiceModal;window.viewInvoice=viewInvoice;window.printInvoice=printInvoice;window.downloadInvoicePDF=downloadInvoicePDF;window.downloadInvoicePNG=downloadInvoicePNG;window.deleteInvoice=deleteInvoice;window.toggleOrderAddonPanel=toggleOrderAddonPanel;window.setOrderAddonDraft=setOrderAddonDraft;window.addDraftedOrderProduct=addDraftedOrderProduct;window.addOrderProduct=addOrderProduct;window.changeOrderQty=changeOrderQty;window.menuDragStart=menuDragStart;window.menuDragEnd=menuDragEnd;window.menuDragOver=menuDragOver;window.menuDrop=menuDrop;window.moveProductByOffset=moveProductByOffset;window.openProductModal=openProductModal;window.openCategoryModal=openCategoryModal;window.openAddonModal=openAddonModal;window.addAddonRecipeRow=addAddonRecipeRow;window.updateAddonRecipePreview=updateAddonRecipePreview;window.openStaffModal=openStaffModal;window.deleteStaff=deleteStaff;window.openInventoryItemModal=openInventoryItemModal;window.openInventoryItemModalById=openInventoryItemModalById;window.deleteInventoryItem=deleteInventoryItem;window.setInventoryFilter=setInventoryFilter;window.openIngredientModal=openIngredientModal;window.openIngredientModalById=openIngredientModalById;window.openPackagingModal=openPackagingModal;window.openPackagingModalById=openPackagingModalById;window.openSubrecipeModal=openSubrecipeModal;window.deleteSubrecipe=deleteSubrecipe;window.addSubrecipeRow=addSubrecipeRow;window.changeSubrecipeType=changeSubrecipeType;window.updateSubrecipePreview=updateSubrecipePreview;window.openCustomerModal=openCustomerModal;window.openExpenseModal=openExpenseModal;window.openOrderModal=openOrderModal;window.closeModal=closeModal;window.deleteRow=deleteRow;window.deleteOrder=deleteOrder;window.completeOrder=completeOrder;
window.openWastageModal=openWastageModal;window.updateWastagePreview=updateWastagePreview;window.deleteWastage=deleteWastage;
window.openOrderDateEditor=openOrderDateEditor;window.openOrderEditModal=openOrderEditModal;window.addEditOrderItem=addEditOrderItem;window.renderEditOrderNewItems=renderEditOrderNewItems;window.updateEditOrderNewQty=updateEditOrderNewQty;window.removeEditOrderNewItem=removeEditOrderNewItem;window.render=render;window.openMenuCategory=openMenuCategory;window.renderMenuCategories=renderMenuCategories;window.printKitchenOrder=printKitchenOrder;window.printAllPendingKitchen=printAllPendingKitchen;

window.addEventListener("error",e=>{ console.error("NUONUO runtime error:",e.error||e.message); });
window.addEventListener("unhandledrejection",e=>{ console.error("NUONUO promise error:",e.reason); });
bindCoreEvents();
document.addEventListener("click",e=>{
  const btn=e.target.closest(".date-picker-btn");
  if(!btn)return;
  const field=btn.closest(".english-date-field");
  const input=field?.querySelector("input");
  if(input){e.preventDefault();e.stopPropagation();openEnglishCalendar(input);}
});
const englishDateObserver=new MutationObserver(()=>{
  initAllEnglishDateFields();
  document.querySelectorAll('input[type="date"]').forEach(input=>{
    // Never allow the browser/Windows native calendar to appear.
    const wrapper=input.closest(".english-date-field");
    if(wrapper){
      input.type="text";
      input.setAttribute("inputmode","numeric");
      input.setAttribute("autocomplete","off");
      input.setAttribute("placeholder","YYYY-MM-DD");
    }
  });
});
englishDateObserver.observe(document.body,{childList:true,subtree:true});
init();
