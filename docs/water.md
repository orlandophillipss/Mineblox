# Water and lava presentation

Minecraft generates the oceans and owns all source creation, spreading,
waterlogging, currents and block updates. Roblox never fills an ocean or runs a
parallel fluid simulation. The gateway reads the real 1.21.4 block states and
remeshes server changes, including partition neighbors.

The `level` property encodes source level 0, horizontal flow levels 1–7 and
falling states 8–15. Rendered standalone source height is 8/9 of a block; level 7
is 1/9. Falling water uses source-like height, rather than being rendered empty.
A fluid block with the same fluid directly above fills its entire cell.
Internal fluid faces and faces behind solid full cubes are omitted. Neighbor
fluid state is included in the partition halo. Tests cover these height cases.

Ordinary immersed movement uses the pinned
[Prismarine physics implementation](https://github.com/PrismarineJS/prismarine-physics/blob/master/index.js)
as the reference: water inertia 0.8, acceleration 0.02, gravity 0.02 and jump
buoyancy 0.04. The Roblox approximation reconciles with the real protocol client.
It does not yet model currents, depth-strider, swimming poses or waterlogged
shape interaction exactly. The server still applies those rules.

Current fluid surfaces are flat per voxel. Corner-weighted flow slopes,
directional animated UVs, waterlogged overlays, biome water colors, underwater
fog and exact liquid edge prediction remain parity gaps. Filled oceans are real
server world data; this prototype does not yet reproduce their full appearance.
