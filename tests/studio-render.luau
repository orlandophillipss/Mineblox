-- Run in the Client data model of the private Studio development place.
-- No Minecraft world edits: this fixture owns and destroys all probe geometry.
local modules=game.ReplicatedStorage.MinebloxClient
local Renderer=require(modules.Renderer)
local r=Renderer.new() r.root.Name="MinebloxRespawnProbe"
local ok,result=pcall(function()
	local partition={key="probe",revision=1,origin={10000,0,0},palette={{state=1,name="stone",color={128,128,128}}},quads={{1,1,10000,0,0,64,64,1}}}
	-- clear() runs during one of the actual mesh builder's yields.
	task.defer(function() r:clear() end)
	assert(r:partition(partition)==false,"superseded mesh build must not commit")
	assert(next(r.parts)==nil,"respawn cannot resurrect pre-reset partitions")
	local atlas=r.atlas local page=atlas.pages[1]
	assert(page,"private test needs the stone skin")
	local pixel=page:ReadPixelsBuffer(Vector2.zero,Vector2.new(1,1))
	assert(buffer.readu8(pixel,3)==255,"atlas source is populated")
	r:clear()
	assert(r.atlas==atlas and atlas.pages[1]==page,"world reset retains valid catalog texture objects")
	assert(buffer.readu8(page:ReadPixelsBuffer(Vector2.zero,Vector2.new(1,1)),3)==255,"retained image remains readable after reset")
	assert(r:partition({key="water-probe",revision=1,origin={10000,0,0},palette={{state=1,name="water",properties={level=0},color={46,90,200}}},quads={{1,1,10000,.888889,0,1,1,1}}}),"water test must allocate a real mesh")
	local parts=r.parts["water-probe"].group:GetChildren()
	assert(#parts==1 and parts[1]:IsA("MeshPart") and parts[1].DoubleSided,"water remains visible from underneath")
	assert(parts[1]:FindFirstChildOfClass("SurfaceAppearance"),"water retains its textured appearance")
	return {cancelled=true,stalePartitions=0,atlasAliveAfterReset=true,waterDoubleSided=true}
end)
r:clear() for _,image in pairs(r.atlas.pages) do image:Destroy() end r.root:Destroy()
assert(ok,result) return result
