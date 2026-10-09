local World = {} World.__index = World
local VoxelData=require(script and script.Parent.VoxelData or "./VoxelData")
function World.new() return setmetatable({parts={},epoch=nil},World) end
function World:clear() self.parts={} self.epoch=nil end
function World:apply(world)
	assert((world.voxelFormat=="state-u32-xzy-v1" or world.voxelFormat=="state-adaptive-xzy-v2") and world.minecraftVersion=="1.21.4","Unsupported voxel schema or Minecraft version")
	local decoded={} for _,p in ipairs(world.partitions) do decoded[p.key]=VoxelData.decode(p,world.voxelFormat) end
	if self.epoch~=world.epoch then self:clear() self.epoch=world.epoch end
	local active={} for _,key in ipairs(world.active) do active[key]=true end
	for key in pairs(self.parts) do if not active[key] then self.parts[key]=nil end end
	for _,p in ipairs(world.partitions) do
		local previous=self.parts[p.key]
		if not previous or p.revision>previous.revision then
			local palette={} for _,m in ipairs(p.palette) do palette[m.state]=m end
			self.parts[p.key]={revision=p.revision,voxels=decoded[p.key],palette=palette}
		end
	end
end
function World:get(x,y,z)
	local ix,iy,iz=math.floor(x/8),math.floor(y/8),math.floor(z/8)
	local p=self.parts[ix..","..iy..","..iz]
	if not p or not p.voxels then return nil end
	return p.palette[VoxelData.get(p.voxels,(x-ix*8)+8*((z-iz*8)+8*(y-iy*8)))]
end
function World:boxes(low,high)
	local boxes={}
	for y=math.floor(low.y),math.floor(high.y) do for z=math.floor(low.z),math.floor(high.z) do for x=math.floor(low.x),math.floor(high.x) do
		local block=self:get(x,y,z)
		local shapes=block and block.shapes or {{0,0,0,1,1,1}} -- Unknown space is solid for display prediction.
		for _,s in ipairs(shapes) do table.insert(boxes,{x+s[1],y+s[2],z+s[3],x+s[4],y+s[5],z+s[6]}) end
	end end end
	return boxes
end
local function depth(block)
	if not block then return nil end
	local water=block.name=="water" or block.name=="bubble_column" or block.name=="kelp" or block.name=="kelp_plant" or string.find(block.name,"seagrass") or block.properties and (block.properties.waterlogged==true or block.properties.waterlogged=="true")
	if not water and block.name~="lava" then return nil end
	local level=tonumber(block.properties and block.properties.level) or 0
	return level>=8 and 0 or level,block.name=="lava" and "lava" or "water",level>=8
end
function World:fluid(p)
	local current={x=0,y=0,z=0} local liquid=nil
	-- Contracted body bounds match the mature Java client physics. Currents
	-- only predict presentation; Minecraft computes the actual player motion.
	for y=math.floor(p.y+.401),math.floor(p.y+1.399) do for z=math.floor(p.z-.299),math.floor(p.z+.299) do for x=math.floor(p.x-.299),math.floor(p.x+.299) do
		local block=self:get(x,y,z) local level,kind,falling=depth(block)
		if level and p.y+1.399>=y+1-(level+1)/9 then
			liquid=kind
			if kind=="water" then
				local fx,fz=0,0
				for _,d in ipairs({{1,0},{-1,0},{0,1},{0,-1}}) do
					local adjacent=self:get(x+d[1],y,z+d[2]) local other=depth(adjacent)
					if other then fx+=d[1]*(other-level) fz+=d[2]*(other-level)
					elseif adjacent and #(adjacent.shapes or {})==0 then
						local lower=depth(self:get(x+d[1],y-1,z+d[2]))
						if lower then fx+=d[1]*(lower-level+8) fz+=d[2]*(lower-level+8) end
					end
				end
				local length=math.sqrt(fx*fx+fz*fz) if length>0 then current.x+=fx/length current.z+=fz/length end
				if falling then
					for _,d in ipairs({{1,0},{-1,0},{0,1},{0,-1}}) do
						local adjacent=self:get(x+d[1],y,z+d[2]) local above=self:get(x+d[1],y+1,z+d[2])
						if adjacent and #(adjacent.shapes or {})>0 or above and #(above.shapes or {})>0 then current.y-=6 break end
					end
				end
				if block.name=="bubble_column" then current.y+=(block.properties.drag==true or block.properties.drag=="true") and -3 or 3 end
			end
		end
	end end end
	local length=math.sqrt(current.x^2+current.y^2+current.z^2)
	if length>0 then current.x=current.x/length*.014 current.y=current.y/length*.014 current.z=current.z/length*.014 end
	return liquid,current
end
function World:ray(origin,direction,reach)
	local names={"x","y","z"} local cell,step,delta,nextAt={},{},{},{}
	for i,name in ipairs(names) do
		cell[i]=math.floor(origin[name]) step[i]=math.sign(direction[name])
		delta[i]=direction[name]==0 and math.huge or math.abs(1/direction[name])
		nextAt[i]=direction[name]==0 and math.huge or ((cell[i]+(step[i]>0 and 1 or 0))-origin[name])/direction[name]
	end
	local distance,face=0,{0,1,0}
	for _=1,math.ceil(reach*3)+4 do
		if distance>reach then break end
		local b=self:get(cell[1],cell[2],cell[3])
		if b and b.name~="air" and b.name~="cave_air" and b.name~="void_air" and b.name~="water" and b.name~="lava" then
			local shapes=b.shapes
			if not shapes or #shapes==0 then
				local lo,hi={1,1,1},{0,0,0} local found=false
				for _,f in ipairs(b.modelFaces or {}) do for _,p in ipairs(f.points) do for i=1,3 do lo[i]=math.min(lo[i],p[i]) hi[i]=math.max(hi[i],p[i]) end found=true end end
				shapes=found and {{lo[1],lo[2],lo[3],hi[1],hi[2],hi[3]}} or {{0,0,0,1,1,1}}
			end
			local best,bestFace,bestShape
			for _,shape in ipairs(shapes) do
				local enter,leave=0,reach local hitFace=face local valid=true
				for i,name in ipairs(names) do
					local low,high=cell[i]+shape[i],cell[i]+shape[i+3] local d=direction[name]
					if d==0 then if origin[name]<low or origin[name]>high then valid=false break end
					else
						local a,c=(low-origin[name])/d,(high-origin[name])/d local sign=-math.sign(d)
						if a>c then a,c=c,a end
						if a>enter then enter=a hitFace={0,0,0} hitFace[i]=sign end
						leave=math.min(leave,c) if enter>leave then valid=false break end
					end
				end
				if valid and (not best or enter<best) then best=enter bestFace=hitFace bestShape=shape end
			end
			if best then
				local hit={} for i,name in ipairs(names) do hit[i]=math.clamp(origin[name]+direction[name]*best-cell[i],0,1) end
				return {target=table.clone(cell),face=bestFace,hit=hit,shape=bestShape,block=b,distance=best}
			end
		end
		local axis=nextAt[1]<=nextAt[2] and 1 or 2 if nextAt[3]<nextAt[axis] then axis=3 end
		distance=nextAt[axis] nextAt[axis]+=delta[axis] cell[axis]+=step[axis] face={0,0,0} face[axis]=-step[axis]
	end
end
return World
