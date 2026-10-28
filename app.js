/* TRT web app: Firestore persistent work records and browser DOCX generator. */
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => (
  {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]
));
const pad = n => String(n).padStart(2,"0");
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function parseDay(day) {const [y,m,d]=day.split("-").map(Number);return new Date(y,m-1,d);}
const today = iso(new Date());
const state = {
  month: today.substring(0,7),
  selected: today,
  categories: [],
  monthEntries: [],
  logEntries: [],
  invoiceEntries: [],
  view: "calendar",
  fromEntryCategory: false,
  quantityAuto: true
};

const arabicMonths = Array.from({length:12},(_,i)=>new Intl.DateTimeFormat("ar",{month:"long"}).format(new Date(2026,i,1)));
const englishMonths = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function msg(text, error=false) {
  const el=$("toast");el.textContent=text;el.className="toast visible"+(error?" error":"");
  clearTimeout(msg.timer);msg.timer=setTimeout(()=>el.className="toast",4600);
}
const api = (...args)=>window.TRTCloud.api(...args);
const dateDisplay = d => new Intl.DateTimeFormat("ar",{day:"numeric",month:"long",year:"numeric"}).format(parseDay(d));
const dayName = d => new Intl.DateTimeFormat("ar",{weekday:"long"}).format(parseDay(d));
function monthLabel(month){const [y,m]=month.split("-").map(Number);return `${arabicMonths[m-1]} ${y}`;}
function tag(name){return `<span class="tag">${esc(name)}</span>`;}
function weekdayEntryLabel(item){return `${esc(item.category)} · ${esc(item.story)}`;}

async function refreshMonth(){
  try {
    const data=await api("/api/state?month="+encodeURIComponent(state.month));
    state.categories=data.categories;
    state.monthEntries=data.entries;
    $("monthTitle").textContent=monthLabel(state.month);
    $("statRecords").textContent=data.stats.records;
    $("statServices").textContent=data.stats.services;
    $("statLive").textContent=data.stats.live;
    $("statDays").textContent=data.stats.days;
    renderCalendar();renderDay();fillCategories();
  }catch(e){msg(e.message,true);}
}
// Work times are always UTC/GMT clock values; the browser timezone is never applied.
function normalizeTime(raw){
  const s=String(raw||"").trim();
  if(!/^\d{1,2}(:[0-5]\d)?$/.test(s))return null;
  const [hours,minutes="00"]=s.split(":");
  const hour=Number(hours);
  return hour>=0&&hour<=23 ? pad(hour)+":"+minutes : null;
}
function parseTimes(raw){
  return [...new Set(String(raw||"").split(/\s*[/,،;\n]+\s*/).filter(Boolean)
    .map(normalizeTime).filter(Boolean))].sort();
}
function firstTime(e){return parseTimes(e.gmt)[0]||"99:99";}
function byGmt(a,b){return firstTime(a).localeCompare(firstTime(b))||a.id-b.id;}
let pickedTimes=[];
function updateTimeChips(){
  pickedTimes=[...new Set(pickedTimes)].sort();
  $("entryGmt").value=pickedTimes.join(" / ");
  $("gmtTimeChips").innerHTML=pickedTimes.length
    ? pickedTimes.map(t=>`<span class="gmt-chip"><b dir="ltr">${t}</b><button type="button" data-remove-gmt="${t}" aria-label="حذف موعد ${t}">×</button></span>`).join("")
    : '<span class="gmt-empty">لم تختر أي وقت بعد.</span>';
  updateQtyHint();
}
function addPickedTime(raw){
  const normalized=normalizeTime(raw);
  if(!normalized){msg("استخدم GMT بين 00:00 و23:59. مثال: 14:35",true);return;}
  if(pickedTimes.includes(normalized)){msg("هذا الموعد مضاف مسبقًا.",true);return;}
  pickedTimes.push(normalized);
  updateTimeChips();
}
function renderCalendar(){
  const [year,month]=state.month.split("-").map(Number);
  const total=new Date(year,month,0).getDate();
  const shift=(new Date(year,month-1,1).getDay()+1)%7; // Saturday-first grid
  const byDay={};
  for(const entry of state.monthEntries) (byDay[entry.date] ||= []).push(entry);
  let cells="";
  for(let i=0;i<Math.ceil((shift+total)/7)*7;i++){
    const day=i-shift+1;
    if(day<1||day>total){cells+=`<div class="cal-day blank" aria-hidden="true"></div>`;continue;}
    const key=`${year}-${pad(month)}-${pad(day)}`;
    const entries=(byDay[key]||[]).sort(byGmt);
    const todayClass=key===today?" today":"";
    const selectedClass=key===state.selected?" selected":"";
    // Show all appointments inside this same day cell, including multiple GMT times.
    const items=entries.map(x=>{
      const time=parseTimes(x.gmt);
      const label=x.category==="LIVE DTL"?"LIVE":x.category;
      const stamp=time.length?time.join("، "):"";
      return `<span class="day-mark" title="${esc(x.category+" · "+x.story+" · "+stamp)}">
        ${stamp?`<b dir="ltr">${esc(stamp)}</b> `:""}${esc(label)}</span>`;
    }).join("");
    cells+=`<button type="button" class="cal-day${todayClass}${selectedClass}" data-date="${key}" aria-label="${esc(dateDisplay(key))}, ${entries.length} إنجاز">
      <span class="day-number">${day}</span>
      <span class="calendar-appointments">${items}</span>
      ${entries.length?`<span class="cal-count">${entries.length} إنجاز · ${entries.reduce((s,x)=>s+x.quantity,0)} خدمة</span>`:""}
    </button>`;
  }
  $("calendarGrid").innerHTML=cells;
}
function renderDay(){
  const entries=state.monthEntries.filter(r=>r.date===state.selected).sort(byGmt);
  $("selectedDayTitle").textContent=dateDisplay(state.selected);
  $("selectedDaySub").textContent=`${dayName(state.selected)} · ${entries.length} إنجاز · ${entries.reduce((n,x)=>n+x.quantity,0)} خدمة`;
  const el=$("dayEntries");
  if(!entries.length){
    el.innerHTML=`<div class="empty"><div class="empty-symbol">▤</div><strong>لا توجد إنجازات لهذا اليوم</strong><p>يمكنك تسجيل بث مباشر أو تقرير أو أي عمل آخر.</p>
    <button type="button" class="btn secondary" data-day-add="1">＋ تسجيل إنجاز</button></div>`;
    return;
  }
  el.innerHTML=entries.map(x=>{
    const times=parseTimes(x.gmt);
    return `<div class="day-entry" style="border-right-color:${esc(x.color)}">
      <div class="day-entry-top">${tag(x.category)}<span class="entry-qty">${x.quantity} ${x.quantity===1?"خدمة":"خدمات"}</span></div>
      <div class="day-entry-story">${esc(x.story)}</div>
      ${times.length?`<div class="entry-time-list">${times.map(t=>`<span dir="ltr">GMT ${t}</span>`).join("")}</div>`:""}
      <div class="day-entry-bottom"><span dir="ltr">${times.length?times.length+" مواعيد GMT":esc(x.gmt)||"—"}</span>
        <div class="row-actions"><button type="button" data-edit="${x.id}">تعديل</button><button type="button" class="danger" data-delete="${x.id}">حذف</button></div></div>
    </div>`;
  }).join("");
}
function fillCategories(){
  const c=state.categories;
  const formCurrent=$("entryCategory").value;
  $("entryCategory").innerHTML=c.map(x=>`<option value="${x.id}">${esc(x.name)} — ${esc(x.label)}</option>`).join("");
  if(formCurrent && c.some(x=>String(x.id)===formCurrent)) $("entryCategory").value=formCurrent;
  const logCurrent=$("logCategory").value;
  $("logCategory").innerHTML='<option value="">جميع الفئات</option>'+c.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("");
  $("logCategory").value=logCurrent;
  $("categoriesGrid").innerHTML=c.map((cat,i)=>`<article class="cat-card">
    <div class="cat-symbol" style="color:${esc(cat.color)}">◇</div>
    <strong>${esc(cat.name)}</strong><p>${esc(cat.label)}</p>
  </article>`).join("");
}
function changeMonth(offset){
  const [y,m]=state.month.split("-").map(Number);
  const date=new Date(y,m-1+offset,1);
  state.month=iso(date).slice(0,7);
  state.selected=iso(date);
  refreshMonth();
}
function switchView(view){
  state.view=view;
  document.querySelectorAll(".nav-link").forEach(x=>x.classList.toggle("active",x.dataset.view===view));
  document.querySelectorAll(".view").forEach(x=>x.classList.toggle("active",x.id==="view-"+view));
  const titles={calendar:["تقويم الإنجازات","وثّق كل إنجاز في يومه، وجهّز الفاتورة عندما تحتاج إليها."],
    log:["سجل الإنجازات","جميع الأعمال قابلة للمراجعة والتعديل في أي وقت."],
    invoice:["إصدار الفاتورة","اختر الفترة والمبلغ، ثم حمّل ملف Word بنفس قالب TRT."],
    categories:["فئات العمل","أنواع الخدمات الموجودة في الفاتورة، مع خيار إضافة أنواع جديدة."]};
  $("pageTitle").textContent=titles[view][0];$("pageSubtitle").textContent=titles[view][1];
  $("breadcrumb").textContent="إدارة العمل / "+titles[view][0];
  if(view==="log")loadLog();
  if(view==="invoice")refreshInvoice();
  if(view==="categories")fillCategories();
}
function openEntry(entry=null, dateToUse=null){
  $("entryId").value=entry?.id||"";
  $("entryModalTitle").textContent=entry?"تعديل الإنجاز":"إضافة إنجاز جديد";
  $("entryDate").value=entry?.date||dateToUse||state.selected;
  $("entryCategory").value=entry?.category_id||state.categories[0]?.id||"";
  // Historical categories remain readable; choose a canonical category on edit.
  if(!$("entryCategory").value)$("entryCategory").value="1";
  $("entryStory").value=entry?.story||"";
  pickedTimes=parseTimes(entry?.gmt||"");
  $("gmtManual").value="";
  $("entryQuantity").value=entry?.quantity||1;
  state.quantityAuto=!entry;
  updateTimeChips();
  $("entryModal").hidden=false;
  $("entryStory").focus();
}
function closeModal(id){$(id).hidden=true;}
function updateQtyHint(){
  const category=state.categories.find(x=>String(x.id)===$("entryCategory").value);
  const isLive=category?.name==="LIVE DTL";
  if(isLive && pickedTimes.length && state.quantityAuto)
    $("entryQuantity").value=pickedTimes.length;
  $("qtyHint").textContent=isLive
    ? "يُحسب عدد مداخلات LIVE DTL تلقائيًا من مواعيد GMT. يمكن تعديل العدد يدويًا."
    : "يمكنك تعديل العدد يدويًا. الأوقات اختيارية للفئات غير المباشرة.";
}
function findEntry(id){
  return [...state.monthEntries,...state.logEntries,...state.invoiceEntries].find(x=>x.id===id);
}
async function deleteEntry(id){
  const item=findEntry(id);
  if(!item || !confirm(`حذف إنجاز "${item.story}" بتاريخ ${item.date}؟ لا يمكن التراجع.`))return;
  try{
    await api("/api/entries/"+id,"DELETE");
    msg("تم حذف الإنجاز");
    await refreshMonth();
    if(state.view==="log")await loadLog();
    if(state.view==="invoice")await refreshInvoice();
  }catch(e){msg(e.message,true);}
}
async function saveEntry(e){
  e.preventDefault();
  // Manual and preset GMT times are independent alternatives.
  const pending=$("gmtManual").value.trim();
  const selectedCategory=state.categories.find(c=>String(c.id)===$("entryCategory").value);
  if(pending){
    const normalized=normalizeTime(pending);
    if(!normalized){
      msg("الوقت اليدوي يجب أن يكون GMT بصيغة HH:mm مثل 14:35.",true);return;
    }
    if(!pickedTimes.includes(normalized))addPickedTime(normalized);
    $("gmtManual").value="";
  } else if(selectedCategory?.name==="LIVE DTL" && pickedTimes.length===0){
    addPickedTime($("gmtHour").value);
  }
  const id=$("entryId").value;
  const data={
    date:$("entryDate").value,
    category_id:Number($("entryCategory").value),
    story:$("entryStory").value.trim(),
    gmt:pickedTimes.join(" / "),
    quantity:Number($("entryQuantity").value)
  };
  if(!data.story){msg("أدخل وصف الإنجاز",true);return;}
  if(selectedCategory?.name==="LIVE DTL"&&!pickedTimes.length){
    msg("اختر على الأقل موعد بث واحد بتوقيت GMT.",true);return;
  }
  try{
    await api(id?"/api/entries/"+id:"/api/entries",id?"PUT":"POST",data);
    closeModal("entryModal");msg(id?"تم تعديل الإنجاز وحفظه في قاعدة البيانات":"تم تسجيل الإنجاز وحفظه في قاعدة البيانات");
    state.month=data.date.slice(0,7);state.selected=data.date;
    await refreshMonth();
    if(state.view==="log")await loadLog();
    if(state.view==="invoice")await refreshInvoice();
  }catch(err){msg(err.message,true);}
}
function openCategory(fromEntry=false){
  state.fromEntryCategory=fromEntry;
  $("categoryForm").reset();$("categoryModal").hidden=false;$("catName").focus();
}
async function saveCategory(e){
  e.preventDefault();
  try {
    const result=await api("/api/categories","POST",{name:$("catName").value.trim(),label:$("catLabel").value.trim()});
    const data=await api("/api/categories");
    state.categories=data.categories;
    fillCategories();closeModal("categoryModal");
    if(state.fromEntryCategory) $("entryCategory").value=String(result.id);
    msg("تم إنشاء الفئة الجديدة، ويمكن استخدامها في الفاتورة");
  }catch(err){msg(err.message,true);}
}
async function loadLog(){
  try{
    const start=$("logStart").value,end=$("logEnd").value;
    if(!start||!end)return;
    const data=await api(`/api/entries?start=${start}&end=${end}`);
    state.logEntries=data.entries;
    renderLog();
  }catch(err){msg(err.message,true);}
}
function renderLog(){
  const catId=$("logCategory").value;
  const rows=state.logEntries.filter(r=>!catId||String(r.category_id)===catId);
  const qty=rows.reduce((n,x)=>n+x.quantity,0);
  $("logSummary").innerHTML=`<strong>${rows.length}</strong> بندًا · <strong>${qty}</strong> خدمة · ${new Set(rows.map(r=>r.date)).size} يومًا`;
  $("logTable").innerHTML=rows.length?rows.map(x=>`<tr>
    <td dir="ltr">${esc(x.date)}</td>
    <td>${tag(x.category)}<div class="story-text">${esc(x.story)}</div></td>
    <td dir="ltr">${esc(parseTimes(x.gmt).join(" / ")||x.gmt)||"—"}</td>
    <td><span class="qty-badge">${x.quantity}</span></td>
    <td><div class="row-actions"><button data-edit="${x.id}">تعديل</button><button class="danger" data-delete="${x.id}">حذف</button></div></td>
  </tr>`).join(""):`<tr><td colspan="5"><div class="empty"><strong>لا توجد إنجازات لهذه الفترة</strong><p>غيّر التواريخ أو أضف إنجازًا جديدًا.</p></div></td></tr>`;
}
async function refreshInvoice(){
  const start=$("invStart").value,end=$("invEnd").value;
  if(!start||!end)return;
  try{
    const data=await api(`/api/entries?start=${start}&end=${end}`);
    state.invoiceEntries=data.entries;
    const rows=data.entries;
    $("previewStats").innerHTML=`<span><strong>${rows.length}</strong> بندًا</span><span><strong>${rows.reduce((s,r)=>s+r.quantity,0)}</strong> خدمة</span><span>${esc(start)} — ${esc(end)}</span>`;
    $("invoicePreview").innerHTML=rows.length?rows.map(x=>`<tr>
       <td>${esc(x.date.split("-").reverse().map(Number).join("-"))}</td>
       <td>${x.quantity}</td>
       <td><b>${esc(x.category)}</b><span>${esc(x.story)}</span></td>
       <td dir="ltr">${esc(parseTimes(x.gmt).join(" / ")||x.gmt)}</td>
      </tr>`).join(""):`<tr><td colspan="4" style="padding:35px;text-align:center;color:#95a7ad">لا توجد إنجازات خلال الفترة المحددة.</td></tr>`;
    updatePreviewAmount();
  }catch(err){msg(err.message,true);}
}
function updatePreviewAmount(){
  const raw=$("invAmount").value.trim();
  const x=Number(raw);
  $("previewAmount").textContent=raw!=="" && Number.isFinite(x) && x>=0
    ? "$"+x.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:2})
    : "—";
}
async function generateInvoice(e){
  e.preventDefault();
  const data={
    start:$("invStart").value,end:$("invEnd").value,
    month:Number($("invMonth").value),year:Number($("invYear").value),
    amount:$("invAmount").value,sender:$("invSender").value.trim()
  };
  if(data.amount==="" || !Number.isFinite(Number(data.amount))) {
    msg("أدخل مبلغ الفاتورة",true);return;
  }
  const button=$("invoiceForm").querySelector('[type="submit"]');
  try {
    button.disabled=true;button.textContent="جارٍ إعداد ملف Word…";
    const invoiceData=await api(`/api/entries?start=${encodeURIComponent(data.start)}&end=${encodeURIComponent(data.end)}`);
    const blob=await window.TRTDocx.makeInvoice(invoiceData.entries,data);
    window.TRTCloud.download(blob,`فاتورة شهر ${data.month}-${data.year}.docx`);
    msg("تم إصدار فاتورة Word وفق النموذج الأصلي");
  }catch(err){msg(err.message,true);}
  finally{button.disabled=false;button.textContent="↓ إصدار الفاتورة بصيغة Word";}
}
function init(){
  $("todayText").textContent=dateDisplay(today);
  $("logStart").value=today.slice(0,7)+"-01";$("logEnd").value=today;
  $("invMonth").innerHTML=englishMonths.map((name,i)=>`<option value="${i+1}" ${i===new Date().getMonth()?"selected":""}>${arabicMonths[i]} — ${name}</option>`).join("");
  document.querySelectorAll(".nav-link").forEach(el=>el.addEventListener("click",()=>switchView(el.dataset.view)));
  $("prevMonth").onclick=()=>changeMonth(-1);
  $("nextMonth").onclick=()=>changeMonth(1);
  $("goToday").onclick=()=>{state.month=today.slice(0,7);state.selected=today;refreshMonth();};
  $("calendarGrid").onclick=(e)=>{
    const b=e.target.closest("[data-date]");
    if(!b)return;state.selected=b.dataset.date;renderCalendar();renderDay();openEntry();
  };
  $("dayEntries").onclick=e=>{
    if(e.target.closest("[data-day-add]"))openEntry();
  };
  ["topAddBtn","logAddBtn","addForDay"].forEach(id=>$(id).onclick=()=>openEntry());
  $("entryForm").addEventListener("submit",saveEntry);
  $("gmtHour").innerHTML=Array.from({length:24},(_,h)=>`<option value="${pad(h)}:00">${pad(h)}:00 GMT</option>`).join("");
  $("addGmtHour").onclick=()=>addPickedTime($("gmtHour").value);
  $("gmtHour").addEventListener("change",()=>addPickedTime($("gmtHour").value));
  $("addGmtManual").onclick=()=>{
    const raw=$("gmtManual").value;
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)){msg("الوقت اليدوي بصيغة 24 ساعة، مثل 08:30 أو 17:45.",true);return;}
    addPickedTime(raw);
    $("gmtManual").value="";
  };
  $("gmtManual").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("addGmtManual").click();}});
  $("gmtTimeChips").addEventListener("click",e=>{
    const b=e.target.closest("[data-remove-gmt]");
    if(b){pickedTimes=pickedTimes.filter(t=>t!==b.dataset.removeGmt);updateTimeChips();}
  });
  $("entryCategory").addEventListener("change",updateQtyHint);
  $("entryQuantity").addEventListener("input",()=>{state.quantityAuto=false;});
  $("inlineAddCategory").onclick=()=>openCategory(true);
  $("addCategoryBtn").onclick=()=>openCategory(false);
  $("categoryForm").addEventListener("submit",saveCategory);
  document.querySelectorAll("[data-close]").forEach(x=>x.onclick=()=>closeModal(x.dataset.close));
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"){closeModal("categoryModal");closeModal("entryModal");}
  });
  document.querySelectorAll(".modal-backdrop").forEach(x=>x.addEventListener("click",e=>{
    if(e.target===x)closeModal(x.id);
  }));
  document.addEventListener("click",e=>{
    const edit=e.target.closest("[data-edit]");
    const del=e.target.closest("[data-delete]");
    if(edit){const ent=findEntry(Number(edit.dataset.edit));if(ent)openEntry(ent);}
    else if(del)deleteEntry(Number(del.dataset.delete));
  });
  $("refreshLog").onclick=loadLog;
  $("logCategory").onchange=renderLog;
  $("previewBtn").onclick=refreshInvoice;
  $("invStart").addEventListener("change",refreshInvoice);
  $("invEnd").addEventListener("change",refreshInvoice);
  $("invAmount").addEventListener("input",updatePreviewAmount);
  $("invoiceForm").addEventListener("submit",generateInvoice);
  $("exportCsv").onclick=()=>{
    const start=$("invStart").value,end=$("invEnd").value;
    api(`/api/entries?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`).then(x=>window.TRTCloud.csv(x.entries)).catch(e=>msg(e.message,true));
  };
  const backup=async ()=>{try {await window.TRTCloud.backup();msg("تم تنزيل نسخة احتياطية");}catch(e){msg(e.message,true);}};
  $("backupBtn").onclick=backup;
  $("mobileBackupBtn").onclick=backup;
  const askRestore=()=>$("restoreFile").click();
  $("restoreBtn").onclick=askRestore;
  $("mobileRestoreBtn").onclick=askRestore;
  $("restoreFile").onchange=async ()=>{
    const file=$("restoreFile").files[0];
    if(!file) return;
    if(!confirm("سيستبدل الاسترجاع جميع التسجيلات والفئات الموجودة حاليًا. سيتم حفظ نسخة احتياطية قبل الاستبدال. هل تريد المتابعة؟")){ $("restoreFile").value=""; return; }
    try {
      const data=JSON.parse(await file.text());
      await window.TRTCloud.backup();  // Save local recovery copy before destructive import.
      const response=await api("/api/restore","POST",data);
      msg("تم استعادة "+response.count+" تسجيلًا بنجاح");
      await refreshMonth();
      if(state.view==="log")await loadLog();
      if(state.view==="invoice")await refreshInvoice();
    } catch(e) {msg("فشلت الاستعادة: "+e.message,true);}
    finally {$("restoreFile").value="";}
  };
  const logout=async ()=>{try {await window.TRTCloud.signOut();msg("تم تسجيل الخروج");}catch(e){msg(e.message,true);}};
  $("logoutBtn").onclick=logout;
  $("mobileLogoutBtn").onclick=logout;
  window.addEventListener("offline",()=>msg("لا يوجد اتصال بالإنترنت. لا يتم حفظ إضافات جديدة حتى يعود الاتصال.",true));
  refreshMonth();
}
window.TRTAppInit=init;
window.TRTAppRefresh=refreshMonth;
