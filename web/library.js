import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

async function call(endpoint, payload) {
  const res = await api.fetchApi("/lora-library/" + endpoint, payload ? { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) } : {});
  const result = await res.json();
  if (!res.ok) throw Error(result.error || "Request failed");
  return result;
}

function browser(node) {
  document.getElementById("lora-library-ui")?.remove();
  const root = document.createElement("div"); root.id = "lora-library-ui";
  root.style.cssText = "position:fixed;inset:5%;z-index:99999;display:flex;flex-direction:column;padding:18px;background:#1c2027;color:#eee;border:1px solid #666;border-radius:12px;font-family:sans-serif;box-shadow:0 12px 45px #000a";
  root.innerHTML = '<header style="display:flex;gap:10px"><b>LoRA Library</b><input class="search" placeholder="Search local LoRAs" style="flex:1"><label><input class="updates" type="checkbox">Updates only</label><button class="reload">Rescan</button><button class="close">✕</button></header><div style="display:flex;gap:14px;flex:1;min-height:0;margin-top:14px"><aside class="items" style="width:32%;overflow:auto;border-right:1px solid #555"></aside><main class="detail" style="flex:1;overflow:auto">Select a LoRA</main></div>';
  document.body.append(root);
  const $ = selector => root.querySelector(selector);
  $(".close").onclick = () => root.remove();
  root.addEventListener("keydown", e => { if (e.key==="Escape") { e.stopPropagation();root.remove(); } });
  let items = [];
  const button = (parent,label,fn) => { const b=document.createElement("button");b.textContent=label;b.onclick=fn;parent.append(b);return b; };
  const line = (parent,label,value) => { const p=document.createElement("p");const strong=document.createElement("b");strong.textContent=label+": ";p.append(strong,document.createTextNode(String(value ?? "—")));parent.append(p); };
  function render() {
    $(".items").replaceChildren();
    for (const item of items.filter(i => i.name.toLowerCase().includes($(".search").value.toLowerCase()) && (!$(".updates").checked || i.metadata?.has_update))) {
      const row=document.createElement("div");row.style.cssText="padding:10px;border-bottom:1px solid #444;cursor:pointer";
      row.textContent=(item.favorite?"★ ":"")+item.name+(item.metadata?.has_update?" ⬆ update":"");
      row.onclick=()=>show(item);$(".items").append(row);
    }
  }
  async function scan() { try {items=(await call("list")).items;render();} catch(e){$(".detail").textContent=e.message;} }
  async function show(item) {
    const panel=$(".detail");panel.replaceChildren();
    const title=document.createElement("h2");title.textContent=item.name;panel.append(title);
    const actions=document.createElement("div");panel.append(actions);
    button(actions,item.favorite?"★ Favorite":"☆ Favorite",async()=>{await call("favorite",{name:item.name,favorite:!item.favorite});item.favorite=!item.favorite;render();show(item);});
    button(actions,"Refresh Civitai",()=>load(true));
    const body=document.createElement("div");panel.append(body);
    async function load(force=false) {
      body.textContent="Loading metadata…";
      try { const data=await call("resolve",{name:item.name,force});item.metadata=data;render();draw(data); }
      catch(e){body.textContent=e.message;}
    }
    function draw(data) {
      body.replaceChildren();
      line(body,"Status",data.status);line(body,"Model",data.name);line(body,"Version",data.installed_version);
      line(body,"Base",data.base_model);line(body,"Creator",data.creator);line(body,"Triggers",(data.trained_words||[]).join(", "));
      line(body,"Compatible updates",data.update_count||0);
      if(data.url) { const a=document.createElement("a");a.href=data.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent="View on Civitai ↗";body.append(a); }
      const versions=document.createElement("details");const summary=document.createElement("summary");summary.textContent="Versions ("+(data.versions||[]).length+")";versions.append(summary);
      for (const v of data.versions||[]) line(versions,v.name,v.base_model+(v.installed?" · installed":"")+(v.compatible?"":" · other base"));
      body.append(versions);
      const desc=document.createElement("p");desc.textContent=(data.version_description||data.description||"").replace(/<[^>]*>/g," ");body.append(desc);
      const gallery=document.createElement("div");gallery.style.cssText="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px";body.append(gallery);
      for(const [index,img] of (data.images||[]).entries()) {
        const card=document.createElement("button");card.style.cssText="background:#292d35;color:white;border:1px solid #555;cursor:pointer";
        const image=document.createElement("img");image.src=img.url;image.loading="lazy";image.style.cssText="width:100%;height:170px;object-fit:contain";card.append(image);
        const caption=document.createElement("div");caption.textContent="Example "+(index+1);card.append(caption);gallery.append(card);
        card.onclick=()=>{
          const d={...(img.meta||{}),trainedWords:data.trained_words||[],width:img.width||0,height:img.height||0};
          const json=node.widgets?.find(w=>w.name==="example_json");if(json)json.value=JSON.stringify(d);
          const name=node.widgets?.find(w=>w.name==="lora_name");if(name)name.value=item.name;
          node.setDirtyCanvas?.(true,true);
          body.querySelector(".chosen")?.remove();
          const chosen=document.createElement("section");chosen.className="chosen";chosen.style.cssText="background:#303743;padding:12px;margin:10px 0;white-space:pre-wrap";
          line(chosen,"Selected prompt",d.prompt||"No embedded prompt");line(chosen,"Negative",d.negativePrompt||"");line(chosen,"Seed",d.seed||"");line(chosen,"Steps",d.steps||"");line(chosen,"CFG",d.cfgScale||"");
          button(chosen,"Copy prompt",()=>navigator.clipboard.writeText(String(d.prompt||"")));
          body.prepend(chosen);
        };
      }
    }
    await load();
  }
  $(".search").oninput=render;$(".updates").onchange=render;$(".reload").onclick=scan;scan();
}

app.registerExtension({name:"LoraLibrary.UI",beforeRegisterNodeDef(Node,definition){
  if(definition.name!=="LoraLibraryExample")return;
  const previous=Node.prototype.onNodeCreated;
  Node.prototype.onNodeCreated=function(){previous?.apply(this,arguments);this.addWidget("button","Browse LoRA Library","Open",()=>browser(this));};
}});
