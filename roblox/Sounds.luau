local SoundService=game:GetService("SoundService")
local Sounds={} Sounds.__index=Sounds
-- Only configured, permitted recordings. Missing effects stay silent rather
-- than using unrelated Roblox plastic/jump/slider noises for Minecraft events.
function Sounds.new()
	local module=script.Parent:FindFirstChild("AudioConfig") local config=module and require(module) or {sounds={},music={}}
	local self=setmetatable({pool={},lastStep=0,stepDistance=0,lastHealth=20,eventSeq=0,actions={},enabled=true,musicEnabled=true,config=config},Sounds)
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
function Sounds:play(kind,pitch,volume,position)
	if not self.enabled then return end local id=self.config.sounds[kind] if not id then return end
	local s=self.pool[kind]
	if not s then
		s=Instance.new("Sound") s.Name="MinecraftSound_"..kind s.SoundId=id s.Parent=SoundService self.pool[kind]=s
		s.RollOffMinDistance=12 s.RollOffMaxDistance=192
		s.Loaded:Connect(function()s:SetAttribute("Loaded",true)end)
	end
	if position then
		local emitter=s:FindFirstChild("EmitterReference")
		if not emitter then
			local part=Instance.new("Part") part.Name="MinecraftSoundEmitter" part.Size=Vector3.one part.Anchored=true part.Transparency=1 part.CanCollide=false part.CanTouch=false part.CanQuery=false part.Parent=workspace
			emitter=Instance.new("ObjectValue") emitter.Name="EmitterReference" emitter.Value=part emitter.Parent=s
		end
		emitter.Value.Position=Vector3.new(position.x,position.y,position.z)*4 s.Parent=emitter.Value
	else s.Parent=SoundService end
	s.Volume=math.clamp(volume or .25,0,1) s.PlaybackSpeed=math.clamp(pitch or 1,.25,4) s:Play()
end
function Sounds:update(state)
	if self.sessionId~=state.id or self.epoch~=state.worldEpoch then
		self.sessionId=state.id self.epoch=state.worldEpoch self.eventSeq=0 self.actions={} self.lastPosition=nil self.stepDistance=0 self.lastHealth=state.health or 20
	end
	if state.health and state.health<self.lastHealth then self:play("damage",1,.35) end self.lastHealth=state.health or self.lastHealth
	for _,e in ipairs(state.events or {}) do if e.seq>self.eventSeq then self.eventSeq=e.seq
		if e.kind=="sound" and self.config.sounds[e.data.name] then self:play(e.data.name,e.data.pitch,(e.data.volume or 1)*.3,e.data.position) end
		if e.kind=="pickup" and e.data.collector==state.entityId then self:play("pickup",1,.2) end
	end end
	for _,a in ipairs(state.actions or {}) do if a.status=="sent" and not self.actions[a.seq] then
		self.actions[a.seq]=true if a.kind=="dig" then self:play("breakBlock",1,.25) elseif a.kind=="place" then self:play("place",1,.25) elseif a.kind=="click" then self:play("ui",1,.12) end
	end end
	for seq in pairs(self.actions) do if seq<(state.actions and state.actions[1] and state.actions[1].seq or 0) then self.actions[seq]=nil end end
end
function Sounds:movement(state,world)
	if not state then return end local p=state.position
	if self.lastPosition and state.onGround and not state.liquid then
		local distance=math.sqrt((p.x-self.lastPosition.x)^2+(p.z-self.lastPosition.z)^2)
		if distance<.5 then self.stepDistance+=distance end
		if self.stepDistance>=1.3 and os.clock()-self.lastStep>.15 then
			self.stepDistance%=1.3 self.lastStep=os.clock()
			local below=world:get(math.floor(p.x),math.floor(p.y-.01),math.floor(p.z)) local name=below and below.name or "stone"
			local material=string.find(name,"grass") and "grass" or (string.find(name,"wood") or string.find(name,"log") or string.find(name,"planks")) and "wood" or "stone"
			self:play(self.config.sounds["step_"..material] and "step_"..material or "step",.95+math.random()*.1,.18)
		end
	else self.stepDistance=0 end
	self.lastPosition={x=p.x,y=p.y,z=p.z}
end
return Sounds
