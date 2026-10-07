local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local Transport = require(script.Parent.BridgeTransport)
local config = require(script.Parent.DevelopmentConfig)
Players.CharacterAutoLoads = false
assert(HttpService.HttpEnabled, "Enable HTTP requests in Game Settings > Security")
local secret = RunService:IsStudio() and config.token or HttpService:GetSecret("MINEBLOX_TOKEN")
local bridge = Transport.new(config.url, secret)
local folder = Instance.new("Folder")
folder.Name = "MinebloxNet"
folder.Parent = ReplicatedStorage
local function remote(name)
	local event = Instance.new("RemoteEvent")
	event.Name = name
	event.Parent = folder
	return event
end
local input, state, terrain, status = remote("Input"), remote("State"), remote("Terrain"), remote("Status")
local terrainAck = remote("TerrainAck")
local action = remote("Action")
local actionRate={}
action.OnServerEvent:Connect(function(player,request)
	local b=actionRate[player] or {time=os.clock(),tokens=6} actionRate[player]=b
	b.tokens=math.min(6,b.tokens+(os.clock()-b.time)*4) b.time=os.clock()
	if b.tokens<1 then return end b.tokens-=1
	if type(request)~="table" then return end
	-- Published cross-platform chat requires filtering. This launcher is Studio-only.
	if request.kind=="chat" and not RunService:IsStudio() then
		status:FireClient(player,"External chat is unavailable in published servers until account linking/filtering is configured") return
	end
	bridge:setAction(player,request)
end)
local joining, rate = {}, {}
local function join(player)
	if joining[player] or bridge.sessions[player.UserId] then return end
	joining[player] = true
	local ok, result = pcall(bridge.join, bridge, player)
	joining[player] = nil
	if not player.Parent then if ok then pcall(bridge.leave, bridge, player) end return end
	if ok then state:FireClient(player, result) else status:FireClient(player, "Connection failed; retrying in 20 seconds") warn("Mineblox join:", result) end
end
Players.PlayerAdded:Connect(function(player) task.spawn(join, player) end)
for _, player in ipairs(Players:GetPlayers()) do task.spawn(join, player) end
Players.PlayerRemoving:Connect(function(player)
	rate[player] = nil
	actionRate[player]=nil
	task.spawn(function() pcall(bridge.leave, bridge, player) end)
end)
input.OnServerEvent:Connect(function(player, frame)
	local bucket = rate[player] or { time = os.clock(), tokens = 30 }
	rate[player] = bucket
	bucket.tokens = math.min(30, bucket.tokens + (os.clock() - bucket.time) * 20)
	bucket.time = os.clock()
	if bucket.tokens < 1 then return end
	bucket.tokens -= 1
	bridge:setInput(player, frame)
end)
terrainAck.OnServerEvent:Connect(function(player, epoch, known)
	local session = bridge.sessions[player.UserId]
	if not session or session.epoch ~= epoch or type(known) ~= "table" then return end
	local count = 0
	local validated = {}
	for key, revision in pairs(known) do
		count += 1
		if count > 243 or type(key) ~= "string" or #key > 32 or not string.match(key, "^%-?%d+,%-?%d+,%-?%d+$") or type(revision) ~= "number" or revision % 1 ~= 0 or revision < 0 or revision > 4294967295 then return end
		validated[key] = revision
	end
	session.known = validated
end)
-- Shared budgets: 5 gameplay + 2 terrain calls/sec = 420/min for the entire server.
task.spawn(function()
	while true do
		local started = os.clock()
		local ok, result = pcall(bridge.exchange, bridge)
		if ok then
			for _, snapshot in ipairs(result.states) do
				for _, player in ipairs(Players:GetPlayers()) do
					local session = bridge.sessions[player.UserId]
					if session and session.id == snapshot.id then
						if snapshot.error then
							status:FireClient(player, {connected=false,text="Minecraft session ended. Reconnecting..."})
							if snapshot.status == 404 then bridge.sessions[player.UserId] = nil end
						else
							if not RunService:IsStudio() then local filtered={} for _,e in ipairs(snapshot.events or {}) do if e.kind~="chat" then table.insert(filtered,e) end end snapshot.events=filtered end
							snapshot.roundTripMs = (os.clock() - started) * 1000 state:FireClient(player, snapshot)
						end
					end
				end
			end
		else
			if not bridge.notifiedOffline then for _,player in ipairs(Players:GetPlayers()) do status:FireClient(player,{connected=false,text="Minecraft disconnected. Waiting to reconnect..."}) end bridge.notifiedOffline=true end
		end
		if ok and not result.offline and #result.states>0 and bridge.notifiedOffline then bridge.notifiedOffline=false end
		task.wait(math.max(0.2 - (os.clock() - started), 0.01))
	end
end)
task.spawn(function()
	while true do
		local started = os.clock()
		local ok, deliveries = pcall(bridge.terrain, bridge)
		if ok then
			for _, delivery in ipairs(deliveries) do
				local player = Players:GetPlayerByUserId(delivery.userId)
				if player then terrain:FireClient(player, delivery.world) end
			end
		else if os.clock()-(bridge.lastTerrainWarning or -math.huge)>5 then bridge.lastTerrainWarning=os.clock() warn("Mineblox terrain:", deliveries) end end
		task.wait(math.max(0.5 - (os.clock() - started), 0.01))
	end
end)
task.spawn(function()
	while true do
		task.wait(20)
		for _, player in ipairs(Players:GetPlayers()) do task.spawn(join, player) end
	end
end)
game:BindToClose(function()
	for _, player in ipairs(Players:GetPlayers()) do pcall(bridge.leave, bridge, player) end
end)
