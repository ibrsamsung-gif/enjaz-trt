/* Generate a real .docx directly in the browser from the original TRT template.
   Requires JSZip 3.10.1. No reports are sent to an invoice server. */
"use strict";
window.TRTDocx=(function(){
 const NS="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
 const english=["January","February","March","April","May","June","July","August","September","October","November","December"];
 const elems=(p,name)=>Array.from(p.getElementsByTagNameNS(NS,name));
 // Keep 24-hour GMT display for previously saved entries such as "8 / 13".
 function fmtGmt(value){
   const raw=String(value||"").trim();
   if(!raw)return "";
   const times=raw.split(/\s*[/,،;\n]+\s*/).filter(Boolean).map(t=>{
     if(!/^\d{1,2}(:[0-5]\d)?$/.test(t))return null;
     const [hour,minute="00"]=t.split(":");
     return Number(hour)<=23?String(Number(hour)).padStart(2,"0")+":"+minute:null;
   });
   return times.every(Boolean)?[...new Set(times)].sort().join(" / "):raw;
 }
 const direct=(p,name)=>Array.from(p.childNodes||[]).filter(x=>x.nodeType===1&&x.namespaceURI===NS&&x.localName===name);
 function replaceCell(tc,str){
   const ts=elems(tc,"t");
   if(!ts.length)throw Error("ملف النموذج لا يحتوي على خلية نصية قابلة للتعديل.");
   ts.forEach((t,i)=>{t.textContent=i? "":String(str);});
 }
 function updateRun(r,text,prefixBreak=false){
   const children=Array.from(r.childNodes);
   for(const child of children)if(child.namespaceURI===NS&&["t","br","cr","tab"].includes(child.localName))r.removeChild(child);
   if(prefixBreak){const br=r.ownerDocument.createElementNS(NS,"w:br");r.appendChild(br);}
   const t=r.ownerDocument.createElementNS(NS,"w:t");
   t.setAttribute("xml:space","preserve");
   t.textContent=text;
   r.appendChild(t);
 }
 function replaceStory(tc,category,story){
   const para=elems(tc,"p")[0], runs=direct(para,"r");
   if(!runs.length)throw Error("تنسيق خانة القصة مفقود.");
   updateRun(runs[0],category);
   if(story){
     if(runs.length>1)updateRun(runs[1],story,true);
     else{const clone=runs[0].cloneNode(true);updateRun(clone,story,true);para.appendChild(clone);}
   }else if(runs.length>1) updateRun(runs[1],"");
   for(const r of runs.slice(2))updateRun(r,"");
 }
 function tableRows(tbl){return direct(tbl,"tr");}
 function cells(row){return direct(row,"tc");}
 async function makeInvoice(rows, options){
   if(typeof JSZip==="undefined")throw Error("تعذّر تحميل مكتبة Word. تحقق من اتصال الإنترنت.");
   if(!Array.isArray(rows)||rows.length===0)throw Error("لا توجد إنجازات في الفترة المحددة.");
   const amount=Number(options.amount),m=Number(options.month),y=Number(options.year);
   if(!Number.isFinite(amount)||amount<0||amount>1e9)throw Error("مبلغ الفاتورة غير صالح.");
   if(!Number.isInteger(m)||m<1||m>12||!Number.isInteger(y)||y<2000||y>2200)throw Error("شهر أو سنة غير صالح.");
   const sender=String(options.sender||"").trim();
   if(!sender||sender.length>100)throw Error("اسم المرسل غير صالح.");
   const template=await fetch("templates/trt_invoice_template.docx",{cache:"no-cache"});
   if(!template.ok)throw Error("تعذّر تحميل قالب الفاتورة الأصلي.");
   const zip=await JSZip.loadAsync(await template.arrayBuffer());
   const entry=zip.file("word/document.xml");
   if(!entry)throw Error("النموذج لا يحتوي على ملف Word سليم.");
   const xml=new DOMParser().parseFromString(await entry.async("string"),"application/xml");
   if(xml.querySelector("parsererror"))throw Error("لا يمكن قراءة قالب Word.");
   const tables=elems(xml,"tbl");
   if(tables.length<3)throw Error("قالب TRT لا يحتوي على الجداول المطلوبة.");
   replaceCell(cells(tableRows(tables[0])[0])[0],`DATE: ${english[m-1]} ${y}`);
   // Sender is the second styled run following the "From:" run.
   const senderPara=elems(xml,"p").find(p=>elems(p,"t").some(t=>t.textContent.includes("From:")));
   if(!senderPara)throw Error("لم يتم العثور على خانة From في القالب.");
   const senderRuns=direct(senderPara,"r");
   if(senderRuns.length>=2){updateRun(senderRuns[1],sender);senderRuns.slice(2).forEach(r=>updateRun(r,""));}
   else updateRun(senderRuns[0],"From:  "+sender);
   const listTable=tables[1], existing=tableRows(listTable);
   if(existing.length<2)throw Error("قالب الفاتورة لا يحتوي على صف نموذجي.");
   const sample=existing[1].cloneNode(true);
   for(const r of existing.slice(1))listTable.removeChild(r);
   const sorted=[...rows].sort((a,b)=>a.date.localeCompare(b.date)||
      (fmtGmt(a.gmt).split(" / ")[0]||"99:99").localeCompare(fmtGmt(b.gmt).split(" / ")[0]||"99:99")||
      (Number(a.sequence)||0)-(Number(b.sequence)||0)||Number(a.id)-Number(b.id));
   for(const line of sorted){
     const row=sample.cloneNode(true),cs=cells(row);
     if(cs.length<4)throw Error("صف الفاتورة غير متوقع.");
     const [year,month,day]=line.date.split("-").map(Number);
     replaceCell(cs[0],`${day}-${month}-${year}`);
     replaceCell(cs[1],String(line.quantity));
     replaceStory(cs[2],String(line.category),String(line.story||""));
     replaceCell(cs[3],fmtGmt(line.gmt));
     for(const c of cs.slice(4)) {
       const ts=elems(c,"t");ts.forEach(t=>t.textContent="");
     }
     listTable.appendChild(row);
   }
   const amountTxt=amount.toFixed(2).replace(/\.?0+$/,"");
   replaceCell(cells(tableRows(tables[2])[0])[1],`$${amountTxt} `);
   const output=new XMLSerializer().serializeToString(xml);
   zip.file("word/document.xml",output);
   return zip.generateAsync({type:"blob",compression:"DEFLATE",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
 }
 return {makeInvoice};
})();
