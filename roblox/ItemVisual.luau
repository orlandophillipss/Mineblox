local AssetService=game:GetService("AssetService")
local Images=require(script.Parent.Images)
local ItemVisual={cache={},pending={},meshes={}}
local function template(name)
	if ItemVisual.cache[name]~=nil then return ItemVisual.cache[name] or nil end
	if ItemVisual.pending[name] then return nil end
	ItemVisual.pending[name]=true
	local model=Instance.new("Model") model.Name=name
	local ok,err=pcall(function()
		local block=Images.assets.blocks[name]
		local batches={}
		for axis=0,2 do for _,sign in ipairs({-1,1}) do
			if not block and (axis~=2 or sign~=-1) then continue end
			local image,key
			if block then image,key=Images.face(name,axis,sign,{}) else key=Images.assets.items and Images.assets.items[name] image=Images.get(key,8) end
			if not image then continue end
			if not batches[key] then batches[key]={image=image,faces={},tint=Color3.new(1,1,1)} end
			local b=batches[key]
			if name=="grass_block" and axis==1 and sign==1 or string.find(name,"leaves") then b.tint=Color3.fromRGB(145,189,89) end
			local a=axis+1 local u,v=a%3+1,(a+1)%3+1 local points={}
			for _,corner in ipairs({{0,0},{1,0},{1,1},{0,1}}) do local p={-.5,-.5,-.5} p[a]=block and sign*.5 or 0 p[u]=corner[1]-.5 p[v]=corner[2]-.5 table.insert(points,Vector3.new(table.unpack(p))) end
			if sign<0 then points[2],points[4]=points[4],points[2] end
			table.insert(b.faces,points)
		end end
		for key,b in pairs(batches) do
			local lo,hi=Vector3.new(math.huge,math.huge,math.huge),Vector3.new(-math.huge,-math.huge,-math.huge)
			for _,points in ipairs(b.faces) do for _,p in ipairs(points) do lo=lo:Min(p) hi=hi:Max(p) end end
			local center=(lo+hi)/2
			local mesh=AssetService:CreateEditableMesh() assert(mesh,"Item mesh allocation denied")
			for _,points in ipairs(b.faces) do
				local ids,uvs={},{} for i,p in ipairs(points) do ids[i]=mesh:AddVertex(p-center) uvs[i]=mesh:AddUV(({Vector2.new(0,1),Vector2.new(1,1),Vector2.new(1,0),Vector2.new(0,0)})[i]) end
				for _,t in ipairs({{1,2,3},{1,3,4}}) do local f=mesh:AddTriangle(ids[t[1]],ids[t[2]],ids[t[3]]) mesh:SetFaceUVs(f,{uvs[t[1]],uvs[t[2]],uvs[t[3]]}) end
			end
			local fixed=AssetService:CreateEditableMeshAsync(Content.fromObject(mesh),{FixedSize=true}) mesh:Destroy() assert(fixed,"Item fixed mesh allocation denied")
			table.insert(ItemVisual.meshes,fixed)
			local p=AssetService:CreateMeshPartAsync(Content.fromObject(fixed)) p.Name="ItemGeometry" p.Anchored=true p.CanCollide=false p.DoubleSided=true p.Color=b.tint p.Material=Enum.Material.SmoothPlastic p.TextureContent=Content.fromObject(b.image)
			p.CFrame=CFrame.new(center) if Images.alpha[key] then p.Transparency=.02 end p.Parent=model
		end
	end)
	ItemVisual.pending[name]=nil
	if not ok or #model:GetChildren()==0 then model:Destroy() ItemVisual.cache[name]=false if not ok then warn("Item visual:",err) end return nil end
	model.WorldPivot=CFrame.new() ItemVisual.cache[name]=model return model
end
function ItemVisual.world(name)
	local model=template(name) if not model then return nil end
	local copy=model:Clone() copy:SetAttribute("MinecraftItem",name) return copy
end
function ItemVisual.icon(parent,size,position)
	local viewport=Instance.new("ViewportFrame") viewport.Name="MinecraftBlockIcon" viewport.Size=size viewport.Position=position viewport.BackgroundTransparency=1 viewport.Ambient=Color3.fromRGB(160,160,160) viewport.LightColor=Color3.new(1,1,1) viewport.LightDirection=Vector3.new(-1,-2,-1) viewport.Parent=parent
	local camera=Instance.new("Camera") camera.FieldOfView=28 camera.CFrame=CFrame.lookAt(Vector3.new(2.5,2,2.5),Vector3.zero) camera.Parent=viewport viewport.CurrentCamera=camera
	return {viewport=viewport,name=nil,model=nil}
end
function ItemVisual.update(icon,name)
	local block=name and Images.assets.blocks[name]
	icon.viewport.Visible=block~=nil
	if not block then if icon.model then icon.model:Destroy() icon.model=nil end icon.name=nil return false end
	if name~=icon.name then
		local model=ItemVisual.world(name) if not model then icon.viewport.Visible=false return false end
		if icon.model then icon.model:Destroy() end icon.model=model icon.name=name model.Parent=icon.viewport
	end return true
end
return ItemVisual
