local Font=require(script.Parent.Font)
local Images=require(script.Parent.Images)
local ItemVisual=require(script.Parent.ItemVisual)
local EntityVisual=require(script.Parent.EntityVisual)
local Inventory=require(script.Parent.Inventory)
local ViewportFit=require(script.Parent.ViewportFit)
local Interface={} Interface.__index=Interface
local function mousePosition()
	-- Absolute GUI coordinates and GetGuiObjectsAtPosition exclude the top bar.
	local inset=game:GetService("GuiService"):GetGuiInset()
	return game.UserInputService:GetMouseLocation()-inset
end
local function frame(parent,size,pos,color)
	local f=Instance.new("Frame") f.Size=size f.Position=pos f.BackgroundColor3=color or Color3.fromRGB(198,198,198) f.BorderSizePixel=2 f.BorderColor3=Color3.fromRGB(55,55,55) f.Parent=parent return f
end
local function button(parent,text,size,pos,callback)
	local b=Instance.new("TextButton") b.Size=size b.Position=pos b.BackgroundColor3=Color3.fromRGB(110,110,110) b.Text=text b.TextSize=16 b.TextColor3=Color3.new(1,1,1) b.Parent=parent Font.attach(b) b.Activated:Connect(callback) return b
end
function Interface.new(gui,send)
	local self=setmetatable({send=send,open=false,chatOpen=false,slots={},messages={},seen=0,actionSeen={},history={},historyIndex=0,snapshot=nil,displayNames=true},Interface)
	self.transactions=Inventory.new(send)
	self.root=frame(gui,UDim2.fromOffset(580,400),UDim2.new(.5,-290,.5,-200)) self.root.Visible=false self.root.ZIndex=5
	self.root.AnchorPoint=Vector2.new(.5,.5) self.root.Name="MinecraftInventory"
	self.scale=Instance.new("UIScale") self.scale.Parent=self.root
	self.background=Instance.new("ImageLabel") self.background.BackgroundTransparency=1 self.background.Size=UDim2.fromScale(1,1) self.background.ResampleMode=Enum.ResamplerMode.Pixelated self.background.ImageRectSize=Vector2.new(176,166) self.background.Parent=self.root self.background.ZIndex=0
	local inventoryImage=Images.gui("inventory") if inventoryImage then self.background.ImageContent=Content.fromObject(inventoryImage) end
	self.preview=Instance.new("ViewportFrame") self.preview.BackgroundTransparency=1 self.preview.Size=UDim2.fromOffset(153,210) self.preview.Position=UDim2.fromOffset(78,24) self.preview.Ambient=Color3.fromRGB(180,180,180) self.preview.LightColor=Color3.new(1,1,1) self.preview.Parent=self.root
	local previewCamera=Instance.new("Camera") previewCamera.FieldOfView=28 previewCamera.Parent=self.preview self.preview.CurrentCamera=previewCamera
	self.title=Font.label(self.root,"Inventory",UDim2.fromOffset(520,24),UDim2.fromOffset(12,8)) self.title.TextColor3=Color3.fromRGB(40,40,40) self.title.TextXAlignment=Enum.TextXAlignment.Left
	self.craftingTitle=Font.label(self.root,"Crafting",UDim2.fromOffset(220,24),UDim2.fromOffset(291,15)) self.craftingTitle.TextColor3=Color3.fromRGB(40,40,40) self.craftingTitle.TextXAlignment=Enum.TextXAlignment.Left self.craftingTitle.TextSize=24
	self.title:SetAttribute("BitmapShadow",false) self.craftingTitle:SetAttribute("BitmapShadow",false)
	self.tooltip=Font.label(gui,"",UDim2.fromOffset(40,24),UDim2.fromOffset(0,0)) self.tooltip.BackgroundTransparency=.1 self.tooltip.BackgroundColor3=Color3.fromRGB(20,0,30) self.tooltip.Visible=false self.tooltip.ZIndex=20 self.tooltip.TextXAlignment=Enum.TextXAlignment.Left
	self.cursor=Instance.new("ImageLabel") self.cursor.BackgroundTransparency=1 self.cursor.Size=UDim2.fromOffset(40,40) self.cursor.ResampleMode=Enum.ResamplerMode.Pixelated self.cursor.Visible=false self.cursor.ZIndex=21 self.cursor.Parent=gui
	self.cursorBlock=ItemVisual.icon(gui,UDim2.fromOffset(40,40),UDim2.fromOffset(0,0)) self.cursorBlock.viewport.ZIndex=21 self.cursorBlock.viewport.Visible=false
	self.cursorCount=Font.label(gui,"",UDim2.fromOffset(40,18),UDim2.fromOffset(0,0)) self.cursorCount.ZIndex=22 self.cursorCount.TextXAlignment=Enum.TextXAlignment.Right
	self.creative=frame(self.root,UDim2.new(1,-16,1,-46),UDim2.fromOffset(8,38)) self.creative.Visible=false self.creative.ZIndex=12
	self.tabs=frame(self.root,UDim2.new(1,0,0,28),UDim2.fromOffset(0,-30)) self.tabs.Name="InventoryTabs" self.tabs.BackgroundTransparency=1 self.tabs.BorderSizePixel=0 self.tabs.Visible=false
	for i,name in ipairs({"Search","Inventory"}) do button(self.tabs,name,UDim2.fromOffset(108,28),UDim2.fromOffset((i-1)*110,0),function()self.hovered=nil self.transactions:cancelDrag() self.creative.Visible=name=="Search" if self.creative.Visible then self:searchCatalog(0) end end) end
	button(self.tabs,"<",UDim2.fromOffset(32,28),UDim2.fromOffset(300,0),function()self:searchCatalog(math.max(0,(self.catalogOffset or 0)-64))end)
	button(self.tabs,">",UDim2.fromOffset(32,28),UDim2.fromOffset(334,0),function()if (self.catalogOffset or 0)+64<(self.catalogTotal or 0) then self:searchCatalog((self.catalogOffset or 0)+64) end end)
	self.page=Font.label(self.tabs,"",UDim2.fromOffset(150,26),UDim2.fromOffset(370,0)) self.page.TextSize=14
	self.search=Instance.new("TextBox") self.search.Size=UDim2.new(1,-16,0,32) self.search.Position=UDim2.fromOffset(8,6) self.search.PlaceholderText="Search Items" self.search.Text="" self.search.TextSize=14 self.search.ClearTextOnFocus=false self.search.Parent=self.creative
	self.search.FocusLost:Connect(function() if self.creative.Visible then self:searchCatalog(0) end end)
	self.browser=Instance.new("ScrollingFrame") self.browser.Size=UDim2.new(1,-16,1,-50) self.browser.Position=UDim2.fromOffset(8,42) self.browser.BackgroundTransparency=1 self.browser.ScrollBarThickness=6 self.browser.Parent=self.creative
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
	self.respawn=button(self.death,"Respawn",UDim2.fromOffset(300,40),UDim2.new(.5,-150,.55,0),function()
		self:requestRespawn()
	end) self.respawn.ZIndex=31
	game.UserInputService.InputEnded:Connect(function(input)
		if input.UserInputType==Enum.UserInputType.MouseButton1 or input.UserInputType==Enum.UserInputType.MouseButton2 then
			local slot=nil local mouse=mousePosition()
			for _,object in ipairs(game.Players.LocalPlayer.PlayerGui:GetGuiObjectsAtPosition(mouse.X,mouse.Y)) do local n=tonumber(string.match(object.Name,"^InventorySlot(%d+)$")) if n then slot=n break end end
			self.transactions:release(slot)
		end
	end)
	game.UserInputService.WindowFocusReleased:Connect(function()self.transactions:cancelDrag()end)
	game.UserInputService.InputBegan:Connect(function(input)
		if self.open and not self.creative.Visible and self.transactions.cursor and (input.UserInputType==Enum.UserInputType.MouseButton1 or input.UserInputType==Enum.UserInputType.MouseButton2) then
			local mouse=mousePosition() local at,size=self.root.AbsolutePosition,self.root.AbsoluteSize
			if mouse.X<at.X or mouse.X>at.X+size.X or mouse.Y<at.Y or mouse.Y>at.Y+size.Y then self.transactions:submit("click",{window=self.transactions.window,slot=-999,button=input.UserInputType==Enum.UserInputType.MouseButton1 and 0 or 1,mode=0}) end
		end
	end)
	return self
end
function Interface:requestRespawn()
	if not self.death.Visible or os.clock()-(self.deadAt or os.clock())<1 or self.respawning then return end
	self.respawning=true self.send("respawn",{}) self.respawn.Text="Respawning..."
end
function Interface:toggle()
	self.open=not self.open self.root.Visible=self.open self.tooltip.Visible=false
	if not self.open and self.snapshot and self.snapshot.inventory then self.transactions:close(self.snapshot.inventory.id) end
	if not self.open then self.creative.Visible=false end
	if self.open and self.snapshot and self.snapshot.gameMode=="creative" and self.snapshot.inventory.id==0 then self.creative.Visible=true self:searchCatalog(0) end
end
function Interface:searchCatalog(offset)
	self.catalogOffset=offset self.catalogRequest=self.send("catalog",{query=string.sub(self.search.Text,1,64),offset=offset})
end
function Interface:catalog(items)
	self.browser:ClearAllChildren()
	self.catalogSlots={}
	for index,item in ipairs(items) do
		local b=button(self.browser,"",UDim2.fromOffset(48,48),UDim2.fromOffset(((index-1)%9)*54,math.floor((index-1)/9)*54),function()
			self.send("creative",{name=item.name,count=item.stackSize or 1,slot=36+(self.snapshot.selectedSlot or 0)})
		end)
		local block=ItemVisual.icon(b,UDim2.fromOffset(40,40),UDim2.fromOffset(4,4))
		local icon=Instance.new("ImageLabel") icon.Size=UDim2.fromOffset(36,36) icon.Position=UDim2.fromOffset(6,6) icon.BackgroundTransparency=1 icon.ResampleMode=Enum.ResamplerMode.Pixelated icon.Parent=b icon.Visible=false
		table.insert(self.catalogSlots,{button=b,block=block,icon=icon,item=item})
		b.MouseEnter:Connect(function()self.tooltip.Text=item.displayName or item.name self.tooltip.Visible=true end) b.MouseLeave:Connect(function()self.tooltip.Visible=false end)
	end
	self.browser.CanvasSize=UDim2.fromOffset(0,math.ceil(#items/9)*54)
end
function Interface:beginChat(command)
	self.chatOpen=true self.input.Visible=true self.input.Text=command and "/" or "" self.input:CaptureFocus() self.input.CursorPosition=#self.input.Text+1
end
function Interface:message(text)
	table.insert(self.messages,{text=string.sub(text,1,110),at=os.clock()}) if #self.messages>8 then table.remove(self.messages,1) end
end
function Interface:update(state)
	self.snapshot=state
	if not self.previewModel or self.previewGeneration~=EntityVisual.generation then
		if self.previewModel then self.previewModel:Destroy() self.previewModel=nil end
		local model=EntityVisual.create({type="player",name="player",id=0,height=1.8})
		if model then
			self.previewModel=model self.previewGeneration=EntityVisual.generation model.Parent=self.preview model:PivotTo(CFrame.Angles(0,math.pi-.25,0))
			local bounds,size=model:GetBoundingBox() local center=bounds.Position
			local distance=ViewportFit.distance(size.X,size.Y,size.Z,self.preview.Size.X.Offset/self.preview.Size.Y.Offset,self.preview.CurrentCamera.FieldOfView,.86)
			self.preview.CurrentCamera.CFrame=CFrame.lookAt(center+Vector3.new(0,0,distance),center)
		end
	end
	self.transactions:update(state)
	for _,entry in ipairs(self.catalogSlots or {}) do
		local rendered=ItemVisual.update(entry.block,entry.item.name) local image=Images.item(entry.item.name)
		entry.icon.Visible=image~=nil and not rendered if image then entry.icon.ImageContent=Content.fromObject(image) end
		entry.button.Text=not rendered and not image and (ItemVisual.definition(entry.item.name) and "..." or "?") or ""
	end
	local dead=(state.health or 20)<=0
	if dead and not self.death.Visible then self.deadAt=os.clock() self.respawning=false self.respawn.Text="Respawn" self.open=false self.root.Visible=false end
	if not dead then self.deadAt=nil self.respawning=false end
	self.death.Visible=dead
	self.tabs.Visible=state.gameMode=="creative" and state.inventory and state.inventory.id==0 or false
	if not self.tabs.Visible then self.creative.Visible=false end
	for _,event in ipairs(state.events or {}) do
		if event.seq>self.seen then self.seen=event.seq if event.kind=="chat" then self:message(event.data.text) elseif event.kind=="actionRejected" then self:message(event.data.error) end end
	end
	for _,result in ipairs(state.actions or {}) do
		if self.actionSeen[result.seq]~=result.status then self.actionSeen[result.seq]=result.status
			if result.status=="rejected" then self:message(result.error) if result.kind=="respawn" then self.respawning=false self.respawn.Text="Respawn" end end
			if result.kind=="complete" and result.result then local names={} for _,s in ipairs(result.result.suggestions or {}) do table.insert(names,s.text) end self.suggestions.Text=table.concat(names,"  ") end
			if result.kind=="catalog" and result.status=="sent" and result.result and result.seq==self.catalogRequest then self.catalogTotal=result.result.total or #result.result.items self.catalogOffset=result.result.offset or 0 self.page.Text=string.format("%d / %d",math.floor(self.catalogOffset/64)+1,math.max(1,math.ceil(self.catalogTotal/64))) self:catalog(result.result.items or {}) end
		end
	end
	local inv=state.inventory if not inv then return end
	if self.window~=inv.id then
		if self.window and self.window~=0 and inv.id==0 then self.open=false self.root.Visible=false end
		self.window=inv.id for _,entry in pairs(self.slots) do entry.button:Destroy() end self.slots={} self.hovered=nil
		if inv.id~=0 then self.open=true self.root.Visible=true end
	end
	local crafting=inv.type=="minecraft:crafting"
	local vanilla=inv.id==0 or crafting
	local backgroundImage=Images.gui(crafting and "crafting" or "inventory")
	if backgroundImage then self.background.ImageContent=Content.fromObject(backgroundImage) end
	self.title.Text=vanilla and "Inventory" or inv.title or string.gsub(inv.type,"minecraft:","")
	self.title.TextSize=vanilla and 24 or 16 self.title.Position=vanilla and UDim2.fromOffset(24,216) or UDim2.fromOffset(12,8)
	-- The personal inventory only labels Crafting. An Inventory label here
	-- overlaps the character plate; container/crafting-table windows keep it.
	self.background.Visible=vanilla and backgroundImage~=nil self.preview.Visible=inv.id==0 self.craftingTitle.Visible=vanilla self.title.Visible=inv.id~=0
	self.craftingTitle.Position=crafting and UDim2.fromOffset(84,18) or UDim2.fromOffset(291,18)
	self.root.BackgroundTransparency=self.background.Visible and 1 or 0
	local rows=math.ceil((inv.inventoryStart or 0)/9)
	local height=vanilla and 498 or 60+(rows+4)*54+12 local width=vanilla and 528 or 580
	self.root.Size=UDim2.fromOffset(width,height) self.root.Position=UDim2.fromScale(.5,.5)
	for index,item in ipairs(inv.slots) do
		local slot=index-1 local entry=self.slots[index]
		if not entry then
			local x,y
			if inv.id==0 then
				if slot>=9 and slot<=35 then x=24+(slot-9)%9*54 y=252+math.floor((slot-9)/9)*54
				elseif slot>=36 and slot<=44 then x=24+(slot-36)*54 y=426
				elseif slot>=5 and slot<=8 then x=24 y=24+(slot-5)*54
				elseif slot==45 then x=231 y=186
				elseif slot==0 then x=462 y=84
				else x=294+(slot-1)%2*54 y=54+math.floor((slot-1)/2)*54 end
			elseif crafting then
				if slot==0 then x=372 y=105
				elseif slot<=9 then x=90+(slot-1)%3*54 y=51+math.floor((slot-1)/3)*54
				elseif slot<37 then x=24+(slot-10)%9*54 y=252+math.floor((slot-10)/9)*54
				else x=24+(slot-37)*54 y=426 end
			else
				local start=inv.inventoryStart or 0
				if slot<start then x=16+slot%9*58 y=44+math.floor(slot/9)*54
				else local offset=slot-start x=16+offset%9*58 y=60+(rows+math.floor(offset/9))*54+(offset>=27 and 10 or 0) end
			end
			local b=button(self.root,"",UDim2.fromOffset(48,48),UDim2.fromOffset(x,y),function()end)
			b.MouseButton1Down:Connect(function()self.transactions:press(slot,0,game.UserInputService:IsKeyDown(Enum.KeyCode.LeftShift) and 1 or 0)end)
			b.MouseButton2Down:Connect(function()self.transactions:press(slot,1,0)end)
			b.Name="InventorySlot"..slot
			b.BackgroundTransparency=self.background.Visible and 1 or 0 b.BorderSizePixel=self.background.Visible and 0 or 2
			b.MouseEnter:Connect(function() self.hovered=slot self.transactions:visit(slot) self.tooltip.Visible=true end) b.MouseLeave:Connect(function()self.hovered=nil self.tooltip.Visible=false end)
			local icon=Instance.new("ImageLabel") icon.Size=UDim2.fromOffset(36,36) icon.Position=UDim2.fromOffset(6,6) icon.BackgroundTransparency=1 icon.ResampleMode=Enum.ResamplerMode.Pixelated icon.Parent=b
			local count=Font.label(b,"",UDim2.fromOffset(40,18),UDim2.fromOffset(6,30)) count.TextXAlignment=Enum.TextXAlignment.Right count.ZIndex=10
			entry={button=b,icon=icon,count=count,blockIcon=ItemVisual.icon(b,UDim2.fromOffset(40,40),UDim2.fromOffset(4,4))} self.slots[index]=entry
		end
		local valid=type(item)=="table" local image=valid and Images.item(item.name)
		local block=ItemVisual.update(entry.blockIcon,valid and item.name or nil)
		entry.icon.Visible=image~=nil and not block if image then entry.icon.ImageContent=Content.fromObject(image) end
		entry.button.Text=valid and not image and not block and string.sub(item.name,1,6) or "" entry.count.Text=valid and item.count>1 and tostring(item.count) or ""
	end
	local valid=type(inv.cursor)=="table"
	local image=valid and Images.item(inv.cursor.name) local block=ItemVisual.update(self.cursorBlock,valid and inv.cursor.name or nil)
	self.cursorBlock.viewport.Visible=self.open and block self.cursor.Visible=self.open and image~=nil and not block
	if image then self.cursor.ImageContent=Content.fromObject(image) end
	self.cursorCount.Text=self.open and valid and inv.cursor.count>1 and tostring(inv.cursor.count) or ""
end
function Interface:tick()
	local viewport=workspace.CurrentCamera.ViewportSize self.scale.Scale=math.min(1,viewport.X/(self.root.Size.X.Offset+32),viewport.Y/(self.root.Size.Y.Offset+72))
	local mouse=mousePosition() self.tooltip.Position=UDim2.fromOffset(mouse.X+14,mouse.Y-30) self.cursor.Position=UDim2.fromOffset(mouse.X-20,mouse.Y-20)
	self.cursorBlock.viewport.Position=self.cursor.Position self.cursorCount.Position=UDim2.fromOffset(mouse.X-20,mouse.Y+4)
	if not self.open then self.cursor.Visible=false self.cursorBlock.viewport.Visible=false self.cursorCount.Text="" end
	self.respawn.Active=not self.respawning and os.clock()-(self.deadAt or os.clock())>=1
	if self.hovered and not self.creative.Visible and self.snapshot and self.snapshot.inventory then local item=self.snapshot.inventory.slots[self.hovered+1] self.tooltip.Text=type(item)=="table" and (item.displayName or item.name) or "" self.tooltip.Visible=self.open and type(item)=="table" end
	local width=Font.width(self.tooltip.Text,16)+12 self.tooltip.Size=UDim2.fromOffset(width,24) self.tooltip.Position=UDim2.fromOffset(math.min(mouse.X+14,viewport.X-width-4),math.max(4,mouse.Y-30))
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
