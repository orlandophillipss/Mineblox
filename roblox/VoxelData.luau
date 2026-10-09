local VoxelData={}
local function state(n) return type(n)=="number" and n%1==0 and n>=0 and n<=4294967295 end
function VoxelData.decode(partition,format)
	local data=partition.voxelData
	if format=="state-u32-xzy-v1" then data={encoding="array",values=partition.voxels} end
	assert(type(data)=="table","Missing voxel data")
	if data.encoding=="uniform" then assert(state(data.state),"Invalid uniform voxel") return data.state end
	local bytes=buffer.create(512*4)
	if data.encoding=="array" then
		assert(type(data.values)=="table" and #data.values==512,"Invalid voxel count")
		for i,n in ipairs(data.values) do assert(state(n),"Invalid voxel state") buffer.writeu32(bytes,(i-1)*4,n) end
	elseif data.encoding=="rle" then
		assert(type(data.runs)=="table" and #data.runs>=2 and #data.runs<=1024 and #data.runs%2==0,"Invalid voxel runs")
		local offset=0
		for i=1,#data.runs,2 do
			local count,n=data.runs[i],data.runs[i+1]
			assert(type(count)=="number" and count%1==0 and count>0 and offset+count<=512 and state(n),"Invalid voxel run")
			for j=offset,offset+count-1 do buffer.writeu32(bytes,j*4,n) end offset+=count
		end
		assert(offset==512,"Truncated voxel runs")
	else error("Unsupported voxel encoding") end
	return bytes
end
function VoxelData.get(data,index)
	return type(data)=="number" and data or buffer.readu32(data,index*4)
end
return VoxelData
