local Font=require(script.Parent.Font)
local Images=require(script.Parent.Images)
local ItemVisual=require(script.Parent.ItemVisual)
local Interface={} Interface.__index=Interface
local function frame(parent,size,pos,color)
	local f=Instance.new("Frame") f.Size=size f.Position=pos f.BackgroundColor3=color or Color3.fromRGB(198,198,198) f.BorderSizePixel=2 f.BorderColor3=Color3.fromRGB(55,55,55) f.Parent=parent return f
end
local function button(parent,text,size,pos,callback)
	local b=Instance.new("TextButton") b.Size=size b.Position=pos b.BackgroundColor3=Color3.fromRGB(110,110,110) b.Text=text b.TextSize=16 b.TextColor3=Color3.new(1,1,1) b.Parent=parent Font.attach(b) b.Activated:Connect(callback) return b
end
function Interface.new(gui,send)
	local self=setmetatable({send=send,open=false,chatOpen=false,slots={},messages={},seen=0,actionSeen={},history={},historyIndex=0,snapshot=nil,displayNames=true},Interface)
	self.root=frame(gui,UDim2.fromOffset(580,400),UDim2.new(.5,-290,.5,-200)) self.root.Visible=false self.root.ZIndex=5
	self.title=Font.label(self.root,"Inventory",UDim2.fromOffset(520,24),UDim2.fromOffset(12,8)) self.title.TextColor3=Color3.fromRGB(40,40,40) self.title.TextXAlignment=Enum.TextXAlignment.Left
	self.tooltip=Font.label(gui,"",UDim2.fromOffset(400,30),UDim2.fromOffset(0,0)) self.tooltip.BackgroundTransparency=.15 self.tooltip.BackgroundColor3=Color3.fromRGB(20,0,30) self.tooltip.Visible=false self.tooltip.ZIndex=20
	self.cursor=Instance.new("ImageLabel") self.cursor.BackgroundTransparency=1 self.cursor.Size=UDim2.fromOffset(32,32) self.cursor.ResampleMode=Enum.ResamplerMode.Pixelated self.cursor.Visible=false self.cursor.ZIndex=21 self.cursor.Parent=gui
	button(self.root,"Done",UDim2.fromOffset(100,28),UDim2.new(1,-112,0,8),function()self:toggle()end)
	self.chat=frame(gui,UDim2.fromOffset(700,160),UDim2.new(0,8,1,-288),Color3.new()) self.chat.BackgroundTransparency=1 self.chat.BorderSizePixel=0
	self.lines={} for i=1,8 do local l=Font.label(self.chat,"",UDim2.fromOffset(680,20),UDim2.fromOffset(0,(i-1)*20)) l.BackgroundColor3=Color3.new() l.BackgroundTransparency=.5 l.TextXAlignment=Enum.TextXAlignment.Left l.TextSize=16 self.lines[i]=l end
	self.input=Instance.new("TextBox") self.input.Size=UDim2.fromOffset(700,28) self.input.Position=UDim2.new(0,8,1,-132) self.input.BackgroundColor3=Color3.new() self.input.BackgroundTransparency=.25 self.input.TextColor3=Color3.new(1,1,1) self.input.TextSize=16 self.input.Font=Enum.Font.Code self.input.TextXAlignment=Enum.TextXAlignment.Left self.input.ClearTextOnFocus=false self.input.Visible=false self.input.Parent=gui
	Font.attach(self.input)
	self.input.Name="MinecraftChatInput"
	self.suggestions=Font.label(gui,"",UDim2.fromOffset(650,28),UDim2.new(0,12,1,-166)) self.suggestions.TextXAlignment=Enum.TextXAlignment.Left
	self.input.FocusLost:Connect(function(enter)
		if enter and #self.input.Text>0 then
			local text=string.sub(self.input.Text,1,256) table.insert(self.history,text) if #self.history>32 then table.remove(self.history,1) end
			if string.sub(text,1,6)=="/names" then local mode=string.match(text,"^/names%s+(%w+)$") if mode=="display" or mode=="username" then self.displayNames=mode=="display" self:message("Chat names: "..mode) else self:message("Usage: /names display or /names username") end
			elseif not (self.onLocalCommand and self.onLocalCommand(text)) then self.send("chat",{text=text}) end
		end
		self.input.Text="" self.input.Visible=false self.chatOpen=false self.suggestions.Text=""
	end)
	self.death=frame(gui,UDim2.fromScale(1,1),UDim2.fromScale(0,0),Color3.fromRGB(90,0,0)) self.death.BackgroundTransparency=.4 self.death.Visible=false self.death.ZIndex=30
	Font.label(self.death,"You died!",UDim2.fromOffset(300,60),UDim2.new(.5,-150,.35,0)).TextSize=32
	button(self.death,"Respawn",UDim2.fromOffset(300,40),UDim2.new(.5,-150,.55,0),function()self.send("respawn",{})end).ZIndex=31
	return self
end
function Interface:toggle()
	self.open=not self.open self.root.Visible=self.open self.tooltip.Visible=false
	if not self.open and self.snapshot and self.snapshot.inventory then self.send("closeWindow",{window=self.snapshot.inventory.id}) end
end
function Interface:beginChat(command)
	self.chatOpen=true self.input.Visible=true self.input.Text=command and "/" or "" self.input:CaptureFocus() self.input.CursorPosition=#self.input.Text+1
end
function Interface:message(text)
	table.insert(self.messages,{text=string.sub(text,1,110),at=os.clock()}) if #self.messages>8 then table.remove(self.messages,1) end
end
function Interface:update(state)
	self.snapshot=state self.death.Visible=(state.health or 20)<=0
	for _,event in ipairs(state.events or {}) do
		if event.seq>self.seen then self.seen=event.seq if event.kind=="chat" then self:message(event.data.text) elseif event.kind=="actionRejected" then self:message(event.data.error) end end
	end
	for _,result in ipairs(state.actions or {}) do
		if self.actionSeen[result.seq]~=result.status then self.actionSeen[result.seq]=result.status
			if result.status=="rejected" then self:message(result.error) end
			if result.kind=="complete" and result.result then local names={} for _,s in ipairs(result.result.suggestions or {}) do table.insert(names,s.text) end self.suggestions.Text=table.concat(names,"  ") end
		end
	end
	local inv=state.inventory if not inv then return end
	if self.window~=inv.id then
		self.window=inv.id for _,entry in pairs(self.slots) do entry.button:Destroy() end self.slots={}
		if inv.id~=0 then self.open=true self.root.Visible=true end
	end
	self.title.Text=inv.id==0 and "Inventory" or string.gsub(inv.type,"minecraft:","")
	for index,item in ipairs(inv.slots) do
		local slot=index-1 local entry=self.slots[index]
		if not entry then
			local x,y
			if inv.id==0 then
				if slot>=9 and slot<=35 then x=(slot-9)%9 y=math.floor((slot-9)/9)+2
				elseif slot>=36 and slot<=44 then x=slot-36 y=5
				elseif slot>=5 and slot<=8 then x=slot-5 y=0
				elseif slot==45 then x=5 y=0 else x=slot%5 y=1 end
			else x=slot%9 y=math.floor(slot/9) end
			local b=button(self.root,"",UDim2.fromOffset(48,48),UDim2.fromOffset(16+x*58,44+y*54),function()
				local shift=game.UserInputService:IsKeyDown(Enum.KeyCode.LeftShift)
				self.send("click",{window=inv.id,slot=slot,button=0,mode=shift and 1 or 0})
			end)
			b.MouseButton2Click:Connect(function()self.send("click",{window=inv.id,slot=slot,button=1,mode=0})end)
			b.MouseEnter:Connect(function() self.hovered=slot self.tooltip.Visible=true end) b.MouseLeave:Connect(function()self.hovered=nil self.tooltip.Visible=false end)
			local icon=Instance.new("ImageLabel") icon.Size=UDim2.fromOffset(36,36) icon.Position=UDim2.fromOffset(6,6) icon.BackgroundTransparency=1 icon.ResampleMode=Enum.ResamplerMode.Pixelated icon.Parent=b
			local count=Font.label(b,"",UDim2.fromOffset(40,18),UDim2.fromOffset(6,30)) count.TextXAlignment=Enum.TextXAlignment.Right count.ZIndex=10
			entry={button=b,icon=icon,count=count,blockIcon=ItemVisual.icon(b,UDim2.fromOffset(40,40),UDim2.fromOffset(4,4))} self.slots[index]=entry
		end
		local valid=type(item)=="table" local image=valid and Images.item(item.name)
		local block=ItemVisual.update(entry.blockIcon,valid and item.name or nil)
		entry.icon.Visible=image~=nil and not block if image then entry.icon.ImageContent=Content.fromObject(image) end
		entry.button.Text=valid and not image and string.sub(item.name,1,6) or "" entry.count.Text=valid and item.count>1 and tostring(item.count) or ""
	end
	local image=type(inv.cursor)=="table" and Images.item(inv.cursor.name) self.cursor.Visible=self.open and image~=nil if image then self.cursor.ImageContent=Content.fromObject(image) end
end
function Interface:tick()
	local mouse=game.UserInputService:GetMouseLocation() self.tooltip.Position=UDim2.fromOffset(mouse.X+14,mouse.Y-30) self.cursor.Position=UDim2.fromOffset(mouse.X-16,mouse.Y-16)
	if self.hovered and self.snapshot and self.snapshot.inventory then local item=self.snapshot.inventory.slots[self.hovered+1] self.tooltip.Text=type(item)=="table" and (item.displayName or item.name) or "" self.tooltip.Visible=self.open and type(item)=="table" end
	local active={}
	for _,m in ipairs(self.messages) do if self.chatOpen or os.clock()-m.at<10 then table.insert(active,m) end end
	for i,l in ipairs(self.lines) do
		local m=active[i] local text=m and m.text or ""
		if self.snapshot then for _,p in ipairs(self.snapshot.roster or {}) do local prefix="<"..p.minecraftName..">" if string.sub(text,1,#prefix)==prefix then text="<"..(self.displayNames and p.displayName or p.username)..">"..string.sub(text,#prefix+1) break end end end
		l.Text=text l.Visible=m~=nil l.Position=UDim2.fromOffset(4,(8-#active+i-1)*20) l.Size=UDim2.fromOffset(math.min(696,Font.width(text,16)+8),20)
	end
	self.chat.Visible=self.chatOpen or (#self.messages>0 and os.clock()-self.messages[#self.messages].at<10)
end
return Interface
