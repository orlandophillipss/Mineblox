-- Server-only transport. The local launcher supplies a development secret;
-- published games must use Roblox's secret store instead.
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local InputLatch=require(game.ReplicatedStorage.MinebloxClient.InputLatch)
local Transport = {}
Transport.__index = Transport

function Transport.new(baseUrl, secret)
	local loopback = RunService:IsStudio() and string.match(baseUrl, "^http://127%.0%.0%.1:%d+$") ~= nil
	assert(loopback or string.sub(baseUrl, 1, 8) == "https://", "Use HTTPS; loopback HTTP is only allowed in local Studio")
	assert(type(secret) ~= "string" or RunService:IsStudio(), "Published games require a Roblox Secret")
	return setmetatable({ url = baseUrl, secret = secret, sessions = {}, busy = false, stateSeq = 0, owner = game.JobId~="" and game.JobId or HttpService:GenerateGUID(false) }, Transport)
end

function Transport:request(method, route, payload)
	if os.clock()<(self.retryAt or 0) then error("Connection unavailable; waiting to reconnect",0) end
	local ok,response = pcall(HttpService.RequestAsync,HttpService,{
		Url = self.url .. route,
		Method = method,
		Headers = { Authorization = type(self.secret) == "string" and ("Bearer " .. self.secret) or self.secret:AddPrefix("Bearer "), ["Content-Type"] = "application/json", ["X-Mineblox-Server"]=self.owner },
		Body = payload and HttpService:JSONEncode(payload) or nil,
	})
	if ok and not response.Success and (route=="/v1/terrain" or response.StatusCode<500 and response.StatusCode~=429) then
		error((route=="/v1/terrain" and "Terrain request failed" or "Request rejected").." (HTTP "..response.StatusCode..")",0)
	end
	if not ok or not response.Success then
		self.failures=math.min((self.failures or 0)+1,5) self.retryAt=os.clock()+math.min(20,2^(self.failures-1)) self.offline=true
		error("Minecraft connection unavailable"..(ok and " (HTTP "..response.StatusCode..")" or "").."; reconnecting",0)
	end
	self.failures=0 self.retryAt=0 self.offline=false
	self.httpCount=(self.httpCount or 0)+1 self.httpBytes=(self.httpBytes or 0)+#response.Body
	return HttpService:JSONDecode(response.Body)
end

function Transport:join(player)
	assert(self.sessions[player.UserId] == nil, "Player already mapped")
	local identity = player.UserId
	if RunService:IsStudio() and identity <= 0 then identity = 200000000000 + math.abs(identity) end
	local state = self:request("POST", "/v1/sessions", { version = 1, robloxId = tostring(identity),username=player.Name,displayName=player.DisplayName })
	self.sessions[player.UserId] = { id = state.id, seq = 0, sendSeq = 0, frame = nil, lastInput = 0, known = {}, epoch = state.worldEpoch, actions = {}, actionSeq = 0,latch=InputLatch.new() }
	return state
end

function Transport:setInput(player, frame)
	-- Use the engine-supplied Player from OnServerEvent, never a client user ID.
	local session = self.sessions[player.UserId]
	if not session or type(frame) ~= "table" then return false end
	for key in pairs(frame) do
		if key ~= "version" and key ~= "seq" and key ~= "controls" and key ~= "yaw" and key ~= "pitch" and key ~= "slot" and key ~= "clientTimeMs" then return false end
	end
	if frame.version ~= 1 or type(frame.seq) ~= "number" or frame.seq % 1 ~= 0 or frame.seq <= session.seq or frame.seq > 4294967295 then return false end
	if type(frame.controls) ~= "number" or frame.controls % 1 ~= 0 or frame.controls < 0 or frame.controls > 127 then return false end
	if type(frame.yaw) ~= "number" or frame.yaw ~= frame.yaw or math.abs(frame.yaw) > math.pi then return false end
	if type(frame.pitch) ~= "number" or frame.pitch ~= frame.pitch or math.abs(frame.pitch) > math.pi / 2 then return false end
	if type(frame.slot) ~= "number" or frame.slot % 1 ~= 0 or frame.slot < 0 or frame.slot > 8 then return false end
	if type(frame.clientTimeMs) ~= "number" or frame.clientTimeMs~=frame.clientTimeMs or frame.clientTimeMs<0 or frame.clientTimeMs>1e12 then return false end
	-- Copy untrusted data; keep only the latest frame for each player.
	session.seq = frame.seq
	session.latch:input(frame.controls,os.clock())
	session.frame = { version = 1, seq = frame.seq, controls = frame.controls, yaw = frame.yaw, pitch = frame.pitch, slot = frame.slot, clientTimeMs=frame.clientTimeMs }
	session.lastInput = os.clock()
	return true
end

function Transport:setAction(player, action)
	local s=self.sessions[player.UserId]
	if not s or type(action)~="table" or #s.actions>=16 then return false end
	if type(action.seq)~="number" or action.seq%1~=0 or action.seq<=s.actionSeq or action.seq>4294967295 or action.epoch~=s.epoch then return false end
	local ok,encoded=pcall(HttpService.JSONEncode,HttpService,action)
	if not ok or #encoded>1024 then return false end
	s.actionSeq=action.seq table.insert(s.actions,HttpService:JSONDecode(encoded)) return true
end

function Transport:exchange()
	if os.clock()<(self.retryAt or 0) then return {version=1,states={},offline=true} end
	assert(not self.busy, "Only one gameplay exchange may be in flight")
	local inputs = {}
	local metadata={}
	for _, session in pairs(self.sessions) do
		local frame = session.frame or { controls = 0, yaw = 0, pitch = 0 }
		session.sendSeq += 1
		local actions={} for i=1,math.min(4,#session.actions) do actions[i]=session.actions[i] end
		local controls,pulsed=session.latch:controls(os.clock()-session.lastInput<.75 and frame.controls or 0,os.clock())
		metadata[session.id]={clientSeq=frame.seq or 0,clientTimeMs=frame.clientTimeMs or 0,actions=actions,session=session,pulsed=pulsed}
		table.insert(inputs, { id = session.id, actions=#actions>0 and actions or nil, frame = { version = 1, seq = session.sendSeq, controls = controls, yaw = frame.yaw, pitch = frame.pitch, slot = frame.slot or 0 } })
	end
	if #inputs == 0 then return { version = 1, states = {} } end
	self.busy = true
	local ok, result = pcall(self.request, self, "POST", "/v1/exchange", { version = 1, inputs = inputs })
	self.busy = false
	if not ok then error(result) end
	self.stateSeq+=1
	for _,state in ipairs(result.states) do
		local m=metadata[state.id]
		if m and not state.error then
			m.session.latch:accepted(m.pulsed)
			state.observedClientSeq=m.clientSeq state.inputClientTimeMs=m.clientTimeMs state.stateSeq=self.stateSeq
			-- The bridge applies held intentions every 200 ms. Acceptance is not
			-- a physics acknowledgement; retain up to four local presentation ticks.
			state.presentationLeadTicks=4
			state.httpCount=self.httpCount state.httpBytes=self.httpBytes
			m.session.epoch=state.worldEpoch
			for _,a in ipairs(m.actions) do if m.session.actions[1] and m.session.actions[1].seq==a.seq then table.remove(m.session.actions,1) end end
		end
	end
	-- A retry can receive 409 for an input already accepted. The next newer
	-- frame recovers; do not automatically replay discrete gameplay actions.
	return result
end

function Transport:terrain()
	if self.offline then return {} end
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
		table.insert(requests, { id = s.id, known = next(s.known) and s.known or nil, epoch = s.epoch, format="state-adaptive-xzy-v2" })
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
