local AssetService=game:GetService("AssetService")
local Images=require(script.Parent.Images)
local MeshBuilder=require(script.Parent.MeshBuilder)
local ItemVisual={cache={},pending={},resources={},uses={},lastUsed={},retryAt={},generation=0,cacheSize=0,maxTemplates=32,busy=false}
local function makeRoom()
	if ItemVisual.cacheSize<ItemVisual.maxTemplates then return true end
	local oldest,at=nil,math.huge
	for name,model in pairs(ItemVisual.cache) do if model and (ItemVisual.uses[name] or 0)==0 and (ItemVisual.lastUsed[name] or 0)<at then oldest=name at=ItemVisual.lastUsed[name] or 0 end end
	if not oldest then return false end
	ItemVisual.cache[oldest]:Destroy() for _,mesh in ipairs(ItemVisual.resources[oldest] or {}) do mesh:Destroy() end
	ItemVisual.resources[oldest]=nil ItemVisual.cache[oldest]=nil ItemVisual.lastUsed[oldest]=nil ItemVisual.cacheSize-=1 return true
end
local function definition(name)
	local compiled=Images.assets.itemModels and Images.assets.itemModels[name]
	if compiled then return compiled end
	if Images.assets.itemModels then return nil end
	local block=Images.assets.blocks[name] local result={kind="mesh",faces={}}
	if not block then local texture=Images.assets.items and Images.assets.items[name] if not texture then return nil end return {kind="sprite",texture=texture} end
	for axis=0,2 do for _,sign in ipairs({-1,1}) do
		local a=axis+1 local u,v=a%3+1,(a+1)%3+1 local points={}
		for _,corner in ipairs({{0,0},{1,0},{1,1},{0,1}}) do local p={0,0,0} p[a]=sign>0 and 1 or 0 p[u]=corner[1] p[v]=corner[2] table.insert(points,p) end
		if sign<0 then points[2],points[4]=points[4],points[2] end
		table.insert(result.faces,{points=points,uv={{0,1},{1,1},{1,0},{0,0}},texture=Images.faceKey(name,axis,sign,{})})
	end end return result
end
function ItemVisual.definition(name) return name and definition(name) end
local function prepare(name,generation)
	if ItemVisual.pending[name] or ItemVisual.busy then return end ItemVisual.pending[name]=true ItemVisual.busy=true
	local data=definition(name) if not data then ItemVisual.cache[name]=false ItemVisual.pending[name]=nil ItemVisual.busy=false return end
	if not makeRoom() then ItemVisual.pending[name]=nil ItemVisual.busy=false ItemVisual.retryAt[name]=os.clock()+.5 return end
	local model=Instance.new("Model") model.Name=name local resources={}
	local ok,err=pcall(function()
		local faces=data.worldFaces or data.faces or {{points={{0,0,.5},{1,0,.5},{1,1,.5},{0,1,.5}},uv={{0,1},{1,1},{1,0},{0,0}},texture=data.texture}}
		local batches={}
		for _,face in ipairs(faces) do local image=Images.get(face.texture,8) assert(image,"Item image unavailable") local b=batches[face.texture] if not b then b={image=image,faces={}} batches[face.texture]=b end table.insert(b.faces,face) end
		for key,b in pairs(batches) do
			local lo,hi=Vector3.new(math.huge,math.huge,math.huge),Vector3.new(-math.huge,-math.huge,-math.huge)
			for _,face in ipairs(b.faces) do for _,p in ipairs(face.points) do local v=Vector3.new(table.unpack(p))-Vector3.one*.5 lo=lo:Min(v) hi=hi:Max(v) end end
			local center=(lo+hi)/2 local mesh=MeshBuilder.acquire() assert(mesh,"Item mesh allocation denied")
			for _,face in ipairs(b.faces) do
				local ids,uvs={},{} local tint=face.tint or {255,255,255} local color=mesh:AddColor(Color3.fromRGB(table.unpack(tint)),1)
				for i,p in ipairs(face.points) do ids[i]=mesh:AddVertex(Vector3.new(table.unpack(p))-Vector3.one*.5-center) uvs[i]=mesh:AddUV(Vector2.new(table.unpack(face.uv[i]))) end
				for _,t in ipairs({{1,2,3},{1,3,4}}) do local f=mesh:AddTriangle(ids[t[1]],ids[t[2]],ids[t[3]]) mesh:SetFaceUVs(f,{uvs[t[1]],uvs[t[2]],uvs[t[3]]}) mesh:SetFaceColors(f,{color,color,color}) end
			end
			local fixed=AssetService:CreateEditableMeshAsync(Content.fromObject(mesh),{FixedSize=true}) MeshBuilder.release() assert(fixed,"Item fixed mesh allocation denied") table.insert(resources,fixed)
			local p=AssetService:CreateMeshPartAsync(Content.fromObject(fixed)) p.Name="ItemGeometry" p.Anchored=true p.CanCollide=false p.CanTouch=false p.CastShadow=false p.DoubleSided=true p.Material=Enum.Material.SmoothPlastic p.CFrame=CFrame.new(center)
			local appearance=AssetService:CreateSurfaceAppearanceAsync({ColorMap=Content.fromObject(b.image)}) appearance.ResampleMode=Enum.ResamplerMode.Pixelated appearance.AlphaMode=Enum.AlphaMode.Transparency appearance.Parent=p
			p.Parent=model
		end
	end)
	MeshBuilder.release()
	if generation==ItemVisual.generation then ItemVisual.pending[name]=nil ItemVisual.busy=false end
	if not ok or generation~=ItemVisual.generation then model:Destroy() for _,mesh in ipairs(resources) do mesh:Destroy() end if not ok and generation==ItemVisual.generation then ItemVisual.retryAt[name]=os.clock()+5 warn("Item visual retry "..name..": "..tostring(err)) end return end
	if not makeRoom() then model:Destroy() for _,mesh in ipairs(resources) do mesh:Destroy() end ItemVisual.retryAt[name]=os.clock()+.5 return end
	ItemVisual.resources[name]=resources ItemVisual.lastUsed[name]=os.clock() ItemVisual.cacheSize+=1
	model.WorldPivot=CFrame.new() ItemVisual.cache[name]=model
end
function ItemVisual.world(name)
	local model=ItemVisual.cache[name]
	if model==nil and not ItemVisual.busy and not ItemVisual.pending[name] and os.clock()>=(ItemVisual.retryAt[name] or 0) then task.spawn(prepare,name,ItemVisual.generation) end
	if not model then return nil end local copy=model:Clone() copy:SetAttribute("MinecraftItem",name)
	ItemVisual.lastUsed[name]=os.clock() ItemVisual.uses[name]=(ItemVisual.uses[name] or 0)+1 local generation=ItemVisual.generation
	copy.Destroying:Connect(function() if generation==ItemVisual.generation then ItemVisual.uses[name]=math.max(0,(ItemVisual.uses[name] or 0)-1) end end) return copy
end
function ItemVisual.reset()
	ItemVisual.generation+=1 for _,model in pairs(ItemVisual.cache) do if model then model:Destroy() end end for _,owned in pairs(ItemVisual.resources) do for _,mesh in ipairs(owned) do mesh:Destroy() end end ItemVisual.cache={} ItemVisual.pending={} ItemVisual.resources={} ItemVisual.uses={} ItemVisual.lastUsed={} ItemVisual.retryAt={} ItemVisual.cacheSize=0 ItemVisual.busy=false
end
function ItemVisual.icon(parent,size,position)
	local viewport=Instance.new("ViewportFrame") viewport.Name="MinecraftBlockIcon" viewport.Size=size viewport.Position=position viewport.BackgroundTransparency=1 viewport.Ambient=Color3.fromRGB(180,180,180) viewport.LightColor=Color3.new(1,1,1) viewport.LightDirection=Vector3.new(-1,-2,-1) viewport.Parent=parent
	local camera=Instance.new("Camera") camera.FieldOfView=28 camera.CFrame=CFrame.new(0,0,2.3) camera.Parent=viewport viewport.CurrentCamera=camera return {viewport=viewport,name=nil,model=nil,generation=ItemVisual.generation}
end
function ItemVisual.update(icon,name)
	local data=name and definition(name) local mesh=data and data.kind=="mesh" and not data.guiTexture
	if not mesh then icon.viewport.Visible=false if icon.model then icon.model:Destroy() icon.model=nil end icon.name=nil return false end
	if name~=icon.name or icon.generation~=ItemVisual.generation then
		if icon.model then icon.model:Destroy() icon.model=nil end icon.name=nil
		local model=ItemVisual.world(name) if not model then icon.viewport.Visible=false return false end
		local display=data.display and data.display.gui or {rotation={30,225,0},scale={.625,.625,.625}}
		local r=display.rotation or {0,0,0} local t=display.translation or {0,0,0} local s=display.scale or {1,1,1}
		model:ScaleTo(s[1]) model:PivotTo(CFrame.new(Vector3.new(table.unpack(t))/16)*CFrame.Angles(math.rad(r[1]),math.rad(r[2]),math.rad(r[3])))
		icon.model=model icon.name=name icon.generation=ItemVisual.generation model.Parent=icon.viewport
	end icon.viewport.Visible=true return true
end
return ItemVisual
