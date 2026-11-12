# ComfyUI LoRA Library

A local LoRA browser, Civitai metadata inspector, example gallery, version checker and workflow outputs.

## Install

```bash
cd /workspace/runpod-slim/ComfyUI/custom_nodes
git clone https://github.com/showads/ComfyUI-LoraLibrary.git
```

Restart ComfyUI, add **LoRA Library Example** from the *LoRA Library* node category, and click **Browse LoRA Library**. Select a local LoRA and click an example thumbnail to populate the node's outputs. Wire only the ones you need.

Outputs: prompt, negative prompt, trigger words, LoRA filename, seed, steps, CFG, sampler, scheduler, width, height, and strength.

The index reads configured ComfyUI LoRA folders, including extra_model_paths. SHA-256 hashes and remote metadata are cached for 24 hours in `.library-data/library.sqlite3`. Set `LORA_LIBRARY_DATA` to locate the cache on persistent storage. Optional `CIVITAI_API_KEY` environment variable enables authenticated requests.

**Updates:** model versions and compatible newer releases are listed in the inspector. Use *Updates only* to filter models already checked. Click the source link to download updates manually. **Existing LoRAs are never overwritten automatically.**

### Initial build limitations

- Civitai is the first metadata provider; CivitRed integration is planned.
- Update detection is on-demand per selected LoRA; a complete bulk update scan/download manager is not yet implemented.
- Remote thumbnails aren't saved locally. Missing image metadata produces empty/zero output values.
- Selecting an example updates node widgets, but the graph needs to run again to propagate outputs.
- Workflow-use indexing, optional socket visibility, reference IMAGE output, and managed downloads are future enhancements.

This is an initial implementation, not yet tested inside a running ComfyUI installation.

## Inline gallery and batch caching (v0.2)

The **LoRA Library Example** node now embeds a resizable library UI directly in the graph rather than opening a modal. Folder breadcrumbs navigate subdirectories (for example `krea2/`), while search matches both filenames and Civitai display names. Each indexed entry displays a locally cached thumbnail when available.

Click **Scan & cache** to perform a background, sequential scan of local LoRAs. This hashes files as necessary, resolves Civitai metadata and caches a small thumbnail for each matched LoRA. The scan progress indicator shows completed items and failures. Scanning is intentionally user-initiated to avoid unexpectedly saturating disk/network resources on startup. Reopening a LoRA uses cached metadata (24-hour TTL). A manual metadata refresh is available for individual models.

Thumbnail cache files are stored under `LORA_LIBRARY_DATA/thumbnails` and served from a local ComfyUI endpoint. Metadata display names come from Civitai model records, with filename fallback. Local filenames are retained for actual workflow outputs.

**Notes:** Initial batch scanning can take a while on large collections; provider rate limits and unmatched LoRAs are counted as scan errors or unmatched records. Existing workflows retain their node type and outputs. The inline UI uses ComfyUI's DOM-widget API and requires a compatible recent ComfyUI frontend. No automatic updates/downloads are performed.
