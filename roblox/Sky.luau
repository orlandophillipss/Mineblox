local Lighting=game:GetService("Lighting")
local AssetService=game:GetService("AssetService")
local Images=require(script.Parent.Images)
local SkyAssets=require(script.Parent.SkyAssets)
local Sky={} Sky.__index=Sky
local function panel(parent,name,size)
	local part=Instance.new("Part") part.Name=name part.Size=size part.Anchored=true part.Transparency=1 part.CanCollide=false part.CanTouch=false part.CanQuery=false part.CastShadow=false part.Parent=parent
	local surface=Instance.new("SurfaceGui") surface.Face=Enum.NormalId.Front surface.CanvasSize=Vector2.new(64,64) surface.LightInfluence=0 surface.AlwaysOnTop=false surface.Parent=part
	local image=Instance.new("ImageLabel") image.Size=UDim2.fromScale(1,1) image.BackgroundTransparency=1 image.ResampleMode=Enum.ResamplerMode.Pixelated image.Parent=surface
	return part,image
end
local function cubemap(sky,assets)
	for _,face in ipairs({"Bk","Ft","Lf","Rt"}) do sky["Skybox"..face]=assets.side end
	sky.SkyboxUp=assets.top sky.SkyboxDn=assets.bottom
end
function Sky.new()
	for _,parent in ipairs({Lighting,workspace.CurrentCamera}) do for _,v in ipairs(parent:GetChildren()) do if v:IsA("PostEffect") then v.Enabled=false end end end
	Lighting.GlobalShadows=false Lighting.EnvironmentDiffuseScale=0 Lighting.EnvironmentSpecularScale=0 Lighting.ExposureCompensation=0
	for _,v in ipairs(Lighting:GetChildren()) do if v:IsA("Sky") or v:IsA("Atmosphere") then v:Destroy() end end
	local terrain=workspace:FindFirstChildOfClass("Terrain") if terrain then local clouds=terrain:FindFirstChildOfClass("Clouds") if clouds then clouds:Destroy() end end
	local sky=Instance.new("Sky") sky.Name="MinecraftSky" sky.CelestialBodiesShown=false sky.StarCount=0
	local self=setmetatable({sky=sky,time=6000,day=0,at=os.clock(),updated=0,night=false},Sky)
	cubemap(sky,SkyAssets.day)
	local folder=Instance.new("Folder") folder.Name="MinecraftAtmosphere" folder.Parent=workspace self.folder=folder
	local sun=Images.gui("sun") if sun then sky.SunTextureContent=Content.fromObject(sun) else sky.SunTextureId="" end
	if sun then self.sun,self.sunLabel=panel(folder,"Sun",Vector3.new(8,8,.01)) self.sunLabel.ImageContent=Content.fromObject(sun) end
	local moon=Images.gui("moon")
	if moon then
		local size=Vector2.new(moon.Size.X/4,moon.Size.Y/2)
		self.moonSource=moon self.moonSize=size self.moon=AssetService:CreateEditableImage({Size=size})
		if self.moon then self.moon:WritePixelsBuffer(Vector2.zero,size,moon:ReadPixelsBuffer(Vector2.zero,size)) sky.MoonTextureContent=Content.fromObject(self.moon) self.moonPart,self.moonLabel=panel(folder,"Moon",Vector3.new(6,6,.01)) self.moonLabel.ImageContent=Content.fromObject(self.moon) end
	else sky.MoonTextureId="" end
	sky.Parent=Lighting
	local cloudImage=Images.gui("clouds")
	if cloudImage then
		local ok,err=pcall(function()
			local mesh=AssetService:CreateEditableMesh() assert(mesh,"Cloud mesh unavailable")
			local ids,uvs={},{} self.cloudUV={}
			for i,p in ipairs({{-1024,-1024},{1024,-1024},{1024,1024},{-1024,1024}}) do ids[i]=mesh:AddVertex(Vector3.new(p[1],0,p[2])) uvs[i]=mesh:AddUV(Vector2.new(p[1]/12288,p[2]/12288)) end
			for _,t in ipairs({{1,2,3},{1,3,4}}) do local f=mesh:AddTriangle(ids[t[1]],ids[t[2]],ids[t[3]]) mesh:SetFaceUVs(f,{uvs[t[1]],uvs[t[2]],uvs[t[3]]}) end
			self.cloudMesh=AssetService:CreateEditableMeshAsync(Content.fromObject(mesh),{FixedSize=true}) mesh:Destroy() assert(self.cloudMesh,"Cloud fixed mesh unavailable")
			local part=AssetService:CreateMeshPartAsync(Content.fromObject(self.cloudMesh)) part.Name="MinecraftCloudLayer" part.Anchored=true part.CanCollide=false part.CanTouch=false part.CanQuery=false part.CastShadow=false part.DoubleSided=true part.Transparency=.15
			local appearance=AssetService:CreateSurfaceAppearanceAsync({ColorMap=Content.fromObject(cloudImage)}) appearance.AlphaMode=Enum.AlphaMode.Transparency appearance.ResampleMode=Enum.ResamplerMode.Pixelated appearance.Parent=part
			part.Parent=workspace self.cloud=part self.cloudBaseSize=part.Size self.cloudUVs={}
			for _,id in ipairs(self.cloudMesh:GetUVs()) do self.cloudUVs[id]=self.cloudMesh:GetUV(id) end
		end)
		if not ok then warn("Cloud rendering:",err) end
	end
	return self
end
function Sky:state(state)
	if state.timeOfDay then self.time=state.timeOfDay self.at=os.clock() end
	self.day=state.day or 0 self.dimension=state.dimension self.inWater=state.inWater
end
function Sky:tick(camera)
	local center=camera.CFrame.Position
	local time=(self.time+(os.clock()-self.at)*20)%24000 local angle=time/24000*math.pi*2
	local sunDirection=Vector3.new(-math.cos(angle),math.sin(angle),0)
	if self.sun then self.sun.CFrame=CFrame.lookAt(center+sunDirection*48,center) self.sunLabel.Visible=sunDirection.Y>0 end
	if self.moonPart then self.moonPart.CFrame=CFrame.lookAt(center-sunDirection*48,center) self.moonLabel.Visible=sunDirection.Y<0 end
	if os.clock()-self.updated<.1 then return end self.updated=os.clock()
	local daylight=math.clamp(math.sin(angle)*1.3+.2,0,1)
	-- Direct Roblox solar lighting introduces broad specular highlights even
	-- with Bloom/specular environment disabled. Minecraft faces use vertex shade.
	Lighting.ClockTime=(time/1000+6)%24 Lighting.Brightness=0
	Lighting.Ambient=Color3.fromRGB(35,40,55):Lerp(Color3.new(1,1,1),daylight) Lighting.OutdoorAmbient=Lighting.Ambient
	Lighting.FogColor=self.inWater and Color3.fromRGB(25,55,115) or Color3.fromRGB(20,24,38):Lerp(Color3.fromRGB(156,190,239),daylight)
	Lighting.FogStart=self.inWater and 4 or 96 Lighting.FogEnd=self.inWater and 40 or 192
	local night=daylight<.2
	if night~=self.night then self.night=night cubemap(self.sky,night and SkyAssets.night or SkyAssets.day) self.sky.StarCount=night and 1200 or 0 end
	if self.moon and self.phase~=(self.day%8) then self.phase=self.day%8 local origin=Vector2.new((self.phase%4)*self.moonSize.X,math.floor(self.phase/4)*self.moonSize.Y) self.moon:WritePixelsBuffer(Vector2.zero,self.moonSize,self.moonSource:ReadPixelsBuffer(origin,self.moonSize)) end
	if self.cloud then
		self.cloud.Transparency=(self.dimension=="overworld" or self.dimension=="minecraft:overworld") and .15 or 1
		local center=Vector3.new(math.floor(camera.CFrame.Position.X/512)*512,192*4,math.floor(camera.CFrame.Position.Z/512)*512)
		-- Project only the decorative sky plane closer, preserving its angular
		-- size and world UV position. Terrain/gameplay coordinates stay untouched.
		-- Roblox's global distance fog otherwise erases the entire high cloud layer.
		local delta=center-camera.CFrame.Position
		local scale=math.min(1,64/math.max(math.abs(delta.Y),1))
		self.cloud.Size=Vector3.new(self.cloudBaseSize.X*scale,self.cloudBaseSize.Y,self.cloudBaseSize.Z*scale)
		self.cloud.CFrame=CFrame.new(camera.CFrame.Position+delta*scale)
		local offset=Vector2.new((center.X+os.clock()*1.2)/12288,center.Z/12288)
		for id,uv in pairs(self.cloudUVs) do self.cloudMesh:SetUV(id,uv+offset) end
	end
end
return Sky
