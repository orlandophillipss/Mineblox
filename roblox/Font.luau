local Images = require(script.Parent.Images)
local Font = {}
function Font.width(text,size)
	local data=Images.assets.font if not data then return #text*size*.6 end
	local scale=math.max(1,math.floor(size/data.height+.5)) local width=0
	for _,code in utf8.codes(text) do local g=data.glyphs[utf8.char(code)] or data.glyphs["?"] if g then width+=g.advance*scale end end return width
end
function Font.attach(label)
	local data = Images.assets.font
	local image = data and Images.get(data.image)
	if not image then return label end
	label.TextTransparency = 1 label.TextStrokeTransparency = 1
	local layer = Instance.new("Frame") layer.Name = "BitmapText" layer.BackgroundTransparency = 1 layer.Size = UDim2.fromScale(1,1) layer.Parent = label
	local pool = {}
	local function render()
		for _, sprite in ipairs(pool) do sprite.Visible = false end
		local used = 0
		local scale = math.max(1, math.floor(label.TextSize / data.height + 0.5))
		local glyphs = {} local width = 0
		local limit=utf8.offset(label.Text,513)
		for _, code in utf8.codes(limit and string.sub(label.Text,1,limit-1) or label.Text) do
			local char = utf8.char(code) local glyph = data.glyphs[char] or data.glyphs["?"]
			if glyph then table.insert(glyphs, {char=char,glyph=glyph,at=width}) width += glyph.advance * scale end
		end
		local offset = label.TextXAlignment == Enum.TextXAlignment.Center and (label.AbsoluteSize.X-width)/2 or label.TextXAlignment == Enum.TextXAlignment.Right and label.AbsoluteSize.X-width or 0
		local top = math.max(0,(label.AbsoluteSize.Y-data.height*scale)/2)
		for _, entry in ipairs(glyphs) do
			if entry.char ~= " " then for _, shadow in ipairs({true,false}) do
				used += 1
				local g = entry.glyph local sprite = pool[used]
				if not sprite then sprite = Instance.new("ImageLabel") pool[used] = sprite end
				sprite.Visible = true sprite.BackgroundTransparency=1
				sprite.ImageContent=Content.fromObject(image) sprite.ResampleMode=Enum.ResamplerMode.Pixelated
				sprite.ImageRectOffset=Vector2.new(g.x,g.y) sprite.ImageRectSize=Vector2.new(g.width,g.height)
				sprite.Size=UDim2.fromOffset(g.width*scale,g.height*scale) sprite.Position=UDim2.fromOffset(math.floor(offset+entry.at)+(shadow and scale or 0),math.floor(top)+(shadow and scale or 0))
				sprite.ImageColor3=shadow and label.TextColor3:Lerp(Color3.new(),0.75) or label.TextColor3 sprite.ZIndex=label.ZIndex+(shadow and 0 or 1) sprite.Parent=layer
			end end
		end
	end
	for _, key in ipairs({"Text","TextSize","TextColor3","AbsoluteSize","TextXAlignment"}) do label:GetPropertyChangedSignal(key):Connect(render) end
	render() return label
end
function Font.label(parent,text,size,position)
	local label=Instance.new("TextLabel") label.BackgroundTransparency=1 label.Size=size label.Position=position label.Text=text label.TextColor3=Color3.new(1,1,1) label.TextSize=16 label.Font=Enum.Font.Code label.Parent=parent
	return Font.attach(label)
end
return Font
