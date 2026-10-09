-- Local display prediction only. Minecraft/Mineflayer retain actual gameplay.
-- Ordinary walking constants follow Prismarine physics; special blocks/effects
-- use server reconciliation until their prediction is implemented.
local Prediction = {} Prediction.__index=Prediction
local axes={"x","y","z"}
local function copy(v) return {x=v.x,y=v.y,z=v.z} end
local function box(p) return {p.x-.3,p.y,p.z-.3,p.x+.3,p.y+1.8,p.z+.3} end
local function clip(a,b,axis,d)
	for k=1,3 do if k~=axis and (a[k+3]<=b[k] or a[k]>=b[k+3]) then return d end end
	if d>0 and a[axis+3]<=b[axis] then return math.min(d,b[axis]-a[axis+3]) end
	if d<0 and a[axis]>=b[axis+3] then return math.max(d,b[axis+3]-a[axis]) end
	return d
end
local function move(p,delta,boxes)
	local bounds=box(p) local moved={}
	for _,axis in ipairs({2,1,3}) do
		local d=delta[axis] for _,b in ipairs(boxes) do d=clip(bounds,b,axis,d) end
		bounds[axis]+=d bounds[axis+3]+=d moved[axis]=d
	end
	return {x=(bounds[1]+bounds[4])/2,y=bounds[2],z=(bounds[3]+bounds[6])/2},moved
end
function Prediction.step(state,frame,world)
	local p,v=copy(state.position),copy(state.velocity)
	local function held(i) return bit32.band(frame.controls,2^i)~=0 end
	local forward=(held(0) and 1 or 0)-(held(1) and 1 or 0)
	local strafe=(held(3) and 1 or 0)-(held(2) and 1 or 0)
	local sprint=held(5) and forward>0 and not held(6) local ground=state.onGround
	local jumpTicks=math.max(0,(state.jumpTicks or 0)-1)
	local feet=world:get(math.floor(p.x),math.floor(p.y+.4),math.floor(p.z))
	local liquid,current
	if world.fluid then liquid,current=world:fluid(p) else liquid=feet and (feet.name=="water" or feet.name=="lava") and feet.name end
	if current then v.x+=current.x v.y+=current.y v.z+=current.z end
	local length=math.max(1,math.sqrt(forward*forward+strafe*strafe))
	forward=forward/length*.98 strafe=strafe/length*.98
	if held(6) then forward*=.3 strafe*=.3 end
	local below=world:get(math.floor(p.x),math.floor(p.y-.01),math.floor(p.z))
	local slipperiness=below and string.find(below.name,"ice") and .98 or .6
	local friction=ground and slipperiness*.91 or .91
	local acceleration=ground and .1*(sprint and 1.3 or 1)*(.1627714/friction^3) or (sprint and .026 or .02)
	if liquid then acceleration=.02 if held(4) then v.y+=.04 end
	elseif held(4) and ground and jumpTicks==0 then v.y=.41999998688697815 jumpTicks=10 if sprint then v.x-=math.sin(frame.yaw)*.2 v.z-=math.cos(frame.yaw)*.2 end end
	if not held(4) then jumpTicks=0 end
	v.x+=(-math.sin(frame.yaw)*forward+math.cos(frame.yaw)*strafe)*acceleration
	v.z+=(-math.cos(frame.yaw)*forward-math.sin(frame.yaw)*strafe)*acceleration
	for _,axis in ipairs(axes) do if math.abs(v[axis])<.003 then v[axis]=0 end end
	local boxes=world:boxes({x=p.x-.3+math.min(0,v.x),y=p.y+math.min(0,v.y),z=p.z-.3+math.min(0,v.z)}, {x=p.x+.3+math.max(0,v.x),y=p.y+1.8+math.max(.6,v.y),z=p.z+.3+math.max(0,v.z)})
	if held(6) and ground then
		for _,axis in ipairs({"x","z"}) do
			while math.abs(v[axis])>.001 do local q=copy(p) q[axis]+=v[axis] local _,m=move(q,{0,-.6,0},boxes) if m[2]>-.6 then break end v[axis]=math.abs(v[axis])<=.05 and 0 or v[axis]-math.sign(v[axis])*.05 end
		end
	end
	local at,moved=move(p,{v.x,v.y,v.z},boxes)
	if ground and (moved[1]~=v.x or moved[3]~=v.z) then
		local elevated,rise=move(p,{0,.6,0},boxes)
		local step,stepMove=move(elevated,{v.x,0,v.z},boxes)
		local landed,fall=move(step,{0,-rise[2],0},boxes)
		if stepMove[1]^2+stepMove[3]^2>moved[1]^2+moved[3]^2 then at=landed moved={stepMove[1],rise[2]+fall[2],stepMove[3]} end
	end
	local onGround=v.y<0 and moved[2]~=v.y
	local blocked=moved[1]~=v.x or moved[3]~=v.z
	if moved[1]~=v.x then v.x=0 end if moved[3]~=v.z then v.z=0 end if moved[2]~=v.y then v.y=0 end
	if liquid then
		local inertia=liquid=="water" and .8 or .5 v.x*=inertia v.z*=inertia v.y=v.y*inertia-.02
		if blocked then
			local exit,fall=move(at,{0,.6,0},boxes)
			if held(4) and fall[2]==.6 and world.fluid and not world:fluid(exit) then v.y=.3 end
		end
	else v.x*=friction v.z*=friction v.y=(v.y-.08)*.98 end
	return {position=at,velocity=v,onGround=onGround,jumpTicks=jumpTicks,liquid=liquid}
end
function Prediction.new(world) return setmetatable({world=world,history={},lastStateSeq=0,correction=0,error=0,stale=0},Prediction) end
function Prediction:reset(snapshot)
	self.state={position=copy(snapshot.predicted.position),velocity=copy(snapshot.velocity),onGround=snapshot.predicted.onGround,jumpTicks=snapshot.jumpTicks or 0} self.history={} self.lastStateSeq=0 self.correction=0 self.verticalFlight=false
end
function Prediction:input(frame)
	if not self.state then return end
	self.lastInputAt=frame.clientTimeMs/1000
	local grounded=self.state.onGround
	self.state=Prediction.step(self.state,frame,self.world)
	if grounded and not self.state.onGround and bit32.band(frame.controls,16)~=0 and not self.state.liquid then self.verticalFlight=true end
	table.insert(self.history,{seq=frame.seq,frame=table.clone(frame),state=self.state})
	if #self.history>64 then table.remove(self.history,1) end
end
function Prediction:reconcile(snapshot)
	if snapshot.stateSeq and snapshot.stateSeq<=self.lastStateSeq then self.stale+=1 return false end
	self.lastStateSeq=snapshot.stateSeq or self.lastStateSeq+1
	if not self.state then self:reset(snapshot) return true end
	local base={position=copy(snapshot.predicted.position),velocity=copy(snapshot.velocity),onGround=snapshot.predicted.onGround,jumpTicks=snapshot.jumpTicks or 0}
	if snapshot.correction and snapshot.correction.revision~=self.correction then self.correction=snapshot.correction.revision self.state=base self.history={} self.verticalFlight=false return true end
	local remaining={}
	-- Ack covers bridge-applied input; it is never a server position acknowledgement.
	local lead=math.clamp(math.floor(snapshot.presentationLeadTicks or 0),0,4)
	for _,entry in ipairs(self.history) do if entry.seq>(snapshot.observedClientSeq or 0)-lead then table.insert(remaining,entry) base=Prediction.step(base,entry.frame,self.world) end end
	local dx,dy,dz=base.position.x-self.state.position.x,base.position.y-self.state.position.y,base.position.z-self.state.position.z
	self.error=math.sqrt(dx*dx+dy*dy+dz*dz)
	-- A regular held-intent response can be several physics ticks behind a short
	-- jump. Preserve its local vertical presentation instead of rewinding at 5 Hz.
	-- Forced moves, large divergence and liquids still correct immediately.
	if self.verticalFlight and self.error<2 and not snapshot.inWater and not snapshot.inLava then
		base.position.y=self.state.position.y base.velocity.y=self.state.velocity.y base.onGround=self.state.onGround base.jumpTicks=self.state.jumpTicks
		if self.state.onGround and snapshot.predicted.onGround then self.verticalFlight=false end
	elseif self.error>=2 then self.verticalFlight=false end
	self.state=base self.history=remaining
	return self.error>2
end
return Prediction
