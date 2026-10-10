-- Conservative eligibility for client presentation, never a server verdict.
local Rules={}
function Rules.cube(data)
	if not data or not data.blockItem or data.kind~="mesh" or #data.faces~=6 then return false end
	local planes={}
	for _,face in ipairs(data.faces) do
		local found
		for axis=1,3 do
			local side=face.points[1][axis] local planar=side==0 or side==1
			for _,p in ipairs(face.points) do
				if p[axis]~=side then planar=false end
				for i=1,3 do if p[i]~=0 and p[i]~=1 then return false end end
			end
			if planar then found=axis..":"..side break end
		end
		if not found or planes[found] then return false end planes[found]=true
	end
	return true
end
function Rules.allowed(at,previous,position)
	if not previous or not ({air=true,cave_air=true,void_air=true,water=true,lava=true})[previous.name] then return false end
	if position and position.x+.3>at[1] and position.x-.3<at[1]+1 and position.y+1.8>at[2] and position.y<at[2]+1 and position.z+.3>at[3] and position.z-.3<at[3]+1 then return false end
	return true
end
return Rules
