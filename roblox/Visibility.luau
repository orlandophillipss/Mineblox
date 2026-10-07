local Visibility={}
function Visibility.sphere(x,y,z,fov,aspect,radius,maxDistance)
	local depth=-z
	if math.sqrt(x*x+y*y+z*z)-radius>maxDistance or depth+radius<0 then return false end
	local vertical=math.tan(math.rad(fov/2)) local horizontal=vertical*aspect
	return math.abs(y)<=math.max(depth,0)*vertical+radius*math.sqrt(1+vertical*vertical) and math.abs(x)<=math.max(depth,0)*horizontal+radius*math.sqrt(1+horizontal*horizontal)
end
-- Conservative sphere/frustum test. It changes presentation residency only.
function Visibility.visible(camera,center,radius,maxDistance)
	local localPoint=camera.CFrame:PointToObjectSpace(center)
	local aspect=camera.ViewportSize.X/math.max(camera.ViewportSize.Y,1)
	return Visibility.sphere(localPoint.X,localPoint.Y,localPoint.Z,camera.FieldOfView,aspect,radius,maxDistance)
end
return Visibility
