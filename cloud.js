/* TRT cloud backend: Firebase Authentication + Firestore.
   All work entries are private to the signed-in Firebase uid. */
"use strict";
(function(){
  // Canonical invoice category names supplied by the user (unique, exact spelling).
  // IDs 1–3 are kept for historical entries already saved in Firestore.
  const DEFAULT_CATEGORIES = [
    {id:3,name:"WALK&TALK",label:"واك أند توك",color:"#985acb"},
    {id:1,name:"LIVE DTL",label:"بث مباشر",color:"#2f70d4"},
    {id:8,name:"INTERVIEW",label:"مقابلة",color:"#71809a"},
    {id:2,name:"PKG",label:"تقرير مصور",color:"#0b997e"},
    {id:9,name:"Deployment Expenses",label:"مصاريف التغطية",color:"#dc8b21"},
    {id:10,name:"OTHERS",label:"أخرى — اكتب نوع العمل في وصف الإنجاز",color:"#64748b"}
  ];
  const LEGACY_CATEGORIES = [
    {id:4,name:"RUSHES",label:"مواد خام",color:"#dc8b21"},
    {id:5,name:"سلسلة قصص الصمود",label:"وثائقي",color:"#ba6889"},
    {id:6,name:"تصوير برومو",label:"برومو",color:"#327e99"},
    {id:7,name:"حوار خاص",label:"مقابلة خاصة",color:"#71809a"}
  ];
  const canonical = name => String(name).replace(/\s*&\s*/g,"&").trim().toLowerCase();
  function normalizeGmt(value){
    const raw=String(value||"").trim();
    if(!raw)return "";
    const fields=raw.split(/\s*[/,،;\n]+\s*/).filter(Boolean);
    if(!fields.length||fields.length>200)throw Error("عدد مواعيد GMT غير صالح.");
    const out=fields.map(s=>{
      if(!/^\d{1,2}(:[0-5]\d)?$/.test(s))throw Error("استخدم وقت GMT بصيغة 08:00 أو 15:30.");
      const [h,m="00"]=s.split(":");
      if(Number(h)>23)throw Error("ساعة GMT يجب أن تكون بين 00 و23.");
      return String(Number(h)).padStart(2,"0")+":"+m;
    });
    return [...new Set(out)].sort().join(" / ");
  }
  const firstGmt = value => {
    try{return normalizeGmt(value).split(" / ")[0]||"99:99";}catch{return "99:99";}
  };
  let db,auth,uid,initialized=false;
  const $=id=>document.getElementById(id);
  const errorText = err => {
    const code=String(err?.code||"");
    if(code==="auth/invalid-credential" || code==="auth/wrong-password" || code==="auth/user-not-found")
      return "البريد الإلكتروني أو كلمة المرور غير صحيحين.";
    if(code==="auth/unauthorized-domain") return "أضف نطاق موقع GitHub Pages إلى Authorized domains في Firebase Authentication.";
    if(code==="permission-denied") return "تم منع القراءة أو الحفظ؛ انشر قواعد Firestore المرفقة بالمشروع.";
    if(code==="auth/too-many-requests") return "محاولات دخول كثيرة. حاول لاحقًا.";
    return err?.message||"تعذّر الاتصال بالخدمة.";
  };
  function requireLogin(){if(!uid||!db)throw Error("سجّل الدخول أولاً.");}
  const col = name => {requireLogin();return db.collection("users").doc(uid).collection(name);};
  function safeNumber(v,min,max){let n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error("قيمة عددية غير صالحة");return n;}
  function idNum(){return Date.now()*1000+Math.floor(Math.random()*1000);}
  const ordered=(xs)=>xs.sort((a,b)=>a.date.localeCompare(b.date)||
    firstGmt(a.gmt).localeCompare(firstGmt(b.gmt))||
    (a.sequence||0)-(b.sequence||0)||a.id-b.id);
  async function categories(){
    const custom=await col("categories").get();
    const names=new Set(DEFAULT_CATEGORIES.map(x=>canonical(x.name)));
    const extras=custom.docs.map(x=>({id:Number(x.id),...x.data()})).filter(x=>{
      const key=canonical(x.name);
      if(names.has(key))return false;
      names.add(key);return true;
    });
    return [...DEFAULT_CATEGORIES,...extras];
  }
  async function entries(start="",end=""){
    const [cats,snap]=await Promise.all([categories(),col("entries").get()]);
    const map=new Map([...LEGACY_CATEGORIES,...cats].map(x=>[Number(x.id),x]));
    return ordered(snap.docs.map(doc=>{
      let x=doc.data();
      let c=map.get(Number(x.category_id))||{name:x.category||"أخرى",color:"#667b8f",label:""};
      return { ...x, id:Number(doc.id), category:c.name,label:c.label,color:c.color};
    }).filter(x=>(!start||x.date>=start)&&(!end||x.date<=end)));
  }
  async function api(path,method="GET",data=null){
    requireLogin();
    const url=new URL(path,"https://trt.local"), p=url.pathname;
    const s=url.searchParams;
    if(method==="GET" && p==="/api/categories") return {categories:await categories()};
    if(method==="GET" && p==="/api/state"){
      const month=s.get("month")||new Date().toISOString().slice(0,7);
      const rows=await entries(month+"-01",month+"-31");
      return {categories:await categories(),entries:rows,
        stats:{records:rows.length,services:rows.reduce((n,x)=>n+x.quantity,0),
          live:rows.filter(x=>x.category==="LIVE DTL").reduce((n,x)=>n+x.quantity,0),
          days:new Set(rows.map(x=>x.date)).size}};
    }
    if(method==="GET" && p==="/api/entries"){
      return {entries:await entries(s.get("start")||"",s.get("end")||"")};
    }
    if(method==="POST" && p==="/api/categories"){
      const name=String(data.name||"").trim();
      if(!name||name.length>120)throw Error("الاسم مطلوب (حتى 120 حرفًا).");
      if((await categories()).some(x=>canonical(x.name)===canonical(name)))throw Error("الفئة موجودة مسبقًا.");
      const id=idNum();
      await col("categories").doc(String(id)).set({id,name,label:String(data.label||"").trim().slice(0,120),color:"#667b8f"});
      return {id};
    }
    if((method==="POST" && p==="/api/entries") || (["PUT","DELETE"].includes(method) && /^\/api\/entries\/\d+$/.test(p))){
      const id=method==="POST"?idNum():Number(p.split("/").pop());
      const doc=col("entries").doc(String(id));
      if(method==="DELETE"){await doc.delete();return {ok:true};}
      const category_id=safeNumber(data.category_id,1,Number.MAX_SAFE_INTEGER);
      if(!(await categories()).some(x=>Number(x.id)===category_id))throw Error("اختر فئة صحيحة.");
      const date=String(data.date||"");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw Error("تاريخ غير صالح.");
      const story=String(data.story||"").trim();
      if(!story||story.length>1500) throw Error("وصف العمل مطلوب (حتى 1500 حرف).");
      const gmt=normalizeGmt(data.gmt);
      if(gmt.length>200)throw Error("مواعيد كثيرة جدًا؛ قسّم الإنجاز إلى تسجيلين.");
      const quantity=safeNumber(data.quantity,1,1000);
      if(!Number.isInteger(quantity))throw Error("العدد يجب أن يكون رقمًا صحيحًا");
      const payload={date,category_id,story,gmt,quantity,updated_at:new Date().toISOString()};
      await doc.set(payload,{merge:true});
      return {id};
    }
    if(method==="POST" && p==="/api/restore") {
      return await restoreBackup(data);
    }
    if(method==="POST" && p==="/api/logout"){await auth.signOut();return {ok:true};}
    throw Error("عملية غير مدعومة: "+method+" "+p);
  }
  async function backup(){
    const [all,cats]=await Promise.all([entries(),categories()]);
    download(new Blob([JSON.stringify({version:2,exported_at:new Date().toISOString(),categories:cats,entries:all},null,2)],{type:"application/json;charset=utf-8"}),"TRT_نسخة_احتياطية.json");
  }
  function download(blob,filename){
    const a=document.createElement("a"),url=URL.createObjectURL(blob);
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),8000);
  }
  async function restoreBackup(payload){
    if(!payload || !Array.isArray(payload.entries) || !Array.isArray(payload.categories))throw Error("ملف استعادة غير صحيح.");
    if(payload.entries.length>10000 || payload.categories.length>250)throw Error("ملف كبير جدًا.");
    // Reassign identifiers to avoid collisions. Map old categories from either category_id or name.
    const incomingCategories=payload.categories.map(c=>({
      oldId:Number(c.id),name:String(c.name||"").trim().slice(0,120),
      label:String(c.label||"").slice(0,120),color: /^#[0-9a-f]{6}$/i.test(c.color)?c.color:"#667b8f"
    })).filter(c=>c.name);
    let newCats=[],oldToNew=new Map();
    const newCategoryBase=idNum();
    for (const c of incomingCategories) {
      const built=DEFAULT_CATEGORIES.find(d=>canonical(d.name)===canonical(c.name));
      const id=built?.id??(newCategoryBase+newCats.length);
      oldToNew.set(c.oldId,id);
      if(!built && !newCats.some(x=>x.name===c.name))newCats.push({id,name:c.name,label:c.label,color:c.color});
    }
    const byName=new Map([...LEGACY_CATEGORIES,...DEFAULT_CATEGORIES,...newCats].map(x=>[x.name,x.id]));
    const newEntryBase=Math.max(idNum(),newCategoryBase+newCats.length+10);
    const restored=payload.entries.map((e,i)=>{
      const catId=oldToNew.get(Number(e.category_id))||byName.get(String(e.category||"").trim());
      const date=String(e.date||"");
      const story=String(e.story||"").trim().slice(0,1500);
      if(!catId||!/^\d{4}-\d\d-\d\d$/.test(date)||!story) throw Error("بعض التسجيلات غير صالحة أو فئاتها غير معروفة.");
      return {id:newEntryBase+i,date,category_id:catId,story,gmt:String(e.gmt||"").slice(0,200),
        quantity:safeNumber(e.quantity,1,1000),updated_at:new Date().toISOString()};
    });
    const before=await Promise.all([col("entries").get(),col("categories").get()]);
    const operations=[
      ...before[0].docs.map(d=>b=>b.delete(d.ref)),
      ...before[1].docs.map(d=>b=>b.delete(d.ref)),
      ...newCats.map(c=>b=>b.set(col("categories").doc(String(c.id)),c)),
      ...restored.map(r=>b=>b.set(col("entries").doc(String(r.id)),r))
    ];
    // Firestore batches have 500-write limit; restoration >500 can be partially applied on interruption.
    for(let i=0;i<operations.length;i+=400){
      const batch=db.batch();
      for(const op of operations.slice(i,i+400))op(batch);
      await batch.commit();
    }
    return {ok:true,count:restored.length};
  }
  function csv(rows) {
    const header=["التاريخ","الفئة","الإنجاز","توقيت GMT","العدد"];
    const q=s=>'"'+String(s??"").replace(/"/g,'""')+'"';
    const lines=[header,...rows.map(r=>[r.date,r.category,r.story,r.gmt,r.quantity])];
    download(new Blob(["\ufeff"+lines.map(a=>a.map(q).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}),"TRT_سجل_الإنجازات.csv");
  }
  async function signOut(){requireLogin();await auth.signOut();}
  function launch(){
    const cfg=window.TRT_FIREBASE_CONFIG;
    if(!window.firebase || !cfg || String(cfg.apiKey).includes("PUT_")){
      $("authFeedback").textContent=!window.firebase ? "تعذّر تحميل مكتبات Firebase؛ تحقق من اتصال الإنترنت." : "يلزم إعداد Firebase أولاً. راجع ملف خطوات_النشر.md.";
      $("authButton").disabled=true;
      return;
    }
    try{
      if(!firebase.apps.length)firebase.initializeApp(cfg);
      auth=firebase.auth();
      db=firebase.firestore();
      auth.onAuthStateChanged(async user=>{
        uid=user?.uid??null;
        const logged=Boolean(uid);
        $("authScreen").hidden=logged;$("mainShell").hidden=!logged;
        if(logged) {
          try{
            if(!initialized){initialized=true;window.TRTAppInit();}
            else {await window.TRTAppRefresh();}
          }catch(e){if(window.msg)window.msg(errorText(e),true);}
        }
      },err=>$("authFeedback").textContent=errorText(err));
      $("authForm").addEventListener("submit",async ev=>{
        ev.preventDefault();
        $("authButton").disabled=true;$("authFeedback").textContent="يتم التحقق من البيانات...";
        try{
          await auth.signInWithEmailAndPassword($("authEmail").value.trim(),$("authPassword").value);
          $("authFeedback").textContent="";
          $("authPassword").value="";
        }catch(err){$("authFeedback").textContent=errorText(err);}
        finally{$("authButton").disabled=false;}
      });
    }catch(e){$("authFeedback").textContent=errorText(e);}
  }
  window.TRTCloud={api,backup,restoreBackup,csv,entries,signOut,download,errorText,launch};
  document.addEventListener("DOMContentLoaded",launch);
})();
