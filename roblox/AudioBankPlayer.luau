local RunService=game:GetService("RunService")
local Rules=require(script.Parent.AudioBankRules)
local Player={} Player.__index=Player
function Player.new(config)
	local self=setmetatable({config=config,pool={},volumes={},muted={},enabled=true,played=0,dropped=0},Player)
	for _,category in ipairs({"blocks","players","ambient","weather","hostile","friendly","music","records","voice"}) do self.volumes[category]=1 end
	if not config or not next(config.banks) then return self end
	self.root=Instance.new("Folder") self.root.Name="MinecraftAudioBanks" self.root.Parent=workspace
	self.output=Instance.new("AudioDeviceOutput") self.output.Parent=self.root
	self.listener=Instance.new("AudioListener") self.listener.Parent=workspace.CurrentCamera
	local wire=Instance.new("Wire") wire.SourceInstance=self.listener wire.TargetInstance=self.output wire.Parent=self.root
	local warm={} for key,b in pairs(config.banks) do if type(b.assetId)=="string" then table.insert(warm,{key=key,bank=b}) end end
	table.sort(warm,function(a,b)return tonumber(a.key)<tonumber(b.key)end)
	for i=1,16 do
		local audio=Instance.new("AudioPlayer") audio.Name="BankVoice"..i audio.AutoLoad=true audio.AutoPlay=false audio.Looping=false audio.Parent=self.root
		local part=Instance.new("Part") part.Name="AudioEmitterPosition" part.Size=Vector3.one part.Transparency=1 part.Anchored=true part.CanCollide=false part.CanTouch=false part.CanQuery=false part.Parent=self.root
		local emitter=Instance.new("AudioEmitter") emitter.Parent=part
		local route=Instance.new("Wire") route.SourceInstance=audio route.TargetInstance=self.output route.Parent=self.root
		local entry={player=audio,part=part,emitter=emitter,wire=route}
		-- Warm a small, fixed number of frequent banks; do not download all music.
		if i<=4 and #warm>0 then local b=warm[(i-1)%math.min(2,#warm)+1] entry.bank=b.key audio.Asset=b.bank.assetId end
		table.insert(self.pool,entry)
	end
	self.connection=RunService.Heartbeat:Connect(function()self:tick()end)
	return self
end
function Player:setVolume(category,value)
	if self.volumes[category]==nil then return false end self.volumes[category]=math.clamp(value,0,1)
	for _,e in ipairs(self.pool) do if e.busy and e.category==category then e.player.Volume=e.volume*self.volumes[category] end end return true
end
function Player:stop()
	for _,e in ipairs(self.pool) do e.player:Stop() e.busy=false end
end
function Player:destroy()
	self:stop() if self.connection then self.connection:Disconnect() end if self.listener then self.listener:Destroy() end if self.root then self.root:Destroy() end self.pool={}
end
function Player:tick()
	local now=os.clock()
	for _,e in ipairs(self.pool) do if e.busy then Rules.speedChanged(now,e,e.player.TimePosition,e.player.PlaybackSpeed) if Rules.expired(now,e,e.player.TimePosition,e.player.IsReady,e.player.IsPlaying) then e.player:Stop() e.busy=false end end end
end
function Player:play(name,pitch,volume,position)
	if not self.enabled or not self.config then return false end
	local event=self.config.events[name] or self.config.events["minecraft:"..name] if not event then return false end
	if self.muted[event.category] or self.volumes[event.category]==0 then return true end
	local variant=Rules.select(event,math.random()) if not variant then return false end
	local sample=self.config.samples[variant.sample] local bank=sample and self.config.banks[tostring(sample.bank)]
	if not bank or type(bank.assetId)~="string" then return false end
	local selected
	for _,e in ipairs(self.pool) do if not e.busy and e.bank==tostring(sample.bank) and e.player.IsReady then selected=e break end end
	if not selected then
		for _,e in ipairs(self.pool) do if not e.busy and e.bank~=tostring(sample.bank) then e.bank=tostring(sample.bank) e.player.Asset=bank.assetId break end end
		self.dropped+=1 return false -- Cold/overloaded events use the individual fallback.
	end
	local audio=selected.player local speed=math.clamp((pitch or 1)*variant.pitch,.25,4)
	if audio.TimeLength<sample["end"]-.02 then self.dropped+=1 return false end
	audio:Stop() audio.Looping=false audio.PlaybackRegion=NumberRange.new(sample.start,sample["end"]) audio.TimePosition=sample.start audio.PlaybackSpeed=speed
	selected.category=event.category selected.volume=math.clamp((volume or 1)*variant.volume,0,3)
	audio.Volume=selected.volume*(self.volumes[event.category] or 1)
	if position then
		selected.part.Position=Vector3.new(position.x,position.y,position.z)*4
		local distance=math.clamp(variant.attenuationDistance or 16,1,256)*4
		selected.emitter:SetDistanceAttenuation({[0]=1,[distance]=0}) selected.wire.TargetInstance=selected.emitter
	else selected.wire.TargetInstance=self.output end
	selected.busy=true selected.finish=sample["end"] selected.speed=speed selected.deadline=os.clock()+sample.duration/speed+.05
	audio:Play() self.played+=1 return true
end
return Player
