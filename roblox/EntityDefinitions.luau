-- Original presentation cuboids; texture pixels remain private.
local Definitions={}
function Definitions.get(name)
	local parts={}
	local function add(n,s,p,uv) table.insert(parts,{name=n,size=s,position=p,uv=uv}) end
	if name=="pig" or name=="cow" then
		local cow=name=="cow"
		add("Head",cow and {8,8,6} or {8,8,8},cow and {0,20,-10} or {0,12,-9},{0,0})
		-- Quadruped body texture nets are vertical cuboids rotated into a
		-- horizontal pose. Swapping height/depth before UV generation sampled
		-- outside the skin and produced black strips.
		add("Body",cow and {12,18,10} or {10,16,8},cow and {0,14,1} or {0,10,0},{cow and 18 or 28,cow and 4 or 8}) parts[#parts].rotation=math.pi/2
		for _,x in ipairs({-1,1}) do for _,z in ipairs({-1,1}) do add("Leg"..x..z,{4,cow and 12 or 6,4},{x*3,cow and 6 or 3,z*(cow and 7 or 5)},{0,16}) end end
	elseif name=="creeper" then
		add("Head",{8,8,8},{0,22,0},{0,0}) add("Body",{8,12,4},{0,12,0},{16,16})
		for _,x in ipairs({-1,1}) do for _,z in ipairs({-1,1}) do add("Leg"..x..z,{4,6,4},{x*2,3,z*4},{0,16}) end end
	elseif name=="enderman" then
		add("Head",{8,8,8},{0,42,0},{0,0}) add("Body",{8,12,4},{0,36,0},{32,16})
		for _,sign in ipairs({-1,1}) do add("Arm"..sign,{2,30,2},{sign*5,27,0},{56,0}) add("Leg"..sign,{2,30,2},{sign*2,15,0},{56,0}) end
	elseif name=="sheep" then
		add("Head",{6,6,8},{0,18,-10},{0,0})
		add("Body",{8,16,6},{0,14,2},{28,8}) parts[#parts].rotation=math.pi/2
		for _,x in ipairs({-1,1}) do for _,z in ipairs({-1,1}) do add("Leg"..x..z,{4,12,4},{x*3,6,z*6+1},{0,16}) end end
		-- Wool uses its own Java skin, not the Bedrock combined skin layout.
		add("WoolHead",{6,6,6},{0,18,-9},{0,0}) parts[#parts].inflate=.6 parts[#parts].texture="sheep_wool"
		add("WoolBody",{8,16,6},{0,14,2},{28,8}) parts[#parts].rotation=math.pi/2 parts[#parts].inflate=1.75 parts[#parts].texture="sheep_wool"
	elseif name=="chicken" then
		add("Head",{4,6,3},{0,12,-4.5},{0,0}) add("Beak",{4,2,2},{0,12,-7},{14,0}) add("Comb",{2,2,2},{0,10,-6},{14,4})
		add("Body",{6,8,6},{0,8,0},{0,9}) parts[#parts].rotation=math.pi/2
		for _,sign in ipairs({-1,1}) do
			add("Leg"..sign,{3,5,3},{sign*1.5,2.5,-.5},{26,0})
			add("Wing"..sign,{1,4,6},{sign*3.5,9,0},{24,13}) parts[#parts].animation="wing" parts[#parts].phase=sign
		end
	elseif name=="bat" then
		-- Java 1.21.4 uses the modern 32x32 skin with flat ears/wings.
		add("Head",{4,3,2},{0,8.5,0},{0,7}) add("Body",{3,5,2},{0,4.5,0},{0,0})
		for _,sign in ipairs({-1,1}) do
			add("Ear"..sign,{3,5,0},{sign*2.5,10.5,0},{sign==-1 and 1 or 8,15}) parts[#parts].card=true
			add("Wing"..sign,{2,7,0},{sign*2.5,5.5,0},{12,sign==-1 and 0 or 7}) parts[#parts].card=true parts[#parts].animation="bat" parts[#parts].phase=sign
			add("WingTip"..sign,{6,8,0},{sign*6.5,5,0},{16,sign==-1 and 0 or 8}) parts[#parts].card=true parts[#parts].animation="bat" parts[#parts].phase=sign
		end
		add("Feet",{3,2,0},{0,1,0},{16,16}) parts[#parts].card=true
	elseif name=="spider" or name=="cave_spider" then
		add("Head",{8,8,8},{0,9,-7},{32,4}) add("Body",{6,6,6},{0,9,0},{0,0}) add("Abdomen",{10,8,12},{0,9,9},{0,12})
		for row=1,4 do for _,sign in ipairs({-1,1}) do
			local angle=(row-2.5)*math.pi/6
			add("SpiderLeg"..row..sign,{16,2,2},{sign*(4+8*math.cos(angle)),6,8*math.sin(angle)},{18,0})
			parts[#parts].angles={0,-sign*angle,sign*math.pi/7} parts[#parts].animation="spider" parts[#parts].phase=sign*(row%2==0 and 1 or -1)
		end end
	elseif name=="player" or name=="zombie" or name=="skeleton" or name=="husk" or name=="stray" or name=="wither_skeleton" then
		local thin=name=="skeleton" or name=="stray" or name=="wither_skeleton" local limb=thin and 2 or 4
		add("Head",{8,8,8},{0,28,0},{0,0}) add("Body",{8,12,4},{0,18,0},{16,16})
		for _,sign in ipairs({-1,1}) do
			local left=name=="player" and sign==1
			add("Arm"..sign,{limb,12,limb},{sign*6,18,0},left and {32,48} or {40,16})
			add("Leg"..sign,{limb,12,limb},{sign*2,6,0},left and {16,48} or {0,16})
		end
	else return nil end return parts
end
return Definitions
