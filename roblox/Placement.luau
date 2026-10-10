-- Bounded local render/collision prediction; Minecraft always decides outcomes.
local ItemVisual=require(script.Parent.ItemVisual)
local Rules=require(script.Parent.PlacementRules)
local Placement={} Placement.__index=Placement
function Placement.new() return setmetatable({pending={},count=0},Placement) end
function Placement:clear() for seq in pairs(self.pending) do self:remove(seq) end end
function Placement:remove(seq) local p=self.pending[seq] if p then if p.model then p.model:Destroy() end p.world:unpredict(p.at,seq) self.pending[seq]=nil self.count-=1 end end
function Placement:available(target,face)
	if self.count>=8 then return false end
	local at={target[1]+face[1],target[2]+face[2],target[3]+face[3]}
	for _,pending in pairs(self.pending) do if pending.at[1]==at[1] and pending.at[2]==at[2] and pending.at[3]==at[3] then return false end end return true
end
function Placement:preview(seq,target,face,name,world,position)
	if not seq or self.count>=8 then return end
	local at={target[1]+face[1],target[2]+face[2],target[3]+face[3]}
	local previous=world:get(table.unpack(at)) local data=ItemVisual.definition(name)
	if not Rules.allowed(at,previous,position) then return end
	local region=world.parts[math.floor(at[1]/8)..","..math.floor(at[2]/8)..","..math.floor(at[3]/8)]
	if not region then return end
	local p={name=name,at=at,world=world,revision=region.revision,deadline=os.clock()+6}
	self.pending[seq]=p self.count+=1
	-- Only a verified full cube receives predicted collision. Rotated/connected
	-- models wait for their actual state rather than inventing placement rules.
	if Rules.cube(data) then world:predict(at,{name=name,shapes={{0,0,0,1,1,1}},predicted=true},seq) end
end
function Placement:tick(world,renderer,state)
	for _,result in ipairs(state.actions or {}) do
		local p=self.pending[result.seq]
		if p and result.status=="rejected" then self:remove(result.seq)
		elseif p and result.status=="sent" then p.confirmed=result.result and result.result.serverBlock if p.confirmed and p.confirmed~=p.name then self:remove(result.seq) end end
	end
	for seq,p in pairs(self.pending) do
		local block=world:canonical(table.unpack(p.at)) local key=math.floor(p.at[1]/8)..","..math.floor(p.at[2]/8)..","..math.floor(p.at[3]/8) local mesh=renderer.parts[key] local data=world.parts[key]
		local changed=data and data.revision>p.revision
		if os.clock()>p.deadline or not block or changed and block.name~=p.name and p.confirmed or block and block.name==p.name and mesh and data and mesh.revision>=data.revision and not mesh.degraded then self:remove(seq)
		elseif not p.model then
			local model=ItemVisual.world(p.name)
			if model then model:ScaleTo(4) model:PivotTo(CFrame.new((Vector3.new(table.unpack(p.at))+Vector3.new(.5,.5,.5))*4)) model.Name="PendingMinecraftPlacement" model.Parent=workspace p.model=model end
		end
	end
end
return Placement
