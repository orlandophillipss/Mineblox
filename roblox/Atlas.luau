-- One shared texture, with gutters, replaces a mesh/draw call per block texture.
-- Original pixels are loaded only from the user's private/permitted catalog.
local AssetService=game:GetService("AssetService")
local Images=require(script.Parent.Images)
local Atlas={} Atlas.__index=Atlas
local TILE,STRIDE,SIZE,COLUMNS=128,136,1024,7
function Atlas.new()
	-- Reserve cells only for terrain actually rendered, not every GUI/item image.
	return setmetatable({cells={},count=0,pages={}},Atlas)
end
function Atlas:get(key)
	if not key then return nil end
	if self.cells[key] then return self.cells[key] end
	if not Images.assets.images[key] then return nil end
	local index=self.count
	local page=math.floor(index/(COLUMNS*COLUMNS))+1 index%=COLUMNS*COLUMNS
	local source=Images.get(key) if not source then return nil end
	if not self.pages[page] then self.pages[page]=AssetService:CreateEditableImage({Size=Vector2.new(SIZE,SIZE)}) end
	local image=self.pages[page] if not image then return nil end
	local size=source.Size local bytes=source:ReadPixelsBuffer(Vector2.zero,size)
	local tile=buffer.create(STRIDE*STRIDE*4)
	for y=0,STRIDE-1 do for x=0,STRIDE-1 do
		local sx=math.floor(math.clamp(x-4,0,TILE-1)*size.X/TILE)
		local sy=math.floor(math.clamp(y-4,0,TILE-1)*math.min(size.Y,size.X)/TILE)
		buffer.copy(tile,(x+y*STRIDE)*4,bytes,(sx+sy*size.X)*4,4)
	end end
	local x,y=(index%COLUMNS)*STRIDE,math.floor(index/COLUMNS)*STRIDE
	image:WritePixelsBuffer(Vector2.new(x,y),Vector2.new(STRIDE,STRIDE),tile)
	local cell={x=x+4,y=y+4,alpha=Images.alpha[key],page=page,image=image}
	self.cells[key]=cell self.count+=1 return cell
end
function Atlas:uv(cell,uv,minU,minV,model)
	local u,v=uv.X,uv.Y
	if not model then u-=math.floor(minU+.00001) v-=math.floor(minV+.00001) end
	return Vector2.new((cell.x+u*TILE)/SIZE,(cell.y+v*TILE)/SIZE)
end
return Atlas
