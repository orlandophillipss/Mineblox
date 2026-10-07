local AssetService = game:GetService("AssetService")
local Images = {}
Images.cache = {}
local assetModule = script.Parent:FindFirstChild("DevelopmentAssets")
Images.assets = assetModule and require(assetModule) or { images = {}, blocks = {}, gui = {} }
function Images.get(key)
	if not key then return nil end
	if Images.cache[key] then return Images.cache[key] end
	local data = Images.assets.images[key]
	if not data then return nil end
	local ok, image = pcall(function()
		local editable = AssetService:CreateEditableImage({ Size = Vector2.new(data.width, data.height) })
		if not editable then return nil end
		local bytes = buffer.create(data.width * data.height * 4)
		for i = 0, buffer.len(bytes) - 1 do buffer.writeu8(bytes, i, tonumber(string.sub(data.hex, i * 2 + 1, i * 2 + 2), 16)) end
		editable:WritePixelsBuffer(Vector2.zero, editable.Size, bytes)
		return editable
	end)
	if ok then Images.cache[key] = image return image end
	return nil
end
function Images.gui(name)
	return Images.get(Images.assets.gui[name])
end
function Images.face(name, axis, sign, properties)
	local material = Images.assets.blocks[name]
	if not material then return nil, nil end
	local key = material[axis * 2 + (sign == -1 and 1 or 2)]
	if string.find(name, "mushroom") and properties then
		local face = ({ "west", "east", "down", "up", "north", "south" })[axis * 2 + (sign == -1 and 1 or 2)]
		if properties[face] == false or properties[face] == "false" then key = "assets/minecraft/textures/block/mushroom_block_inside.png" end
	end
	return Images.get(key), key
end
return Images
