"""Reproducible Blender 4.5.16 LTS asset generator for Vietnam-Monopoly-3D.

Builds the 4 lightweight rigged Vietnamese tycoon board tokens (`pawn_car.glb`,
`pawn_yacht.glb`, `pawn_jet.glb`, `pawn_crown.glb`) using rigid-bone
single-weight skinning (10 bones <= 12, <= 1,800 tris, 12 canonical NLA clips
@ 30 fps) and exports binary glTF 2.0 (`.glb`) to `public/assets/models/`.

Run inside Blender 4.5 (headless or via `blender` MCP `execute_blender_code`):
    blender --background --python scripts/blender/build_monopoly_assets.py
"""

from __future__ import annotations

import math
import os
import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

REPO_ROOT = r"d:\Code\Project\cờ-tỷ-phú-3d-việt-nam"
OUTPUT_DIR = os.path.join(REPO_ROOT, "public", "assets", "models")

CLIP_SPECS = [
    "idle_loop",
    "anticipation",
    "hop_takeoff",
    "hop_airborne",
    "hop_land",
    "corner_bank",
    "celebrate_short",
    "proud_gesture",
    "stressed_slump",
    "jailed_loop",
    "victory_dance",
    "defeat_slump",
]

TROPHY_CLIP_SPECS = [
    "podium_rise",
    "trophy_idle",
]

# Archetype default suit colors (overridden dynamically at runtime via player.color)
ARCHETYPE_META = {
    "car": {
        "suit_hex": (0.961, 0.722, 0.0),      # #F5B800 (CEO Minh Khoi)
        "hair_hex": (0.165, 0.094, 0.063),    # #2A1810
        "female": False,
    },
    "yacht": {
        "suit_hex": (0.400, 0.776, 0.110),    # #66C61C (Chu Tich Lan Anh)
        "hair_hex": (0.118, 0.161, 0.231),    # #1E293B
        "female": True,
    },
    "jet": {
        "suit_hex": (0.161, 0.714, 0.965),    # #29B6F6 (Shark Hoang Nam)
        "hair_hex": (0.290, 0.145, 0.071),    # #4A2512
        "female": False,
    },
    "crown": {
        "suit_hex": (0.914, 0.118, 0.388),    # #E91E63 (Phu Nhan Ngoc Diep)
        "hair_hex": (0.420, 0.157, 0.078),    # #6B2814
        "female": True,
    },
}

PALETTE_VCOLS = {
    "white": (0.98, 0.98, 0.99, 1.0),
    "skin": (0.984, 0.835, 0.741, 1.0),
    "blush": (1.0, 0.561, 0.671, 1.0),
    "shoe": (0.118, 0.161, 0.231, 1.0),
    "glass": (0.220, 0.741, 0.973, 1.0),
    "emerald": (0.063, 0.725, 0.506, 1.0),
    "leather": (0.36, 0.19, 0.10, 1.0),
}


def srgb_to_linear_channel(c: float) -> float:
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def srgb_rgba_to_linear(rgba: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    return (
        srgb_to_linear_channel(rgba[0]),
        srgb_to_linear_channel(rgba[1]),
        srgb_to_linear_channel(rgba[2]),
        rgba[3],
    )


def clear_scene() -> None:
    if bpy.context.active_object and bpy.context.active_object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for arm in list(bpy.data.armatures):
        if arm.users == 0:
            bpy.data.armatures.remove(arm)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    for act in list(bpy.data.actions):
        if act.users == 0:
            bpy.data.actions.remove(act)


def make_materials(suit_srgb: tuple[float, float, float]) -> dict[str, bpy.types.Material]:
    suit_lin = (
        srgb_to_linear_channel(suit_srgb[0]),
        srgb_to_linear_channel(suit_srgb[1]),
        srgb_to_linear_channel(suit_srgb[2]),
        1.0,
    )
    suit_dark_lin = (suit_lin[0] * 0.72, suit_lin[1] * 0.72, suit_lin[2] * 0.72, 1.0)

    def create_pbr(name: str, base_color, roughness: float, metallic: float = 0.0) -> bpy.types.Material:
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = base_color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        return mat

    mat_suit = create_pbr("mat_suit", suit_lin, roughness=0.40, metallic=0.14)
    mat_suit_dark = create_pbr("mat_suit_dark", suit_dark_lin, roughness=0.55, metallic=0.14)
    mat_gold = create_pbr(
        "mat_gold",
        srgb_rgba_to_linear((0.980, 0.800, 0.082, 1.0)),
        roughness=0.26,
        metallic=0.68,
    )

    mat_vcol = bpy.data.materials.new(name="mat_body_vcol")
    mat_vcol.use_nodes = True
    nt = mat_vcol.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.50
    bsdf.inputs["Metallic"].default_value = 0.05
    vcol_node = nt.nodes.new(type="ShaderNodeAttribute")
    vcol_node.attribute_name = "Col"
    nt.links.new(vcol_node.outputs["Color"], bsdf.inputs["Base Color"])

    return {
        "suit": mat_suit,
        "suit_dark": mat_suit_dark,
        "gold": mat_gold,
        "vcol": mat_vcol,
    }


def add_bmesh_part(
    bm: bmesh.types.BMesh,
    col_layer,
    bone_name: str,
    bone_tag_layer,
    mat_idx: int,
    bone_id_map: dict[str, int],
    kind: str,
    pos: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
    scale: tuple[float, float, float] = (1.0, 1.0, 1.0),
    vcol_srgb: tuple[float, float, float, float] = PALETTE_VCOLS["white"],
    smooth: bool = False,
    **params,
) -> None:
    """Appends a manifold closed primitive directly into `bm`, stamping material, color, and bone tag."""
    tmp = bmesh.new()
    if kind == "box":
        sx, sy, sz = params["size"]
        bmesh.ops.create_cube(tmp, size=1.0)
        for v in tmp.verts:
            v.co.x *= sx
            v.co.y *= sy
            v.co.z *= sz
    elif kind == "cyl":
        r1 = params["r1"]
        r2 = params.get("r2", r1)
        h = params["h"]
        segs = params.get("segs", 10)
        bmesh.ops.create_cone(
            tmp,
            cap_ends=True,
            cap_tris=True,
            segments=segs,
            radius1=r1,
            radius2=r2,
            depth=h,
        )
    elif kind == "sphere":
        r = params["r"]
        u_segs = params.get("u_segs", 12)
        v_segs = params.get("v_segs", 8)
        bmesh.ops.create_uvsphere(tmp, u_segments=u_segs, v_segments=v_segs, radius=r)
    elif kind == "ico":
        r = params["r"]
        sub = params.get("subdivisions", 1)
        bmesh.ops.create_icosphere(tmp, subdivisions=sub, radius=r)
    else:
        raise ValueError(f"Unsupported primitive kind: {kind}")

    bmesh.ops.triangulate(tmp, faces=tmp.faces[:])

    scale_m = Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
    rot_m = Euler(rot, "XYZ").to_matrix().to_4x4()
    trans_m = Matrix.Translation(Vector(pos))
    xf = trans_m @ rot_m @ scale_m
    bmesh.ops.transform(tmp, matrix=xf, verts=tmp.verts[:])

    lin_col = srgb_rgba_to_linear(vcol_srgb)
    bone_id = bone_id_map[bone_name]
    vert_map: dict[bmesh.types.BMVert, bmesh.types.BMVert] = {}
    for v in tmp.verts:
        nv = bm.verts.new(v.co)
        nv[bone_tag_layer] = bone_id
        vert_map[v] = nv

    for f in tmp.faces:
        nf = bm.faces.new([vert_map[v] for v in f.verts])
        nf.material_index = mat_idx
        nf.smooth = smooth
        for loop in nf.loops:
            loop[col_layer] = lin_col

    tmp.free()


def build_unified_armature(name: str) -> tuple[bpy.types.Object, dict[str, int]]:
    """Builds the 10-bone unified chibi armature (+Z Up, -Y Front)."""
    arm_data = bpy.data.armatures.new(f"{name}_Armature")
    arm_obj = bpy.data.objects.new(f"{name}_Rig", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")

    # All bones use a vertical small tail along +Z with roll=0 so local axes stay uniform:
    # Local Y = World +Z (Up), Local X = World +X (Right), Local Z = World -Y (Forward)
    bone_defs = [
        ("root", None, (0.0, 0.0, 0.0), (0.0, 0.0, 0.10)),
        ("pedestal_bone", "root", (0.0, 0.0, 0.04), (0.0, 0.0, 0.16)),
        ("hips", "root", (0.0, 0.0, 0.22), (0.0, 0.0, 0.34)),
        ("leg_L", "hips", (-0.095, 0.0, 0.30), (-0.095, 0.0, 0.40)),
        ("leg_R", "hips", (0.095, 0.0, 0.30), (0.095, 0.0, 0.40)),
        ("spine", "hips", (0.0, 0.0, 0.34), (0.0, 0.0, 0.62)),
        ("head", "spine", (0.0, 0.0, 0.66), (0.0, 0.0, 0.90)),
        ("arm_L", "spine", (-0.22, 0.0, 0.56), (-0.22, 0.0, 0.66)),
        ("arm_R", "spine", (0.22, 0.0, 0.56), (0.22, 0.0, 0.66)),
        ("prop_R", "arm_R", (0.255, -0.02, 0.365), (0.255, -0.02, 0.445)),
    ]

    ebones = arm_data.edit_bones
    bone_id_map: dict[str, int] = {}
    for idx, (bname, parent_name, head_pt, tail_pt) in enumerate(bone_defs):
        eb = ebones.new(bname)
        eb.head = Vector(head_pt)
        eb.tail = Vector(tail_pt)
        eb.roll = 0.0
        eb.use_deform = True
        if parent_name:
            eb.parent = ebones[parent_name]
        bone_id_map[bname] = idx

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj, bone_id_map


def build_pawn_mesh(
    archetype: str,
    bone_id_map: dict[str, int],
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Object:
    """Constructs the single rigid-weighted Low-Poly Vietnamese Tycoon SkinnedMesh."""
    meta = ARCHETYPE_META[archetype]
    is_female = meta["female"]
    suit_rgba = (*meta["suit_hex"], 1.0)
    hair_rgba = (*meta["hair_hex"], 1.0)

    # Material slot indices: 0=suit, 1=suit_dark, 2=gold, 3=vcol
    M_SUIT = 0
    M_SUIT_DARK = 1
    M_GOLD = 2
    M_VCOL = 3

    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")
    bone_tag_layer = bm.verts.layers.int.new("bone_tag")

    def part(
        bone_name: str,
        mat_idx: int,
        kind: str,
        pos=(0.0, 0.0, 0.0),
        rot=(0.0, 0.0, 0.0),
        scale=(1.0, 1.0, 1.0),
        vcol=PALETTE_VCOLS["white"],
        smooth: bool | None = None,
        **params,
    ):
        use_smooth = smooth if smooth is not None else (kind in ("sphere", "ico") or (kind == "cyl" and params.get("segs", 10) >= 8))
        add_bmesh_part(
            bm=bm,
            col_layer=col_layer,
            bone_name=bone_name,
            bone_tag_layer=bone_tag_layer,
            mat_idx=mat_idx,
            bone_id_map=bone_id_map,
            kind=kind,
            pos=pos,
            rot=rot,
            scale=scale,
            vcol_srgb=vcol,
            smooth=use_smooth,
            **params,
        )

    # 1. Pedestal Disc & Archetype Mount (facing -Y Front, bottom strictly >= 0.0)
    part("pedestal_bone", M_GOLD, "cyl", pos=(0.0, 0.0, 0.03), r1=0.39, r2=0.36, h=0.06, segs=8)
    part("pedestal_bone", M_VCOL, "cyl", pos=(0.0, 0.0, 0.068), r1=0.33, r2=0.31, h=0.045, segs=8, vcol=PALETTE_VCOLS["white"])

    if archetype == "car":
        part("pedestal_bone", M_SUIT, "box", pos=(0.0, -0.08, 0.14), size=(0.46, 0.56, 0.11), smooth=True)
        part("pedestal_bone", M_GOLD, "box", pos=(0.0, -0.34, 0.095), size=(0.48, 0.13, 0.035), smooth=True)
        for wx, wy in [(-0.24, -0.20), (0.24, -0.20), (-0.24, 0.14), (0.24, 0.14)]:
            part("pedestal_bone", M_VCOL, "cyl", pos=(wx, wy, 0.10), rot=(0.0, math.pi / 2, 0.0), r1=0.085, h=0.06, segs=4, vcol=PALETTE_VCOLS["shoe"])
        for hx in (-0.14, 0.14):
            part("pedestal_bone", M_GOLD, "box", pos=(hx, -0.36, 0.15), size=(0.09, 0.04, 0.04), smooth=True)
    elif archetype == "yacht":
        part("pedestal_bone", M_VCOL, "cyl", pos=(0.0, -0.15, 0.145), rot=(math.pi / 2, 0.0, math.pi / 4), scale=(0.95, 0.44, 1.0), r1=0.31, r2=0.02, h=0.60, segs=4, vcol=PALETTE_VCOLS["white"], smooth=False)
        part("pedestal_bone", M_SUIT, "box", pos=(0.0, -0.02, 0.175), size=(0.40, 0.42, 0.045), smooth=True)
        part("pedestal_bone", M_VCOL, "box", pos=(0.0, -0.18, 0.225), rot=(0.35, 0.0, 0.0), size=(0.30, 0.075, 0.085), vcol=PALETTE_VCOLS["glass"], smooth=True)
    elif archetype == "jet":
        part("pedestal_bone", M_SUIT, "box", pos=(0.0, 0.02, 0.15), size=(0.80, 0.22, 0.04), smooth=True)
        part("pedestal_bone", M_GOLD, "box", pos=(0.0, 0.08, 0.185), size=(0.84, 0.05, 0.085), smooth=True)
        for ex in (-0.25, 0.25):
            part("pedestal_bone", M_VCOL, "cyl", pos=(ex, -0.05, 0.12), rot=(math.pi / 2, 0.0, 0.0), r1=0.06, r2=0.05, h=0.22, segs=4, vcol=PALETTE_VCOLS["white"])
            part("pedestal_bone", M_GOLD, "sphere", pos=(ex, -0.165, 0.12), r=0.04, u_segs=4, v_segs=3)
    else:
        for i in range(6):
            ang = (i / 6.0) * math.pi * 2.0
            part("pedestal_bone", M_GOLD, "sphere", pos=(math.cos(ang) * 0.31, math.sin(ang) * 0.31, 0.135), r=0.052, u_segs=4, v_segs=3)

    # 2. Shoes & Legs (facing -Y Front)
    for lx, bname in ((-0.095, "leg_L"), (0.095, "leg_R")):
        part(bname, M_VCOL, "box", pos=(lx, -0.025, 0.13), size=(0.125, 0.17, 0.068), vcol=PALETTE_VCOLS["shoe"], smooth=True)
        part(bname, M_SUIT_DARK, "cyl", pos=(lx, 0.0, 0.245), r1=0.062, r2=0.068, h=0.21, segs=4)

    # 3. Torso, Shirt Collar & Tie/Necklace
    r_top = 0.166 if is_female else 0.184
    r_bot = 0.146 if is_female else 0.158
    part("spine", M_SUIT, "cyl", pos=(0.0, 0.0, 0.49), scale=(1.02 if is_female else 1.08, 0.84, 1.0), r1=r_bot, r2=r_top, h=0.31, segs=6)
    part("spine", M_VCOL, "box", pos=(0.0, -0.132, 0.54), size=(0.115 if is_female else 0.128, 0.04, 0.175), vcol=PALETTE_VCOLS["white"], smooth=True)
    if is_female:
        part("spine", M_VCOL, "box", pos=(0.0, -0.142, 0.605), size=(0.11, 0.024, 0.024), vcol=PALETTE_VCOLS["white"], smooth=True)
        part("spine", M_GOLD, "sphere", pos=(0.0, -0.152, 0.555), r=0.032, u_segs=4, v_segs=3)
    else:
        part("spine", M_GOLD, "box", pos=(0.0, -0.146, 0.525), size=(0.046, 0.045, 0.135), smooth=True)

    # 4. Arms & Hands
    for side, bname in ((-1, "arm_L"), (1, "arm_R")):
        part(bname, M_SUIT, "cyl", pos=(side * 0.22, 0.0, 0.49), rot=(0.0, side * -0.16, 0.0), r1=0.046, r2=0.052, h=0.24, segs=4)
        part(bname, M_VCOL, "sphere", pos=(side * 0.245, -0.01, 0.36), r=0.048, u_segs=4, v_segs=3, vcol=PALETTE_VCOLS["skin"])

    # Signature Right-Hand Prop (`prop_R`)
    if archetype == "car":
        part("prop_R", M_VCOL, "box", pos=(0.275, -0.03, 0.255), size=(0.06, 0.19, 0.14), vcol=PALETTE_VCOLS["leather"], smooth=True)
        part("prop_R", M_GOLD, "box", pos=(0.275, -0.03, 0.33), size=(0.03, 0.08, 0.025), smooth=True)
    elif archetype == "yacht":
        part("prop_R", M_GOLD, "box", pos=(0.27, -0.06, 0.39), rot=(0.35, -0.3, 0.0), size=(0.14, 0.025, 0.12), smooth=True)
    elif archetype == "jet":
        part("prop_R", M_SUIT_DARK, "box", pos=(0.27, -0.05, 0.34), rot=(0.2, 0.15, 0.0), size=(0.03, 0.15, 0.18), smooth=True)
    else:
        part("prop_R", M_GOLD, "cyl", pos=(0.265, -0.06, 0.42), rot=(-0.25, 0.0, 0.0), r1=0.016, h=0.34, segs=4, smooth=True)
        part("prop_R", M_VCOL, "sphere", pos=(0.265, -0.105, 0.59), r=0.04, u_segs=4, v_segs=3, vcol=PALETTE_VCOLS["emerald"])

    # 5. Expressive Chibi Head, Eyes, Cheeks, Hair & Headwear (facing -Y Front!)
    hz = 0.83
    part("head", M_VCOL, "sphere", pos=(0.0, 0.0, hz), scale=(1.02, 0.98, 0.98), r=0.21, u_segs=8, v_segs=4, vcol=PALETTE_VCOLS["skin"])
    for ex in (-0.072, 0.072):
        part("head", M_VCOL, "sphere", pos=(ex, -0.194, hz + 0.015), scale=(0.9, 0.7, 1.05), r=0.028, u_segs=4, v_segs=3, vcol=PALETTE_VCOLS["shoe"])
        part("head", M_VCOL, "sphere", pos=(ex + 0.008, -0.212, hz + 0.024), r=0.011, u_segs=4, v_segs=3, vcol=PALETTE_VCOLS["white"])
        part("head", M_VCOL, "sphere", pos=(ex * 1.45, -0.182, hz - 0.03), scale=(1.2, 0.5, 0.75), r=0.028, u_segs=4, v_segs=3, vcol=PALETTE_VCOLS["blush"])

    # Back Hair Cap
    part("head", M_VCOL, "sphere", pos=(0.0, 0.045, hz + 0.02), scale=(1.02, 0.92, 0.96), r=0.20, u_segs=6, v_segs=4, vcol=hair_rgba)

    if archetype == "car":
        part("head", M_VCOL, "box", pos=(0.0, -0.04, hz + 0.18), rot=(-0.18, 0.0, 0.0), size=(0.25, 0.21, 0.085), vcol=hair_rgba, smooth=True)
        part("head", M_VCOL, "box", pos=(0.0, -0.195, hz + 0.03), size=(0.27, 0.055, 0.06), vcol=PALETTE_VCOLS["shoe"], smooth=True)
    elif archetype == "yacht":
        for side in (-1, 1):
            part("head", M_VCOL, "cyl", pos=(side * 0.19, -0.03, hz - 0.06), rot=(0.0, side * 0.14, 0.0), r1=0.05, r2=0.045, h=0.20, segs=4, vcol=hair_rgba, smooth=True)
        part("head", M_VCOL, "cyl", pos=(0.0, 0.0, hz + 0.155), rot=(0.1, 0.0, 0.0), r1=0.30, r2=0.30, h=0.03, segs=7, vcol=PALETTE_VCOLS["white"])
        part("head", M_SUIT, "cyl", pos=(0.0, 0.01, hz + 0.215), r1=0.18, r2=0.16, h=0.11, segs=6)
    elif archetype == "jet":
        part("head", M_SUIT_DARK, "cyl", pos=(0.0, 0.0, hz + 0.155), r1=0.265, r2=0.265, h=0.032, segs=6)
        part("head", M_SUIT, "cyl", pos=(0.0, 0.0, hz + 0.245), r1=0.155, r2=0.175, h=0.17, segs=6)
        part("head", M_GOLD, "cyl", pos=(0.0, 0.0, hz + 0.19), r1=0.170, r2=0.170, h=0.038, segs=6)
    else:
        for side in (-1, 1):
            part("head", M_VCOL, "cyl", pos=(side * 0.195, -0.045, hz - 0.09), rot=(0.1, side * 0.12, 0.0), r1=0.056, r2=0.048, h=0.25, segs=4, vcol=hair_rgba, smooth=True)
        part("head", M_GOLD, "cyl", pos=(0.0, 0.0, hz + 0.22), r1=0.145, r2=0.165, h=0.10, segs=5)
        for i in range(5):
            a = (i / 5.0) * math.pi * 2.0
            part("head", M_GOLD, "cyl", pos=(math.cos(a) * 0.118, math.sin(a) * 0.118, hz + 0.305), r1=0.044, r2=0.005, h=0.12, segs=3, smooth=True)

    mesh_data = bpy.data.meshes.new(f"pawn_{archetype}_Mesh")
    bm.to_mesh(mesh_data)

    # Ensure Col color attribute is active for Blender & glTF COLOR_0 export
    if mesh_data.color_attributes:
        mesh_data.color_attributes.active_color_index = 0
        mesh_data.color_attributes.render_color_index = 0

    # Read back per-vertex rigid bone tag before freeing bmesh
    vert_bone_ids = [v[bone_tag_layer] for v in bm.verts]
    bm.free()

    mesh_obj = bpy.data.objects.new(f"pawn_{archetype}_Body", mesh_data)
    bpy.context.collection.objects.link(mesh_obj)

    for slot_key in ("suit", "suit_dark", "gold", "vcol"):
        mesh_data.materials.append(materials[slot_key])

    # Create vertex groups matching armature deform bones & assign exact 1.0 rigid weight
    id_to_bone = {idx: name for name, idx in bone_id_map.items()}
    vgroups = {idx: mesh_obj.vertex_groups.new(name=name) for name, idx in bone_id_map.items()}
    grouped: dict[int, list[int]] = {idx: [] for idx in id_to_bone}
    for v_idx, b_id in enumerate(vert_bone_ids):
        grouped[b_id].append(v_idx)
    for b_id, v_indices in grouped.items():
        if v_indices:
            vgroups[b_id].add(v_indices, 1.0, "REPLACE")

    return mesh_obj


def add_pose_key(
    arm_obj: bpy.types.Object,
    frame: int,
    bone_name: str,
    loc: tuple[float, float, float] | None = None,
    rot_deg: tuple[float, float, float] | None = None,
    scale: tuple[float, float, float] | None = None,
) -> None:
    pb = arm_obj.pose.bones[bone_name]
    pb.rotation_mode = "XYZ"
    if loc is not None:
        pb.location = Vector(loc)
        pb.keyframe_insert(data_path="location", frame=frame)
    if rot_deg is not None:
        # Recall bone axes: Local X=World +X, Local Y=World +Z, Local Z=World -Y
        # Convert intuitive World (pitch_x, roll_y, yaw_z) into bone-local XYZ Euler cleanly:
        pb.rotation_euler = Euler(
            (math.radians(rot_deg[0]), math.radians(rot_deg[2]), math.radians(-rot_deg[1])),
            "XYZ",
        )
        pb.keyframe_insert(data_path="rotation_euler", frame=frame)
    if scale is not None:
        pb.scale = Vector(scale)
        pb.keyframe_insert(data_path="scale", frame=frame)


def reset_bones_at(
    arm_obj: bpy.types.Object,
    frame: int,
    bone_channels: dict[str, tuple[str, ...]],
) -> None:
    for bname, paths in bone_channels.items():
        pb = arm_obj.pose.bones[bname]
        pb.rotation_mode = "XYZ"
        if "loc" in paths:
            pb.location = Vector((0.0, 0.0, 0.0))
            pb.keyframe_insert(data_path="location", frame=frame)
        if "rot" in paths:
            pb.rotation_euler = Euler((0.0, 0.0, 0.0), "XYZ")
            pb.keyframe_insert(data_path="rotation_euler", frame=frame)
        if "scale" in paths:
            pb.scale = Vector((1.0, 1.0, 1.0))
            pb.keyframe_insert(data_path="scale", frame=frame)


def populate_clip_keyframes(arm_obj: bpy.types.Object, clip_name: str) -> None:
    """Authors all 12 canonical Business-Tour-style motion clips @ 30 fps using sparse channel keys."""
    k = lambda f, b, **kw: add_pose_key(arm_obj, f, b, **kw)

    if clip_name == "idle_loop":  # 2.4s -> 1..73
        for f, z_hip, sx, sp_x, hd_x in [
            (1, 0.0, 1.0, 0.0, 0.0),
            (37, 0.015, 1.02, 4.0, 2.5),
            (73, 0.0, 1.0, 0.0, 0.0),
        ]:
            k(f, "hips", loc=(0.0, z_hip, 0.0))
            k(f, "spine", rot_deg=(sp_x, 0.0, 0.0), scale=(sx, sx, sx))
            k(f, "head", rot_deg=(hd_x, 0.0, 3.0 if f == 37 else 0.0))

    elif clip_name == "anticipation":  # 0.12s -> 1..5
        reset_bones_at(arm_obj, 1, {"hips": ("loc", "scale"), "spine": ("rot",)})
        k(5, "hips", loc=(0.0, -0.055, 0.0), scale=(1.06, 0.89, 1.06))
        k(5, "spine", rot_deg=(12.0, 0.0, 0.0))

    elif clip_name == "hop_takeoff":  # 0.10s -> 1..4
        reset_bones_at(
            arm_obj,
            1,
            {
                "hips": ("loc", "scale"),
                "arm_L": ("rot",),
                "arm_R": ("rot",),
            },
        )
        k(4, "hips", loc=(0.0, 0.04, 0.0), scale=(0.93, 1.14, 0.93))
        k(4, "arm_L", rot_deg=(28.0, -18.0, 0.0))
        k(4, "arm_R", rot_deg=(-30.0, 18.0, 0.0))

    elif clip_name == "hop_airborne":  # 0.20s -> 1..7
        k(1, "spine", rot_deg=(11.0, 0.0, 0.0))
        k(1, "leg_L", rot_deg=(-22.0, 0.0, 0.0))
        k(1, "leg_R", rot_deg=(20.0, 0.0, 0.0))
        k(7, "spine", rot_deg=(8.0, 0.0, 0.0))
        k(7, "leg_L", rot_deg=(-10.0, 0.0, 0.0))
        k(7, "leg_R", rot_deg=(10.0, 0.0, 0.0))

    elif clip_name == "hop_land":  # 0.14s -> 1..5
        k(1, "hips", loc=(0.0, -0.05, 0.0), scale=(1.08, 0.86, 1.08))
        reset_bones_at(arm_obj, 5, {"hips": ("loc", "scale")})

    elif clip_name == "corner_bank":  # 0.20s -> 1..7
        chans = {"pedestal_bone": ("rot",), "hips": ("rot",)}
        reset_bones_at(arm_obj, 1, chans)
        k(3, "pedestal_bone", rot_deg=(0.0, 10.0, 0.0))
        k(3, "hips", rot_deg=(0.0, 12.0, 0.0))
        reset_bones_at(arm_obj, 7, chans)

    elif clip_name == "celebrate_short":  # 0.65s -> 1..21
        chans = {"hips": ("loc",), "arm_L": ("rot",), "arm_R": ("rot",)}
        reset_bones_at(arm_obj, 1, chans)
        for f, z_up, a_up in [(6, 0.075, 130.0), (11, 0.015, 95.0), (15, 0.07, 135.0)]:
            k(f, "hips", loc=(0.0, z_up, 0.0))
            k(f, "arm_L", rot_deg=(-a_up * 0.25, -a_up * 0.6, 0.0))
            k(f, "arm_R", rot_deg=(-a_up * 0.25, a_up * 0.6, 0.0))
        reset_bones_at(arm_obj, 21, chans)

    elif clip_name == "proud_gesture":  # 0.55s -> 1..18
        chans = {"spine": ("rot",), "arm_R": ("rot",)}
        reset_bones_at(arm_obj, 1, chans)
        k(7, "spine", rot_deg=(-6.0, 0.0, -8.0))
        k(7, "arm_R", rot_deg=(-48.0, 22.0, 0.0))
        reset_bones_at(arm_obj, 18, chans)

    elif clip_name == "stressed_slump":  # 0.60s -> 1..19
        chans = {"spine": ("rot",), "head": ("rot",)}
        reset_bones_at(arm_obj, 1, chans)
        k(5, "spine", rot_deg=(-9.0, 0.0, 0.0))
        k(6, "head", rot_deg=(8.0, 0.0, -16.0))
        k(13, "head", rot_deg=(10.0, 0.0, 16.0))
        reset_bones_at(arm_obj, 19, chans)

    elif clip_name == "jailed_loop":  # 2.0s -> 1..61
        for f, yaw, hip_z in [(1, 0.0, -0.032), (31, 22.0, -0.036), (61, 0.0, -0.032)]:
            k(f, "hips", loc=(0.0, hip_z, 0.0))
            k(f, "head", rot_deg=(6.0, 0.0, yaw))

    elif clip_name == "victory_dance":  # 2.2s -> 1..67
        for f, z_up, yaw, ll, lr in [
            (1, 0.0, 0.0, 10.0, -12.0),
            (18, 0.08, 10.0, -10.0, 12.0),
            (34, 0.01, -10.0, 12.0, -10.0),
            (50, 0.085, 12.0, -12.0, 12.0),
            (67, 0.0, 0.0, 10.0, -12.0),
        ]:
            k(f, "hips", loc=(0.0, z_up, 0.0), rot_deg=(0.0, yaw * 0.4, yaw))
            k(f, "leg_L", rot_deg=(ll, 0.0, 0.0))
            k(f, "leg_R", rot_deg=(lr, 0.0, 0.0))
        k(1, "arm_L", rot_deg=(-25.0, -68.0, 0.0))
        k(1, "arm_R", rot_deg=(-25.0, 68.0, 0.0))
        k(34, "arm_L", rot_deg=(-35.0, -78.0, 0.0))
        k(34, "arm_R", rot_deg=(-35.0, 78.0, 0.0))
        k(67, "arm_L", rot_deg=(-25.0, -68.0, 0.0))
        k(67, "arm_R", rot_deg=(-25.0, 68.0, 0.0))

    elif clip_name == "defeat_slump":  # 0.90s -> 1..28
        chans = {"hips": ("loc",), "spine": ("rot",)}
        reset_bones_at(arm_obj, 1, chans)
        k(28, "hips", loc=(0.0, -0.09, 0.0))
        k(28, "spine", rot_deg=(30.0, 0.0, 0.0))


def iter_action_fcurves(act: bpy.types.Action):
    if hasattr(act, "layers") and len(act.layers) > 0:
        for layer in act.layers:
            for strip in layer.strips:
                if hasattr(strip, "channelbags"):
                    for bag in strip.channelbags:
                        for fc in bag.fcurves:
                            yield fc
    elif hasattr(act, "fcurves"):
        for fc in act.fcurves:
            yield fc


def author_nla_clips(arm_obj: bpy.types.Object) -> None:
    bpy.context.scene.render.fps = 30
    arm_obj.animation_data_create()

    for clip_name in CLIP_SPECS:
        act = bpy.data.actions.new(name=clip_name)
        arm_obj.animation_data.action = act
        populate_clip_keyframes(arm_obj, clip_name)

        # Keep compact linear interpolation (smoothly interpolated by Three.js AnimationMixer)
        for fcurve in iter_action_fcurves(act):
            for kp in fcurve.keyframe_points:
                kp.interpolation = "LINEAR"

        track = arm_obj.animation_data.nla_tracks.new()
        track.name = clip_name
        start_frame = int(act.frame_range[0])
        track.strips.new(clip_name, start_frame, act)

        # Important: clear active action so NLA_TRACKS exports cleanly
        arm_obj.animation_data.action = None

    # Restore rest pose
    for pb in arm_obj.pose.bones:
        pb.location = Vector((0.0, 0.0, 0.0))
        pb.rotation_euler = Euler((0.0, 0.0, 0.0), "XYZ")
        pb.scale = Vector((1.0, 1.0, 1.0))


def verify_pawn_health(
    archetype: str, arm_obj: bpy.types.Object, mesh_obj: bpy.types.Object
) -> tuple[int, int, int, int, float, float]:
    check_bm = bmesh.new()
    check_bm.from_mesh(mesh_obj.data)
    check_bm.edges.ensure_lookup_table()
    check_bm.faces.ensure_lookup_table()
    ngons = sum(1 for f in check_bm.faces if len(f.verts) > 4)
    non_manifold = sum(1 for e in check_bm.edges if not e.is_manifold)
    z_coords = [v.co.z for v in check_bm.verts]
    z_min = min(z_coords) if z_coords else 0.0
    z_max = max(z_coords) if z_coords else 0.0
    tri_count = sum(max(1, len(f.verts) - 2) for f in check_bm.faces)
    check_bm.free()

    unweighted_verts = sum(1 for v in mesh_obj.data.vertices if len(v.groups) == 0)
    bone_count = len(arm_obj.data.bones)
    track_count = len(arm_obj.animation_data.nla_tracks) if arm_obj.animation_data else 0

    assert ngons == 0, f"{archetype}: found {ngons} ngons"
    assert non_manifold == 0, f"{archetype}: found {non_manifold} non-manifold edges"
    assert unweighted_verts == 0, f"{archetype}: found {unweighted_verts} unweighted verts"
    assert tri_count <= 1800, f"{archetype}: tris {tri_count} > 1800"
    assert bone_count <= 12, f"{archetype}: bones {bone_count} > 12"
    assert track_count == 12, f"{archetype}: expected 12 NLA tracks, got {track_count}"
    assert -0.02 <= z_min <= 0.02, f"{archetype}: unexpected z_min={z_min}"
    return ngons, non_manifold, unweighted_verts, tri_count, z_min, z_max


def build_and_export_pawn(archetype: str) -> dict[str, object]:
    clear_scene()
    meta = ARCHETYPE_META[archetype]
    materials = make_materials(meta["suit_hex"])
    arm_obj, bone_id_map = build_unified_armature(archetype)
    mesh_obj = build_pawn_mesh(archetype, bone_id_map, materials)

    # Parent SkinnedMesh cleanly under Armature
    mesh_obj.parent = arm_obj
    arm_mod = mesh_obj.modifiers.new(name="Armature", type="ARMATURE")
    arm_mod.object = arm_obj
    arm_mod.use_vertex_groups = True

    author_nla_clips(arm_obj)
    ngons, non_manifold, unweighted, tri_count, z_min, z_max = verify_pawn_health(
        archetype, arm_obj, mesh_obj
    )

    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    mesh_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, f"pawn_{archetype}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=False,
        export_def_bones=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=False,
        export_optimize_animation_keep_anim_object=False,
        export_skins=True,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_image_format="NONE",
    )

    bone_count = len(arm_obj.data.bones)
    track_names = [t.name for t in arm_obj.animation_data.nla_tracks]
    file_bytes = os.path.getsize(out_path)
    return {
        "archetype": archetype,
        "out_path": out_path,
        "tris": tri_count,
        "bones": bone_count,
        "tracks": len(track_names),
        "bytes": file_bytes,
        "ngons": ngons,
        "non_manifold": non_manifold,
        "unweighted": unweighted,
        "z_min": z_min,
        "z_max": z_max,
    }


def make_trophy_materials() -> dict[str, bpy.types.Material]:
    """Creates exactly 3 materials for the Vietnamese Victory Trophy Podium."""
    def create_pbr(name: str, base_color, roughness: float, metallic: float = 0.0) -> bpy.types.Material:
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = base_color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        return mat

    mat_podium_gold = create_pbr(
        "mat_podium_gold",
        srgb_rgba_to_linear((0.961, 0.722, 0.0, 1.0)),  # #F5B800
        roughness=0.26,
        metallic=0.80,
    )
    mat_podium_crimson = create_pbr(
        "mat_podium_crimson",
        srgb_rgba_to_linear((0.784, 0.118, 0.227, 1.0)),  # #C81E3A
        roughness=0.38,
        metallic=0.14,
    )

    mat_podium_marble = bpy.data.materials.new(name="mat_podium_marble")
    mat_podium_marble.use_nodes = True
    nt = mat_podium_marble.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = srgb_rgba_to_linear((0.973, 0.980, 0.988, 1.0))  # #F8FAFC
    bsdf.inputs["Roughness"].default_value = 0.44
    bsdf.inputs["Metallic"].default_value = 0.08
    vcol_node = nt.nodes.new(type="ShaderNodeAttribute")
    vcol_node.attribute_name = "Col"
    nt.links.new(vcol_node.outputs["Color"], bsdf.inputs["Base Color"])

    return {
        "gold": mat_podium_gold,
        "crimson": mat_podium_crimson,
        "marble": mat_podium_marble,
    }


def build_trophy_armature() -> tuple[bpy.types.Object, dict[str, int]]:
    """Builds the 3-bone Trophy Podium armature (+Z Up, -Y Front, roll=0)."""
    arm_data = bpy.data.armatures.new("trophy_podium_Armature")
    arm_obj = bpy.data.objects.new("trophy_podium_Rig", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")

    bone_defs = [
        ("podium_root", None, (0.0, 0.0, 0.0), (0.0, 0.0, 0.14)),
        ("trophy_spin", "podium_root", (0.0, 0.38, 0.72), (0.0, 0.38, 0.90)),
        ("lid_pop", "trophy_spin", (0.0, 0.38, 1.44), (0.0, 0.38, 1.60)),
    ]

    ebones = arm_data.edit_bones
    bone_id_map: dict[str, int] = {}
    for idx, (bname, parent_name, head_pt, tail_pt) in enumerate(bone_defs):
        eb = ebones.new(bname)
        eb.head = Vector(head_pt)
        eb.tail = Vector(tail_pt)
        eb.roll = 0.0
        eb.use_deform = True
        if parent_name:
            eb.parent = ebones[parent_name]
        bone_id_map[bname] = idx

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj, bone_id_map


def build_trophy_podium_mesh(
    bone_id_map: dict[str, int],
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Object:
    """Constructs the 2-slot Royal Vietnamese Podium + Golden Chalice SkinnedMesh."""
    M_GOLD = 0
    M_CRIMSON = 1
    M_MARBLE = 2

    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")
    bone_tag_layer = bm.verts.layers.int.new("bone_tag")

    alabaster_rgba = (0.973, 0.980, 0.988, 1.0)     # #F8FAFC
    slate_marble_rgba = (0.20, 0.255, 0.333, 1.0)   # Dark bronze/slate plinth step

    def part(
        bone_name: str,
        mat_idx: int,
        kind: str,
        pos=(0.0, 0.0, 0.0),
        rot=(0.0, 0.0, 0.0),
        scale=(1.0, 1.0, 1.0),
        vcol=alabaster_rgba,
        smooth: bool | None = None,
        **params,
    ):
        use_smooth = smooth if smooth is not None else (
            kind in ("sphere", "ico") or (kind == "cyl" and params.get("segs", 10) >= 8)
        )
        add_bmesh_part(
            bm=bm,
            col_layer=col_layer,
            bone_name=bone_name,
            bone_tag_layer=bone_tag_layer,
            mat_idx=mat_idx,
            bone_id_map=bone_id_map,
            kind=kind,
            pos=pos,
            rot=rot,
            scale=scale,
            vcol_srgb=vcol,
            smooth=use_smooth,
            **params,
        )

    # 1. Step 1 Plinth (2.60 x 1.50, z = 0.00..0.24)
    part("podium_root", M_MARBLE, "box", pos=(0.0, 0.0, 0.07), size=(2.60, 1.50, 0.14), vcol=slate_marble_rgba)
    part("podium_root", M_MARBLE, "box", pos=(0.0, 0.0, 0.19), size=(2.38, 1.36, 0.10), vcol=alabaster_rgba)
    part("podium_root", M_GOLD, "box", pos=(0.0, 0.0, 0.245), size=(2.42, 1.40, 0.03))
    # Front golden emblem medallion at y = -0.75 facing -Y (glTF +Z Front)
    part("podium_root", M_GOLD, "cyl", pos=(0.0, -0.755, 0.125), rot=(math.pi / 2, 0.0, 0.0), r1=0.11, r2=0.11, h=0.04, segs=6, smooth=True)

    # 2. Step 2 Winner Stage (2.16 x 1.24, z = 0.24..0.46)
    part("podium_root", M_MARBLE, "box", pos=(0.0, 0.0, 0.34), size=(2.16, 1.24, 0.20), vcol=alabaster_rgba)
    part("podium_root", M_GOLD, "box", pos=(0.0, 0.0, 0.442), size=(2.20, 1.26, 0.024))
    part("podium_root", M_CRIMSON, "box", pos=(0.0, 0.0, 0.450), size=(2.06, 1.14, 0.022))

    # 3. Back Trophy Pedestal (0.56 x 0.40, z = 0.46..0.72, y = +0.38 -> clear of front winner slots)
    part("podium_root", M_MARBLE, "box", pos=(0.0, 0.38, 0.57), size=(0.56, 0.40, 0.22), vcol=slate_marble_rgba)
    part("podium_root", M_GOLD, "box", pos=(0.0, 0.38, 0.70), size=(0.60, 0.44, 0.04))

    # 4. Golden Chalice & Twin Handles (trophy_spin, centered at (0.0, 0.38, 0.72..1.46))
    part("trophy_spin", M_GOLD, "cyl", pos=(0.0, 0.38, 0.76), r1=0.22, r2=0.15, h=0.08, segs=8, smooth=True)
    part("trophy_spin", M_GOLD, "cyl", pos=(0.0, 0.38, 0.91), r1=0.07, r2=0.10, h=0.22, segs=6, smooth=True)
    part("trophy_spin", M_CRIMSON, "cyl", pos=(0.0, 0.38, 1.03), r1=0.14, r2=0.13, h=0.045, segs=8, smooth=True)
    # Flared 8-segment chalice bowl
    part("trophy_spin", M_GOLD, "cyl", pos=(0.0, 0.38, 1.24), r1=0.13, r2=0.31, h=0.38, segs=8, smooth=True)
    part("trophy_spin", M_GOLD, "cyl", pos=(0.0, 0.38, 1.43), r1=0.33, r2=0.31, h=0.045, segs=8, smooth=True)
    # Twin curved low-poly handles (+/- X)
    for side in (-1, 1):
        part("trophy_spin", M_GOLD, "box", pos=(side * 0.36, 0.38, 1.25), rot=(0.0, side * 0.18, 0.0), size=(0.14, 0.055, 0.26))

    # 5. Crown Lid & Star Finial (lid_pop, z = 1.44..1.72)
    part("lid_pop", M_GOLD, "cyl", pos=(0.0, 0.38, 1.465), r1=0.28, r2=0.22, h=0.05, segs=8, smooth=True)
    part("lid_pop", M_CRIMSON, "cyl", pos=(0.0, 0.38, 1.525), r1=0.21, r2=0.11, h=0.07, segs=8, smooth=True)
    # Two-piece jewel diamond finial (sleek low-poly peak silhouette)
    part("lid_pop", M_GOLD, "cyl", pos=(0.0, 0.38, 1.585), r1=0.025, r2=0.065, h=0.05, segs=4, smooth=True)
    part("lid_pop", M_GOLD, "cyl", pos=(0.0, 0.38, 1.65), r1=0.065, r2=0.006, h=0.08, segs=4, smooth=True)

    mesh_data = bpy.data.meshes.new("trophy_podium_Mesh")
    bm.to_mesh(mesh_data)

    if mesh_data.color_attributes:
        mesh_data.color_attributes.active_color_index = 0
        mesh_data.color_attributes.render_color_index = 0

    vert_bone_ids = [v[bone_tag_layer] for v in bm.verts]
    bm.free()

    mesh_obj = bpy.data.objects.new("trophy_podium_Body", mesh_data)
    bpy.context.collection.objects.link(mesh_obj)

    for slot_key in ("gold", "crimson", "marble"):
        mesh_data.materials.append(materials[slot_key])

    id_to_bone = {idx: name for name, idx in bone_id_map.items()}
    vgroups = {idx: mesh_obj.vertex_groups.new(name=name) for name, idx in bone_id_map.items()}
    grouped: dict[int, list[int]] = {idx: [] for idx in id_to_bone}
    for v_idx, b_id in enumerate(vert_bone_ids):
        grouped[b_id].append(v_idx)
    for b_id, v_indices in grouped.items():
        if v_indices:
            vgroups[b_id].add(v_indices, 1.0, "REPLACE")

    return mesh_obj


def populate_trophy_clip_keyframes(arm_obj: bpy.types.Object, clip_name: str) -> None:
    """Authors `podium_rise` and `trophy_idle` clips @ 30 fps."""
    k = lambda f, b, **kw: add_pose_key(arm_obj, f, b, **kw)

    if clip_name == "podium_rise":  # 0.75s -> frames 1..24
        k(1, "podium_root", loc=(0.0, -0.55, 0.0))
        k(17, "podium_root", loc=(0.0, 0.04, 0.0))
        k(24, "podium_root", loc=(0.0, 0.0, 0.0))

        for f, yaw in [(1, 0.0), (7, 90.0), (13, 180.0), (19, 270.0), (24, 360.0)]:
            k(f, "trophy_spin", rot_deg=(0.0, 0.0, yaw))

        k(1, "lid_pop", loc=(0.0, 0.0, 0.0))
        k(13, "lid_pop", loc=(0.0, 0.18, 0.0))
        k(24, "lid_pop", loc=(0.0, 0.0, 0.0))

    elif clip_name == "trophy_idle":  # 2.4s -> frames 1..73
        for f, yaw in [(1, 0.0), (19, 90.0), (37, 180.0), (55, 270.0), (73, 360.0)]:
            k(f, "trophy_spin", rot_deg=(0.0, 0.0, yaw))

        k(1, "lid_pop", loc=(0.0, 0.0, 0.0))
        k(37, "lid_pop", loc=(0.0, 0.06, 0.0))
        k(73, "lid_pop", loc=(0.0, 0.0, 0.0))


def author_trophy_nla_clips(arm_obj: bpy.types.Object) -> None:
    bpy.context.scene.render.fps = 30
    arm_obj.animation_data_create()

    for clip_name in TROPHY_CLIP_SPECS:
        act = bpy.data.actions.new(name=clip_name)
        arm_obj.animation_data.action = act
        populate_trophy_clip_keyframes(arm_obj, clip_name)

        for fcurve in iter_action_fcurves(act):
            for kp in fcurve.keyframe_points:
                kp.interpolation = "LINEAR"

        track = arm_obj.animation_data.nla_tracks.new()
        track.name = clip_name
        start_frame = int(act.frame_range[0])
        track.strips.new(clip_name, start_frame, act)
        arm_obj.animation_data.action = None

    for pb in arm_obj.pose.bones:
        pb.location = Vector((0.0, 0.0, 0.0))
        pb.rotation_euler = Euler((0.0, 0.0, 0.0), "XYZ")
        pb.scale = Vector((1.0, 1.0, 1.0))


def verify_trophy_podium_health(
    arm_obj: bpy.types.Object, mesh_obj: bpy.types.Object
) -> tuple[int, int, int, int, float, float]:
    check_bm = bmesh.new()
    check_bm.from_mesh(mesh_obj.data)
    check_bm.edges.ensure_lookup_table()
    check_bm.faces.ensure_lookup_table()
    ngons = sum(1 for f in check_bm.faces if len(f.verts) > 4)
    non_manifold = sum(1 for e in check_bm.edges if not e.is_manifold)
    z_coords = [v.co.z for v in check_bm.verts]
    z_min = min(z_coords) if z_coords else 0.0
    z_max = max(z_coords) if z_coords else 0.0
    tri_count = sum(max(1, len(f.verts) - 2) for f in check_bm.faces)
    check_bm.free()

    unweighted_verts = sum(1 for v in mesh_obj.data.vertices if len(v.groups) == 0)
    bone_count = len(arm_obj.data.bones)
    mat_count = len(mesh_obj.data.materials)
    track_count = len(arm_obj.animation_data.nla_tracks) if arm_obj.animation_data else 0

    assert ngons == 0, f"trophy_podium: found {ngons} ngons"
    assert non_manifold == 0, f"trophy_podium: found {non_manifold} non-manifold edges"
    assert unweighted_verts == 0, f"trophy_podium: found {unweighted_verts} unweighted verts"
    assert tri_count <= 1200, f"trophy_podium: tris {tri_count} > 1200"
    assert bone_count == 3, f"trophy_podium: bones {bone_count} != 3"
    assert mat_count <= 3, f"trophy_podium: materials {mat_count} > 3"
    assert track_count == 2, f"trophy_podium: expected 2 NLA tracks, got {track_count}"
    assert -0.02 <= z_min <= 0.02, f"trophy_podium: unexpected z_min={z_min}"
    return ngons, non_manifold, unweighted_verts, tri_count, z_min, z_max


def build_and_export_trophy_podium() -> dict[str, object]:
    clear_scene()
    materials = make_trophy_materials()
    arm_obj, bone_id_map = build_trophy_armature()
    mesh_obj = build_trophy_podium_mesh(bone_id_map, materials)

    mesh_obj.parent = arm_obj
    arm_mod = mesh_obj.modifiers.new(name="Armature", type="ARMATURE")
    arm_mod.object = arm_obj
    arm_mod.use_vertex_groups = True

    author_trophy_nla_clips(arm_obj)
    ngons, non_manifold, unweighted, tri_count, z_min, z_max = verify_trophy_podium_health(
        arm_obj, mesh_obj
    )

    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    mesh_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_path = os.path.join(OUTPUT_DIR, "trophy_podium.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=False,
        export_def_bones=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=False,
        export_optimize_animation_keep_anim_object=False,
        export_skins=True,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_image_format="NONE",
    )

    bone_count = len(arm_obj.data.bones)
    track_names = [t.name for t in arm_obj.animation_data.nla_tracks]
    file_bytes = os.path.getsize(out_path)
    assert file_bytes <= 30_720, f"trophy_podium.glb size {file_bytes} > 30720 bytes"
    return {
        "archetype": "trophy_podium",
        "out_path": out_path,
        "tris": tri_count,
        "bones": bone_count,
        "tracks": len(track_names),
        "bytes": file_bytes,
        "ngons": ngons,
        "non_manifold": non_manifold,
        "unweighted": unweighted,
        "z_min": z_min,
        "z_max": z_max,
    }


def build_all_pawns() -> list[dict[str, object]]:
    results = []
    for archetype in ("car", "yacht", "jet", "crown"):
        results.append(build_and_export_pawn(archetype))
    results.append(build_and_export_trophy_podium())
    return results


if __name__ == "__main__":
    summary = build_all_pawns()
    for row in summary:
        print(
            f"[GLB] {row['archetype']}: {row['tris']} tris, "
            f"{row['bones']} bones, {row['tracks']} clips, "
            f"ngons={row['ngons']}, non_manifold={row['non_manifold']}, unweighted={row['unweighted']}, "
            f"z=[{row['z_min']:.3f}, {row['z_max']:.3f}], "
            f"{row['bytes']} bytes -> {row['out_path']}"
        )
