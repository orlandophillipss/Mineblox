local AssetService = game:GetService("AssetService")
local Images = require(script.Parent.Images)
local Renderer = {}
Renderer.__index = Renderer
local SCALE = 4
local function destroy(entry)
	entry.group:Destroy()
	for _, mesh in ipairs(entry.meshes) do mesh:Destroy() end
end
function Renderer.new()
	local root = Instance.new("Folder") root.Name = "MinecraftTerrain" root.Parent = workspace
	return setmetatable({ root = root, parts = {}, epoch = nil, meshAvailable = true, count = 0 }, Renderer)
end
function Renderer:clear()
	for _, entry in pairs(self.parts) do destroy(entry) end
	self.parts = {} self.count = 0
end
local function vertices(q)
	local axis = q[1] + 1
	local u, v = axis % 3 + 1, (axis + 1) % 3 + 1
	local base = { q[3], q[4], q[5] }
	local out, uv = {}, {}
	for _, offset in ipairs({ {0, 0}, {q[6], 0}, {q[6], q[7]}, {0, q[7]} }) do
		local p = table.clone(base) p[u] += offset[1] p[v] += offset[2]
		table.insert(out, Vector3.new(p[1], p[2], p[3]) * SCALE)
		-- Block-scale UVs repeat at each voxel on a greedy merged face.
		if axis == 1 then table.insert(uv, Vector2.new(q[2] < 0 and p[3] or -p[3], -p[2]))
		elseif axis == 2 then table.insert(uv, Vector2.new(p[1], q[2] > 0 and p[3] or -p[3]))
		else table.insert(uv, Vector2.new(q[2] < 0 and -p[1] or p[1], -p[2])) end
	end
	if q[2] < 0 then out[2], out[4] = out[4], out[2] uv[2], uv[4] = uv[4], uv[2] end
	return out, uv
end
function Renderer:partition(partition)
	local previous = self.parts[partition.key]
	if previous and previous.revision >= partition.revision then return end
	local group = Instance.new("Folder") group.Name = partition.key
	local palette = {}
	for _, p in ipairs(partition.palette) do palette[p.state] = p end
	local batches = {}
	local missing = {}
	for _, q in ipairs(partition.quads) do
		local material = palette[q[8]]
		local image, key = Images.face(material.name, q[1], q[2], material.properties)
		key = image and key or "substitute"
		if not image then missing[material.name] = true end
		if not batches[key] then batches[key] = { image = image, quads = {} } end
		table.insert(batches[key].quads, q)
	end
	local missingNames = {} for name in pairs(missing) do table.insert(missingNames, name) end table.sort(missingNames)
	group:SetAttribute("UntexturedMaterials", table.concat(missingNames, ","))
	local meshes, rendered = {}, false
	if self.meshAvailable then
		local ok, err = pcall(function()
			for _, batch in pairs(batches) do
				local mesh = AssetService:CreateEditableMesh() assert(mesh, "EditableMesh allocation denied")
				table.insert(meshes, mesh)
				local low, high = Vector3.new(math.huge, math.huge, math.huge), Vector3.new(-math.huge, -math.huge, -math.huge)
				for _, q in ipairs(batch.quads) do
					local points, uv = vertices(q)
					local ids, uvIds = {}, {}
					for i, p in ipairs(points) do
						low = Vector3.new(math.min(low.X, p.X), math.min(low.Y, p.Y), math.min(low.Z, p.Z))
						high = Vector3.new(math.max(high.X, p.X), math.max(high.Y, p.Y), math.max(high.Z, p.Z))
						table.insert(ids, mesh:AddVertex(p)) table.insert(uvIds, mesh:AddUV(uv[i]))
					end
					local material = palette[q[8]]
					local color = batch.image and Color3.new(1, 1, 1) or Color3.fromRGB(table.unpack(material.color))
					if batch.image and (string.find(material.name, "leaves") or material.name == "grass_block" and q[1] == 1 and q[2] == 1) then color = Color3.fromRGB(145, 189, 89) end
					local colorId = mesh:AddColor(color, 1)
					for _, triangle in ipairs({ {1, 2, 3}, {1, 3, 4} }) do
						local a, b, c = triangle[1], triangle[2], triangle[3]
						local face = mesh:AddTriangle(ids[a], ids[b], ids[c])
						mesh:SetFaceColors(face, { colorId, colorId, colorId })
						mesh:SetFaceUVs(face, { uvIds[a], uvIds[b], uvIds[c] })
					end
				end
				-- Mesh vertices use object space; place the part at the world center
				-- only after subtracting that center from every vertex.
				local center = (low + high) / 2
				for _, id in ipairs(mesh:GetVertices()) do mesh:SetPosition(id, mesh:GetPosition(id) - center) end
				-- Resizable meshes reserve growth capacity. Freeze each completed
				-- batch so chunk streaming can fit the device's mesh memory budget.
				local fixed = AssetService:CreateEditableMeshAsync(Content.fromObject(mesh), { FixedSize = true })
				assert(fixed, "Fixed mesh allocation denied")
				mesh:Destroy()
				mesh = fixed meshes[#meshes] = fixed
				local part = AssetService:CreateMeshPartAsync(Content.fromObject(mesh))
				part.Anchored = true part.CanCollide = false part.DoubleSided = true
				part.Material = Enum.Material.SmoothPlastic part.Color = Color3.new(1, 1, 1)
				part.CFrame = CFrame.new(center)
				if batch.image then part.TextureContent = Content.fromObject(batch.image) end
				part.Parent = group
			end
		end)
		if ok then rendered = true else
			for _, mesh in ipairs(meshes) do mesh:Destroy() end meshes = {}
			self.meshAvailable = false group:ClearAllChildren() warn("Mineblox mesh fallback:", err)
		end
	end
	if not rendered then
		-- Fallback is a Part per greedy face, never a Part per voxel.
		for _, q in ipairs(partition.quads) do
			local axis = q[1] + 1 local u, v = axis % 3 + 1, (axis + 1) % 3 + 1
			local size, p = { 0.025, 0.025, 0.025 }, { q[3], q[4], q[5] }
			size[u], size[v] = q[6] * SCALE, q[7] * SCALE p[u] += q[6] / 2 p[v] += q[7] / 2
			local part = Instance.new("Part") part.Size = Vector3.new(table.unpack(size)) part.Position = Vector3.new(table.unpack(p)) * SCALE
			part.Anchored = true part.CanCollide = false part.Material = Enum.Material.SmoothPlastic
			part.Color = Color3.fromRGB(table.unpack(palette[q[8]].color)) part.Parent = group
		end
	end
	if previous then destroy(previous) end
	group.Parent = self.root self.parts[partition.key] = { group = group, revision = partition.revision, meshes = meshes }
end
function Renderer:apply(world)
	if self.epoch ~= world.epoch then self:clear() self.epoch = world.epoch end
	local active = {} for _, key in ipairs(world.active) do active[key] = true end
	for key, entry in pairs(self.parts) do if not active[key] then destroy(entry) self.parts[key] = nil end end
	for _, partition in ipairs(world.partitions) do self:partition(partition) end
	self.count = 0 for _ in pairs(self.parts) do self.count += 1 end
end
return Renderer
