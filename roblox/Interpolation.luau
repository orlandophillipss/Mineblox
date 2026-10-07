local Interpolation={}
function Interpolation.sample(samples,time)
	if #samples==0 then return nil end
	for i=2,#samples do local a,b=samples[i-1],samples[i]
		if time<=b.time then
			local t=math.clamp((time-a.time)/math.max(b.time-a.time,.001),0,1)
			return {x=a.position.x+(b.position.x-a.position.x)*t,y=a.position.y+(b.position.y-a.position.y)*t,z=a.position.z+(b.position.z-a.position.z)*t,yaw=a.yaw+((b.yaw-a.yaw+math.pi)%(2*math.pi)-math.pi)*t}
		end
	end
	local b=samples[#samples] local age=math.clamp(time-b.time,0,.2) local v=b.velocity or {x=0,y=0,z=0}
	return {x=b.position.x+v.x*age*20,y=b.position.y+v.y*age*20,z=b.position.z+v.z*age*20,yaw=b.yaw}
end
return Interpolation
