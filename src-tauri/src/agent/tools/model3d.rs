//! Local 3D generation: scene spec → GLB, inspect, edit, convert.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::agent::media_stash::{self, StashMeta};
use crate::agent::security;

use super::dispatch::{ToolCtx, ToolOutcome};

const GLB_MAGIC: u32 = 0x4654_6C67;
const CHUNK_JSON: u32 = 0x4E4F_534A;
const CHUNK_BIN: u32 = 0x004E_4942;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneSpec {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub parts: Vec<PartSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartSpec {
    pub id: String,
    #[serde(default = "default_mesh")]
    pub mesh: String,
    #[serde(default = "default_size")]
    pub size: [f32; 3],
    #[serde(default)]
    pub position: [f32; 3],
    #[serde(default)]
    pub rotation: [f32; 3],
    #[serde(default)]
    pub material: MaterialSpec,
}

fn default_mesh() -> String {
    "box".into()
}
fn default_size() -> [f32; 3] {
    [1.0, 1.0, 1.0]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterialSpec {
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default = "default_metal")]
    pub metalness: f32,
    #[serde(default = "default_rough")]
    pub roughness: f32,
}

impl Default for MaterialSpec {
    fn default() -> Self {
        Self {
            color: default_color(),
            metalness: default_metal(),
            roughness: default_rough(),
        }
    }
}

fn default_color() -> String {
    "#c8c8c8".into()
}
fn default_metal() -> f32 {
    0.1
}
fn default_rough() -> f32 {
    0.6
}

struct MeshData {
    positions: Vec<f32>,
    normals: Vec<f32>,
    indices: Vec<u16>,
}

pub fn spec_from_value(value: &Value) -> Result<SceneSpec, String> {
    if value.is_null() || (value.is_object() && value.as_object().map(|o| o.is_empty()).unwrap_or(true)) {
        return Err("spec is required (JSON scene with parts).".into());
    }
    serde_json::from_value(value.clone()).map_err(|e| format!("Invalid scene spec: {e}"))
}

pub fn spec_from_prompt(prompt: &str) -> SceneSpec {
    let p = prompt.to_ascii_lowercase();
    if p.contains("sword") {
        return sword_spec();
    }
    if p.contains("sphere") || p.contains("ball") {
        return SceneSpec {
            name: Some("sphere".into()),
            parts: vec![PartSpec {
                id: "body".into(),
                mesh: "sphere".into(),
                size: [1.0, 1.0, 1.0],
                position: [0.0, 0.0, 0.0],
                rotation: [0.0, 0.0, 0.0],
                material: MaterialSpec {
                    color: "#6ea8fe".into(),
                    metalness: 0.05,
                    roughness: 0.4,
                },
            }],
        };
    }
    SceneSpec {
        name: Some("cube".into()),
        parts: vec![PartSpec {
            id: "body".into(),
            mesh: "box".into(),
            size: [1.0, 1.0, 1.0],
            position: [0.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0],
            material: MaterialSpec::default(),
        }],
    }
}

fn sword_spec() -> SceneSpec {
    SceneSpec {
        name: Some("sword".into()),
        parts: vec![
            PartSpec {
                id: "blade".into(),
                mesh: "box".into(),
                size: [0.06, 0.9, 0.018],
                position: [0.0, 0.55, 0.0],
                rotation: [0.0, 0.0, 0.0],
                material: MaterialSpec {
                    color: "#c5ced8".into(),
                    metalness: 0.85,
                    roughness: 0.25,
                },
            },
            PartSpec {
                id: "guard".into(),
                mesh: "box".into(),
                size: [0.24, 0.045, 0.05],
                position: [0.0, 0.12, 0.0],
                rotation: [0.0, 0.0, 0.0],
                material: MaterialSpec {
                    color: "#c9a227".into(),
                    metalness: 0.7,
                    roughness: 0.35,
                },
            },
            PartSpec {
                id: "handle".into(),
                mesh: "cylinder".into(),
                size: [0.04, 0.2, 0.04],
                position: [0.0, 0.0, 0.0],
                rotation: [0.0, 0.0, 0.0],
                material: MaterialSpec {
                    color: "#6b3f24".into(),
                    metalness: 0.05,
                    roughness: 0.8,
                },
            },
            PartSpec {
                id: "pommel".into(),
                mesh: "sphere".into(),
                size: [0.055, 0.055, 0.055],
                position: [0.0, -0.12, 0.0],
                rotation: [0.0, 0.0, 0.0],
                material: MaterialSpec {
                    color: "#c9a227".into(),
                    metalness: 0.7,
                    roughness: 0.35,
                },
            },
        ],
    }
}

pub fn build_glb(spec: &SceneSpec) -> Result<Vec<u8>, String> {
    if spec.parts.is_empty() {
        return Err("Scene spec has no parts.".into());
    }
    let mut bin = Vec::new();
    let mut accessors = Vec::new();
    let mut views = Vec::new();
    let mut meshes = Vec::new();
    let mut materials = Vec::new();
    let mut nodes = Vec::new();

    for (i, part) in spec.parts.iter().enumerate() {
        let mesh = mesh_for(&part.mesh, part.size);
        if mesh.positions.is_empty() {
            return Err(format!("Unknown mesh type '{}'. Use box, sphere, cylinder, cone, or plane.", part.mesh));
        }
        let (min, max) = bounds(&mesh.positions);
        let pos_off = align4(bin.len());
        bin.resize(pos_off, 0);
        let pos_bytes = f32_bytes(&mesh.positions);
        bin.extend_from_slice(&pos_bytes);
        views.push(json!({"buffer": 0, "byteOffset": pos_off, "byteLength": pos_bytes.len(), "target": 34962}));
        let pos_acc = accessors.len();
        accessors.push(json!({
            "bufferView": views.len() - 1,
            "componentType": 5126,
            "count": mesh.positions.len() / 3,
            "type": "VEC3",
            "min": min,
            "max": max
        }));

        let nrm_off = align4(bin.len());
        bin.resize(nrm_off, 0);
        let nrm_bytes = f32_bytes(&mesh.normals);
        bin.extend_from_slice(&nrm_bytes);
        views.push(json!({"buffer": 0, "byteOffset": nrm_off, "byteLength": nrm_bytes.len(), "target": 34962}));
        let nrm_acc = accessors.len();
        accessors.push(json!({
            "bufferView": views.len() - 1,
            "componentType": 5126,
            "count": mesh.normals.len() / 3,
            "type": "VEC3"
        }));

        let idx_off = align4(bin.len());
        bin.resize(idx_off, 0);
        let idx_bytes = u16_bytes(&mesh.indices);
        bin.extend_from_slice(&idx_bytes);
        views.push(json!({"buffer": 0, "byteOffset": idx_off, "byteLength": idx_bytes.len(), "target": 34963}));
        let idx_acc = accessors.len();
        accessors.push(json!({
            "bufferView": views.len() - 1,
            "componentType": 5123,
            "count": mesh.indices.len(),
            "type": "SCALAR"
        }));

        let color = parse_color(&part.material.color);
        materials.push(json!({
            "name": part.id,
            "pbrMetallicRoughness": {
                "baseColorFactor": color,
                "metallicFactor": part.material.metalness.clamp(0.0, 1.0),
                "roughnessFactor": part.material.roughness.clamp(0.0, 1.0)
            }
        }));
        meshes.push(json!({
            "name": part.id,
            "primitives": [{
                "attributes": { "POSITION": pos_acc, "NORMAL": nrm_acc },
                "indices": idx_acc,
                "material": i
            }]
        }));
        let quat = euler_xyz_deg_to_quat(part.rotation[0], part.rotation[1], part.rotation[2]);
        nodes.push(json!({
            "name": part.id,
            "mesh": i,
            "translation": part.position,
            "rotation": quat
        }));
    }

    let spec_json = serde_json::to_value(spec).unwrap_or(json!({}));
    let node_ids: Vec<usize> = (0..nodes.len()).collect();
    let root = json!({
        "asset": { "version": "2.0", "generator": "Shape" },
        "scene": 0,
        "scenes": [{ "nodes": node_ids, "extras": { "shapeSpec": spec_json } }],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{ "byteLength": bin.len() }]
    });
    pack_glb(&root, &bin)
}

fn pack_glb(json_root: &Value, bin: &[u8]) -> Result<Vec<u8>, String> {
    let mut json_bytes = serde_json::to_vec(json_root).map_err(|e| e.to_string())?;
    while json_bytes.len() % 4 != 0 {
        json_bytes.push(b' ');
    }
    let mut bin_bytes = bin.to_vec();
    while bin_bytes.len() % 4 != 0 {
        bin_bytes.push(0);
    }
    let total = 12 + 8 + json_bytes.len() + 8 + bin_bytes.len();
    let mut out = Vec::with_capacity(total);
    out.extend_from_slice(&GLB_MAGIC.to_le_bytes());
    out.extend_from_slice(&2u32.to_le_bytes());
    out.extend_from_slice(&(total as u32).to_le_bytes());
    out.extend_from_slice(&(json_bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(&CHUNK_JSON.to_le_bytes());
    out.extend_from_slice(&json_bytes);
    out.extend_from_slice(&(bin_bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(&CHUNK_BIN.to_le_bytes());
    out.extend_from_slice(&bin_bytes);
    Ok(out)
}

pub fn parse_glb_json(bytes: &[u8]) -> Result<Value, String> {
    if bytes.len() < 20 {
        return Err("File is too small to be a GLB.".into());
    }
    let magic = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
    if magic != GLB_MAGIC {
        return Err("Not a GLB file (missing glTF magic).".into());
    }
    let json_len = u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize;
    let json_type = u32::from_le_bytes(bytes[16..20].try_into().unwrap());
    if json_type != CHUNK_JSON {
        return Err("GLB JSON chunk is missing.".into());
    }
    let start: usize = 20;
    let end = start.checked_add(json_len).ok_or("Invalid GLB JSON length.")?;
    if end > bytes.len() {
        return Err("GLB JSON chunk is truncated.".into());
    }
    serde_json::from_slice(&bytes[start..end]).map_err(|e| format!("GLB JSON parse failed: {e}"))
}

pub fn spec_from_glb(bytes: &[u8]) -> Result<SceneSpec, String> {
    let root = parse_glb_json(bytes)?;
    if let Some(spec) = root
        .pointer("/scenes/0/extras/shapeSpec")
        .cloned()
        .and_then(|v| serde_json::from_value::<SceneSpec>(v).ok())
    {
        if !spec.parts.is_empty() {
            return Ok(spec);
        }
    }
    Err("This GLB has no Shape scene spec. Pass a new spec to rebuild it.".into())
}

pub fn inspect_glb(bytes: &[u8]) -> Result<Value, String> {
    let root = parse_glb_json(bytes)?;
    let mesh_count = root.get("meshes").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    let material_count = root.get("materials").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    let node_count = root.get("nodes").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    let names: Vec<String> = root
        .get("nodes")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|n| n.get("name").and_then(|s| s.as_str()).map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let spec = root.pointer("/scenes/0/extras/shapeSpec").cloned();
    Ok(json!({
        "format": "glb",
        "byteLength": bytes.len(),
        "meshes": mesh_count,
        "materials": material_count,
        "nodes": node_count,
        "partIds": names,
        "hasShapeSpec": spec.is_some(),
        "spec": spec
    }))
}

pub fn glb_to_gltf(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut root = parse_glb_json(bytes)?;
    let json_len = u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize;
    let bin_header = 20 + json_len;
    if bytes.len() < bin_header + 8 {
        return Err("GLB has no BIN chunk.".into());
    }
    let bin_len = u32::from_le_bytes(bytes[bin_header..bin_header + 4].try_into().unwrap()) as usize;
    let bin_start = bin_header + 8;
    let bin_end = bin_start + bin_len;
    if bin_end > bytes.len() {
        return Err("GLB BIN chunk is truncated.".into());
    }
    let bin = &bytes[bin_start..bin_end];
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bin);
    if let Some(buffers) = root.get_mut("buffers").and_then(|v| v.as_array_mut()) {
        if let Some(first) = buffers.first_mut() {
            first["uri"] = json!(format!("data:application/octet-stream;base64,{b64}"));
        }
    }
    serde_json::to_vec_pretty(&root).map_err(|e| e.to_string())
}

pub fn spec_to_obj(spec: &SceneSpec) -> String {
    let mut out = String::from("# Shape OBJ\n");
    let mut vbase = 1u32;
    for part in &spec.parts {
        let mesh = mesh_for(&part.mesh, part.size);
        out.push_str(&format!("o {}\n", part.id));
        for chunk in mesh.positions.chunks(3) {
            let (x, y, z) = transform_point(chunk, part.position, part.rotation);
            out.push_str(&format!("v {x:.6} {y:.6} {z:.6}\n"));
        }
        for chunk in mesh.normals.chunks(3) {
            out.push_str(&format!("vn {:.6} {:.6} {:.6}\n", chunk[0], chunk[1], chunk[2]));
        }
        for tri in mesh.indices.chunks(3) {
            let a = vbase + tri[0] as u32;
            let b = vbase + tri[1] as u32;
            let c = vbase + tri[2] as u32;
            out.push_str(&format!("f {a}//{a} {b}//{b} {c}//{c}\n"));
        }
        vbase += (mesh.positions.len() / 3) as u32;
    }
    out
}

pub fn spec_to_stl(spec: &SceneSpec) -> Vec<u8> {
    let mut triangles: Vec<([f32; 3], [[f32; 3]; 3])> = Vec::new();
    for part in &spec.parts {
        let mesh = mesh_for(&part.mesh, part.size);
        for tri in mesh.indices.chunks(3) {
            let p0 = transform_point(
                &mesh.positions[tri[0] as usize * 3..tri[0] as usize * 3 + 3],
                part.position,
                part.rotation,
            );
            let p1 = transform_point(
                &mesh.positions[tri[1] as usize * 3..tri[1] as usize * 3 + 3],
                part.position,
                part.rotation,
            );
            let p2 = transform_point(
                &mesh.positions[tri[2] as usize * 3..tri[2] as usize * 3 + 3],
                part.position,
                part.rotation,
            );
            let n = {
                let ux = p1.0 - p0.0;
                let uy = p1.1 - p0.1;
                let uz = p1.2 - p0.2;
                let vx = p2.0 - p0.0;
                let vy = p2.1 - p0.1;
                let vz = p2.2 - p0.2;
                let nx = uy * vz - uz * vy;
                let ny = uz * vx - ux * vz;
                let nz = ux * vy - uy * vx;
                let len = (nx * nx + ny * ny + nz * nz).sqrt().max(1e-8);
                [nx / len, ny / len, nz / len]
            };
            triangles.push((n, [[p0.0, p0.1, p0.2], [p1.0, p1.1, p1.2], [p2.0, p2.1, p2.2]]));
        }
    }
    let mut out = vec![0u8; 80];
    let header = b"Shape STL";
    out[..header.len()].copy_from_slice(header);
    out.extend_from_slice(&(triangles.len() as u32).to_le_bytes());
    for (n, pts) in triangles {
        for v in n {
            out.extend_from_slice(&v.to_le_bytes());
        }
        for p in pts {
            for v in p {
                out.extend_from_slice(&v.to_le_bytes());
            }
        }
        out.extend_from_slice(&0u16.to_le_bytes());
    }
    out
}

fn transform_point(p: &[f32], pos: [f32; 3], rot_deg: [f32; 3]) -> (f32, f32, f32) {
    let q = euler_xyz_deg_to_quat(rot_deg[0], rot_deg[1], rot_deg[2]);
    let (x, y, z) = (p[0], p[1], p[2]);
    let (qx, qy, qz, qw) = (q[0], q[1], q[2], q[3]);
    let ix = qw * x + qy * z - qz * y;
    let iy = qw * y + qz * x - qx * z;
    let iz = qw * z + qx * y - qy * x;
    let iw = -qx * x - qy * y - qz * z;
    (
        ix * qw + iw * -qx + iy * -qz - iz * -qy + pos[0],
        iy * qw + iw * -qy + iz * -qx - ix * -qz + pos[1],
        iz * qw + iw * -qz + ix * -qy - iy * -qx + pos[2],
    )
}

fn mesh_for(kind: &str, size: [f32; 3]) -> MeshData {
    match kind.to_ascii_lowercase().as_str() {
        "sphere" => sphere(size, 12, 8),
        "cylinder" => cylinder(size, 16),
        "cone" => cone(size, 16),
        "plane" => plane(size),
        _ => box_mesh(size),
    }
}

fn box_mesh(size: [f32; 3]) -> MeshData {
    let hx = size[0] * 0.5;
    let hy = size[1] * 0.5;
    let hz = size[2] * 0.5;
    let faces = [
        ([0.0, 0.0, 1.0], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]),
        ([0.0, 0.0, -1.0], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]),
        ([0.0, 1.0, 0.0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]),
        ([0.0, -1.0, 0.0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]),
        ([1.0, 0.0, 0.0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]),
        ([-1.0, 0.0, 0.0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]),
    ];
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut indices = Vec::new();
    for (n, q) in faces {
        let base = (positions.len() / 3) as u16;
        for p in q {
            positions.extend_from_slice(&p);
            normals.extend_from_slice(&n);
        }
        indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    }
    MeshData { positions, normals, indices }
}

fn plane(size: [f32; 3]) -> MeshData {
    let hx = size[0] * 0.5;
    let hz = size[2] * 0.5;
    MeshData {
        positions: vec![-hx, 0.0, -hz, hx, 0.0, -hz, hx, 0.0, hz, -hx, 0.0, hz],
        normals: vec![0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0],
        indices: vec![0, 1, 2, 0, 2, 3],
    }
}

fn sphere(size: [f32; 3], slices: u32, stacks: u32) -> MeshData {
    let rx = size[0] * 0.5;
    let ry = size[1] * 0.5;
    let rz = size[2] * 0.5;
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    for y in 0..=stacks {
        let v = y as f32 / stacks as f32;
        let phi = v * std::f32::consts::PI;
        let (sp, cp) = phi.sin_cos();
        for x in 0..=slices {
            let u = x as f32 / slices as f32;
            let theta = u * std::f32::consts::TAU;
            let (st, ct) = theta.sin_cos();
            let nx = st * sp;
            let ny = cp;
            let nz = ct * sp;
            positions.extend_from_slice(&[nx * rx, ny * ry, nz * rz]);
            normals.extend_from_slice(&[nx, ny, nz]);
        }
    }
    let mut indices = Vec::new();
    let cols = slices + 1;
    for y in 0..stacks {
        for x in 0..slices {
            let i = y * cols + x;
            let i2 = i + cols;
            indices.extend_from_slice(&[i as u16, (i + 1) as u16, i2 as u16, (i + 1) as u16, (i2 + 1) as u16, i2 as u16]);
        }
    }
    MeshData { positions, normals, indices }
}

fn cylinder(size: [f32; 3], slices: u32) -> MeshData {
    let rx = size[0] * 0.5;
    let hy = size[1] * 0.5;
    let rz = size[2] * 0.5;
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut indices = Vec::new();
    for i in 0..=slices {
        let t = i as f32 / slices as f32 * std::f32::consts::TAU;
        let (s, c) = t.sin_cos();
        let nx = s;
        let nz = c;
        positions.extend_from_slice(&[nx * rx, -hy, nz * rz, nx * rx, hy, nz * rz]);
        normals.extend_from_slice(&[nx, 0.0, nz, nx, 0.0, nz]);
    }
    for i in 0..slices {
        let a = (i * 2) as u16;
        indices.extend_from_slice(&[a, a + 1, a + 2, a + 1, a + 3, a + 2]);
    }
    let bottom = (positions.len() / 3) as u16;
    positions.extend_from_slice(&[0.0, -hy, 0.0]);
    normals.extend_from_slice(&[0.0, -1.0, 0.0]);
    let top = (positions.len() / 3) as u16;
    positions.extend_from_slice(&[0.0, hy, 0.0]);
    normals.extend_from_slice(&[0.0, 1.0, 0.0]);
    for i in 0..slices {
        let t = i as f32 / slices as f32 * std::f32::consts::TAU;
        let n = (i + 1) as f32 / slices as f32 * std::f32::consts::TAU;
        let (s0, c0) = t.sin_cos();
        let (s1, c1) = n.sin_cos();
        let b0 = (positions.len() / 3) as u16;
        positions.extend_from_slice(&[s0 * rx, -hy, c0 * rz, s1 * rx, -hy, c1 * rz]);
        normals.extend_from_slice(&[0.0, -1.0, 0.0, 0.0, -1.0, 0.0]);
        indices.extend_from_slice(&[bottom, b0 + 1, b0]);
        let t0 = (positions.len() / 3) as u16;
        positions.extend_from_slice(&[s0 * rx, hy, c0 * rz, s1 * rx, hy, c1 * rz]);
        normals.extend_from_slice(&[0.0, 1.0, 0.0, 0.0, 1.0, 0.0]);
        indices.extend_from_slice(&[top, t0, t0 + 1]);
    }
    MeshData { positions, normals, indices }
}

fn cone(size: [f32; 3], slices: u32) -> MeshData {
    let rx = size[0] * 0.5;
    let hy = size[1] * 0.5;
    let rz = size[2] * 0.5;
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut indices = Vec::new();
    let tip = 0u16;
    positions.extend_from_slice(&[0.0, hy, 0.0]);
    normals.extend_from_slice(&[0.0, 1.0, 0.0]);
    for i in 0..=slices {
        let t = i as f32 / slices as f32 * std::f32::consts::TAU;
        let (s, c) = t.sin_cos();
        positions.extend_from_slice(&[s * rx, -hy, c * rz]);
        let nx = s;
        let nz = c;
        let len = (nx * nx + 0.5 * 0.5 + nz * nz).sqrt();
        normals.extend_from_slice(&[nx / len, 0.5 / len, nz / len]);
    }
    for i in 0..slices {
        indices.extend_from_slice(&[tip, 1 + i as u16, 2 + i as u16]);
    }
    let bottom = (positions.len() / 3) as u16;
    positions.extend_from_slice(&[0.0, -hy, 0.0]);
    normals.extend_from_slice(&[0.0, -1.0, 0.0]);
    for i in 0..slices {
        let t = i as f32 / slices as f32 * std::f32::consts::TAU;
        let n = (i + 1) as f32 / slices as f32 * std::f32::consts::TAU;
        let (s0, c0) = t.sin_cos();
        let (s1, c1) = n.sin_cos();
        let b = (positions.len() / 3) as u16;
        positions.extend_from_slice(&[s0 * rx, -hy, c0 * rz, s1 * rx, -hy, c1 * rz]);
        normals.extend_from_slice(&[0.0, -1.0, 0.0, 0.0, -1.0, 0.0]);
        indices.extend_from_slice(&[bottom, b + 1, b]);
    }
    MeshData { positions, normals, indices }
}

fn bounds(pos: &[f32]) -> ([f32; 3], [f32; 3]) {
    let mut min = [f32::MAX; 3];
    let mut max = [f32::MIN; 3];
    for c in pos.chunks(3) {
        for i in 0..3 {
            min[i] = min[i].min(c[i]);
            max[i] = max[i].max(c[i]);
        }
    }
    (min, max)
}

fn align4(n: usize) -> usize {
    (n + 3) & !3
}

fn f32_bytes(v: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(v.len() * 4);
    for n in v {
        out.extend_from_slice(&n.to_le_bytes());
    }
    out
}

fn u16_bytes(v: &[u16]) -> Vec<u8> {
    let mut out = Vec::with_capacity(v.len() * 2);
    for n in v {
        out.extend_from_slice(&n.to_le_bytes());
    }
    out
}

fn parse_color(hex: &str) -> [f32; 4] {
    let h = hex.trim().trim_start_matches('#');
    if h.len() >= 6 {
        let r = u8::from_str_radix(&h[0..2], 16).unwrap_or(200) as f32 / 255.0;
        let g = u8::from_str_radix(&h[2..4], 16).unwrap_or(200) as f32 / 255.0;
        let b = u8::from_str_radix(&h[4..6], 16).unwrap_or(200) as f32 / 255.0;
        return [r, g, b, 1.0];
    }
    [0.8, 0.8, 0.8, 1.0]
}

fn euler_xyz_deg_to_quat(x: f32, y: f32, z: f32) -> [f32; 4] {
    let rx = x.to_radians() * 0.5;
    let ry = y.to_radians() * 0.5;
    let rz = z.to_radians() * 0.5;
    let (sx, cx) = rx.sin_cos();
    let (sy, cy) = ry.sin_cos();
    let (sz, cz) = rz.sin_cos();
    [
        sx * cy * cz - cx * sy * sz,
        cx * sy * cz + sx * cy * sz,
        cx * cy * sz - sx * sy * cz,
        cx * cy * cz + sx * sy * sz,
    ]
}

fn apply_ops(spec: &mut SceneSpec, ops: &[Value]) -> Result<(), String> {
    for op in ops {
        let kind = op.get("op").and_then(|v| v.as_str()).unwrap_or("").trim();
        let part_id = op.get("part").and_then(|v| v.as_str()).unwrap_or("").trim();
        let part = spec
            .parts
            .iter_mut()
            .find(|p| p.id == part_id)
            .ok_or_else(|| format!("Unknown part '{part_id}'."))?;
        match kind {
            "scale" => {
                let by = vec3_arg(op, "by")?;
                part.size = [part.size[0] * by[0], part.size[1] * by[1], part.size[2] * by[2]];
            }
            "move" | "translate" => {
                let by = vec3_arg(op, "by")?;
                part.position = [
                    part.position[0] + by[0],
                    part.position[1] + by[1],
                    part.position[2] + by[2],
                ];
            }
            "rotate" => {
                let by = vec3_arg(op, "by")?;
                part.rotation = [
                    part.rotation[0] + by[0],
                    part.rotation[1] + by[1],
                    part.rotation[2] + by[2],
                ];
            }
            "recolor" => {
                if let Some(c) = op.get("color").and_then(|v| v.as_str()) {
                    part.material.color = c.to_string();
                }
            }
            "metalness" => {
                if let Some(v) = op.get("value").and_then(|v| v.as_f64()) {
                    part.material.metalness = v as f32;
                }
            }
            "roughness" => {
                if let Some(v) = op.get("value").and_then(|v| v.as_f64()) {
                    part.material.roughness = v as f32;
                }
            }
            other => return Err(format!("Unknown edit op '{other}'. Use scale, move, rotate, recolor.")),
        }
    }
    Ok(())
}

fn vec3_arg(op: &Value, key: &str) -> Result<[f32; 3], String> {
    let arr = op
        .get(key)
        .and_then(|v| v.as_array())
        .ok_or_else(|| format!("{key} must be [x,y,z]."))?;
    if arr.len() != 3 {
        return Err(format!("{key} must have 3 numbers."));
    }
    Ok([
        arr[0].as_f64().unwrap_or(1.0) as f32,
        arr[1].as_f64().unwrap_or(1.0) as f32,
        arr[2].as_f64().unwrap_or(1.0) as f32,
    ])
}

fn blender_on_path() -> Option<String> {
    lookup_bin("blender")
}

fn lookup_bin(name: &str) -> Option<String> {
    let mut cmd = if cfg!(windows) {
        let mut c = std::process::Command::new("where");
        c.arg(name);
        c
    } else {
        let mut c = std::process::Command::new("which");
        c.arg(name);
        c
    };
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

async fn blender_glb(spec: &SceneSpec) -> Result<Vec<u8>, String> {
    let blender = blender_on_path().ok_or_else(|| "Blender is not on PATH.".to_string())?;
    let dir = std::env::temp_dir().join(format!("shape-blend-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out_path = dir.join("out.glb");
    let py_path = dir.join("build.py");
    let py = blender_script(spec, &out_path);
    std::fs::write(&py_path, py).map_err(|e| e.to_string())?;
    let status = tokio::process::Command::new(&blender)
        .args([
            "--background",
            "--python",
            &py_path.to_string_lossy(),
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map_err(|e| format!("Failed to run Blender: {e}"))?;
    if !status.success() {
        let _ = std::fs::remove_dir_all(&dir);
        return Err("Blender exited with an error.".into());
    }
    let bytes = std::fs::read(&out_path).map_err(|_| "Blender did not write a GLB.".to_string())?;
    let _ = std::fs::remove_dir_all(&dir);
    Ok(bytes)
}

fn blender_script(spec: &SceneSpec, out: &std::path::Path) -> String {
    let mut body = String::from(
        "import bpy\nbpy.ops.object.select_all(action='SELECT')\nbpy.ops.object.delete(use_global=False)\n",
    );
    for part in &spec.parts {
        let [sx, sy, sz] = part.size;
        let [px, py, pz] = part.position;
        let [rx, ry, rz] = part.rotation;
        let kind = part.mesh.to_ascii_lowercase();
        let create = match kind.as_str() {
            "sphere" => format!("bpy.ops.mesh.primitive_uv_sphere_add(radius={:.6}, location=({px},{py},{pz}))\n", sx.max(sy).max(sz) * 0.5),
            "cylinder" => format!("bpy.ops.mesh.primitive_cylinder_add(radius={:.6}, depth={sy:.6}, location=({px},{py},{pz}))\n", sx.max(sz) * 0.5),
            "cone" => format!("bpy.ops.mesh.primitive_cone_add(radius1={:.6}, depth={sy:.6}, location=({px},{py},{pz}))\n", sx.max(sz) * 0.5),
            "plane" => format!("bpy.ops.mesh.primitive_plane_add(size={sx:.6}, location=({px},{py},{pz}))\n"),
            _ => format!("bpy.ops.mesh.primitive_cube_add(size=1, location=({px},{py},{pz}))\nobj=bpy.context.object\nobj.scale=({sx:.6},{sy:.6},{sz:.6})\n"),
        };
        body.push_str(&create);
        body.push_str(&format!(
            "obj=bpy.context.object\nobj.name={:?}\nobj.rotation_euler=({:.6},{:.6},{:.6})\n",
            part.id,
            rx.to_radians(),
            ry.to_radians(),
            rz.to_radians()
        ));
        let c = parse_color(&part.material.color);
        body.push_str(&format!(
            "mat=bpy.data.materials.new(name={:?})\nmat.use_nodes=True\nbsdf=mat.node_tree.nodes.get('Principled BSDF')\nif bsdf:\n    bsdf.inputs['Base Color'].default_value=({:.4},{:.4},{:.4},1)\n    bsdf.inputs['Metallic'].default_value={:.4}\n    bsdf.inputs['Roughness'].default_value={:.4}\nobj.data.materials.append(mat)\n",
            part.id, c[0], c[1], c[2], part.material.metalness, part.material.roughness
        ));
    }
    body.push_str(&format!(
        "bpy.ops.export_scene.gltf(filepath={:?}, export_format='GLB')\n",
        out.to_string_lossy().replace('\\', "/")
    ));
    body
}

fn fail(_name: &str, message: &str) -> ToolOutcome {
    ToolOutcome {
        tool_result: format!("ERROR: {message}"),
        ui_chunk: "\n<generated_model failed=\"1\"></generated_model>\n".into(),
        side_effect: None,
    }
}

fn resolve_source_bytes(args: &Value, ctx: &ToolCtx<'_>) -> Result<(Vec<u8>, Option<String>), String> {
    if let Some(id) = args.get("media_id").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
        return media_stash::read_bytes(id).map(|b| (b, Some(id.to_string())));
    }
    if let Some(path) = args.get("path").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
        let resolved = security::paths::resolve_safe_path(path, ctx.project_path)
            .map_err(|e| e.to_string())?;
        let bytes = std::fs::read(&resolved).map_err(|e| e.to_string())?;
        return Ok((bytes, None));
    }
    Err("Pass media_id or path.".into())
}

fn stash_model(
    bytes: &[u8],
    kind: &str,
    mime: &str,
    prompt: Option<&str>,
    name: Option<&str>,
    ctx: &ToolCtx<'_>,
    parent: Option<String>,
) -> Result<media_stash::MediaEntry, String> {
    media_stash::stash_bytes_meta(
        bytes,
        mime,
        kind,
        ctx.conversation_id.as_deref(),
        prompt,
        name,
        StashMeta {
            model: Some("shape-local".into()),
            parent_id: parent,
            ordinal: Some(1),
            ..StashMeta::default()
        },
    )
}

fn model_tag(entry: &media_stash::MediaEntry, prompt: &str) -> String {
    format!(
        "\n<generated_model media_id=\"{}\" name=\"{}\" format=\"glb\" prompt=\"{}\"></generated_model>\n",
        entry.id,
        entry.name.as_deref().unwrap_or("model.glb").replace('"', "'"),
        prompt.replace('"', "'")
    )
}

pub async fn tool_generate_3d_model(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let prompt = args.get("prompt").and_then(|v| v.as_str()).unwrap_or("").trim();
    let spec = if let Some(raw) = args.get("spec") {
        match spec_from_value(raw) {
            Ok(s) if !s.parts.is_empty() => s,
            Ok(_) => spec_from_prompt(prompt),
            Err(e) => return fail("generate_3d_model", &e),
        }
    } else if !prompt.is_empty() {
        spec_from_prompt(prompt)
    } else {
        return fail("generate_3d_model", "Pass prompt or spec.");
    };
    let backend = args.get("backend").and_then(|v| v.as_str()).unwrap_or("native");
    let glb = if backend.eq_ignore_ascii_case("blender") {
        match blender_glb(&spec).await {
            Ok(b) => b,
            Err(e) => return fail("generate_3d_model", &e),
        }
    } else {
        match build_glb(&spec) {
            Ok(b) => b,
            Err(e) => return fail("generate_3d_model", &e),
        }
    };
    let name = format!("{}.glb", spec.name.as_deref().unwrap_or("model"));
    match stash_model(&glb, "model", "model/gltf-binary", Some(prompt), Some(&name), ctx, None) {
        Ok(entry) => ToolOutcome {
            tool_result: format!(
                "Generated 3D model media_id={} ({} bytes, {} parts). Preview is in chat. Use save_media only if they asked to put it in the project. Do not dump binary.",
                entry.id,
                glb.len(),
                spec.parts.len()
            ),
            ui_chunk: model_tag(&entry, prompt),
            side_effect: None,
        },
        Err(e) => fail("generate_3d_model", &e),
    }
}

pub async fn tool_edit_3d_model(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let (bytes, parent) = match resolve_source_bytes(args, ctx) {
        Ok(v) => v,
        Err(e) => return fail("edit_3d_model", &e),
    };
    let mut spec = if let Some(raw) = args.get("spec") {
        match spec_from_value(raw) {
            Ok(s) => s,
            Err(e) => return fail("edit_3d_model", &e),
        }
    } else {
        match spec_from_glb(&bytes) {
            Ok(s) => s,
            Err(e) => return fail("edit_3d_model", &e),
        }
    };
    if let Some(ops) = args.get("ops").and_then(|v| v.as_array()) {
        if let Err(e) = apply_ops(&mut spec, ops) {
            return fail("edit_3d_model", &e);
        }
    }
    let glb = match build_glb(&spec) {
        Ok(b) => b,
        Err(e) => return fail("edit_3d_model", &e),
    };
    let prompt = args.get("prompt").and_then(|v| v.as_str()).unwrap_or("edited model");
    let name = format!("{}.glb", spec.name.as_deref().unwrap_or("model"));
    match stash_model(&glb, "model", "model/gltf-binary", Some(prompt), Some(&name), ctx, parent) {
        Ok(entry) => ToolOutcome {
            tool_result: format!(
                "Edited 3D model media_id={} parent={}. Preview is in chat.",
                entry.id,
                entry.parent_id.as_deref().unwrap_or("-")
            ),
            ui_chunk: model_tag(&entry, prompt),
            side_effect: None,
        },
        Err(e) => fail("edit_3d_model", &e),
    }
}

pub async fn tool_inspect_3d_model(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let (bytes, id) = match resolve_source_bytes(args, ctx) {
        Ok(v) => v,
        Err(e) => {
            return ToolOutcome {
                tool_result: format!("ERROR: {e}"),
                ui_chunk: String::new(),
                side_effect: None,
            };
        }
    };
    match inspect_glb(&bytes) {
        Ok(info) => ToolOutcome {
            tool_result: format!(
                "Inspected {} ({} bytes):\n{}",
                id.unwrap_or_else(|| "file".into()),
                bytes.len(),
                serde_json::to_string_pretty(&info).unwrap_or_default()
            ),
            ui_chunk: String::new(),
            side_effect: None,
        },
        Err(e) => ToolOutcome {
            tool_result: format!("ERROR: {e}"),
            ui_chunk: String::new(),
            side_effect: None,
        },
    }
}

pub async fn tool_convert_3d_model(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let format = args
        .get("format")
        .and_then(|v| v.as_str())
        .unwrap_or("glb")
        .trim()
        .to_ascii_lowercase();
    let (bytes, parent) = match resolve_source_bytes(args, ctx) {
        Ok(v) => v,
        Err(e) => return fail("convert_3d_model", &e),
    };
    let spec = spec_from_glb(&bytes).ok();
    let (out, mime, kind, name) = match format.as_str() {
        "glb" => (bytes.clone(), "model/gltf-binary", "model", "model.glb"),
        "gltf" => match glb_to_gltf(&bytes) {
            Ok(b) => (b, "model/gltf+json", "gltf", "model.gltf"),
            Err(e) => return fail("convert_3d_model", &e),
        },
        "obj" => {
            let Some(spec) = spec.as_ref() else {
                return fail("convert_3d_model", "OBJ export needs a Shape scene spec.");
            };
            (spec_to_obj(spec).into_bytes(), "model/obj", "obj", "model.obj")
        }
        "stl" => {
            let Some(spec) = spec.as_ref() else {
                return fail("convert_3d_model", "STL export needs a Shape scene spec.");
            };
            (spec_to_stl(spec), "model/stl", "stl", "model.stl")
        }
        "fbx" => {
            if blender_on_path().is_none() {
                return fail("convert_3d_model", "FBX export requires Blender on PATH.");
            }
            return fail(
                "convert_3d_model",
                "FBX export via Blender is not wired for this convert path. Export GLB and open it in Blender.",
            );
        }
        other => return fail("convert_3d_model", &format!("Unsupported format '{other}'. Use glb, gltf, obj, or stl.")),
    };
    match stash_model(&out, kind, mime, Some(&format!("converted {format}")), Some(name), ctx, parent) {
        Ok(entry) => ToolOutcome {
            tool_result: format!("Converted to {format}. media_id={} ({} bytes).", entry.id, out.len()),
            ui_chunk: if kind == "model" {
                model_tag(&entry, &format!("converted {format}"))
            } else {
                String::new()
            },
            side_effect: None,
        },
        Err(e) => fail("convert_3d_model", &e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sword_glb_has_magic_and_spec() {
        let spec = sword_spec();
        let glb = build_glb(&spec).unwrap();
        assert_eq!(&glb[0..4], b"glTF");
        assert!(glb.len() > 400);
        let parsed = spec_from_glb(&glb).unwrap();
        assert_eq!(parsed.parts.len(), 4);
        assert!(parsed.parts.iter().any(|p| p.id == "blade"));
        let info = inspect_glb(&glb).unwrap();
        assert_eq!(info["meshes"], 4);
        assert_eq!(info["hasShapeSpec"], true);
    }

    #[test]
    fn edit_lengthens_blade() {
        let mut spec = sword_spec();
        let ops = vec![json!({"op":"scale","part":"blade","by":[1,1.4,1]})];
        apply_ops(&mut spec, &ops).unwrap();
        let blade = spec.parts.iter().find(|p| p.id == "blade").unwrap();
        assert!((blade.size[1] - 0.9 * 1.4).abs() < 0.0001);
        let glb = build_glb(&spec).unwrap();
        assert_eq!(&glb[0..4], b"glTF");
    }

    #[test]
    fn obj_and_stl_export() {
        let spec = spec_from_prompt("a cube");
        let obj = spec_to_obj(&spec);
        assert!(obj.contains("v "));
        assert!(obj.contains("f "));
        let stl = spec_to_stl(&spec);
        assert!(stl.len() > 84);
        let count = u32::from_le_bytes(stl[80..84].try_into().unwrap());
        assert!(count > 0);
    }

    #[test]
    fn gltf_conversion_embeds_buffer() {
        let glb = build_glb(&spec_from_prompt("sphere")).unwrap();
        let gltf = glb_to_gltf(&glb).unwrap();
        let text = String::from_utf8(gltf).unwrap();
        assert!(text.contains("data:application/octet-stream;base64,"));
        assert!(text.contains("\"meshes\""));
    }

    #[test]
    fn blender_backend_skips_when_missing() {
        match blender_on_path() {
            None => eprintln!("skip: Blender is not on PATH (FBX and blender backend unavailable)"),
            Some(path) => assert!(
                std::path::Path::new(&path).exists(),
                "listed Blender binary is missing: {path}"
            ),
        }
    }

    #[test]
    fn write_e2e_model_fixture() {
        let glb = build_glb(&spec_from_prompt("a cube")).unwrap();
        assert_eq!(&glb[0..4], b"glTF");
        let dest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/e2e/fixtures/cube.glb");
        if let Some(parent) = dest.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&dest, &glb).unwrap();
        assert!(dest.is_file());
    }
}
