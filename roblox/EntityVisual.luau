-- Presentation models only. Positions, dimensions, AI and damage come from Minecraft.
local AssetService=game:GetService("AssetService")
local Images=require(script.Parent.Images)
local EntityVisual={cache={},pending={},meshes={},generation=0}
local function box(mesh,size,center,uv,width,height)
	local w,h,d=size[1],size[2],size[3] local u,v=uv[1],uv[2]
	local rectangles={{u,v+d,u+d,v+d+h},{u+d+w,v+d,u+d+w+d,v+d+h},{u+d+w,v,u+d+w+w,v+d},{u+d,v,u+d+w,v+d},{u+d,v+d,u+d+w,v+d+h},{u+d+w+d,v+d,u+d+w+d+w,v+d+h}}
	for axis=0,2 do for _,sign in ipairs({-1,1}) do
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
local function definition(name)
	local parts={}
	local function add(n,s,p,uv) table.insert(parts,{name=n,size=s,position=p,uv=uv}) end
	if name=="pig" or name=="cow" then
		local cow=name=="cow"
		add("Head",cow and {8,8,6} or {8,8,8},cow and {0,20,-10} or {0,12,-9},{0,0})
		-- Quadruped body texture nets are vertical cuboids rotated into a
		-- horizontal pose. Swapping height/depth before UV generation sampled
		-- outside the skin and produced black strips.
		add("Body",cow and {12,18,10} or {10,16,8},cow and {0,14,1} or {0,10,0},{cow and 18 or 28,cow and 4 or 8}) parts[#parts].rotation=math.pi/2
		for _,x in ipairs({-1,1}) do for _,z in ipairs({-1,1}) do add("Leg"..x..z,{4,cow and 12 or 6,4},{x*3,cow and 6 or 3,z*(cow and 7 or 5)},{0,16}) end end
	elseif name=="creeper" then
		add("Head",{8,8,8},{0,28,0},{0,0}) add("Body",{8,12,4},{0,18,0},{16,16})
		for _,x in ipairs({-1,1}) do for _,z in ipairs({-1,1}) do add("Leg"..x..z,{4,6,4},{x*2,3,z*4},{0,16}) end end
	else
		local thin=name=="skeleton" local limb=thin and 2 or 4
		add("Head",{8,8,8},{0,28,0},{0,0}) add("Body",{8,12,4},{0,18,0},{16,16})
		for _,sign in ipairs({-1,1}) do add("Arm"..sign,{limb,12,limb},{sign*6,18,0},{40,16}) add("Leg"..sign,{limb,12,limb},{sign*2,6,0},{0,16}) end
	end return parts
end
local function prepare(name,key,generation)
	if EntityVisual.pending[name] then return end EntityVisual.pending[name]=true
		local model=Instance.new("Model") model.Name=name
		local owned={}
		local ok,err=pcall(function()
			local image=Images.get(key,8) assert(image,"Entity texture allocation denied") local data=Images.assets.images[key]
			local width,height=data.width or image.Size.X,data.height or image.Size.Y
			for _,part in ipairs(definition(name)) do
				local mesh=AssetService:CreateEditableMesh() assert(mesh,"Entity mesh allocation denied") table.insert(owned,mesh)
				box(mesh,part.size,part.position,part.uv,width,height)
				local fixed=AssetService:CreateEditableMeshAsync(Content.fromObject(mesh),{FixedSize=true}) assert(fixed,"Entity fixed mesh allocation denied") mesh:Destroy() owned[#owned]=fixed
				local p=AssetService:CreateMeshPartAsync(Content.fromObject(fixed)) p.Name=part.name p.Anchored=true p.CanCollide=false p.CanTouch=false p.CastShadow=false p.Color=Color3.new(1,1,1) p.TextureContent=Content.fromObject(image) p.Material=Enum.Material.SmoothPlastic p.CFrame=CFrame.new(Vector3.new(table.unpack(part.position))/4)*CFrame.Angles(part.rotation or 0,0,0) p:SetAttribute("RestPose",p.CFrame) p.Parent=model
			end
		end)
		EntityVisual.pending[name]=nil
		if not ok or generation~=EntityVisual.generation then model:Destroy() for _,m in ipairs(owned) do m:Destroy() end if generation==EntityVisual.generation then EntityVisual.cache[name]=false warn("Entity visual:",err) end return end
		for _,m in ipairs(owned) do table.insert(EntityVisual.meshes,m) end
		model.WorldPivot=CFrame.new() EntityVisual.cache[name]=model
end
function EntityVisual.reset()
	EntityVisual.generation+=1 for _,model in pairs(EntityVisual.cache) do if model then model:Destroy() end end for _,mesh in ipairs(EntityVisual.meshes) do mesh:Destroy() end EntityVisual.cache={} EntityVisual.meshes={}
end
function EntityVisual.create(entity)
	local name=entity.type=="player" and "player" or entity.name
	local key=Images.assets.entities and Images.assets.entities[name] if not key then return nil end
	local template=EntityVisual.cache[name]
	if template==nil and not EntityVisual.pending[name] then task.spawn(prepare,name,key,EntityVisual.generation) end
	if not template then return nil end
	local copy=template:Clone() copy.Name=entity.name copy:SetAttribute("MinecraftEntityId",entity.id)
	local _,size=copy:GetBoundingBox() if size.Y>0 then copy:ScaleTo((entity.height or 1.8)*4/size.Y) end
	return copy
end
function EntityVisual.animate(entry,sample,dt)
	if not entry.rig then
		entry.rig={} local pivot=entry.model:GetPivot()
		for _,part in ipairs(entry.model:GetChildren()) do if part:IsA("BasePart") then
			table.insert(entry.rig,{part=part,rest=pivot:ToObjectSpace(part.CFrame),height=part.Size.Y,phase=#entry.rig%2==0 and 1 or -1})
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
		if string.find(name,"Leg") or string.find(name,"Arm") then
			local sign=string.sub(name,-1)=="1" and 1 or -1
			if #name>5 then sign=(name=="Leg-1-1" or name=="Leg11") and 1 or -1 end
			local angle=math.sin(entry.gait)*entry.amplitude*.8*sign
			if string.find(name,"Arm") then angle=-angle+math.sin(os.clock()*1.5)*.025 end
			rotation=CFrame.new(0,limb.height/2,0)*CFrame.Angles(angle,0,0)*CFrame.new(0,-limb.height/2,0)
		end
		limb.part.CFrame=pivot*rest*rotation limb.part.Color=os.clock()<(entry.hurtUntil or 0) and Color3.new(1,.45,.45) or Color3.new(1,1,1)
	end
end
return EntityVisual
