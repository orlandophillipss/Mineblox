local Hud = {}
Hud.__index = Hud
local Images = require(script.Parent.Images)
local Font = require(script.Parent.Font)
local ItemVisual=require(script.Parent.ItemVisual)
local function sprite(parent, image, size, position)
	if not image then return nil end
	local label = Instance.new("ImageLabel") label.BackgroundTransparency = 1 label.Size = size label.Position = position
	label.ImageContent = Content.fromObject(image) label.ResampleMode = Enum.ResamplerMode.Pixelated label.Parent = parent
	return label
end
local function frame(parent, size, position, color)
	local f = Instance.new("Frame")
	f.Size, f.Position = size, position
	f.BackgroundColor3 = color
	f.BorderSizePixel = 0
	f.Parent = parent
	return f
end
local function label(parent, text, size, position, color)
	local l = Instance.new("TextLabel")
	l.Size, l.Position = size, position
	l.BackgroundTransparency = 1
	l.Font = Enum.Font.Code
	l.TextSize = 18
	l.TextColor3 = color or Color3.new(1, 1, 1)
	l.TextStrokeTransparency = 0.3
	l.Text, l.Parent = text, parent
	return Font.attach(l)
end
function Hud.new(player)
	local gui = Instance.new("ScreenGui")
	gui.Name = "MinecraftHUD" gui.ResetOnSpawn = false gui.IgnoreGuiInset = true
	gui.Parent = player:WaitForChild("PlayerGui")
	local root = frame(gui, UDim2.fromOffset(364, 100), UDim2.new(0.5, -182, 1, -100), Color3.new())
	root.BackgroundTransparency = 1
	local slots = {}
	sprite(root, Images.gui("hotbar"), UDim2.fromOffset(364, 44), UDim2.fromOffset(0, 56))
	for i = 1, 9 do
		local slot = frame(root, UDim2.fromOffset(40, 40), UDim2.fromOffset((i - 1) * 40 + 2, 58), Color3.fromRGB(37, 37, 37))
		local stroke = Instance.new("UIStroke") stroke.Thickness = 2 stroke.Color = Color3.fromRGB(135, 135, 135) stroke.Parent = slot
		local name = label(slot, "", UDim2.fromOffset(36, 24), UDim2.fromOffset(2, 1)) name.TextSize = 10 name.TextWrapped = true
		local count = label(slot, "", UDim2.fromOffset(20, 15), UDim2.fromOffset(18, 25)) count.TextSize = 14
		local icon=Instance.new("ImageLabel") icon.BackgroundTransparency=1 icon.Size=UDim2.fromOffset(32,32) icon.Position=UDim2.fromOffset(4,4) icon.ResampleMode=Enum.ResamplerMode.Pixelated icon.Parent=slot
		count.ZIndex=3
		slots[i] = { frame = slot, stroke = stroke, name = name, count = count, icon=icon,blockIcon=ItemVisual.icon(slot,UDim2.fromOffset(36,36),UDim2.fromOffset(2,2)) }
		if Images.gui("hotbar") then slot.BackgroundTransparency = 1 stroke.Enabled = false end
	end
	local hearts, hunger = {}, {}
	local heartImages, foodImages = {}, {}
	for i = 1, 10 do
		hearts[i] = label(root, "♥", UDim2.fromOffset(18, 24), UDim2.fromOffset((i - 1) * 18, 18), Color3.fromRGB(224, 43, 43))
		hunger[i] = label(root, "◆", UDim2.fromOffset(18, 24), UDim2.fromOffset(184 + (i - 1) * 18, 18), Color3.fromRGB(170, 112, 52))
		sprite(root, Images.gui("heartEmpty"), UDim2.fromOffset(18,18),UDim2.fromOffset((i-1)*16,22))
		sprite(root, Images.gui("foodEmpty"), UDim2.fromOffset(18,18),UDim2.fromOffset(202+(i-1)*16,22))
		heartImages[i] = sprite(root, Images.gui("heartFull"), UDim2.fromOffset(18, 18), UDim2.fromOffset((i - 1) * 16, 22))
		foodImages[i] = sprite(root, Images.gui("foodFull"), UDim2.fromOffset(18, 18), UDim2.fromOffset(202 + (i - 1) * 16, 22))
		if heartImages[i] then hearts[i].Visible = false end
		if foodImages[i] then hunger[i].Visible = false end
	end
	local xpBack = frame(root, UDim2.fromOffset(364, 10), UDim2.fromOffset(0, 42), Color3.fromRGB(20, 35, 14))
	local xp = frame(xpBack, UDim2.fromScale(0, 1), UDim2.fromScale(0, 0), Color3.fromRGB(127, 205, 45))
	if sprite(xpBack, Images.gui("experienceBack"), UDim2.fromOffset(364, 10), UDim2.fromOffset(0, 0)) then
		xpBack.Size = UDim2.fromOffset(364, 10)
		xpBack.BackgroundTransparency = 1 xp.BackgroundTransparency = 1 xp.ClipsDescendants = true xp.Size = UDim2.fromScale(0, 2) xp.ZIndex = 2
		local fill = sprite(xp, Images.gui("experienceFill"), UDim2.fromOffset(364, 10), UDim2.fromOffset(0, 0)) if fill then fill.ZIndex = 2 end
	end
	local level = label(root, "", UDim2.fromOffset(60, 22), UDim2.fromOffset(152, 27), Color3.fromRGB(130, 240, 70))
	if not sprite(gui, Images.gui("crosshair"), UDim2.fromOffset(30, 30), UDim2.new(0.5, -15, 0.5, -15)) then
		frame(gui, UDim2.fromOffset(18, 2), UDim2.new(0.5, -9, 0.5, -1), Color3.new(1, 1, 1))
		frame(gui, UDim2.fromOffset(2, 18), UDim2.new(0.5, -1, 0.5, -9), Color3.new(1, 1, 1))
	end
	local selection = sprite(root, Images.gui("selection"), UDim2.fromOffset(48, 48), UDim2.fromOffset(-2, 54))
	local info = label(gui, "Connecting to Minecraft…", UDim2.fromOffset(500, 30), UDim2.fromOffset(16, 16)) info.TextXAlignment = Enum.TextXAlignment.Left info.TextSize = 14
	return setmetatable({ gui = gui, slots = slots, hearts = hearts, hunger = hunger, heartImages = heartImages, foodImages = foodImages, selection = selection, xp = xp, level = level, info = info }, Hud)
end
function Hud:select(slot)
	if self.selection then self.selection.Position = UDim2.fromOffset((slot - 1) * 40 - 2, 54) end
	for i, item in ipairs(self.slots) do item.stroke.Color = i == slot and Color3.new(1, 1, 1) or Color3.fromRGB(135, 135, 135) item.stroke.Thickness = i == slot and 3 or 2 end
end
function Hud:update(state)
	for i = 1, 10 do
		local heart = (state.health or 0) - (i - 1) * 2
		local food = (state.hunger or 0) - (10 - i) * 2
		if self.heartImages[i] then self.heartImages[i].ImageContent = Content.fromObject(Images.gui(heart >= 2 and "heartFull" or heart >= 1 and "heartHalf" or "heartEmpty")) end
		if self.foodImages[i] then self.foodImages[i].ImageContent = Content.fromObject(Images.gui(food >= 2 and "foodFull" or food >= 1 and "foodHalf" or "foodEmpty")) end
		self.hearts[i].TextColor3 = (state.health or 0) >= i * 2 and Color3.fromRGB(224, 43, 43) or Color3.fromRGB(55, 25, 25)
		self.hunger[i].TextColor3 = (state.hunger or 0) >= i * 2 and Color3.fromRGB(170, 112, 52) or Color3.fromRGB(45, 32, 22)
	end
	for i, slot in ipairs(self.slots) do
		local item = state.hotbar and state.hotbar[i]
		slot.name.Text = type(item) == "table" and string.gsub(item.name, "_", " ") or ""
		local image=type(item)=="table" and Images.item(item.name) or nil
		local block=ItemVisual.update(slot.blockIcon,type(item)=="table" and item.name or nil)
		slot.icon.Visible=image~=nil and not block slot.name.Visible=not image and not block
		if image then slot.icon.ImageContent=Content.fromObject(image) end
		slot.count.Text = type(item) == "table" and item.count > 1 and tostring(item.count) or ""
	end
	local experience = state.experience or {}
	self.xp.Size = UDim2.fromScale(experience.progress or 0, 1)
	self.level.Text = (experience.level or 0) > 0 and tostring(experience.level) or ""
	local p = state.predicted.position
	self.info.Text = string.format("Minecraft %s   %.1f / %.1f / %.1f   %.0f ms", state.dimension or "", p.x, p.y, p.z, state.roundTripMs or 0)
	local player=game.Players.LocalPlayer
	self.info.Text ..= string.format("  %.0f FPS  %d/%d regions  error %.3f",1000/math.max(player:GetAttribute("FrameMs") or 16,1),player:GetAttribute("VisiblePartitions") or 0,player:GetAttribute("CachedPartitions") or 0,player:GetAttribute("ReconciliationBlocks") or 0)
end
return Hud
