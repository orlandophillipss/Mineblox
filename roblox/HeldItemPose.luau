local Pose={}
function Pose.get(data,progress)
	progress=math.clamp(progress,0,1)
	local arc=math.sin(math.sqrt(progress)*math.pi)
	local display=data and data.display and data.display.firstperson_righthand or {}
	return {
		position={4*(.56-.4*arc),4*(-.52+.2*math.sin(math.sqrt(progress)*math.pi*2)),4*(-.72-.2*math.sin(progress*math.pi))},
		attack={-80*arc,45-20*math.sin(progress*progress*math.pi),-20*arc},
		translation=display.translation or {0,0,0}, rotation=display.rotation or {0,0,0},
		scale=4*(display.scale and display.scale[1] or 1),
	}
end
return Pose
