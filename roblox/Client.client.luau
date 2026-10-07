local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local StarterGui = game:GetService("StarterGui")
local player = Players.LocalPlayer
local net = ReplicatedStorage:WaitForChild("MinebloxNet")
local modules = ReplicatedStorage:WaitForChild("MinebloxClient")
local renderer = require(modules.Renderer).new()
local worldData = require(modules.World).new()
local prediction = require(modules.Prediction).new(worldData)
local Interpolation=require(modules.Interpolation)
local Visibility=require(modules.Visibility)
local sounds=require(modules.Sounds).new()
local sky=require(modules.Sky).new()
local hud = require(modules.Hud).new(player)
local snapshot, received, displayed, epoch
local actionSeq=0
local interface
local function send(kind,data)
	if not snapshot then return end
	actionSeq+=1 data=table.clone(data) data.kind=kind data.seq=actionSeq data.epoch=epoch net.Action:FireServer(data) return actionSeq
end
pcall(function() StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.All, false) end)
local function hideDefaultChat(child) if child.Name=="Chat" and child:IsA("ScreenGui") then child.Enabled=false end end
for _,child in ipairs(player.PlayerGui:GetChildren()) do hideDefaultChat(child) end
player.PlayerGui.ChildAdded:Connect(hideDefaultChat)
task.delay(1,function() pcall(function() StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.All,false) end) end)
local camera = workspace.CurrentCamera
camera.CameraType = Enum.CameraType.Scriptable camera.FieldOfView = 70
local yaw, pitch, sequence, slot = 0, 0, 0, 1
interface=require(modules.Interface).new(hud.gui,send)
interface.onLocalCommand=function(command)
	local kind,value=string.match(command,"^/(%w+)%s+(%w+)$")
	if kind=="sound" and (value=="on" or value=="off") then sounds:setEnabled(value=="on") interface:message("Sounds "..value) return true end
	if kind=="music" and (value=="on" or value=="off") then if sounds:setMusic(value=="on") then interface:message("Music "..value) else interface:message("No permitted music IDs configured in .local/audio.json") end return true end
	return false
end
local sessionId
local displayOffset = Vector3.zero
local previousPosition
local accumulator=0
local worlds = {}
local entities = {}
local selected
local selectedEntity
local breaking=false
local breakingTarget
local breakingSeq
local crackStarted=0 local crackDuration=1500
local selectionPart=Instance.new("Part") selectionPart.Name="MinecraftSelection" selectionPart.Anchored=true selectionPart.CanCollide=false selectionPart.CanQuery=false selectionPart.Transparency=1 selectionPart.Size=Vector3.new(4.01,4.01,4.01) selectionPart.Parent=workspace
local outline=Instance.new("SelectionBox") outline.LineThickness=.015 outline.Color3=Color3.new(0,0,0) outline.SurfaceTransparency=1 outline.Adornee=selectionPart outline.Visible=false outline.Parent=selectionPart
local crackLabels={}
local Images=require(modules.Images)
local ItemVisual=require(modules.ItemVisual)
local EntityVisual=require(modules.EntityVisual)
for _,face in ipairs(Enum.NormalId:GetEnumItems()) do
	local surface=Instance.new("SurfaceGui") surface.Face=face surface.CanvasSize=Vector2.new(64,64) surface.Adornee=selectionPart surface.Parent=selectionPart
	local image=Instance.new("ImageLabel") image.BackgroundTransparency=1 image.Size=UDim2.fromScale(1,1) image.ResampleMode=Enum.ResamplerMode.Pixelated image.Visible=false image.Parent=surface table.insert(crackLabels,image)
end
local entityFolder = Instance.new("Folder") entityFolder.Name = "MinecraftEntities" entityFolder.Parent = workspace
local locked = true
local focused = true
UserInputService.WindowFocused:Connect(function() focused = true end)
UserInputService.WindowFocusReleased:Connect(function() focused = false end)
local keys = { Enum.KeyCode.W, Enum.KeyCode.S, Enum.KeyCode.A, Enum.KeyCode.D, Enum.KeyCode.Space, Enum.KeyCode.LeftControl, Enum.KeyCode.LeftShift }
local controls = 0
local inputStarted,inputOrigin,inputStateSeq,inputIntentSeq
local visibilityAt=0 local frameTotal,frameCount,frameMax=0,0,0
local function entityModel(entity)
	if entity.item or entity.name=="item" or entity.name=="item_stack" then
		local model=entity.item and ItemVisual.world(entity.item.name) or Instance.new("Model")
		model=model or Instance.new("Model") model.Name=entity.item and entity.item.name or "Item awaiting metadata" model:SetAttribute("MinecraftEntityId",entity.id) model.Parent=entityFolder return model
	end
	local textured=EntityVisual.create(entity) if textured then textured.Parent=entityFolder return textured end
	local model = Instance.new("Model") model.Name = entity.name model:SetAttribute("MinecraftEntityId",entity.id)
	local function part(name, size, at, color)
		local p = Instance.new("Part") p.Name = name p.Size = size * 4 p.CFrame = CFrame.new(at * 4)
		p.Anchored = true p.CanCollide = false p.Color = color p.Material = Enum.Material.SmoothPlastic p.Parent = model
	end
	if entity.type == "player" then
		part("Head", Vector3.new(0.5, 0.5, 0.5), Vector3.new(0, 1.55, 0), Color3.fromRGB(185, 137, 103))
		part("Body", Vector3.new(0.5, 0.65, 0.25), Vector3.new(0, 0.975, 0), Color3.fromRGB(45, 155, 161))
		for _, sign in ipairs({-1, 1}) do
			part("Arm", Vector3.new(0.25, 0.65, 0.25), Vector3.new(sign * 0.375, 0.975, 0), Color3.fromRGB(185, 137, 103))
			part("Leg", Vector3.new(0.25, 0.65, 0.25), Vector3.new(sign * 0.125, 0.325, 0), Color3.fromRGB(64, 60, 141))
		end
	else part("Entity", Vector3.new(0.6, 0.8, 0.6), Vector3.new(0, 0.4, 0), Color3.fromRGB(180, 160, 145)) end
	model.WorldPivot = CFrame.new() model.Parent = entityFolder
	return model
end
net.State.OnClientEvent:Connect(function(state)
	if not state.predicted or state.version ~= 1 then return end
	if epoch ~= state.worldEpoch or sessionId ~= state.id then
		breaking=false breakingTarget=nil breakingSeq=nil
		if sessionId~=state.id then actionSeq=0 interface.seen=0 interface.actionSeen={} player:SetAttribute("DigEventSeq",0) end
		worlds = {} sessionId = state.id
		displayed = nil epoch = state.worldEpoch renderer:clear()
		worldData:clear() prediction:reset(state) displayOffset=Vector3.zero
		previousPosition=state.predicted.position accumulator=0
		for _,entry in pairs(entities) do entry.model:Destroy() end entities = {}
	end
	snapshot, received = state, os.clock()
	local previous=prediction.state and prediction.state.position
	local snap=prediction:reconcile(state)
	if previous and prediction.state then
		local nextPosition=prediction.state.position
		if previousPosition then previousPosition={x=previousPosition.x+nextPosition.x-previous.x,y=previousPosition.y+nextPosition.y-previous.y,z=previousPosition.z+nextPosition.z-previous.z} end
		if snap then displayOffset=Vector3.zero previousPosition=nextPosition else displayOffset+=Vector3.new(previous.x-nextPosition.x,previous.y-nextPosition.y,previous.z-nextPosition.z) end
	end
	player:SetAttribute("ReconciliationBlocks",prediction.error) player:SetAttribute("StaleStates",prediction.stale)
	hud:update(state)
	interface:update(state)
	for _,result in ipairs(state.actions or {}) do if result.seq==breakingSeq and result.status~="pending" then breaking=false breakingTarget=nil end end
	sounds:update(state) sky:state(state)
	for _,event in ipairs(state.events or {}) do if event.kind=="digStart" and event.seq>(player:GetAttribute("DigEventSeq") or 0) then player:SetAttribute("DigEventSeq",event.seq) if breaking and table.concat(event.data.target,",")==breakingTarget then crackDuration=event.data.durationMs end end end
	player:SetAttribute("MinecraftHealth", state.health)
	player:SetAttribute("MinecraftSession",state.id) player:SetAttribute("WorldEpoch",state.worldEpoch)
	player:SetAttribute("HttpResponseBytes",state.httpBytes or 0) player:SetAttribute("HttpRequests",state.httpCount or 0)
	player:SetAttribute("MinecraftHunger", state.hunger)
	player:SetAttribute("BridgeRoundTripMs", state.roundTripMs)
	local present = {}
	for _, entity in ipairs(state.entities or {}) do
		present[entity.id] = true
		local entry = entities[entity.id]
		if not entry then entry = { model = entityModel(entity),samples={} } entities[entity.id] = entry end
		local itemName=entity.item and entity.item.name
		if entry.itemName~=itemName then entry.model:Destroy() entry.model=entityModel(entity) entry.itemName=itemName end
		entry.isItem=itemName~=nil
		entry.target = CFrame.new(Vector3.new(entity.position.x, entity.position.y, entity.position.z) * 4) * CFrame.Angles(0, entity.yaw, 0)
		table.insert(entry.samples,{time=os.clock(),position=entity.position,velocity=entity.velocity,yaw=entity.yaw}) if #entry.samples>8 then table.remove(entry.samples,1) end
	end
	for id, entry in pairs(entities) do if not present[id] then entry.model:Destroy() entities[id] = nil end end
end)
-- Terrain is queued and consumed serially, preventing overlapping mesh builds.
net.Terrain.OnClientEvent:Connect(function(world)
	if sessionId and world.id ~= sessionId or epoch and world.epoch < epoch then return end
	if #worlds >= 4 then table.remove(worlds, 1) end
	table.insert(worlds, world)
end)
task.spawn(function()
	while true do
		local world = table.remove(worlds, 1)
		if world and world.id == sessionId and world.epoch >= epoch then
			local ok, err = pcall(function() worldData:apply(world) renderer:apply(world) end)
			if not ok then warn("Mineblox render:", err) end
			local known = {}
			for key, entry in pairs(renderer.parts) do if not entry.degraded or os.clock()<entry.retryAt then known[key] = entry.revision end end
			net.TerrainAck:FireServer(renderer.epoch, known)
		end
		task.wait()
	end
end)
net.Status.OnClientEvent:Connect(function(value)
	if type(value)=="table" then if value.connected==false then received=-math.huge breaking=false controls=0 end hud.info.Text=value.text
	else hud.info.Text=value end
end)
UserInputService.InputChanged:Connect(function(input, processed)
	if processed then return end
	if input.UserInputType == Enum.UserInputType.MouseMovement and locked then
		yaw = (yaw - input.Delta.X * 0.0025 + math.pi) % (2 * math.pi) - math.pi
		pitch = math.clamp(pitch - input.Delta.Y * 0.0025, -math.pi / 2 + 0.01, math.pi / 2 - 0.01)
	elseif input.UserInputType == Enum.UserInputType.MouseWheel then slot = (slot - 1 - input.Position.Z) % 9 + 1 hud:select(slot) end
end)
UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	focused=true
	if input.KeyCode==Enum.KeyCode.W and displayed then inputStarted=os.clock() inputOrigin=displayed inputStateSeq=snapshot and snapshot.stateSeq inputIntentSeq=sequence+1 end
	if input.KeyCode==Enum.KeyCode.E and not interface.chatOpen then sounds:play("ui") interface:toggle() return end
	if input.KeyCode==Enum.KeyCode.T then interface:beginChat(false) return end
	if input.KeyCode==Enum.KeyCode.Slash then interface:beginChat(true) return end
	if input.KeyCode==Enum.KeyCode.Escape and interface.open then interface:toggle() return end
	if interface.open then
		local number=input.KeyCode.Value-Enum.KeyCode.One.Value+1
		if interface.hovered and number>=1 and number<=9 then send("click",{window=snapshot.inventory.id,slot=interface.hovered,button=number-1,mode=2}) end
		return
	end
	if input.KeyCode==Enum.KeyCode.Q then send("drop",{all=UserInputService:IsKeyDown(Enum.KeyCode.LeftControl)}) end
	if input.KeyCode==Enum.KeyCode.F3 then hud.info.Visible=not hud.info.Visible end
	if input.UserInputType==Enum.UserInputType.MouseButton1 then
		if selectedEntity then send("attack",{entity=selectedEntity}) elseif selected then breaking=true breakingTarget=table.concat(selected.target,",") crackStarted=os.clock() crackDuration=1500 breakingSeq=send("dig",{target=selected.target}) end
	end
	if input.UserInputType==Enum.UserInputType.MouseButton2 then
		if selectedEntity then send("useEntity",{entity=selectedEntity}) elseif selected then
			if UserInputService:IsKeyDown(Enum.KeyCode.LeftShift) then send("useBlock",{target=selected.target}) else send("place",{target=selected.target,face=selected.face}) end
		else send("useItem",{}) end
	end
	if input.KeyCode == Enum.KeyCode.Tab then locked = not locked end
	local number = input.KeyCode.Value - Enum.KeyCode.One.Value + 1
	if number >= 1 and number <= 9 then slot = number hud:select(slot) end
end)
UserInputService.InputEnded:Connect(function(input)
	if input.KeyCode==Enum.KeyCode.W then inputStarted=nil end
	if input.UserInputType==Enum.UserInputType.MouseButton1 and breaking then breaking=false send("cancelDig",{}) end
end)
interface.input.InputBegan:Connect(function(input)
	if input.KeyCode==Enum.KeyCode.Tab then send("complete",{text=interface.input.Text}) end
	if input.KeyCode==Enum.KeyCode.Up and #interface.history>0 then interface.historyIndex=math.clamp(interface.historyIndex+1,1,#interface.history) interface.input.Text=interface.history[#interface.history-interface.historyIndex+1] end
end)
hud:select(slot)
RunService.Heartbeat:Connect(function(dt)
	accumulator=math.min(accumulator+dt,.2)
	while accumulator>=.05 do
		accumulator-=.05
		controls = 0
		if locked and focused and not interface.open and not interface.chatOpen and not interface.death.Visible and not UserInputService:GetFocusedTextBox() then
			for i, key in ipairs(keys) do if UserInputService:IsKeyDown(key) then controls += 2 ^ (i - 1) end end
		end
		sequence += 1
		local frame={ version = 1, seq = sequence, controls = controls, yaw = yaw, pitch = pitch, slot = slot - 1, clientTimeMs=os.clock()*1000 }
		if snapshot and os.clock()-received<.75 then previousPosition=prediction.state.position prediction:input(frame) end
		net.Input:FireServer(frame)
	end
end)
RunService:BindToRenderStep("MinecraftCamera", Enum.RenderPriority.Camera.Value + 1, function(dt)
	local lock=locked and not interface.open and not interface.chatOpen and not interface.death.Visible
	UserInputService.MouseBehavior = lock and Enum.MouseBehavior.LockCenter or Enum.MouseBehavior.Default
	UserInputService.MouseIconEnabled = not lock
	interface:tick()
	sky:tick(camera) sounds:movement(prediction.state,worldData)
	frameTotal+=dt frameCount+=1 frameMax=math.max(frameMax,dt)
	if os.clock()-visibilityAt>.1 then
		renderer:visibility(camera) visibilityAt=os.clock()
		player:SetAttribute("VisiblePartitions",renderer.visible) player:SetAttribute("CachedPartitions",renderer.count) player:SetAttribute("VisibleTriangles",renderer.triangles)
		player:SetAttribute("FrameMs",frameTotal/math.max(frameCount,1)*1000) player:SetAttribute("MaxFrameMs",frameMax*1000) frameTotal=0 frameCount=0 frameMax=0
	end
	if not snapshot then return end
	local p, velocity = prediction.state.position, prediction.state.velocity
	-- Mineflayer velocities are blocks/tick. Extrapolate at most one exchange
	-- interval, then freeze on packet loss. This is display prediction only.
	displayOffset*=math.exp(-dt*12)
	local before=previousPosition or p
	local target=Vector3.new(before.x,before.y,before.z):Lerp(Vector3.new(p.x,p.y,p.z),accumulator/.05)+displayOffset
	local correction = snapshot.correction
	-- Reconciliation already decays displayOffset; a second camera lerp
	-- delayed every local step and amplified the five-Hz exchange cadence.
	displayed=target
	if correction then player:SetAttribute("MinecraftCorrection", correction.revision) end
	camera.CFrame = CFrame.new((displayed + Vector3.new(0, 1.62, 0)) * 4) * CFrame.Angles(0, yaw, 0) * CFrame.Angles(pitch, 0, 0)
	if inputStarted and (displayed-inputOrigin).Magnitude>.01 then
		player:SetAttribute("FirstCameraResponseMs",(os.clock()-inputStarted)*1000)
		player:SetAttribute("CameraMovedBeforeStateUpdate",snapshot.stateSeq==inputStateSeq) inputStarted=nil
		player:SetAttribute("CameraMovedBeforeInputAcknowledged",(snapshot.observedClientSeq or 0)<inputIntentSeq)
	end
	local eye=camera.CFrame.Position/4 local direction=camera.CFrame.LookVector
	selected=worldData:ray({x=eye.X,y=eye.Y,z=eye.Z},{x=direction.X,y=direction.Y,z=direction.Z},5)
	if breaking and (not selected or table.concat(selected.target,",")~=breakingTarget) then breaking=false send("cancelDig",{}) end
	outline.Visible=selected~=nil and lock
	if selected then selectionPart.Position=(Vector3.new(table.unpack(selected.target))+Vector3.new(.5,.5,.5))*4 end
	local filter=RaycastParams.new() filter.FilterType=Enum.RaycastFilterType.Include filter.FilterDescendantsInstances={entityFolder}
	local hit=workspace:Raycast(camera.CFrame.Position,direction*16,filter)
	selectedEntity=hit and hit.Instance.Parent:GetAttribute("MinecraftEntityId") or nil
	local stage=math.clamp(math.floor((os.clock()-crackStarted)*1000/math.max(crackDuration,1)*10),0,9)
	local crack=nil
	if breaking and selected then crack=Images.gui("crack"..stage) end
	for _,label in ipairs(crackLabels) do label.Visible=crack~=nil if crack then label.ImageContent=Content.fromObject(crack) end end
	local visibleEntities=0
	for _, entry in pairs(entities) do
		local sample=Interpolation.sample(entry.samples,os.clock()-.2)
		if sample then
			local center=Vector3.new(sample.x,sample.y,sample.z)*4
			local show=Visibility.visible(camera,center,8,192)
			entry.model.Parent=show and entityFolder or nil
			if show then visibleEntities+=1 entry.model:PivotTo(CFrame.new(center+Vector3.new(0,entry.isItem and .6+math.sin(os.clock()*2)*.15 or 0,0))*CFrame.Angles(0,entry.isItem and os.clock() or sample.yaw,0)) end
		end
	end
	player:SetAttribute("VisibleEntities",visibleEntities)
	player:SetAttribute("MinecraftX", displayed.X) player:SetAttribute("MinecraftY", displayed.Y) player:SetAttribute("MinecraftZ", displayed.Z)
	player:SetAttribute("TerrainPartitions", renderer.count)
end)
if RunService:IsStudio() then
	local diagnostic=Instance.new("BindableFunction") diagnostic.Name="MinebloxDiagnostics" diagnostic.Parent=player.PlayerGui
	diagnostic.OnInvoke=function(kind,data)
		if kind=="snapshot" then return snapshot end
		if kind=="culling" then renderer.disableCulling=not data renderer:visibility(camera) return true end
		if kind=="look" then yaw=data.yaw pitch=data.pitch return true end
		if kind=="action" then local fields=table.clone(data) local action=fields.kind fields.kind=nil send(action,fields) return true end
		if kind=="target" then return selected end
		if kind=="counts" then local total,parts=0,0 for _,e in pairs(renderer.parts) do total+=1 parts+=#e.group:GetChildren() end return {cached=total,meshParts=parts,visible=renderer.visible,triangles=renderer.triangles} end
	end
end
