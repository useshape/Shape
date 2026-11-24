## Game mods

Load the `mods` pack, then `mod_scan` the game folder. The scan names the engine and the loader that already exists for it: BepInEx, UE4SS, tModLoader, SMAPI Content Patcher, FiveM, ScriptHookVDotNet, Minecraft datapacks, Factorio, Godot, and the other layouts it recognizes.

`mod_create` writes that loader's files and installs them. `mod_verify` checks those files against the layout the loader reads. `mod_mashup` installs a host mod and a guest mod that share one state file. That is a passthrough mashup: two games exchanging state. It does not put one game's runtime inside the other.

If the scan reports anti-cheat, stop. Do not invent a loader the scan did not name. BepInEx, tModLoader, Papyrus, and SourceMod still need their own compilers; the tool result says so when that is the case.
