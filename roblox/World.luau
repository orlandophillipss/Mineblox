local World = {} World.__index = World
function World.new() return setmetatable({parts={},epoch=nil},World) end
function World:clear() self.parts={} self.epoch=nil end
function World:apply(world)
	assert(world.voxelFormat=="state-u32-xzy-v1" and world.minecraftVersion=="1.21.4","Unsupported voxel schema or Minecraft version")
	if self.epoch~=world.epoch then self:clear() self.epoch=world.epoch end
	local active={} for _,key in ipairs(world.active) do active[key]=true end
	for key in pairs(self.parts) do if not active[key] then self.parts[key]=nil end end
	for _,p in ipairs(world.partitions) do
		local previous=self.parts[p.key]
		if not previous or p.revision>previous.revision then
			local palette={} for _,m in ipairs(p.palette) do palette[m.state]=m end
			self.parts[p.key]={revision=p.revision,voxels=p.voxels,palette=palette}
		end
	end
end
function World:get(x,y,z)
	local ix,iy,iz=math.floor(x/8),math.floor(y/8),math.floor(z/8)
	local p=self.parts[ix..","..iy..","..iz]
	if not p or not p.voxels then return nil end
	return p.palette[p.voxels[(x-ix*8)+8*((z-iz*8)+8*(y-iy*8))+1]]
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
function World:ray(origin,direction,reach)
	local last={math.floor(origin.x),math.floor(origin.y),math.floor(origin.z)}
	for distance=0,reach,.025 do
		local x,y,z=math.floor(origin.x+direction.x*distance),math.floor(origin.y+direction.y*distance),math.floor(origin.z+direction.z*distance)
		local b=self:get(x,y,z)
		if b and b.name~="air" and b.name~="cave_air" and b.name~="void_air" and b.name~="water" and b.name~="lava" then
			local face={last[1]-x,last[2]-y,last[3]-z}
			if math.abs(face[1])+math.abs(face[2])+math.abs(face[3])~=1 then face={0,1,0} end
			return {target={x,y,z},face=face,block=b,distance=distance}
		end
		last={x,y,z}
	end
end
return World
