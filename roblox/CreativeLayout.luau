local Layout={pageSize=64,columns=9,cell=54,rows=5}
Layout.tabs={
	{"building","Building Blocks","bricks"},{"colored","Colored Blocks","cyan_wool"},{"natural","Natural Blocks","grass_block"},
	{"functional","Functional Blocks","crafting_table"},{"redstone","Redstone Blocks","redstone"},{"tools","Tools & Utilities","iron_pickaxe"},
	{"combat","Combat","iron_sword"},{"food","Food & Drinks","apple"},{"ingredients","Ingredients","stick"},
	{"eggs","Spawn Eggs","pig_spawn_egg"},{"operator","Operator Utilities","command_block"},{"search","Search Items","compass"},{"inventory","Survival Inventory","chest"},
}
function Layout.offset(scroll,total)
	local row=math.floor(math.max(0,scroll)/Layout.cell)
	return math.min(row*Layout.columns,math.max(0,total-Layout.columns*Layout.rows))
end
function Layout.hotbar(slot)
	if slot>=36 and slot<=44 then return 24+(slot-36)*54,333 end
	return nil
end
return Layout
