-- Presentation models only. Positions, dimensions, AI and damage come from Minecraft.
local AssetService=game:GetService("AssetService")
local Images=require(script.Parent.Images)
local EntityVisual={cache={},meshes={}}
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
		add("Body",cow and {12,10,18} or {10,8,16},cow and {0,14,1} or {0,10,0},{cow and 18 or 28,8})
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
function EntityVisual.create(entity)
	local name=entity.type=="player" and "player" or entity.name
	local key=Images.assets.entities and Images.assets.entities[name] if not key then return nil end
	local template=EntityVisual.cache[name]
	if template==false then return nil end
	if not template then
		local model=Instance.new("Model") model.Name=name
		local ok,err=pcall(function()
			local image=Images.get(key,8) assert(image,"Entity texture allocation denied") local data=Images.assets.images[key]
			for _,part in ipairs(definition(name)) do
				local mesh=AssetService:CreateEditableMesh() assert(mesh,"Entity mesh allocation denied")
				box(mesh,part.size,part.position,part.uv,data.width,data.height)
				local fixed=AssetService:CreateEditableMeshAsync(Content.fromObject(mesh),{FixedSize=true}) mesh:Destroy() assert(fixed,"Entity fixed mesh allocation denied") table.insert(EntityVisual.meshes,fixed)
				local p=AssetService:CreateMeshPartAsync(Content.fromObject(fixed)) p.Name=part.name p.Anchored=true p.CanCollide=false p.TextureContent=Content.fromObject(image) p.Material=Enum.Material.SmoothPlastic p.CFrame=CFrame.new(Vector3.new(table.unpack(part.position))/4) p:SetAttribute("RestPose",p.CFrame) p.Parent=model
			end
		end)
		if not ok then model:Destroy() EntityVisual.cache[name]=false warn("Entity visual:",err) return nil end
		model.WorldPivot=CFrame.new() template=model EntityVisual.cache[name]=template
	end
	local copy=template:Clone() copy.Name=entity.name copy:SetAttribute("MinecraftEntityId",entity.id)
	local _,size=copy:GetBoundingBox() if size.Y>0 then copy:ScaleTo((entity.height or 1.8)*4/size.Y) end
	return copy
end
return EntityVisual
