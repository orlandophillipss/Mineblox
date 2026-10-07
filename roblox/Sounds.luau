local SoundService=game:GetService("SoundService")
local Sounds={} Sounds.__index=Sounds
-- Engine-bundled substitutes until permitted Minecraft audio IDs are provided.
-- Audio cannot be embedded as EditableImage-style private pixel buffers.
local defaults={step="action_footsteps_plastic.mp3",jump="action_jump.mp3",land="action_jump_land.mp3",damage="ouch.ogg",ui="volume_slider.ogg",water="impact_water.mp3",pickup="volume_slider.ogg",breakBlock="action_footsteps_plastic.mp3",place="action_footsteps_plastic.mp3"}
function Sounds.new()
	local module=script.Parent:FindFirstChild("AudioConfig") local config=module and require(module) or {sounds={},music={}}
	local self=setmetatable({pool={},lastStep=0,lastHealth=20,eventSeq=0,actions={},enabled=true,musicEnabled=true,config=config},Sounds)
	if #config.music>0 then
		local music=Instance.new("Sound") music.Name="MinecraftMusic" music.Volume=.3 music.Parent=SoundService self.music=music self.musicIndex=0
		local function nextTrack() if not self.musicEnabled then return end self.musicIndex=self.musicIndex%#config.music+1 music.SoundId=config.music[self.musicIndex] music:Play() end music.Ended:Connect(function() task.delay(30,nextTrack) end) self.nextTrack=nextTrack nextTrack()
	end return self
end
function Sounds:setEnabled(enabled)
	self.enabled=enabled if not enabled then for _,sound in pairs(self.pool) do sound:Stop() end end
end
function Sounds:setMusic(enabled)
	self.musicEnabled=enabled if not self.music then return false end
	if enabled then if self.music.TimePosition>0 then self.music:Resume() else self.nextTrack() end else self.music:Pause() end return true
end
function Sounds:play(kind,pitch)
	if not self.enabled then return end local file=defaults[kind] local id=self.config.sounds[kind] if not file and not id then return end
	local s=self.pool[kind] if not s then s=Instance.new("Sound") s.Name="MinecraftSound_"..kind s.SoundId=id or "rbxasset://sounds/"..file s.Volume=.65 s.Parent=SoundService self.pool[kind]=s s.Loaded:Connect(function()s:SetAttribute("Loaded",true)end) end
	s.PlaybackSpeed=pitch or 1 s:Play()
end
function Sounds:update(state)
	if self.sessionId~=state.id then
		self.sessionId=state.id self.eventSeq=0 self.actions={} self.ground=nil self.lastHealth=state.health or 20
	end
	if state.health and state.health<self.lastHealth then self:play("damage") end self.lastHealth=state.health or self.lastHealth
	for _,e in ipairs(state.events or {}) do if e.seq>self.eventSeq then self.eventSeq=e.seq
		if e.kind=="sound" then local name=e.data.name if self.config.sounds[name] then self:play(name) elseif string.find(name,"water") then self:play("water") end end
		if e.kind=="pickup" and e.data.collector==state.entityId then self:play("pickup") end
	end end
	for _,a in ipairs(state.actions or {}) do if a.status=="sent" and not self.actions[a.seq] then self.actions[a.seq]=true if a.kind=="dig" then self:play("breakBlock") elseif a.kind=="place" then self:play("place") end end end
	for seq in pairs(self.actions) do if seq<(state.actions and state.actions[1] and state.actions[1].seq or 0) then self.actions[seq]=nil end end
end
function Sounds:movement(state,world)
	if not state then return end
	local v=state.velocity local speed=math.sqrt(v.x*v.x+v.z*v.z)
	if self.ground~=nil and self.ground~=state.onGround then self:play(state.onGround and "land" or "jump") end self.ground=state.onGround
	if state.onGround and speed>.04 and os.clock()-self.lastStep>math.max(.22,.45-speed) then
		self.lastStep=os.clock() local p=state.position local below=world:get(math.floor(p.x),math.floor(p.y-.01),math.floor(p.z))
		local name=below and below.name or "stone" self:play(string.find(name,"grass") and self.config.sounds.step_grass and "step_grass" or "step",(string.find(name,"wood") or string.find(name,"log")) and .75 or 1)
	end
end
return Sounds
