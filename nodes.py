import json
import folder_paths

class LoraLibraryExample:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "lora_name": (folder_paths.get_filename_list("loras"),),
            "example_json": ("STRING", {"default": "{}", "multiline": False}),
        }, "optional": {"strength": ("FLOAT", {"default": 0.8, "min": -10, "max": 10, "step": 0.05})}}
    RETURN_TYPES = ("STRING","STRING","STRING","STRING","INT","INT","FLOAT","STRING","STRING","INT","INT","FLOAT")
    RETURN_NAMES = ("prompt","negative","trigger_words","lora_name","seed","steps","cfg","sampler","scheduler","width","height","strength")
    FUNCTION = "execute"
    CATEGORY = "LoRA Library"

    def execute(self, lora_name, example_json="{}", strength=0.8):
        try:
            d = json.loads(example_json)
            if not isinstance(d, dict): d = {}
        except (TypeError, ValueError):
            d = {}
        def number(key, conversion):
            try: return conversion(d.get(key) or 0)
            except (ValueError, TypeError): return conversion(0)
        return (str(d.get("prompt") or ""), str(d.get("negativePrompt") or ""),
                ", ".join(d.get("trainedWords") or []), lora_name,
                number("seed", int), number("steps", int), number("cfgScale", float),
                str(d.get("sampler") or ""), str(d.get("scheduler") or ""),
                number("width", int), number("height", int), strength)

NODE_CLASS_MAPPINGS = {"LoraLibraryExample": LoraLibraryExample}
NODE_DISPLAY_NAME_MAPPINGS = {"LoraLibraryExample": "LoRA Library Example"}
