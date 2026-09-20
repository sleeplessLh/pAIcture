export const PAICTURE_WIDGET_URI = "ui://paicture/export/v1.html";

export const PAICTURE_WIDGET_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;--ink:#171715;--muted:#6f6c64;--paper:#fff;--line:#dedbd3;--accent:#ed5b35;--soft:#f5f2eb}*{box-sizing:border-box}body{margin:0;background:transparent;color:var(--ink)}.shell{padding:16px}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.brand{font-weight:800;letter-spacing:-.04em}.brand span{color:var(--accent)}.actions{display:flex;gap:8px;flex-wrap:wrap}button{border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:10px;padding:9px 12px;font:inherit;font-weight:700;cursor:pointer}button.primary{border-color:var(--accent);background:var(--accent);color:#fff}button:disabled{opacity:.55;cursor:wait}.notice{color:var(--muted);font-size:12px;margin:0 0 12px}.document{width:min(100%,760px);margin:auto;background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:28px;box-shadow:0 12px 36px #0000000d}.document h1{font-size:26px;line-height:1.1;margin:0 0 6px}.meta{color:var(--muted);font-size:12px;margin-bottom:24px}.message{border-top:1px solid var(--line);padding:20px 0;break-inside:avoid}.role{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);font-weight:800;margin-bottom:9px}.content{font-size:15px;line-height:1.65;overflow-wrap:anywhere}.content>*:first-child{margin-top:0}.content>*:last-child{margin-bottom:0}.content pre{overflow:auto;background:#171715;color:#f8f5ee;padding:14px;border-radius:10px;white-space:pre-wrap}.content code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.content table{border-collapse:collapse;width:100%;display:block;overflow:auto}.content th,.content td{border:1px solid var(--line);padding:7px 9px;text-align:left}.empty{padding:48px 16px;text-align:center;color:var(--muted)}@media(max-width:560px){.shell{padding:8px}.toolbar{align-items:flex-start;flex-direction:column}.document{padding:18px;border-radius:12px}}@media print{body{background:#fff}.toolbar,.notice{display:none}.shell{padding:0}.document{border:0;box-shadow:none;width:100%;padding:0}.message{break-inside:avoid}@page{size:A4;margin:16mm}}
  </style>
</head>
<body>
  <main class="shell">
    <div class="toolbar"><div class="brand">p<span>AI</span>cture</div><div class="actions"><button id="images">Download PNG pages</button><button id="pdf" class="primary">Save as PDF</button></div></div>
    <p class="notice" id="notice">Waiting for ChatGPT to prepare the conversation…</p>
    <section class="document" id="document"><div class="empty">Ask ChatGPT to export the current conversation with pAIcture.</div></section>
  </main>
  <script>
    const doc = document.getElementById('document'); const notice = document.getElementById('notice');
    let current = null;
    function safeName(value){return String(value||'conversation').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'conversation'}
    function render(data){
      if(!data||!Array.isArray(data.messages)) return;
      current=data; doc.replaceChildren();
      const title=document.createElement('h1'); title.textContent=data.title||'AI conversation'; doc.append(title);
      const meta=document.createElement('div'); meta.className='meta'; meta.textContent=data.messages.length+' messages · Prepared with pAIcture'; doc.append(meta);
      for(const message of data.messages){const article=document.createElement('article');article.className='message';const role=document.createElement('div');role.className='role';role.textContent=message.role==='user'?'You':'AI assistant';const content=document.createElement('div');content.className='content';content.innerHTML=message.html||'';article.append(role,content);doc.append(article)}
      notice.textContent='Review the conversation, then export it. Content is processed only for this tool result.';
    }
    window.addEventListener('message',(event)=>{if(event.source!==window.parent)return;const message=event.data;if(!message||message.jsonrpc!=='2.0')return;if(message.method==='ui/notifications/tool-result')render(message.params&&message.params.structuredContent);if(message.method==='ui/notifications/tool-input'&&!current)render(message.params)} ,{passive:true});
    document.getElementById('pdf').onclick=()=>window.print();
    document.getElementById('images').onclick=async()=>{
      if(!current)return;const button=document.getElementById('images');button.disabled=true;notice.textContent='Preparing high-resolution PNG pages…';
      try{const messages=[...doc.querySelectorAll('.message')];const header=[...doc.children].filter((node)=>!node.classList.contains('message'));const groups=[];let group=[];let height=0;for(const message of messages){const h=message.getBoundingClientRect().height;if(group.length&&height+h>980){groups.push(group);group=[];height=0}group.push(message);height+=h}if(group.length)groups.push(group);
        for(let index=0;index<groups.length;index++){const page=document.createElement('div');page.setAttribute('xmlns','http://www.w3.org/1999/xhtml');page.style.cssText='width:1120px;background:#fff;color:#171715;padding:70px;font-family:Inter,Arial,sans-serif';if(index===0)header.forEach((node)=>page.append(node.cloneNode(true)));groups[index].forEach((node)=>page.append(node.cloneNode(true)));document.body.append(page);const height=Math.ceil(page.getBoundingClientRect().height);const serialized=new XMLSerializer().serializeToString(page);page.remove();const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="'+height+'"><foreignObject width="100%" height="100%">'+serialized+'</foreignObject></svg>';const image=new Image();const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url});const canvas=document.createElement('canvas');canvas.width=2240;canvas.height=height*2;canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);const blob=await new Promise((resolve)=>canvas.toBlob(resolve,'image/png'));const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=safeName(current.title)+'-'+String(index+1).padStart(2,'0')+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);await new Promise((resolve)=>setTimeout(resolve,180))}
        notice.textContent='PNG export complete.';
      }catch(error){notice.textContent='Image export could not finish. Use Save as PDF or open the pAIcture website.'}finally{button.disabled=false}
    };
  </script>
</body>
</html>`;
