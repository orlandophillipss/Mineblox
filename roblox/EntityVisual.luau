-- Presentation models only. Positions, dimensions, AI and damage come from Minecraft.
local AssetService=game:GetService("AssetService")
local Images=require(script.Parent.Images)
local Definitions=require(script.Parent.EntityDefinitions)
local Loader=require(script.Parent.EntityLoad).new()
local EntityVisual={cache={},meshes={},generation=0}
local function box(mesh,size,uv,width,height)
	local w,h,d=size[1],size[2],size[3] local u,v=uv[1],uv[2]
	local rectangles={{u,v+d,u+d,v+d+h},{u+d+w,v+d,u+d+w+d,v+d+h},{u+d+w,v,u+d+w+w,v+d},{u+d,v,u+d+w,v+d},{u+d,v+d,u+d+w,v+d+h},{u+d+w+d,v+d,u+d+w+d+w,v+d+h}}
	for axis=0,2 do for _,sign in ipairs({-1,1}) do
		if d==0 and (axis~=2 or sign~= -1) then continue end
		local a=axis+1 local b,c=a%3+1,(a+1)%3+1 local ids,uvs={},{}
		local r=rectangles[axis*2+(sign==-1 and 1 or 2)]
		for i,corner in ipairs({{0,0},{1,0},{1,1},{0,1}}) do
			local p={-w/2,-h/2,-d/2} p[a]=sign*size[a]/2 p[b]=(corner[1]-.5)*size[b] p[c]=(corner[2]-.5)*size[c]
			ids[i]=mesh:AddVertex(Vector3.new(p[1],p[2],p[3])/4)
			uvs[i]=mesh:AddUV(Vector2.new((r[1]+corner[1]*(r[3]-r[1]))/width,(r[4]-corner[2]*(r[4]-r[2]))/height))
		end
		if sign<0 then ids[2],ids[4]=ids[4],ids[2] uvs[2],uvs[4]=uvs[4],uvs[2] end
		for _,t in ipairs({{1,2,3},{1,3,4}}) do local f=mesh:AddTriangle(ids[t[1]],ids[t[2]],ids[t[3]]) mesh:SetFaceUVs(f,{uvs[t[1]],uvs[t[2]],uvs[t[3]]}) end
	end end
end
local function prepare(ticket,key)
	local name=ticket.name
	local model=Instance.new("Model") model.Name=name
	local owned={}
	local ok,err=pcall(function()
		for _,part in ipairs(Definitions.get(name)) do
			assert(ticket.generation==Loader.generation,"Entity template superseded")
			local textureKey=part.texture and Images.assets.entities[part.texture] or key
			local data=Images.assets.images[textureKey] assert(data,"Entity texture missing: "..tostring(textureKey))
			-- 4x nearest expansion retains pixel edges while using one quarter of
			-- the previous 8x image memory. Never exceed EditableImage's 1024 limit.
			local scale=math.max(1,math.min(4,math.floor(1024/math.max(data.width or 64,data.height or 64))))
			local image=Images.get(textureKey,scale) assert(image,"Entity texture allocation denied")
			local width,height=data.width or image.Size.X,data.height or image.Size.Y
			local w,h,d=table.unpack(part.size) local u,v=table.unpack(part.uv)
			assert(u+2*w+2*d<=width and v+d+h<=height,"Entity UV outside skin: "..name.."/"..part.name)
			local mesh=AssetService:CreateEditableMesh() assert(mesh,"Entity mesh allocation denied") table.insert(owned,mesh)
			box(mesh,part.size,part.uv,width,height)
			if part.inflate then for _,id in ipairs(mesh:GetVertices()) do local p=mesh:GetPosition(id) mesh:SetPosition(id,Vector3.new(p.X+math.sign(p.X)*part.inflate/4,p.Y+math.sign(p.Y)*part.inflate/4,p.Z+math.sign(p.Z)*part.inflate/4)) end end
			local fixed=AssetService:CreateEditableMeshAsync(Content.fromObject(mesh),{FixedSize=true}) assert(fixed,"Entity fixed mesh allocation denied") mesh:Destroy() owned[#owned]=fixed
			local p=AssetService:CreateMeshPartAsync(Content.fromObject(fixed)) p.Name=part.name p.Anchored=true p.CanCollide=false p.CanTouch=false p.CastShadow=false p.Color=Color3.new(1,1,1) p.Material=Enum.Material.SmoothPlastic p.DoubleSided=part.card==true p.Parent=model
			if part.card then
				local appearance=AssetService:CreateSurfaceAppearanceAsync({ColorMap=Content.fromObject(image)}) appearance.AlphaMode=Enum.AlphaMode.Transparency appearance.ResampleMode=Enum.ResamplerMode.Pixelated appearance.Parent=p
			else p.TextureContent=Content.fromObject(image) end
			local rotation=part.angles or {part.rotation or 0,0,0}
			p.CFrame=CFrame.new(Vector3.new(table.unpack(part.position))/4)*CFrame.Angles(table.unpack(rotation))
			p:SetAttribute("RestPose",p.CFrame) p:SetAttribute("Animation",part.animation) p:SetAttribute("Phase",part.phase) p.Parent=model
		end
	end)
	local current=Loader:finish(ticket,os.clock(),not ok)
	if not ok or not current then model:Destroy() for _,m in ipairs(owned) do m:Destroy() end if current then warn("Entity visual retry:",name,err) end return end
	for _,m in ipairs(owned) do table.insert(EntityVisual.meshes,m) end
	model.WorldPivot=CFrame.new() EntityVisual.cache[name]=model
end
function EntityVisual.reset()
	Loader:reset() EntityVisual.generation=Loader.generation for _,model in pairs(EntityVisual.cache) do model:Destroy() end for _,mesh in ipairs(EntityVisual.meshes) do mesh:Destroy() end EntityVisual.cache={} EntityVisual.meshes={}
end
function EntityVisual.create(entity)
	local name=entity.type=="player" and "player" or entity.name
	local key=Images.assets.entities and Images.assets.entities[name] if not key or not Definitions.get(name) then return nil end
	local template=EntityVisual.cache[name]
	if not template then local ticket=Loader:start(name,os.clock()) if ticket then task.spawn(prepare,ticket,key) end return nil end
	local copy=template:Clone() copy.Name=entity.name copy:SetAttribute("MinecraftEntityId",entity.id)
	local _,size=copy:GetBoundingBox() if size.Y>0 then copy:ScaleTo((entity.height or 1.8)*4/size.Y) end
	return copy
end
function EntityVisual.animate(entry,sample,dt)
	if not entry.rig then
		entry.rig={} local pivot=entry.model:GetPivot()
		for _,part in ipairs(entry.model:GetChildren()) do if part:IsA("BasePart") then
			table.insert(entry.rig,{part=part,rest=pivot:ToObjectSpace(part.CFrame),height=part.Size.Y,color=part.Color,phase=#entry.rig%2==0 and 1 or -1})
		end end
		entry.gait=0 entry.amplitude=0
	end
	local distance=entry.lastAnimated and math.sqrt((sample.x-entry.lastAnimated.x)^2+(sample.z-entry.lastAnimated.z)^2) or 0
	entry.lastAnimated=sample entry.gait+=math.min(distance,.5)*3.5
	local amplitude=math.clamp(distance/math.max(dt,.001)/5,0,1)
	entry.amplitude+=(amplitude-entry.amplitude)*math.min(1,dt*12)
	local pivot=entry.model:GetPivot()
	for _,limb in ipairs(entry.rig) do
		local name=limb.part.Name local rest=limb.rest local rotation=CFrame.new()
		if name=="Head" then rotation=CFrame.Angles(-(entry.pitch or 0),0,0) end
		if limb.part:GetAttribute("Animation")=="bat" then
			rotation=CFrame.Angles(0,math.sin(os.clock()*18)*.5*(limb.part:GetAttribute("Phase") or 1),0)
		elseif limb.part:GetAttribute("Animation")=="spider" then
			rotation=CFrame.Angles(0,math.sin(entry.gait)*entry.amplitude*.3*(limb.part:GetAttribute("Phase") or 1),0)
		elseif limb.part:GetAttribute("Animation")=="wing" then
			rotation=CFrame.Angles(0,0,math.sin(entry.gait)*entry.amplitude*.3*(limb.part:GetAttribute("Phase") or 1))
		elseif string.find(name,"Leg") or string.find(name,"Arm") then
			local sign=string.sub(name,-1)=="1" and 1 or -1
			if #name>5 then sign=(name=="Leg-1-1" or name=="Leg11") and 1 or -1 end
			local angle=math.sin(entry.gait)*entry.amplitude*.8*sign
			if string.find(name,"Arm") then angle=-angle+math.sin(os.clock()*1.5)*.025 end
			rotation=CFrame.new(0,limb.height/2,0)*CFrame.Angles(angle,0,0)*CFrame.new(0,-limb.height/2,0)
		end
		limb.part.CFrame=pivot*rest*rotation limb.part.Color=os.clock()<(entry.hurtUntil or 0) and Color3.new(1,.45,.45) or limb.color
	end
end
return EntityVisual
