local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local StarterGui = game:GetService("StarterGui")
local Lighting = game:GetService("Lighting")
local player = Players.LocalPlayer
local net = ReplicatedStorage:WaitForChild("MinebloxNet")
local modules = ReplicatedStorage:WaitForChild("MinebloxClient")
local renderer = require(modules.Renderer).new()
local hud = require(modules.Hud).new(player)
pcall(function() StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.All, false) end)
local camera = workspace.CurrentCamera
camera.CameraType = Enum.CameraType.Scriptable camera.FieldOfView = 70
local yaw, pitch, sequence, slot = 0, 0, 0, 1
local snapshot, received, displayed, epoch
local sessionId
local worlds = {}
local entities = {}
local entityFolder = Instance.new("Folder") entityFolder.Name = "MinecraftEntities" entityFolder.Parent = workspace
local locked = true
local focused = true
UserInputService.WindowFocused:Connect(function() focused = true end)
UserInputService.WindowFocusReleased:Connect(function() focused = false end)
local keys = { Enum.KeyCode.W, Enum.KeyCode.S, Enum.KeyCode.A, Enum.KeyCode.D, Enum.KeyCode.Space, Enum.KeyCode.LeftControl, Enum.KeyCode.LeftShift }
local controls = 0
local function entityModel(entity)
	local model = Instance.new("Model") model.Name = entity.name
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
		worlds = {} sessionId = state.id
		displayed = nil epoch = state.worldEpoch renderer:clear()
		entityFolder:ClearAllChildren() entities = {}
	end
	snapshot, received = state, os.clock()
	hud:update(state)
	player:SetAttribute("MinecraftHealth", state.health)
	player:SetAttribute("MinecraftHunger", state.hunger)
	player:SetAttribute("BridgeRoundTripMs", state.roundTripMs)
	if state.timeOfDay then Lighting.ClockTime = (state.timeOfDay / 1000 + 6) % 24 end
	local present = {}
	for _, entity in ipairs(state.entities or {}) do
		present[entity.id] = true
		local entry = entities[entity.id]
		if not entry then entry = { model = entityModel(entity) } entities[entity.id] = entry end
		entry.target = CFrame.new(Vector3.new(entity.position.x, entity.position.y, entity.position.z) * 4) * CFrame.Angles(0, entity.yaw, 0)
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
			local ok, err = pcall(renderer.apply, renderer, world)
			if not ok then warn("Mineblox render:", err) end
			local known = {}
			for key, entry in pairs(renderer.parts) do known[key] = entry.revision end
			net.TerrainAck:FireServer(renderer.epoch, known)
		end
		task.wait()
	end
end)
net.Status.OnClientEvent:Connect(function(text) hud.info.Text = text end)
UserInputService.InputChanged:Connect(function(input, processed)
	if processed then return end
	if input.UserInputType == Enum.UserInputType.MouseMovement and locked then
		yaw = (yaw - input.Delta.X * 0.0025 + math.pi) % (2 * math.pi) - math.pi
		pitch = math.clamp(pitch - input.Delta.Y * 0.0025, -math.pi / 2 + 0.01, math.pi / 2 - 0.01)
	elseif input.UserInputType == Enum.UserInputType.MouseWheel then slot = (slot - 1 - input.Position.Z) % 9 + 1 hud:select(slot) end
end)
UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	if input.KeyCode == Enum.KeyCode.Tab then locked = not locked end
	local number = input.KeyCode.Value - Enum.KeyCode.One.Value + 1
	if number >= 1 and number <= 9 then slot = number hud:select(slot) end
end)
hud:select(slot)
task.spawn(function()
	while true do
		controls = 0
		if locked and focused and not UserInputService:GetFocusedTextBox() then
			for i, key in ipairs(keys) do if UserInputService:IsKeyDown(key) then controls += 2 ^ (i - 1) end end
		end
		sequence += 1
		net.Input:FireServer({ version = 1, seq = sequence, controls = controls, yaw = yaw, pitch = pitch, slot = slot - 1 })
		task.wait(0.05)
	end
end)
RunService:BindToRenderStep("MinecraftCamera", Enum.RenderPriority.Camera.Value + 1, function(dt)
	UserInputService.MouseBehavior = locked and Enum.MouseBehavior.LockCenter or Enum.MouseBehavior.Default
	UserInputService.MouseIconEnabled = not locked
	if not snapshot then return end
	local p, velocity = snapshot.predicted.position, snapshot.velocity
	-- Mineflayer velocities are blocks/tick. Extrapolate at most one exchange
	-- interval, then freeze on packet loss. This is display prediction only.
	local age = math.min(os.clock() - received, 0.2)
	local target = Vector3.new(p.x, p.y, p.z) + Vector3.new(velocity.x, snapshot.predicted.onGround and 0 or velocity.y, velocity.z) * age * 20
	local correction = snapshot.correction
	if not displayed or (displayed - target).Magnitude > 2 then displayed = target
	else displayed = displayed:Lerp(target, 1 - math.exp(-dt * 24)) end
	if correction and correction.revision ~= player:GetAttribute("MinecraftCorrection") then
		displayed = Vector3.new(correction.position.x, correction.position.y, correction.position.z)
		player:SetAttribute("MinecraftCorrection", correction.revision)
	end
	camera.CFrame = CFrame.new((displayed + Vector3.new(0, 1.62, 0)) * 4) * CFrame.Angles(0, yaw, 0) * CFrame.Angles(pitch, 0, 0)
	for _, entry in pairs(entities) do if entry.target then entry.model:PivotTo(entry.model:GetPivot():Lerp(entry.target, 1 - math.exp(-dt * 16))) end end
	player:SetAttribute("MinecraftX", displayed.X) player:SetAttribute("MinecraftY", displayed.Y) player:SetAttribute("MinecraftZ", displayed.Z)
	player:SetAttribute("TerrainPartitions", renderer.count)
end)
