local Lighting=game:GetService("Lighting")
local Sky={} Sky.__index=Sky
function Sky.new()
	for _,child in ipairs(Lighting:GetChildren()) do if child:IsA("Sky") or child:IsA("Atmosphere") then child:Destroy() end end
	local sky=Instance.new("Sky") sky.CelestialBodiesShown=false sky.StarCount=3000 sky.Parent=Lighting
	local root=Instance.new("Folder") root.Name="MinecraftSky" root.Parent=workspace
	local function square(name,size,color)
		local part=Instance.new("Part") part.Name=name part.Anchored=true part.CanCollide=false part.CanQuery=false part.CastShadow=false part.Material=Enum.Material.Neon part.Color=color part.Size=size part.Parent=root return part
	end
	local sun=square("SquareSun",Vector3.new(120,120,1),Color3.fromRGB(255,245,211))
	local moon=square("SquareMoon",Vector3.new(90,90,1),Color3.fromRGB(220,228,237))
	local clouds={} local random=Random.new(12345)
	for _=1,24 do local p=square("Cloud",Vector3.new(random:NextInteger(4,12)*16,4,random:NextInteger(4,12)*16),Color3.fromRGB(245,245,245)) p.Material=Enum.Material.SmoothPlastic p.Transparency=.25 table.insert(clouds,{part=p,x=random:NextInteger(-12,12)*64,z=random:NextInteger(-12,12)*64}) end
	return setmetatable({root=root,sun=sun,moon=moon,clouds=clouds,time=6000,at=os.clock(),lastUpdate=0},Sky)
end
function Sky:state(state)
	if state.timeOfDay then self.time=state.timeOfDay self.at=os.clock() end
end
function Sky:tick(camera)
	if os.clock()-self.lastUpdate<.1 then return end self.lastUpdate=os.clock()
	local time=(self.time+(os.clock()-self.at)*20)%24000 local angle=time/24000*math.pi*2
	Lighting.ClockTime=(time/1000+6)%24
	local daylight=math.clamp(math.cos(angle)*1.3+.2,0,1)
	Lighting.Ambient=Color3.fromRGB(45+daylight*95,45+daylight*95,55+daylight*85) Lighting.OutdoorAmbient=Lighting.Ambient
	Lighting.FogColor=Color3.fromRGB(15+daylight*150,20+daylight*183,35+daylight*210) Lighting.FogStart=96 Lighting.FogEnd=240
	local center=camera.CFrame.Position local offset=Vector3.new(-math.sin(angle),math.cos(angle),0)*2000
	self.sun.CFrame=CFrame.lookAt(center+offset,center) self.moon.CFrame=CFrame.lookAt(center-offset,center)
	for _,cloud in ipairs(self.clouds) do cloud.part.Position=Vector3.new(math.floor(center.X/64)*64+cloud.x+(os.clock()*1.5)%64,512*4,math.floor(center.Z/64)*64+cloud.z) end
end
return Sky
