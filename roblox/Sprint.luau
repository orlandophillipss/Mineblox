local Sprint={} Sprint.__index=Sprint
function Sprint.new() return setmetatable({lastPress=-math.huge,latched=false},Sprint) end
function Sprint:press(now)
	if now-self.lastPress<=.35 then self.latched=true end
	self.lastPress=now
end
function Sprint:update(forward,control,sneak,hunger)
	if not forward or sneak or (hunger or 20)<=6 then self.latched=false return false end
	return control or self.latched
end
return Sprint
