-- Atlas UVs cannot repeat outside their cell. Split greedy surfaces into texel
-- tiles for the GPU; the authoritative voxel and greedy wire formats stay intact.
local FaceTiles={}
function FaceTiles.each(q,visit)
	if q[9] then visit(q) return end
	local axis=q[1]+1 local u,v=axis%3+1,(axis+1)%3+1
	for y=0,math.ceil(q[7])-1 do for x=0,math.ceil(q[6])-1 do
		local tile=table.clone(q) tile[u+2]+=x tile[v+2]+=y
		tile[6]=math.min(1,q[6]-x) tile[7]=math.min(1,q[7]-y)
		visit(tile)
	end end
end
return FaceTiles
