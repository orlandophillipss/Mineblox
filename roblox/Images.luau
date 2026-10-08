local AssetService = game:GetService("AssetService")
local Images = {}
Images.cache = {}
Images.alpha = {}
Images.guiNames=setmetatable({},{__mode="k"})
local assetModule = script.Parent:FindFirstChild("PublishedAssets") or script.Parent:FindFirstChild("DevelopmentAssets")
Images.assets = assetModule and require(assetModule) or { images = {}, blocks = {}, gui = {} }
function Images.get(key, scale)
	if not key then return nil end
	scale = scale or 1
	local cacheKey = key .. ":" .. scale
	if Images.cache[cacheKey] then return Images.cache[cacheKey] end
	local data = Images.assets.images[key]
	if not data then return nil end
	local ok, image = pcall(function()
		if data.assetId then Images.alpha[key]=data.alpha return AssetService:CreateEditableImageAsync(Content.fromUri(data.assetId)) end
		local editable = AssetService:CreateEditableImage({ Size = Vector2.new(data.width * scale, data.height * scale) })
		if not editable then return nil end
		local bytes = buffer.create(data.width * data.height * 4)
		for i = 0, buffer.len(bytes) - 1 do buffer.writeu8(bytes, i, tonumber(string.sub(data.hex, i * 2 + 1, i * 2 + 2), 16)) end
		for i=3,buffer.len(bytes)-1,4 do if buffer.readu8(bytes,i)<255 then Images.alpha[key]=true break end end
		if scale > 1 then
			local enlarged = buffer.create(data.width * data.height * scale * scale * 4)
			for y = 0, data.height * scale - 1 do
				for x = 0, data.width * scale - 1 do
					buffer.copy(enlarged, (x + y * data.width * scale) * 4, bytes, (math.floor(x / scale) + math.floor(y / scale) * data.width) * 4, 4)
				end
			end
			bytes = enlarged
		end
		editable:WritePixelsBuffer(Vector2.zero, editable.Size, bytes)
		return editable
	end)
	if ok then Images.cache[cacheKey] = image return image end
	return nil
end
function Images.update(catalog)
	if type(catalog)~="table" or catalog.format~=1 or type(catalog.version)~="string" or type(catalog.images)~="table" or type(catalog.blocks)~="table" or type(catalog.gui)~="table" or type(catalog.items)~="table" or type(catalog.entities)~="table" then return false end
	if Images.assets.version==catalog.version then return false end
	Images.assets=catalog
	-- Content changes are infrequent; keep existing images alive until their GUI/mesh
	-- references are retired. Reuse cached image objects only for identical assets.
	Images.cache={} Images.alpha={} return true
end
function Images.gui(name)
	local image=Images.get(Images.assets.gui[name]) if image then Images.guiNames[image]=name end return image
end
function Images.refreshGui(root)
	for _,label in ipairs(root:GetDescendants()) do
		local key=label:GetAttribute("MinebloxSprite")
		if key and label:IsA("ImageLabel") then local image=Images.gui(key) if image then label.ImageContent=Content.fromObject(image) end end
	end
end
function Images.item(name) return Images.get(Images.assets.items and Images.assets.items[name]) end
function Images.block(key) return Images.get(key,8) end
function Images.face(name, axis, sign, properties)
	local material = Images.assets.blocks[name]
	if not material then return nil, nil end
	local key = material[axis * 2 + (sign == -1 and 1 or 2)]
	if string.find(name, "mushroom") and properties then
		local face = ({ "west", "east", "down", "up", "north", "south" })[axis * 2 + (sign == -1 and 1 or 2)]
		if properties[face] == false or properties[face] == "false" then key = "assets/minecraft/textures/block/mushroom_block_inside.png" end
	end
	-- Native-resolution SurfaceAppearance pixelated sampling was still blurred
	-- in this Studio viewport. Enlarged texels are the verified workaround.
	return Images.block(key), key
end
return Images
