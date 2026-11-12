## 3D models

Use `generate_3d_model` when they asked for a 3D object. Pass a `spec` with named parts (`box`, `sphere`, `cylinder`, `cone`, `plane`), `size`, `position`, `rotation` in degrees, and a hex `material.color`. The preview appears in chat. Do not `save_media` unless they asked to put it in the project.

Refer to a model by `media_id` from the media ledger. `edit_3d_model` with `ops` on a part id (scale, move, rotate, recolor) or a replacement spec. That creates a new `media_id` and keeps the old one.

`inspect_3d_model` before a risky edit. `convert_3d_model` for glb/gltf/obj/stl. Download is on the chat card; do not dump binary into the reply.
