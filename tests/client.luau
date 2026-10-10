local Prediction=require("../roblox/Prediction")
local World=require("../roblox/World")
local Interpolation=require("../roblox/Interpolation")
local Visibility=require("../roblox/Visibility")
local EntityLoad=require("../roblox/EntityLoad")
local loading=EntityLoad.new()
local first=loading:start("enderman",0) assert(first and not loading:start("sheep",0),"mob template allocation is serial")
assert(loading:finish(first,0,true),"failed allocation releases the work slot")
assert(not loading:start("enderman",4.99),"packet frequency cannot bypass allocation backoff")
local retry=loading:start("enderman",5) assert(retry,"temporary allocation denial can recover")
loading:finish(retry,5,true) assert(not loading:start("enderman",14.99),"repeated failure backs off")
local old=loading:start("sheep",6) loading:reset() local fresh=loading:start("sheep",6)
assert(not loading:finish(old,7,false) and not loading:start("chicken",7),"stale completion cannot release new-generation work")
assert(loading:finish(fresh,7,false) and loading:start("enderman",7),"reset invalidates old backoff and success releases the slot")
local EntityDefinitions=require("../roblox/EntityDefinitions")
for _,name in ipairs({"pig","cow","creeper","zombie","skeleton","player","enderman","sheep","chicken","spider","cave_spider","husk","stray","wither_skeleton","bat"}) do
	local parts=EntityDefinitions.get(name) assert(parts and #parts>=6,"supported mob must have articulated geometry")
	local seen={}
	for _,part in ipairs(parts) do
		assert(not seen[part.name],"rig part names are unique") seen[part.name]=true
		local w,h,d=table.unpack(part.size) local u,v=table.unpack(part.uv)
		local height=(name=="player" or name=="zombie" or name=="husk") and 64 or 32 local width=name=="bat" and 32 or 64
		assert(w>0 and h>0 and (d>0 or d==0 and part.card) and u>=0 and v>=0 and u+2*w+2*d<=width and v+d+h<=height,"cuboid skin net stays inside the supported texture")
	end
end
assert(EntityDefinitions.get("unknown_mod_mob")==nil,"unsupported species cannot silently receive a humanoid skin")
local playerParts=EntityDefinitions.get("player") local playerNets={}
for _,part in ipairs(playerParts) do playerNets[part.name]=part.uv end
assert(playerNets.Arm1[2]==48 and playerNets.Leg1[2]==48 and playerNets["Arm-1"][2]==16 and playerNets["Leg-1"][2]==16,"modern player skin preserves separate left and right limb texture nets")
local creeperParts=EntityDefinitions.get("creeper")
local head,body=creeperParts[1],creeperParts[2] local leg=creeperParts[3]
assert(head.position[2]-head.size[2]/2==body.position[2]+body.size[2]/2 and body.position[2]-body.size[2]/2==leg.position[2]+leg.size[2]/2,"Creeper head, body and legs connect without a floating gap")
local Fit=require("../roblox/ViewportFit")
for _,aspect in ipairs({153/210,.25,2}) do
	local distance=Fit.distance(3.6,7.2,2,aspect,28,.86)
	local visibleHeight=2*(distance-1)*math.tan(math.rad(28)/2)
	assert(visibleHeight>=7.2/.86 and visibleHeight*aspect>=3.6/.86,"player preview fits vertically and horizontally with margin")
end
print("Entity geometry, texture bounds, bounded retries and generation ownership passed")
local world={get=function(_,_,y,_)return {name=y<0 and "stone" or "air"}end,boxes=function()return {{-100,-1,-100,100,0,100}}end}
local function state()return {position={x=0,y=0,z=0},velocity={x=0,y=-.0784,z=0},onGround=true}end
local frame={controls=1,yaw=0,seq=1,clientTimeMs=0}
local walk=state() for _=1,20 do walk=Prediction.step(walk,frame,world) end
assert(walk.position.z < -4 and walk.position.z > -4.5,"walk speed follows ordinary Minecraft friction")
assert(walk.position.y==0,"floor collision")
local sprint=state() for _=1,20 do sprint=Prediction.step(sprint,{controls=33,yaw=0},world) end
assert(sprint.position.z < walk.position.z,"sprint predicts immediately")
local jump=Prediction.step(state(),{controls=16,yaw=0},world)
assert(jump.position.y>.4,"jump begins without a round trip")
for _=1,30 do jump=Prediction.step(jump,{controls=0,yaw=0},world) end
assert(jump.position.y==0 and jump.onGround,"jump lands at collision floor")
local p=Prediction.new(world)
local snapshot={stateSeq=1,observedClientSeq=0,predicted={position={x=0,y=0,z=0},onGround=true},velocity={x=0,y=-.0784,z=0}}
p:reset(snapshot) p:input(frame)
snapshot.stateSeq=2 p:reconcile(snapshot)
assert(p.state.position.z<0 and #p.history==1,"unacknowledged input replay")
p:reconcile(snapshot) assert(p.stale==1,"duplicate state rejected")
snapshot.stateSeq=3 snapshot.observedClientSeq=1 snapshot.predicted.position={x=0,y=0,z=-10}
assert(p:reconcile(snapshot),"large divergence corrected") assert(#p.history==0,"acknowledged input removed")
local w=World.new()
local data={}for i=1,512 do data[i]=0 end data[1]=1
w:apply({voxelFormat="state-u32-xzy-v1",minecraftVersion="1.21.4",epoch=1,active={"0,0,0"},partitions={{key="0,0,0",revision=1,voxels=data,palette={{state=0,name="air",shapes={}},{state=1,name="stone",shapes={{0,0,0,1,1,1}}}}}}})
assert(w:get(0,0,0).name=="stone","canonical voxel lookup")
assert(w:get(-1,0,0)==nil,"unknown negative coordinate")
assert(w:ray({x=.5,y=.5,z=-1},{x=0,y=0,z=1},3).target[3]==0,"voxel targeting")
w:apply({voxelFormat="state-u32-xzy-v1",minecraftVersion="1.21.4",epoch=2,active={},partitions={}}) assert(w:get(0,0,0)==nil,"epoch evicts cached collision data")
print("Client prediction, acknowledgement, reconciliation, collision and world-cache invariants passed")
local delayed=Prediction.new(world) delayed:reset({predicted={position={x=0,y=0,z=0},onGround=true},velocity=state().velocity})
local authoritative=state() local expected=state() local inputs={}
local apex,apexTick,landTick=0,0,0
for tick=1,32 do
	local input={controls=tick==1 and 16 or 0,yaw=0,seq=tick,clientTimeMs=tick*50} inputs[tick]=input
	expected=Prediction.step(expected,input,world) delayed:input(input)
	if tick>4 then authoritative=Prediction.step(authoritative,inputs[tick-4],world) end
	if tick%4==0 then delayed:reconcile({stateSeq=tick,observedClientSeq=tick,presentationLeadTicks=4,predicted={position=authoritative.position,onGround=authoritative.onGround},velocity=authoritative.velocity,jumpTicks=authoritative.jumpTicks}) end
	assert(math.abs(delayed.state.position.y-expected.position.y)<.000001,"accepted intentions cannot rewind vertical prediction before they are simulated")
	if expected.position.y>apex then apex=expected.position.y apexTick=tick end
	if tick>1 and landTick==0 and expected.onGround then landTick=tick end
end
assert(apex>1.24 and apex<1.26 and apexTick==6 and landTick==12,"ordinary jump has Minecraft height and timing, without vertical camera damping")
local sample=Interpolation.sample({{time=0,position={x=0,y=0,z=0},yaw=0},{time=1,position={x=10,y=0,z=0},yaw=0,velocity={x=1,y=0,z=0}}},.5)
assert(sample.x==5,"remote entity interpolation")
sample=Interpolation.sample({{time=1,position={x=10,y=0,z=0},yaw=0,velocity={x=1,y=0,z=0}}},10)
assert(sample.x==14,"remote extrapolation freezes after short packet gap")
assert(Visibility.sphere(0,0,-10,70,1.5,1,192),"forward sphere visible")
assert(not Visibility.sphere(0,0,10,70,1.5,1,192),"behind-camera sphere culled")
assert(Visibility.sphere(0,0,0,70,1.5,4,192),"near-plane intersection retained")
assert(not Visibility.sphere(200,0,-10,70,1.5,1,192),"off-axis sphere culled")
local Sprint=require("../roblox/Sprint") local sprintInput=Sprint.new()
sprintInput:press(1) assert(not sprintInput:update(true,false,false,20),"single press walks")
sprintInput:press(1.2) assert(sprintInput:update(true,false,false,20),"double tap latches sprint")
assert(not sprintInput:update(false,false,false,20),"release cancels sprint")
assert(sprintInput:update(true,true,false,20),"control sprint") assert(not sprintInput:update(true,true,true,20),"sneaking cancels sprint")
assert(not sprintInput:update(true,true,false,6),"server hunger restricts sprint")
local Tiles=require("../roblox/FaceTiles") local tiles={}
Tiles.each({1,1,-8,64,0,8,8,1},function(q)table.insert(tiles,q)end)
assert(#tiles==64,"atlas repeats large grass surfaces without stretching")
for _,q in ipairs(tiles)do assert(q[6]==1 and q[7]==1 and q[3]>=-8 and q[3]<0 and q[5]>=0 and q[5]<8,"tile geometry preserves negative origins")end
local VoxelData=require("../roblox/VoxelData")
local packed=VoxelData.decode({voxelData={encoding="rle",runs={256,1,256,0}}},"state-adaptive-xzy-v2")
assert(buffer.len(packed)==2048 and VoxelData.get(packed,255)==1 and VoxelData.get(packed,256)==0,"bounded RLE decode")
assert(VoxelData.decode({voxelData={encoding="uniform",state=0}},"state-adaptive-xzy-v2")==0,"air stores one state")
for _,runs in ipairs({{513,0},{511,0},{0,0,512,1},{512,-1},{512,0,1,1},{512.5,0}})do assert(not pcall(VoxelData.decode,{voxelData={encoding="rle",runs=runs}},"state-adaptive-xzy-v2"),"malformed terrain is rejected")end
local rayQueries=0
local dda=setmetatable({get=function(_,x,y,z)rayQueries+=1 return {name=z==-5 and "stone" or "air"}end},{__index=World})
local target=dda:ray({x=.5,y=.5,z=.5},{x=0,y=0,z=-1},6)
assert(target.target[3]==-5 and target.face[3]==1 and rayQueries==6,"DDA visits crossed voxels, not hundreds of fixed samples")
local partial=setmetatable({get=function(_,x,y,z)
	if z==0 and y==0 then return {name="stone_slab",shapes={{0,0,0,1,.5,1}}} end
	return {name=z==-1 and y==0 and "stone" or "air",shapes=z==-1 and y==0 and {{0,0,0,1,1,1}} or {}}
end},{__index=World})
assert(partial:ray({x=.5,y=.75,z=2},{x=0,y=0,z=-1},4).target[3]==-1,"ray passes over a slab rather than selecting its empty upper half")
local slab=partial:ray({x=.5,y=2,z=.5},{x=0,y=-1,z=0},4)
assert(slab.face[2]==1 and slab.hit[2]==.5 and slab.distance==1.5,"slab targeting retains actual surface hit coordinates")
local fluidWorld=setmetatable({get=function(_,x,y,z)
	if y==0 then return {name="water",properties={level=x==0 and 0 or 4},shapes={}} end
	return {name="air",shapes={}}
end},{__index=World})
local liquid,current=fluidWorld:fluid({x=.5,y=0,z=.5})
assert(liquid=="water" and math.abs(current.x)<=.014,"source water occupancy and bounded current")
assert(fluidWorld:submerged({x=.5,y=.8,z=.5})=="water","eyes below the source surface are submerged")
assert(fluidWorld:submerged({x=.5,y=.95,z=.5})==false,"eyes above the surface stay dry even when body is swimming")
assert(fluidWorld:submerged({x=1.5,y=.6,z=.5})==false,"flowing water uses the actual lower surface")
local aquatic=setmetatable({get=function(_,x,y,z) return y==0 and {name="kelp",properties={}} or {name="air"} end},{__index=World})
assert(aquatic:submerged({x=.5,y=.5,z=.5})=="water","camera recognizes water inside kelp")
local unknown=setmetatable({get=function() return nil end},{__index=World})
assert(unknown:submerged({x=0,y=0,z=0})==nil,"missing terrain has an explicit unknown camera medium")
local swim=state() swim.position.y=0
fluidWorld.boxes=function()return {}end
for _=1,10 do swim=Prediction.step(swim,{controls=16,yaw=0},fluidWorld)end
assert(swim.position.y>0,"space gives immediate buoyancy")
print("Sprint, atlas tiling, adaptive storage, DDA and liquid prediction invariants passed")
local InputLatch=require("../roblox/InputLatch") local latch=InputLatch.new()
latch:input(16,1) latch:input(0,1.12)
local latched,pulsed=latch:controls(0,1.2) assert(latched==16 and pulsed,"short jump tap survives the 5 Hz exchange")
latch:accepted(pulsed) assert(latch:controls(0,1.3)==0,"accepted jump is not replayed")
latch:input(16,2) latch:input(0,2.1) assert(latch:controls(0,3)==0,"expired taps cannot move an idle player")
local flight=Prediction.new(world) flight:reset(snapshot)
flight.state=state() flight.history={}
flight:input({controls=16,yaw=0,seq=1,clientTimeMs=50})
local predictedY=flight.state.position.y
flight:reconcile({stateSeq=99,observedClientSeq=1,predicted={position={x=0,y=0,z=0},onGround=true},velocity=state().velocity})
assert(flight.state.position.y==predictedY,"delayed ordinary state cannot rewind a locally initiated jump")
flight:reconcile({stateSeq=100,observedClientSeq=1,predicted={position={x=5,y=3,z=0},onGround=false},velocity=state().velocity,correction={revision=1}})
assert(flight.state.position.y==3 and not flight.verticalFlight and #flight.history==0,"forced teleport immediately replaces vertical presentation")
local Metrics=require("../roblox/Metrics") local metrics=Metrics.new(100)
for _=1,99 do metrics:record(.01)end metrics:record(.1)
local report=metrics:report()
assert(report.samples==100 and report.p99Ms==10 and report.maxMs==100 and report.low1PercentFps==10,"frame tail metrics expose stalls")
for _=1,100 do metrics:record(.02)end
assert(metrics:report().samples==100 and metrics:report().maxMs==20,"metric memory is bounded and old stalls age out")
local Inventory=require("../roblox/Inventory") local sent={}
local inventory=Inventory.new(function(kind,data)table.insert(sent,{kind=kind,data=data})return #sent end)
inventory:update({inventory={id=0,cursor=false},actions={}})
inventory:press(36,0,0) inventory:release(9)
assert(#sent==1 and inventory.active.seq==1,"drag release cannot overtake its pickup")
inventory:update({inventory={id=0,cursor={name="stone",count=16}},actions={{seq=1,status="sent"}}})
assert(#sent==2 and sent[2].data.slot==9 and inventory.state=="HOLDING_STACK","drop follows the acknowledged logical cursor")
inventory:update({inventory={id=0,cursor=false},actions={{seq=2,status="sent"}}})
assert(inventory.state=="EMPTY" and inventory.cursor==nil,"empty authoritative cursor retires its presentation")
inventory:press(9,1,0) inventory:cancelDrag() inventory:close(0)
inventory:update({inventory={id=1,cursor=false},actions={}})
assert(inventory.drag==nil and #inventory.queue==0 and inventory.active==nil,"window changes cancel stale transactions")
inventory:update({inventory={id=0,cursor={name="stone",count=12}},actions={}})
inventory:press(9,0,0) inventory:visit(10) inventory:visit(11) inventory:release(11)
assert(sent[#sent].kind=="distribute" and #sent[#sent].data.slots==3,"held stack drag delegates one bounded server distribution")
