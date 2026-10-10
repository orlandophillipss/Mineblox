-- Fit the entire model at a fixed field of view, including narrow viewports.
local Fit={}
function Fit.distance(width,height,depth,aspect,fov,fill)
	local visible=math.max(height,width/math.max(aspect,.01))
	return visible/(2*math.tan(math.rad(fov)/2)*fill)+depth/2
end
return Fit
