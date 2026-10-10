local AssetService=game:GetService("AssetService")
-- Reserve one growth buffer before streaming fills the device budget. Completed
-- geometry is frozen; icons and terrain serialize access to this scratch mesh.
local Builder={busy=false,mesh=nil}
function Builder.acquire()
	while Builder.busy do task.wait() end
	Builder.busy=true
	Builder.owner=coroutine.running()
	if not Builder.mesh then Builder.mesh=AssetService:CreateEditableMesh() end
	if not Builder.mesh then Builder.busy=false Builder.owner=nil return nil end
	Builder.mesh:Clear() return Builder.mesh
end
function Builder.release()
	if Builder.owner~=coroutine.running() then return end
	if Builder.mesh then Builder.mesh:Clear() end Builder.busy=false Builder.owner=nil
end
function Builder.reserve()
	if not Builder.mesh then Builder.mesh=AssetService:CreateEditableMesh() end
end
return Builder
