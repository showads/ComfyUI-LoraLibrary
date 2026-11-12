import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

async function call(path, payload) {
  const res=await api.fetchApi("/lora-library/"+path,payload?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}:{});
  const data=await res.json();
  if(!res.ok) throw Error(data.error||"Request failed");
  return data;
}
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
const btn=(label,fn)=>{const b=el("button","ll-button",label);b.onclick=fn;return b;};
const thumb=name=>api.apiURL("/lora-library/thumb?name="+encodeURIComponent(name));
function mount(node) {
  const root=el("div","ll-root");
  root.innerHTML=`<style>
    .ll-root{background:#20232b;color:#e8e9ed;font:12px sans-serif;height:100%;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;padding:7px;gap:6px}
    .ll-root *{box-sizing:border-box}.ll-toolbar{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
    .ll-root input{min-width:0;flex:1;background:#141820;color:#eee;border:1px solid #555;padding:5px}
    .ll-button{background:#363d49;border:1px solid #606875;color:#eee;border-radius:4px;padding:5px;cursor:pointer}
    .ll-path{display:flex;gap:3px;flex-wrap:wrap}.ll-body{display:flex;flex:1;min-height:0;gap:6px}
    .ll-list{width:38%;min-width:120px;overflow:auto;border-right:1px solid #555}
    .ll-item{display:flex;align-items:center;gap:6px;padding:5px;cursor:pointer;border-bottom:1px solid #383d46;overflow:hidden}
    .ll-item:hover,.ll-selected{background:#3c4454}.ll-thumb{width:44px;height:44px;object-fit:cover;background:#30343b;flex-shrink:0}
    .ll-detail{flex:1;min-width:0;overflow:auto;overflow-wrap:anywhere}.ll-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:5px}
    .ll-gallery img{width:100%;height:110px;object-fit:contain;cursor:pointer;background:#151820}
    .ll-prompt{white-space:pre-wrap;max-height:130px;overflow:auto;background:#171b23;padding:6px}
    .ll-muted{color:#aeb7c4}.ll-title{font-weight:bold;font-size:14px}.ll-status{font-size:11px}
  </style>`;
  const toolbar=el("div","ll-toolbar"),search=el("input");search.placeholder="Search LoRAs";toolbar.append(search);
  const scan=btn("Scan & cache",()=>startScan(false)),refresh=btn("Refresh",()=>load());toolbar.append(scan,refresh);root.append(toolbar);
  const status=el("div","ll-status ll-muted","Ready"),pathbar=el("div","ll-path");root.append(status,pathbar);
  const body=el("div","ll-body"),nav=el("div","ll-list"),detail=el("div","ll-detail","Select a LoRA");body.append(nav,detail);root.append(body);
  let items=[],folder="",selected="",scanTimer=null;
  const widget=name=>node.widgets?.find(w=>w.name===name);
  const setExample=(item,data,img)=>{
    if(widget("lora_name"))widget("lora_name").value=item.name;
    if(widget("example_json"))widget("example_json").value=JSON.stringify({...img.meta,trainedWords:data.trained_words||[],width:img.width||0,height:img.height||0});
    node.setDirtyCanvas?.(true,true);
  };
  function folders() {
    const found=new Set();
    for(const item of items){if(folder&&!item.name.startsWith(folder+"/"))continue;
      const rest=folder?item.name.slice(folder.length+1):item.name;
      if(rest.includes("/"))found.add(rest.split("/")[0]);
    }return [...found].sort((a,b)=>a.localeCompare(b));
  }
  function renderNav(){
    nav.replaceChildren();pathbar.replaceChildren();
    pathbar.append(btn("All LoRAs",()=>{folder="";renderNav();}));
    let built="";for(const segment of folder.split("/").filter(Boolean)){built=built?built+"/"+segment:segment;const target=built;pathbar.append(el("span","","/"),btn(segment,()=>{folder=target;renderNav();}));}
    const query=search.value.toLowerCase();
    if(!query)for(const dir of folders())nav.append(btn("📁 "+dir,()=>{folder=folder?folder+"/"+dir:dir;renderNav();}));
    for(const item of items){
      if(folder&&!item.name.startsWith(folder+"/"))continue;
      const rest=folder?item.name.slice(folder.length+1):item.name;
      if(!query&&rest.includes("/"))continue;
      const display=item.metadata?.name||item.name.split("/").pop().replace(/\.safetensors$/i,"");
      if(query&&!((display+" "+item.name).toLowerCase().includes(query)))continue;
      const row=el("div","ll-item"+(selected===item.name?" ll-selected":""));
      const img=el("img","ll-thumb");img.loading="lazy";img.src=thumb(item.name);img.onerror=()=>img.style.visibility="hidden";row.append(img);
      const label=el("div");label.append(el("div","",display));
      label.append(el("div","ll-muted",item.name+(item.metadata?.has_update?" · ⬆ Update":"")));row.append(label);
      row.onclick=()=>show(item);nav.append(row);
    }
  }
  async function show(item,force=false){
    selected=item.name;renderNav();detail.replaceChildren(el("div","ll-muted","Loading…"));
    try{
      const data=await call("resolve",{name:item.name,force});item.metadata=data;renderNav();
      if(selected!==item.name)return;detail.replaceChildren();
      detail.append(el("div","ll-title",data.name||item.name),el("div","ll-muted",item.name));
      detail.append(el("p","",`Version: ${data.installed_version||"Unknown"} · Base: ${data.base_model||"Unknown"}`));
      detail.append(el("p","",`Triggers: ${(data.trained_words||[]).join(", ")||"None listed"}`));
      if(data.has_update)detail.append(el("p","","⬆ "+data.update_count+" compatible newer version(s)"));
      const actions=el("div","ll-toolbar");actions.append(btn("Refresh metadata",()=>show(item,true)),btn(item.favorite?"★":"☆",async()=>{await call("favorite",{name:item.name,favorite:!item.favorite});item.favorite=!item.favorite;renderNav();}));
      if(data.url){const a=el("a","","Civitai ↗");a.href=data.url;a.target="_blank";a.rel="noopener noreferrer";actions.append(a);}detail.append(actions);
      const gallery=el("div","ll-gallery");detail.append(gallery);
      const preview=el("div");detail.append(preview);
      for(const [idx,img] of (data.images||[]).entries()){
        const image=el("img");image.src=img.url;image.loading="lazy";image.title="Use example "+(idx+1);
        image.onclick=()=>{setExample(item,data,img);preview.replaceChildren();
          const prompt=String(img.meta?.prompt||"");
          preview.append(el("p","","Selected example "+(idx+1)),el("div","ll-prompt",prompt||"No prompt metadata"));
          preview.append(btn("Copy prompt",()=>navigator.clipboard.writeText(prompt)));
          preview.append(el("div","ll-muted","Seed: "+(img.meta?.seed??"—")+" · Steps: "+(img.meta?.steps??"—")+" · CFG: "+(img.meta?.cfgScale??"—")));
        };gallery.append(image);
      }
      if(!data.images?.length)detail.append(el("p","ll-muted","No gallery images available."));
    }catch(e){if(selected===item.name)detail.textContent=e.message;}
  }
  async function load(){try{items=(await call("list")).items;renderNav();if(selected){const item=items.find(i=>i.name===selected);if(item)show(item);}}catch(e){status.textContent=e.message;}}
  async function poll(){
    if(!root.isConnected){if(scanTimer)clearInterval(scanTimer);scanTimer=null;return;}
    try{const s=await call("scan-status");status.textContent=s.running?`Scanning ${s.done}/${s.total} · errors ${s.errors}`:`Cache scan: ${s.done}/${s.total} · errors ${s.errors}`;
      if(!s.running){clearInterval(scanTimer);scanTimer=null;await load();}
    }catch(e){status.textContent=e.message;clearInterval(scanTimer);scanTimer=null;}
  }
  async function startScan(force){try{await call("scan",{force});if(!scanTimer)scanTimer=setInterval(poll,1500);await poll();}catch(e){status.textContent=e.message;}}
  search.oninput=renderNav;
  load();
  return root;
}
app.registerExtension({name:"LoraLibrary.Inline",beforeRegisterNodeDef(Node,definition){
  if(definition.name!=="LoraLibraryExample")return;
  const prior=Node.prototype.onNodeCreated;
  Node.prototype.onNodeCreated=function(){
    prior?.apply(this,arguments);
    const root=mount(this);
    const widget=this.addDOMWidget("library","ll-library",root,{serialize:false,hideOnZoom:false});
    widget.computeSize=()=>[Math.max(this.size[0]-20,400),430];
    this.setSize([Math.max(this.size[0],660),Math.max(this.size[1],600)]);
  };
}});
