-- Server-only transport. The local launcher supplies a development secret;
-- published games must use Roblox's secret store instead.
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local Transport = {}
Transport.__index = Transport

function Transport.new(baseUrl, secret)
	local loopback = RunService:IsStudio() and string.match(baseUrl, "^http://127%.0%.0%.1:%d+$") ~= nil
	assert(loopback or string.sub(baseUrl, 1, 8) == "https://", "Use HTTPS; loopback HTTP is only allowed in local Studio")
	assert(type(secret) ~= "string" or RunService:IsStudio(), "Published games require a Roblox Secret")
	return setmetatable({ url = baseUrl, secret = secret, sessions = {}, busy = false }, Transport)
end

function Transport:request(method, route, payload)
	local response = HttpService:RequestAsync({
		Url = self.url .. route,
		Method = method,
		Headers = { Authorization = type(self.secret) == "string" and ("Bearer " .. self.secret) or self.secret:AddPrefix("Bearer "), ["Content-Type"] = "application/json" },
		Body = payload and HttpService:JSONEncode(payload) or nil,
	})
	assert(response.Success, "Bridge HTTP " .. tostring(response.StatusCode))
	return HttpService:JSONDecode(response.Body)
end

function Transport:join(player)
	assert(self.sessions[player.UserId] == nil, "Player already mapped")
	local identity = player.UserId
	if RunService:IsStudio() and identity <= 0 then identity = 200000000000 + math.abs(identity) end
	local state = self:request("POST", "/v1/sessions", { version = 1, robloxId = tostring(identity) })
	self.sessions[player.UserId] = { id = state.id, seq = 0, sendSeq = 0, frame = nil, lastInput = 0, known = {}, epoch = 0 }
	return state
end

function Transport:setInput(player, frame)
	-- Use the engine-supplied Player from OnServerEvent, never a client user ID.
	local session = self.sessions[player.UserId]
	if not session or type(frame) ~= "table" then return false end
	for key in pairs(frame) do
		if key ~= "version" and key ~= "seq" and key ~= "controls" and key ~= "yaw" and key ~= "pitch" and key ~= "slot" then return false end
	end
	if frame.version ~= 1 or type(frame.seq) ~= "number" or frame.seq % 1 ~= 0 or frame.seq <= session.seq or frame.seq > 4294967295 then return false end
	if type(frame.controls) ~= "number" or frame.controls % 1 ~= 0 or frame.controls < 0 or frame.controls > 127 then return false end
	if type(frame.yaw) ~= "number" or frame.yaw ~= frame.yaw or math.abs(frame.yaw) > math.pi then return false end
	if type(frame.pitch) ~= "number" or frame.pitch ~= frame.pitch or math.abs(frame.pitch) > math.pi / 2 then return false end
	if type(frame.slot) ~= "number" or frame.slot % 1 ~= 0 or frame.slot < 0 or frame.slot > 8 then return false end
	-- Copy untrusted data; keep only the latest frame for each player.
	session.seq = frame.seq
	session.frame = { version = 1, seq = frame.seq, controls = frame.controls, yaw = frame.yaw, pitch = frame.pitch, slot = frame.slot }
	session.lastInput = os.clock()
	return true
end

function Transport:exchange()
	assert(not self.busy, "Only one gameplay exchange may be in flight")
	local inputs = {}
	for _, session in pairs(self.sessions) do
		local frame = session.frame or { controls = 0, yaw = 0, pitch = 0 }
		session.sendSeq += 1
		table.insert(inputs, { id = session.id, frame = { version = 1, seq = session.sendSeq, controls = os.clock() - session.lastInput < 0.75 and frame.controls or 0, yaw = frame.yaw, pitch = frame.pitch, slot = frame.slot or 0 } })
	end
	if #inputs == 0 then return { version = 1, states = {} } end
	self.busy = true
	local ok, result = pcall(self.request, self, "POST", "/v1/exchange", { version = 1, inputs = inputs })
	self.busy = false
	if not ok then error(result) end
	-- A retry can receive 409 for an input already accepted. The next newer
	-- frame recovers; do not automatically replay discrete gameplay actions.
	return result
end

function Transport:terrain()
	local requests = {}
	local selected = {}
	local users = {}
	for userId in pairs(self.sessions) do table.insert(users, userId) end
	table.sort(users)
	self.cursor = self.cursor or 1
	for _ = 1, math.min(4, #users) do
		if self.cursor > #users then self.cursor = 1 end
		local userId = users[self.cursor]
		self.cursor += 1
		local s = self.sessions[userId]
		table.insert(requests, { id = s.id, known = next(s.known) and s.known or nil, epoch = s.epoch })
		selected[s.id] = { userId = userId, session = s }
	end
	if #requests == 0 then return {} end
	local result = self:request("POST", "/v1/terrain", { version = 1, players = requests })
	local deliveries = {}
	for _, world in ipairs(result.worlds) do
		local entry = selected[world.id]
		if entry then
			local s = entry.session
			if s.epoch ~= world.epoch then s.known = {} end
			s.epoch = world.epoch
			local active = {}
			for _, key in ipairs(world.active) do active[key] = true end
			for key in pairs(s.known) do if not active[key] then s.known[key] = nil end end
			table.insert(deliveries, { userId = entry.userId, world = world })
		end
	end
	return deliveries
end

function Transport:leave(player)
	local session = self.sessions[player.UserId]
	if not session then return end
	self.sessions[player.UserId] = nil
	return self:request("DELETE", "/v1/sessions/" .. session.id)
end

return Transport
