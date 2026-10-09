-- Serial input transactions and cursor presentation. Minecraft owns all stacks.
local Inventory={} Inventory.__index=Inventory
function Inventory.new(send) return setmetatable({send=send,queue={},state="EMPTY",window=nil,cursor=nil,active=nil,drag=nil},Inventory) end
function Inventory:submit(kind,data)
	if #self.queue>=12 then return false end
	table.insert(self.queue,{kind=kind,data=table.clone(data)}) self:pump() return true
end
function Inventory:pump()
	if self.active then return end
	local request=table.remove(self.queue,1) if not request then return end
	local seq=self.send(request.kind,request.data) if seq then self.active={seq=seq,kind=request.kind} end
end
function Inventory:update(snapshot)
	local inv=snapshot.inventory if not inv then return end
	if self.session and self.session~=snapshot.id or self.epoch and self.epoch~=snapshot.worldEpoch then self.queue={} self.active=nil self.drag=nil self.lastPress=nil end
	self.session=snapshot.id self.epoch=snapshot.worldEpoch
	if self.window~=nil and self.window~=inv.id then self.queue={} self.active=nil self.drag=nil self.lastPress=nil end
	self.window=inv.id self.cursor=type(inv.cursor)=="table" and inv.cursor or nil
	if self.active then for _,result in ipairs(snapshot.actions or {}) do if result.seq==self.active.seq and result.status~="pending" then self.active=nil break end end end
	self.state=self.drag and "DRAGGING_STACK" or self.cursor and "HOLDING_STACK" or "EMPTY"
	self:pump()
end
function Inventory:cancelDrag() self.drag=nil self.state=self.cursor and "HOLDING_STACK" or "EMPTY" end
function Inventory:close(window)
	self:cancelDrag() self.state="RETURNING_ITEM" self:submit("closeWindow",{window=window})
end
function Inventory:press(slot,button,mode)
	local now=os.clock()
	if button==0 and mode==0 and self.lastPress and self.lastPress.button==0 and self.lastPress.mode==0 and self.lastPress.slot==slot and now-self.lastPress.at<.25 then mode=6 end
	self.lastPress={slot=slot,at=now,button=button,mode=mode}
	self.drag={source=slot,button=button,mode=mode,window=self.window,holding=self.cursor~=nil and mode==0,slots={slot}}
	if self.drag.holding then self.state="DRAGGING_STACK" return true end
	return self:submit("click",{window=self.window,slot=slot,button=button,mode=mode})
end
function Inventory:visit(slot)
	local drag=self.drag
	if drag and drag.holding and #drag.slots<54 and not table.find(drag.slots,slot) then table.insert(drag.slots,slot) self.state="DISTRIBUTING_STACK" end
end
function Inventory:release(slot)
	local drag=self.drag self:cancelDrag()
	if drag and drag.holding then
		if slot and not table.find(drag.slots,slot) then table.insert(drag.slots,slot) end
		if not slot then self:submit("click",{window=drag.window,slot=-999,button=drag.button,mode=0})
		elseif #drag.slots>1 then self:submit("distribute",{window=drag.window,slots=drag.slots,button=drag.button})
		else self:submit("click",{window=drag.window,slot=slot,button=drag.button,mode=0}) end return
	end
	if drag and drag.mode==0 and slot and slot~=drag.source then self:submit("click",{window=drag.window,slot=slot,button=drag.button,mode=0}) end
end
return Inventory
