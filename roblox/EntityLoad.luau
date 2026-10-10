-- Serial, generation-scoped template work. A denied allocation can recover;
-- frequent state packets cannot turn it into an allocation/warning storm.
local EntityLoad={} EntityLoad.__index=EntityLoad
function EntityLoad.new() return setmetatable({generation=0,active=nil,failures={}},EntityLoad) end
function EntityLoad:start(name,now)
	local failure=self.failures[name]
	if self.active or failure and now<failure.untilTime then return nil end
	local ticket={name=name,generation=self.generation} self.active=ticket return ticket
end
function EntityLoad:finish(ticket,now,failed)
	if self.active~=ticket or ticket.generation~=self.generation then return false end
	self.active=nil
	if failed then local attempts=(self.failures[ticket.name] and self.failures[ticket.name].attempts or 0)+1 self.failures[ticket.name]={attempts=attempts,untilTime=now+math.min(60,5*2^math.min(attempts-1,4))}
	else self.failures[ticket.name]=nil end
	return true
end
function EntityLoad:reset() self.generation+=1 self.active=nil self.failures={} end
return EntityLoad
