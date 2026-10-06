-- Experimental server-only transport. Install as a ModuleScript in
-- ServerScriptService. This is not a complete Roblox client/renderer.
-- secret must be a Roblox Secret with AddPrefix, obtained by the server.
local HttpService = game:GetService("HttpService")
local Transport = {}
Transport.__index = Transport

function Transport.new(baseUrl, secret)
	assert(string.sub(baseUrl, 1, 8) == "https://", "Use an authenticated HTTPS gateway")
	return setmetatable({ url = baseUrl, secret = secret, sessions = {}, busy = false }, Transport)
end

function Transport:request(method, route, payload)
	local response = HttpService:RequestAsync({
		Url = self.url .. route,
		Method = method,
		Headers = { Authorization = self.secret:AddPrefix("Bearer "), ["Content-Type"] = "application/json" },
		Body = payload and HttpService:JSONEncode(payload) or nil,
	})
	assert(response.Success, "Bridge HTTP " .. tostring(response.StatusCode))
	return HttpService:JSONDecode(response.Body)
end

function Transport:join(player)
	assert(self.sessions[player.UserId] == nil, "Player already mapped")
	local state = self:request("POST", "/v1/sessions", { version = 1, robloxId = tostring(player.UserId) })
	self.sessions[player.UserId] = { id = state.id, seq = 0, frame = nil }
	return state
end

function Transport:setInput(player, frame)
	-- Use the engine-supplied Player from OnServerEvent, never a client user ID.
	local session = self.sessions[player.UserId]
	if not session or type(frame) ~= "table" then return false end
	for key in pairs(frame) do
		if key ~= "version" and key ~= "seq" and key ~= "controls" and key ~= "yaw" and key ~= "pitch" then return false end
	end
	if frame.version ~= 1 or type(frame.seq) ~= "number" or frame.seq % 1 ~= 0 or frame.seq <= session.seq or frame.seq > 4294967295 then return false end
	if type(frame.controls) ~= "number" or frame.controls % 1 ~= 0 or frame.controls < 0 or frame.controls > 127 then return false end
	if type(frame.yaw) ~= "number" or frame.yaw ~= frame.yaw or math.abs(frame.yaw) > math.pi then return false end
	if type(frame.pitch) ~= "number" or frame.pitch ~= frame.pitch or math.abs(frame.pitch) > math.pi / 2 then return false end
	-- Copy untrusted data; keep only the latest frame for each player.
	session.seq = frame.seq
	session.frame = { version = 1, seq = frame.seq, controls = frame.controls, yaw = frame.yaw, pitch = frame.pitch }
	return true
end

function Transport:exchange()
	assert(not self.busy, "Only one gameplay exchange may be in flight")
	local inputs = {}
	for _, session in pairs(self.sessions) do
		if session.frame then table.insert(inputs, { id = session.id, frame = session.frame }) end
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

function Transport:leave(player)
	local session = self.sessions[player.UserId]
	if not session then return end
	self.sessions[player.UserId] = nil
	return self:request("DELETE", "/v1/sessions/" .. session.id)
end

return Transport
