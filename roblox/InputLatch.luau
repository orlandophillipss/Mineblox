-- Preserve short jump taps until the next bounded HTTP exchange.
local InputLatch={} InputLatch.__index=InputLatch
function InputLatch.new() return setmetatable({jump=false,held=false,at=0},InputLatch) end
function InputLatch:input(controls,now)
	local held=bit32.band(controls,16)~=0
	if held and not self.held then self.jump=true self.at=now end self.held=held
end
function InputLatch:controls(controls,now)
	if self.jump and now-self.at<.75 then return bit32.bor(controls,16),true end
	if now-self.at>=.75 then self.jump=false end return controls,false
end
function InputLatch:accepted(pulsed) if pulsed then self.jump=false end end
return InputLatch
