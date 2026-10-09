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
function Atlas:get(key,color)
	if not key then return nil end
	if not Images.assets.images[key] then return nil end
	local source=Images.get(key) if not source then return nil end
	-- SurfaceAppearance ignores mesh vertex tint. Bake the bounded face-color
	-- variants into cutout cells so they need no opaque TextureContent underlay.
	local r,g,b=255,255,255
	if Images.alpha[key] and color then r=math.round(color.R*255) g=math.round(color.G*255) b=math.round(color.B*255) end
	local cacheKey=key..":"..r..":"..g..":"..b
	if self.cells[cacheKey] then return self.cells[cacheKey] end
	local index=self.count
	local page=math.floor(index/(COLUMNS*COLUMNS))+1 index%=COLUMNS*COLUMNS
	if not self.pages[page] then self.pages[page]=AssetService:CreateEditableImage({Size=Vector2.new(SIZE,SIZE)}) end
	local image=self.pages[page] if not image then return nil end
	local size=source.Size local bytes=source:ReadPixelsBuffer(Vector2.zero,size)
	if r~=255 or g~=255 or b~=255 then
		for y=0,math.min(size.Y,size.X)-1 do for x=0,size.X-1 do
			local offset=(x+y*size.X)*4
			buffer.writeu8(bytes,offset,math.round(buffer.readu8(bytes,offset)*r/255))
			buffer.writeu8(bytes,offset+1,math.round(buffer.readu8(bytes,offset+1)*g/255))
			buffer.writeu8(bytes,offset+2,math.round(buffer.readu8(bytes,offset+2)*b/255))
		end end
	end
	local tile=buffer.create(STRIDE*STRIDE*4)
	for y=0,STRIDE-1 do for x=0,STRIDE-1 do
		local sx=math.floor(math.clamp(x-4,0,TILE-1)*size.X/TILE)
		local sy=math.floor(math.clamp(y-4,0,TILE-1)*math.min(size.Y,size.X)/TILE)
		buffer.copy(tile,(x+y*STRIDE)*4,bytes,(sx+sy*size.X)*4,4)
	end end
	local x,y=(index%COLUMNS)*STRIDE,math.floor(index/COLUMNS)*STRIDE
	image:WritePixelsBuffer(Vector2.new(x,y),Vector2.new(STRIDE,STRIDE),tile)
	local cell={x=x+4,y=y+4,alpha=Images.alpha[key],page=page,image=image}
	self.cells[cacheKey]=cell self.count+=1 return cell
end
function Atlas:uv(cell,uv,minU,minV,model)
	local u,v=uv.X,uv.Y
	if not model then u-=math.floor(minU+.00001) v-=math.floor(minV+.00001) end
	return Vector2.new((cell.x+u*TILE)/SIZE,(cell.y+v*TILE)/SIZE)
end
return Atlas
