-- Bounded visual prediction only. Canonical voxels and collisions remain server data.
local ItemVisual=require(script.Parent.ItemVisual)
local Placement={} Placement.__index=Placement
function Placement.new() return setmetatable({pending={},count=0},Placement) end
function Placement:clear() for _,p in pairs(self.pending) do p.model:Destroy() end self.pending={} self.count=0 end
function Placement:remove(seq) local p=self.pending[seq] if p then p.model:Destroy() self.pending[seq]=nil self.count-=1 end end
function Placement:available(target,face)
	if self.count>=8 then return false end
	local at={target[1]+face[1],target[2]+face[2],target[3]+face[3]}
	for _,pending in pairs(self.pending) do if pending.at[1]==at[1] and pending.at[2]==at[2] and pending.at[3]==at[3] then return false end end return true
end
function Placement:preview(seq,target,face,name,world,position)
	if not seq or self.count>=8 then return end
	local at={target[1]+face[1],target[2]+face[2],target[3]+face[3]}
	local previous=world:get(table.unpack(at))
	if not previous or not ({air=true,cave_air=true,void_air=true,water=true,lava=true})[previous.name] then return end
	if position and position.x+.3>at[1] and position.x-.3<at[1]+1 and position.y+1.8>at[2] and position.y<at[2]+1 and position.z+.3>at[3] and position.z-.3<at[3]+1 then return end
	local model=ItemVisual.world(name) if not model then return end
	model:ScaleTo(4) model:PivotTo(CFrame.new((Vector3.new(table.unpack(at))+Vector3.new(.5,.5,.5))*4)) model.Name="PendingMinecraftPlacement" model.Parent=workspace
	self.pending[seq]={model=model,name=name,at=at,deadline=os.clock()+2} self.count+=1
end
function Placement:tick(world,renderer,state)
	for _,result in ipairs(state.actions or {}) do if result.status=="rejected" then self:remove(result.seq) end end
	for seq,p in pairs(self.pending) do
		local block=world:get(table.unpack(p.at)) local key=math.floor(p.at[1]/8)..","..math.floor(p.at[2]/8)..","..math.floor(p.at[3]/8) local mesh=renderer.parts[key] local data=world.parts[key]
		if os.clock()>p.deadline or block and block.name==p.name and mesh and data and mesh.revision>=data.revision and not mesh.degraded then self:remove(seq) end
	end
end
return Placement
