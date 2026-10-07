local Prediction=require("../roblox/Prediction")
local World=require("../roblox/World")
local Interpolation=require("../roblox/Interpolation")
local Visibility=require("../roblox/Visibility")
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
local sample=Interpolation.sample({{time=0,position={x=0,y=0,z=0},yaw=0},{time=1,position={x=10,y=0,z=0},yaw=0,velocity={x=1,y=0,z=0}}},.5)
assert(sample.x==5,"remote entity interpolation")
sample=Interpolation.sample({{time=1,position={x=10,y=0,z=0},yaw=0,velocity={x=1,y=0,z=0}}},10)
assert(sample.x==14,"remote extrapolation freezes after short packet gap")
assert(Visibility.sphere(0,0,-10,70,1.5,1,192),"forward sphere visible")
assert(not Visibility.sphere(0,0,10,70,1.5,1,192),"behind-camera sphere culled")
assert(Visibility.sphere(0,0,0,70,1.5,4,192),"near-plane intersection retained")
assert(not Visibility.sphere(200,0,-10,70,1.5,1,192),"off-axis sphere culled")
